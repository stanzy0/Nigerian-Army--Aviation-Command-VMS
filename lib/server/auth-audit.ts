import { supabaseAdmin } from '@/lib/supabase-admin'
import type { NextRequest } from 'next/server'

export type AuditAction = 
  | 'login_success' 
  | 'logout' 
  | 'login_failed' 
  | 'login_failed_invalid_credentials'
  | 'login_failed_account_locked'
  | 'password_reset_by_admin'

export interface AuditLogEntry {
  action: AuditAction
  entity_type: string
  entity_id: string | null
  performed_by: string
  details: string
  role?: string | null
  metadata?: Record<string, unknown>
  ip_address?: string
  user_agent?: string
}

export async function logAuthEvent(entry: AuditLogEntry): Promise<void> {
  try {
    if (!supabaseAdmin) {
      console.error('[audit] supabaseAdmin not configured')
      return
    }

    // details is a JSONB column: store a structured object so that role and
    // other metadata are queryable (e.g. details->>role) while keeping the
    // human-readable message under `message`.
    const details: Record<string, unknown> = { message: entry.details }
    if (entry.role) {
      details.role = entry.role
    }
    if (entry.metadata) {
      Object.assign(details, entry.metadata)
    }

    const { error } = await supabaseAdmin.from('audit_logs').insert({
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      performed_by: entry.performed_by,
      details,
      ip_address: entry.ip_address,
      user_agent: entry.user_agent,
    })

    if (error) {
      console.error('[audit] Failed to log auth event:', error)
    }
  } catch (err) {
    console.error('[audit] Failed to log auth event:', err)
  }
}

export function getClientInfo(request: NextRequest): { ip_address?: string; user_agent?: string } {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 
    request.headers.get('x-real-ip') || 
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
    undefined
  
  const userAgent = request.headers.get('user-agent') || undefined
  
  return { ip_address: ip, user_agent: userAgent }
}

export function getUserDisplayName(user: { email?: string | null; full_name?: string | null }): string {
  return user.full_name || user.email || 'unknown'
}

export function getUserRoleFromMetadata(user: { user_metadata?: Record<string, unknown> }): string | null {
  return user.user_metadata?.role as string | null
}

export function getUserRoleFromSupabaseMetadata(user: { app_metadata?: Record<string, unknown> }): string | null {
  return user.app_metadata?.role as string | null
}

export function getUserRole(user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }): string | null {
  return getUserRoleFromMetadata(user) || getUserRoleFromSupabaseMetadata(user) || 'Unknown'
}