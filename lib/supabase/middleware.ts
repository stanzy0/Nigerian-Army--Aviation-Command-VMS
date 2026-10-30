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
    const mustChangePassword = Boolean(user?.user_metadata?.must_change_password)
    const pathname = request.nextUrl.pathname
    const isChangePasswordPage = pathname === '/change-password'
    const isLoginPage = pathname === '/login'
    const isApiRoute = pathname.startsWith('/api/')

    if (mustChangePassword && !isChangePasswordPage && !isLoginPage && !isApiRoute) {
      return NextResponse.redirect(new URL('/change-password', request.url))
    }
  }

  return supabaseResponse
}
