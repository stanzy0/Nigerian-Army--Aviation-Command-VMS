import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { isDemoMode } from '@/lib/demo'

export const createClient = async () => {
  if (isDemoMode()) {
    throw new Error('Supabase client is disabled in demo mode.')
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase URL and API key are required. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    )
  }

  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    db: { timeout: 30000 },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // Strip domain so the session cookie is scoped to the current host
          // (localhost:3000) and is sent back to /api/auth/me. If @supabase/ssr
          // sets domain to the Supabase host, the browser would not send the
          // cookie to the Next.js app, causing /api/auth/me to return 401 and
          // producing a login redirect loop.
          const { domain, ...cookieOptions } = options
          cookieStore.set(name, value, cookieOptions)
        })
      },
    },
  })
}
