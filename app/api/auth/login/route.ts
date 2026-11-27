import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getClientInfo, logAuthEvent, getUserDisplayName } from '@/lib/server/auth-audit'
import { createClient as createServerClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/auth-types'

/**
 * Resolve the post-login destination from the authoritative application role.
 *
 * Only roles with a dedicated landing page are routed there; every other
 * authenticated role (Admin, Receptionist, Commandant, Director,
 * PA_TO_COMMANDER) lands on the shared dashboard, matching existing routing
 * conventions. Password-change enforcement takes precedence over role routing.
 */
function resolveRedirectUrl(role: string | null, mustChangePassword: boolean): string {
  if (mustChangePassword) return '/change-password'
  switch (role as UserRole) {
    case 'PA_TO_CI':
      return '/pa-ci'
    case 'PA_TO_DIRECTOR':
      return '/pa-director'
    case 'Security':
      return '/security'
    case 'Host Employee':
      return '/host'
    default:
      return '/dashboard'
  }
}

// --- Login API Route ---

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const password = String(formData.get('password') ?? '')
    const remember = formData.get('remember') === 'on'

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    console.info('[api/auth/login] login attempt started')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[api/auth/login] Supabase URL or API key not configured')
      return NextResponse.json({ error: 'Authentication service is not configured.' }, { status: 500 })
    }

    // Use the shared @supabase/ssr server client. It persists the session
    // cookie through its own setAll handler (the single cookie-writing
    // mechanism for the app), so the cookie is written to the HTTP response
    // and is available on the very next request. We do NOT hand-roll cookie
    // encoding/chunking here.
    const supabase = await createServerClient()

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user) {
      // Log failed login attempt
      const clientInfo = getClientInfo(request)
      await logAuthEvent({
        action: 'login_failed_invalid_credentials',
        entity_type: 'auth',
        entity_id: null,
        performed_by: email,
        details: `Failed login attempt for email: ${email}`,
        ip_address: clientInfo.ip_address,
        user_agent: clientInfo.user_agent,
      })

      console.error('[api/auth/login] signInWithPassword failed:', error?.message ?? 'no user returned')
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    console.info('[api/auth/login] signInWithPassword succeeded for user:', data.user.id)

    const session = data.session
    if (!session) {
      console.error('[api/auth/login] signInWithPassword returned no session')
      return NextResponse.json({ error: 'Authentication failed. Please try again.' }, { status: 401 })
    }

    console.info('[api/auth/login] server-side session confirmed for user:', data.user.id)

    // Resolve the authoritative application role from the user_roles table
    // (the same source used by /api/auth/me and getCurrentUser). Do NOT rely on
    // auth metadata or the email address, and do not assume a fallback role.
    let appRole: string | null = null
    let missingRole = false
    let roleMustChangePassword = false

    if (supabaseAdmin) {
      const { data: userRole, error: roleError } = await supabaseAdmin
        .from('user_roles')
        .select('role, must_change_password')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (roleError) {
        console.error('[api/auth/login] user_roles lookup failed:', {
          userId: data.user.id,
          message: roleError.message,
        })
      } else if (userRole?.role) {
        appRole = userRole.role
        roleMustChangePassword = Boolean(userRole.must_change_password)
      } else {
        missingRole = true
        console.warn('[api/auth/login] no application role found for authenticated user:', data.user.id)
      }
    } else {
      missingRole = true
      console.error('[api/auth/login] service role not configured; cannot resolve application role')
    }

    // Password-change enforcement. The authoritative source is
    // user_roles.must_change_password (the same value /api/auth/me reports).
    // The auth-metadata flag is used only as a fallback when no user_roles row
    // exists (e.g. a brand-new account not yet provisioned). Treating the DB
    // flag as authoritative prevents a stale metadata mirror — left true by a
    // partial flag-sync failure after a successful password change — from
    // trapping the user in a /change-password loop.
    const mustChangePassword = appRole
      ? roleMustChangePassword
      : Boolean(data.user.user_metadata?.must_change_password)

    // Log successful login with the actual application role.
    const clientInfo = getClientInfo(request)
    const userDisplayName = getUserDisplayName({
      email: data.user.email,
      full_name: (data.user.user_metadata?.full_name as string | undefined) ?? null,
    })

    await logAuthEvent({
      action: 'login_success',
      entity_type: 'auth',
      entity_id: data.user.id,
      performed_by: userDisplayName,
      details: `Successful login for ${userDisplayName} (${data.user.email}) with role ${appRole ?? 'Unknown'}`,
      role: appRole,
      metadata: missingRole ? { missingRole: true } : undefined,
      ip_address: clientInfo.ip_address,
      user_agent: clientInfo.user_agent,
    })

    // Persist the optional "remember this device" marker. This is a
    // non-session, application-level cookie and does not affect authentication.
    if (remember) {
      // The SSR client already wrote the session cookie to the response via
      // cookies(). We only add the remember marker here.
      const { cookies } = await import('next/headers')
      const cookieStore = await cookies()
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      cookieStore.set('remember_device', 'true', {
        path: '/',
        expires: expiresAt,
        sameSite: 'lax',
        httpOnly: false,
      })
    }

    // Missing role is a hard, secure failure: the session is established but
    // the user is not authorised for any area. Return a non-redirect error.
    if (missingRole) {
      console.warn('[api/auth/login] authenticated user has no assigned role:', data.user.id)
      return NextResponse.json(
        { error: 'Your account does not have an assigned role.' },
        { status: 403 }
      )
    }

    const redirectUrl = resolveRedirectUrl(appRole, mustChangePassword)

    if (process.env.NODE_ENV !== 'production') {
      // Development-only diagnostic. Logs booleans/decision only — never email,
      // UUIDs, tokens or passwords.
      console.info('[dev][login] roleFound=%s mustChangePassword=%s redirect=%s', Boolean(appRole), mustChangePassword, redirectUrl)
    }

    // Return the destination; the session cookie has already been written to
    // the response by the SSR client above.
    return NextResponse.json({ redirectUrl })
  } catch (err) {
    console.error('[api/auth/login] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}