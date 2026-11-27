import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getClientInfo, logAuthEvent, getUserDisplayName, getUserRole } from '@/lib/server/auth-audit'

const PASSWORD_MIN_LENGTH = 8

function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character'
  return null
}

/**
 * Complete a mandatory password change in ONE authenticated server-side flow:
 *   1. Authenticate the caller (SSR session).
 *   2. Verify the CURRENT password (proof the caller owns the account).
 *   3. Change the password (service role).
 *   4. Clear must_change_password in BOTH user_roles and auth metadata.
 *   5. Verify the authoritative flag is cleared, then audit and redirect.
 *
 * The endpoint never trusts a client-supplied "password changed" assertion and
 * never accepts a user id from the request: the target is always the session
 * user. Direct invocation without the correct current password fails at step 2,
 * so mandatory password changes cannot be bypassed. Replay is prevented because
 * the old password is no longer valid after step 3.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate the caller.
    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (process.env.NODE_ENV !== 'production') {
      console.info('[dev][change-password] stage=auth ok=true')
    }

    if (!supabaseAdmin) {
      console.error('[api/auth/change-password] service role not configured')
      if (process.env.NODE_ENV !== 'production') {
        console.info('[dev][change-password] stage=admin_client ok=false')
      }
      return NextResponse.json(
        { error: 'Unable to update your account right now. Please contact an administrator.' },
        { status: 500 }
      )
    }

    if (process.env.NODE_ENV !== 'production') {
      console.info('[dev][change-password] stage=admin_client ok=true')
    }

    // Parse and validate input.
    let body: { current_password?: unknown; new_password?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const currentPassword = typeof body.current_password === 'string' ? body.current_password : ''
    const newPassword = typeof body.new_password === 'string' ? body.new_password : ''

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new passwords are required.' }, { status: 400 })
    }

    const policyError = validatePasswordStrength(newPassword)
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 })
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: 'New password must be different from your current password.' },
        { status: 400 }
      )
    }

    // 2. Verify the current password. This is the proof of ownership; without a
    // correct current password the flow stops here and no flags are touched.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[api/auth/change-password] Supabase URL or API key not configured')
      return NextResponse.json({ error: 'Authentication service is not configured.' }, { status: 500 })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    })

    const { error: reauthError } = await anonClient.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })

    if (reauthError) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 })
    }

    if (process.env.NODE_ENV !== 'production') {
      console.info('[dev][change-password] stage=reauth ok=true')
    }

    // 3. Change the password (service role). Require the returned user object:
    // a null user with no error means the password was NOT changed, so we must
    // not report success (otherwise login rejects the "new" password).
    const { data: passwordData, error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    )

    if (process.env.NODE_ENV !== 'production') {
      console.info(
        '[dev][change-password] stage=password_update ok=%s userReturned=%s',
        !passwordError,
        Boolean(passwordData?.user)
      )
    }

    if (passwordError || !passwordData?.user) {
      console.error(
        '[api/auth/change-password] password update did not return a user; treating as failure'
      )
      return NextResponse.json(
        { error: 'Password could not be changed. Please try again.' },
        { status: 500 }
      )
    }

    // 4. Clear the authoritative DB flag. Request the affected rows so a
    // zero-row update (e.g. no user_roles record for this session user) is
    // detected and fails loudly instead of silently reporting success while the
    // flag/metadata stays true.
    const { data: updatedRows, error: roleClearError } = await supabaseAdmin
      .from('user_roles')
      .update({ must_change_password: false })
      .eq('user_id', user.id)
      .select('user_id')

    if (process.env.NODE_ENV !== 'production') {
      console.info(
        '[dev][change-password] stage=db_clear ok=%s affectedRows=%s',
        !roleClearError,
        Array.isArray(updatedRows) ? updatedRows.length : -1
      )
    }

    if (roleClearError) {
      console.error('[api/auth/change-password] failed to clear user_roles flag:', roleClearError.message)
      return NextResponse.json(
        { error: 'Password changed, but your account could not be updated. Please contact an administrator.' },
        { status: 500 }
      )
    }

    // Require exactly one matching record (user_roles is UNIQUE(user_id)).
    // Zero rows (no record for this session user) or multiple rows (unexpected
    // data integrity issue) must fail loudly — never report success without a
    // confirmed single-row clear.
    if (!Array.isArray(updatedRows) || updatedRows.length !== 1) {
      console.error(
        '[api/auth/change-password] expected exactly one user_roles row to be updated; cannot confirm flag cleared'
      )
      return NextResponse.json(
        { error: 'Password changed, but your account record could not be confirmed. Please contact an administrator.' },
        { status: 500 }
      )
    }

    // Clear the auth-metadata mirror. This is best-effort: the authoritative
    // flag is user_roles.must_change_password (cleared above and verified
    // below), so a metadata failure must NOT block success or re-trap the user
    // in a /change-password loop. A stale metadata=true is ignored because the
    // login route and middleware treat the DB flag as authoritative.
    const { error: metaClearError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { must_change_password: false },
    })

    if (metaClearError) {
      console.warn(
        '[api/auth/change-password] metadata mirror not cleared (non-fatal, DB flag authoritative):',
        metaClearError.message
      )
    }

    // 5. Verify the authoritative flag is cleared before allowing redirect.
    const { data: roleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role, must_change_password')
      .eq('user_id', user.id)
      .maybeSingle()

    if (process.env.NODE_ENV !== 'production') {
      // Development-only diagnostic. Booleans/decision only — no PII.
      console.info(
        '[dev][change-password] stage=verify roleFound=%s mustChangePassword=%s',
        Boolean(roleRow),
        Boolean(roleRow?.must_change_password)
      )
      console.info('[dev][change-password] response status=200')
    }

    if (!roleRow || roleRow.must_change_password) {
      console.error('[api/auth/change-password] flag not confirmed cleared for the authenticated user')
      return NextResponse.json(
        { error: 'Password changed, but your account still requires a change. Please contact an administrator.' },
        { status: 500 }
      )
    }

    const clientInfo = getClientInfo(request)
    await logAuthEvent({
      action: 'password_changed',
      entity_type: 'auth',
      entity_id: user.id,
      performed_by: getUserDisplayName({ email: user.email, full_name: null }),
      details: 'User changed password; must_change_password cleared',
      role: getUserRole(user),
      ip_address: clientInfo.ip_address,
      user_agent: clientInfo.user_agent,
    })

    const role = roleRow?.role ?? null
    let redirectUrl = '/dashboard'
    if (role === 'PA_TO_CI') redirectUrl = '/pa-ci'
    else if (role === 'PA_TO_DIRECTOR') redirectUrl = '/pa-director'
    else if (role === 'Security') redirectUrl = '/security'
    else if (role === 'Host Employee') redirectUrl = '/host'

    if (process.env.NODE_ENV !== 'production') {
      // Development-only diagnostic. Booleans/decision only — no PII.
      console.info(
        '[dev][change-password] roleFound=%s mustChangePassword=%s redirect=%s',
        Boolean(roleRow),
        Boolean(roleRow?.must_change_password),
        redirectUrl
      )
    }

    return NextResponse.json({ success: true, redirectUrl })
  } catch (err) {
    console.error('[api/auth/change-password] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}