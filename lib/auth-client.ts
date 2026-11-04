import { supabase } from './supabase'
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

  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
      cache: 'no-store',
    })

    if (!res.ok) {
      return null
    }

    const { data } = await res.json()
    if (!data) return null

    return {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      role: data.role as UserRole,
      created_at: data.created_at,
      must_change_password: data.must_change_password ?? false,
      missingRole: data.missingRole ?? false,
    }
  } catch (err) {
    console.error('[getCurrentUser] Network error:', err)
    return null
  }
}

export async function getCurrentUserRoleStatus(): Promise<{
  authenticated: boolean
  role: UserRole | null
  missingRole: boolean
}> {
  if (isDemoMode()) {
    return { authenticated: true, role: 'Admin' as UserRole, missingRole: false }
  }

  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
      cache: 'no-store',
    })

    if (res.status === 401) {
      return { authenticated: false, role: null, missingRole: false }
    }

    if (!res.ok) {
      return { authenticated: false, role: null, missingRole: false }
    }

    const { data } = await res.json()
    if (!data) {
      return { authenticated: false, role: null, missingRole: false }
    }

    return {
      authenticated: true,
      role: (data.role as UserRole) ?? null,
      missingRole: data.missingRole ?? false,
    }
  } catch (err) {
    console.error('[getCurrentUserRoleStatus] Network error:', err)
    return { authenticated: false, role: null, missingRole: false }
  }
}

export async function hasPermission(permission: string): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user || !user.role) return false
  return PERMISSIONS[user.role]?.includes(permission) || false
}

export async function requireRole(allowedRoles: UserRole[]): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user || !user.role) return false
  return allowedRoles.includes(user.role)
}

export async function ensureUserInDatabase(userId: string, email: string, fullName: string | null = null): Promise<void> {
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
