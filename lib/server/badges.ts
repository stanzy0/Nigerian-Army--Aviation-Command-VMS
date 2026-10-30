import { supabaseAdmin } from '@/lib/supabase-admin'
import { supabase } from '@/lib/supabase'
import { logAuditAction } from '@/lib/client/audit'
import type { BadgeTemplate, Printer, BadgeHistoryRecord, VisitorBadge } from '@/lib/badge/badge-types'

export async function getBadgeTemplates(): Promise<BadgeTemplate[]> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('badge_templates')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getBadgeTemplateById(id: string): Promise<BadgeTemplate | null> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('badge_templates')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return null
  }

  return data as BadgeTemplate
}

export async function createBadgeTemplate(template: Partial<BadgeTemplate>): Promise<BadgeTemplate> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('badge_templates')
    .insert({
      name: template.name,
      description: template.description || null,
      badge_size: template.badge_size || 'CR80',
      orientation: template.orientation || 'landscape',
      background_image: template.background_image || null,
      logo_url: template.logo_url || null,
      primary_color: template.primary_color || '#2563eb',
      secondary_color: template.secondary_color || '#1e40af',
      text_color: template.text_color || '#111827',
      qr_position: template.qr_position || 'right',
      photo_position: template.photo_position || 'left',
      expiry_display: template.expiry_display ?? true,
      department_display: template.department_display ?? true,
      office_display: template.office_display ?? true,
      signature_area: template.signature_area ?? false,
      layout: template.layout || [],
      is_default: template.is_default ?? false,
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create badge template')
  }

  await logAuditAction('Badge Template Created', 'badge_template', data.id, `Created badge template ${template.name}`)

  return data as BadgeTemplate
}

export async function updateBadgeTemplate(id: string, updates: Partial<BadgeTemplate>): Promise<BadgeTemplate> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('badge_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update badge template')
  }

  await logAuditAction('Badge Template Updated', 'badge_template', id, `Updated badge template ${data.name}`)

  return data as BadgeTemplate
}

export async function deleteBadgeTemplate(id: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { error } = await supabaseAdmin
    .from('badge_templates')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }

  await logAuditAction('Badge Template Deleted', 'badge_template', id, `Deleted badge template ${id}`)
}

export async function getPrinters(): Promise<Printer[]> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('printers')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getDefaultPrinter(): Promise<Printer | null> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('printers')
    .select('*')
    .eq('is_default', true)
    .single()

  if (error || !data) {
    return null
  }

  return data as Printer
}

export async function createPrinter(printer: Partial<Printer>): Promise<Printer> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('printers')
    .insert({
      name: printer.name,
      printer_type: printer.printer_type || 'thermal',
      paper_size: printer.paper_size || 'CR80',
      orientation: printer.orientation || 'landscape',
      margins: printer.margins || { top: 5, right: 5, bottom: 5, left: 5 },
      copies: printer.copies || 1,
      is_default: printer.is_default ?? false,
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create printer')
  }

  return data as Printer
}

export async function updatePrinter(id: string, updates: Partial<Printer>): Promise<Printer> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('printers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update printer')
  }

  return data as Printer
}

export async function deletePrinter(id: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { error } = await supabaseAdmin
    .from('printers')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}

