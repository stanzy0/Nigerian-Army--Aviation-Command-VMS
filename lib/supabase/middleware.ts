import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isDemoMode } from '@/lib/demo'

let startupValidated = false

export async function updateSession(request: NextRequest) {
  if (!startupValidated) {
    const { validateStartup } = await import('@/lib/startup-validation')
    const result = validateStartup()
    startupValidated = true
    if (!result.passed && result.error) {
      console.error('[Startup Validation] Application startup blocked:', result.error)
    }
  }
  if (isDemoMode()) {
    return NextResponse.next({ request })
  }

  const supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    })

    const { data: { user } } = await supabase.auth.getUser()
    const pathname = request.nextUrl.pathname
    const isChangePasswordPage = pathname === '/change-password'
    const isLoginPage = pathname === '/login'
    const isApiRoute = pathname.startsWith('/api/')

    // Password-change enforcement uses the authoritative user_roles flag,
    // read through the same authenticated SSR client (RLS permits a user to
    // select their own row: auth.uid() = user_id). No service-role key is used.
    // The auth-metadata flag is a fallback only when no user_roles row exists,
    // so a stale metadata mirror cannot re-force a user who already changed
    // their password (DB flag cleared).
    let mustChangePassword = Boolean(user?.user_metadata?.must_change_password)
    let roleFound = false
    if (user) {
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('must_change_password')
        .eq('user_id', user.id)
        .maybeSingle()
      roleFound = Boolean(roleRow)
      if (roleRow) {
        mustChangePassword = Boolean(roleRow.must_change_password)
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      // Development-only diagnostic. Booleans/path only — no PII.
      console.info(
        '[dev][middleware] path=%s authed=%s roleFound=%s mustChangePassword=%s',
        pathname,
        Boolean(user),
        roleFound,
        mustChangePassword
      )
    }

    if (mustChangePassword && !isChangePasswordPage && !isLoginPage && !isApiRoute) {
      return NextResponse.redirect(new URL('/change-password', request.url))
    }
  }

  return supabaseResponse
}
