import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase/server'

async function getUser() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  return user
}

export async function requireAdmin() {
  const user = await getUser()

  if (!user) {
    return { authorized: false, error: 'Unauthorized', status: 401 as const }
  }

  if (!supabaseAdmin) {
    return { authorized: false, error: 'Service role key not configured', status: 500 as const }
  }

  const { data: userRole, error } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !userRole) {
    return { authorized: false, error: 'Access denied', status: 403 as const }
  }

  if (userRole.role !== 'Admin') {
    return { authorized: false, error: 'Access denied', status: 403 as const }
  }

  return { authorized: true, userEmail: user.email, userId: user.id }
}

export async function requireRole(allowedRoles: string[]) {
  const user = await getUser()

  if (!user) {
    return { authorized: false, error: 'Unauthorized', status: 401 as const }
  }

  if (!supabaseAdmin) {
    return { authorized: false, error: 'Service role key not configured', status: 500 as const }
  }

  const { data: userRole, error } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !userRole) {
    return { authorized: false, error: 'Access denied', status: 403 as const }
  }

  if (!allowedRoles.includes(userRole.role)) {
    return { authorized: false, error: 'Access denied', status: 403 as const }
  }

  return { authorized: true, userEmail: user.email, userId: user.id }
}
