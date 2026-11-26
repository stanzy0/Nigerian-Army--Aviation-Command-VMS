import { NextRequest, NextResponse } from 'next/server'
import { getClientInfo, logAuthEvent, getUserDisplayName, getUserRole } from '@/lib/server/auth-audit'

function clearSessionCookies(response: NextResponse, request: NextRequest, supabaseUrl: string) {
  const projectRef = supabaseUrl
    .replace(/^https:\/\//, '')
    .replace(/\.supabase\.co$/, '')
  const cookieName = `sb-${projectRef}-auth-token`

  const all = request.cookies.getAll()
  const cookieNames = all.map((c) => c.name)
  const removeCookies = cookieNames.filter(
    (name) => name === cookieName || name.startsWith(`${cookieName}.`)
  )

  for (const name of removeCookies) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.info('[api/auth/logout] logout attempt started')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[api/auth/logout] Supabase URL or API key not configured')
      return NextResponse.json({ error: 'Authentication service is not configured.' }, { status: 500 })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          flowType: 'pkce',
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: true,
        },
      })

    // Capture the authenticated identity BEFORE the session is destroyed.
    const { data: { user } } = await supabase.auth.getUser()

    const clientInfo = getClientInfo(request)

    let userDisplayName = 'Unknown'
    let userId = 'unknown'
    let userRole: string | null = null

    if (user) {
      userDisplayName = getUserDisplayName({
        email: user.email,
        full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
      })
      userId = user.id
      userRole = getUserRole(user)
    }

    // Record the logout event BEFORE destroying the session. logAuthEvent never
    // throws, so a logging failure cannot block the logout below.
    await logAuthEvent({
      action: 'logout',
      entity_type: 'auth',
      entity_id: userId,
      performed_by: user?.email || 'unknown',
      details: `User logged out`,
      role: userRole,
      ip_address: clientInfo.ip_address,
      user_agent: clientInfo.user_agent,
    })

    // Destroy the authenticated session.
    await supabase.auth.signOut()

    // Create response with redirect and clear the session cookie chunks.
    const response = NextResponse.redirect(new URL('/login', new URL(request.url).origin))
    clearSessionCookies(response, request, supabaseUrl)

    return response
  } catch (err) {
    console.error('[api/auth/logout] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  // Redirect-only logout for any GET-based navigation. This path is
  // intentionally non-logging to avoid duplicate logout events when the
  // primary POST flow (or the client SIGNED_OUT listener) also records one.
  const response = NextResponse.redirect(new URL('/login', new URL(request.url).origin))
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    clearSessionCookies(response, request, process.env.NEXT_PUBLIC_SUPABASE_URL)
  }
  return response
}