import { isDemoMode } from '@/lib/demo'

export async function getAuthHeaders(): Promise<Headers> {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')

  if (isDemoMode()) {
    return headers
  }

  const { supabase } = await import('@/lib/supabase')
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  return headers
}
