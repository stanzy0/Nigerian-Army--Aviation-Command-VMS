import { isDemoMode } from '@/lib/demo'

export const supabaseAdmin = isDemoMode()
  ? (null as any)
  : (require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    ))