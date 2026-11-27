import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Supabase Auth callback route.
 *
 * Handles the OAuth/auth-code callback from Supabase Auth, including
 * password-recovery (reset-password) links sent via email.
 *
 * Flow:
 *   1. Extract the `code` from the query string.
 *   2. Exchange it for a session via `supabase.auth.exchangeCodeForSession()`.
 *   3. Redirect to /reset-password so the user can set a new password.
 *
 * Mandatory password-change enforcement (user_roles.must_change_password) is
 * NOT modified here. Recovery only establishes an authenticated session so the
 * user can reach /reset-password; the existing middleware continues to enforce
 * the flag after recovery.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  // Supabase may redirect with an error parameter (e.g. user cancelled).
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, request.url)
    )
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url))
  }

  // Exchange the authorization code for a session.
  const supabase = await createServerClient()
  const { error: exchangeError, data } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data?.session?.user) {
    return NextResponse.redirect(
      new URL('/login?error=invalid_code', request.url)
    )
  }

  // Redirect to the password-reset page. No flags are modified here;
  // mandatory password-change enforcement remains in effect via middleware.
  return NextResponse.redirect(new URL('/reset-password', request.url))
}
