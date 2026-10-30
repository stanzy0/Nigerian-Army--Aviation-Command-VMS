import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient as _createClient } from '@/lib/supabase/client'
import { isDemoMode } from '@/lib/demo'

let _client: SupabaseClient | null = null
let _error: Error | null = null

function getClient(): SupabaseClient {
  if (_client) return _client
  if (_error) throw _error
  try {
    _client = _createClient()
    return _client
  } catch (err) {
    _error = err as Error
    throw _error
  }
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (isDemoMode()) return undefined
    const client = getClient()
    const value = client[prop as keyof SupabaseClient]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
