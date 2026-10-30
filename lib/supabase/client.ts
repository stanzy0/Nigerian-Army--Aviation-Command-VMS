import { createBrowserClient } from '@supabase/ssr'

import { isDemoMode } from '@/lib/demo'

export const createClient = () => {
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

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    db: { timeout: 30000 },
    cookies: {
      getAll() {
        if (typeof document === 'undefined') return []
        return document.cookie.split(';').map(c => {
          const [name, ...rest] = c.split('=').map(s => s.trim())
          return { name, value: decodeURIComponent(rest.join('=')) }
        })
      },
      setAll(cookiesToSet) {
        if (typeof document === 'undefined') return
        cookiesToSet.forEach(({ name, value, options }) => {
          let cookie = `${name}=${encodeURIComponent(value)}`
          if (options?.path) cookie += `; Path=${options.path}`
          if (options?.maxAge) cookie += `; Max-Age=${options.maxAge}`
          if (options?.expires) cookie += `; Expires=${options.expires}`
          if (options?.domain) cookie += `; Domain=${options.domain}`
          if (options?.sameSite) cookie += `; SameSite=${options.sameSite}`
          if (options?.secure) cookie += `; Secure`
          if (options?.httpOnly) cookie += `; HttpOnly`
          document.cookie = cookie
        })
      },
    },
  })
}