export async function getBadgeHistory(badgeId?: string): Promise<BadgeHistoryRecord[]> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  let query = supabaseAdmin
    .from('badge_history')
    .select('*')
    .order('created_at', { ascending: false })

  if (badgeId) {
    query = query.eq('badge_id', badgeId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function addBadgeHistoryRecord(record: {
  badge_id: string
  action: string
  performed_by?: string | null
  reason?: string | null
  printer_name?: string | null
  template_name?: string | null
  metadata?: Record<string, unknown>
}): Promise<BadgeHistoryRecord> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('badge_history')
    .insert({
      badge_id: record.badge_id,
      action: record.action,
      performed_by: record.performed_by || null,
      reason: record.reason || null,
      printer_name: record.printer_name || null,
      template_name: record.template_name || null,
      metadata: record.metadata || {},
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to add badge history record')
  }

  return data as BadgeHistoryRecord
}

export async function validateBadge(qrToken: string): Promise<{
  valid: boolean
  reason?: string
  badge?: VisitorBadge
}> {
  if (!supabaseAdmin) {
    return { valid: false, reason: 'Service not configured' }
  }

  const { data: badge } = await supabaseAdmin
    .from('visitor_badges')
    .select('*, visit:visits(*, visitor:visitors(*), employee:employees(*))')
    .eq('qr_token', qrToken)
    .single()

  if (!badge) {
    return { valid: false, reason: 'Badge not found' }
  }

  if (badge.revoked) {
    return { valid: false, reason: 'Badge has been revoked', badge: badge as VisitorBadge }
  }

  if (badge.badge_status === 'Cancelled') {
    return { valid: false, reason: 'Badge has been cancelled', badge: badge as VisitorBadge }
  }

  if (badge.badge_status === 'Expired') {
    return { valid: false, reason: 'Badge has expired', badge: badge as VisitorBadge }
  }

  if (badge.expires_at && new Date(badge.expires_at) < new Date()) {
    return { valid: false, reason: 'Badge has expired', badge: badge as VisitorBadge }
  }

  if (!badge.visit) {
    return { valid: false, reason: 'Badge visit not found', badge: badge as VisitorBadge }
  }

  const visit = badge.visit as Record<string, unknown>
  if (visit.status === 'checked_out') {
    return { valid: false, reason: 'Visitor has checked out', badge: badge as VisitorBadge }
  }

  return { valid: true, badge: badge as VisitorBadge }
}

export async function revokeBadge(badgeId: string, reason: string, performedBy: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { error } = await supabaseAdmin
    .from('visitor_badges')
    .update({
      revoked: true,
      revoked_at: new Date().toISOString(),
      revoked_by: performedBy,
      revoked_reason: reason,
      badge_status: 'Revoked',
      updated_at: new Date().toISOString(),
    })
    .eq('id', badgeId)

  if (error) {
    throw new Error(error.message)
  }

  await logAuditAction('Badge Revoked', 'badge', badgeId, `Badge revoked. Reason: ${reason}`)
}

export async function expireOldBadges(): Promise<number> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const now = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('visitor_badges')
    .update({ badge_status: 'Expired', updated_at: now })
    .lt('expires_at', now)
    .eq('badge_status', 'Active')
    .select('id')

  if (error) {
    throw new Error(error.message)
  }

  const count = data?.length || 0

  if (count > 0) {
    await logAuditAction('Badges Expired', 'badge', null, `Auto-expired ${count} badges`)
  }

  return count
}

export async function getBadgeStatistics(): Promise<{ totalIssued: number; totalPrinted: number; activeBadges: number; expiredBadges: number; checkedOutBadges: number; cancelledBadges: number; revokedBadges: number; reprints: number }> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const [
    totalIssued,
    totalPrinted,
    activeBadges,
    expiredBadges,
    checkedOutBadges,
    cancelledBadges,
    revokedBadges,
    reprints,
  ] = await Promise.all([
    supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).not('printed_at', 'is', null),
    supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Active'),
    supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Expired'),
    supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Checked Out'),
    supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Cancelled'),
    supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Revoked'),
    supabaseAdmin.from('visitor_badges').select('reprint_count').neq('reprint_count', 0),
  ])

  const totalReprints = reprints.data?.reduce((sum: number, b: Record<string, unknown>) => sum + ((b.reprint_count as number) || 0), 0) || 0

  return {
    totalIssued: totalIssued.count || 0,
    totalPrinted: totalPrinted.count || 0,
    activeBadges: activeBadges.count || 0,
    expiredBadges: expiredBadges.count || 0,
    checkedOutBadges: checkedOutBadges.count || 0,
    cancelledBadges: cancelledBadges.count || 0,
    revokedBadges: revokedBadges.count || 0,
    reprints: totalReprints,
  }
}
