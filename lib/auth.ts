import { createClient } from './supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { UserRole, UserWithRole, PERMISSIONS } from './auth-types'

export { PERMISSIONS }
export type { UserRole, UserWithRole }

import { isDemoMode } from '@/lib/demo'

export async function getCurrentUser(): Promise<UserWithRole | null> {
  if (isDemoMode()) {
    return {
      id: 'demo-admin',
      email: 'demo.admin@local',
      full_name: 'Demo Admin (Sample)',
      role: 'Admin' as UserRole,
      created_at: new Date().toISOString(),
      must_change_password: false,
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  if (!supabaseAdmin) {
    console.error('[getCurrentUser] Service role not configured')
    return null
  }

  const { data: userRole, error } = await supabaseAdmin
    .from('user_roles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !userRole) {
    console.error('[getCurrentUser] user_roles query failed:', { error, userId: user.id })
    return null
  }

  return {
    id: user.id,
    email: user.email || '',
    full_name: userRole.full_name,
    role: userRole.role as UserRole,
    created_at: userRole.created_at,
    must_change_password: userRole.must_change_password ?? false,
  }
}

export async function getCurrentUserRole(): Promise<UserRole> {
  const user = await getCurrentUser()
  return user?.role || 'Receptionist'
}

export async function hasPermission(permission: string): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false
  return PERMISSIONS[user.role]?.includes(permission) || false
}

export async function requireRole(allowedRoles: UserRole[]): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false
  return allowedRoles.includes(user.role)
}

export async function ensureUserInDatabase(userId: string, email: string, fullName: string | null = null): Promise<void> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (!existing) {
    const { error } = await supabase.from('user_roles').insert({
      user_id: userId,
      email: email,
      full_name: fullName,
      role: 'Receptionist' as UserRole,
    })

    if (!error) {
      await logAuditAction('User Created', 'user', userId, `New user auto-assigned Receptionist role`)
    }
  }
}

async function logAuditAction(action: string, entityType: string, entityId: string | null, details: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase.from('audit_logs').insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      performed_by: user?.email || 'anonymous',
      details,
    })

    if (error) console.error('Audit log error:', error)
  } catch (err) {
    console.error('Failed to log audit action:', err)
  }
}
