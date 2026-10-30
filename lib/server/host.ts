import { supabaseAdmin } from '@/lib/supabase-admin'
import { logAuditAction } from '@/lib/server/audit'
import { createHostNotification } from '@/lib/server/notification-service'
import { sendEmail } from '@/lib/server/email'
import { applyVisitStatusChange } from '@/lib/server/visit-status'
import type { HostDashboardStats, HostReport, EmployeeProfile } from '@/lib/types/host'

export async function getHostDashboardStats(employeeId: string): Promise<HostDashboardStats> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const today = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [visitorsToday, pendingApprovals, currentVisitors, monthlyVisitors, invitationsSent] = await Promise.all([
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId).gte('created_at', today),
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId).eq('status', 'pending'),
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId).eq('status', 'checked_in'),
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId).gte('created_at', monthStart),
    supabaseAdmin.from('invitations').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId).gte('created_at', monthStart),
  ])

  return {
    visitorsExpectedToday: visitorsToday.count ?? 0,
    pendingApprovals: pendingApprovals.count ?? 0,
    currentVisitors: currentVisitors.count ?? 0,
    monthlyVisitors: monthlyVisitors.count ?? 0,
    invitationsSent: invitationsSent.count ?? 0,
  }
}

export async function getHostVisitors(employeeId: string, filters: { status?: string; search?: string } = {}): Promise<Record<string, unknown>[]> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  let query = supabaseAdmin
    .from('visits')
    .select('*, visitor:visitors(*), badge:visitor_badges(*)')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  if (filters.search) {
    query = query.or(`visitor.full_name.ilike.%${filters.search}%,visitor.visitor_organization.ilike.%${filters.search}%`)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function approveVisitor(visitId: string, employeeId: string): Promise<Record<string, unknown>> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data: visit, error: fetchError } = await supabaseAdmin
    .from('visits')
    .select('*, visitor:visitors(*), employee:employees(*)')
    .eq('id', visitId)
    .eq('employee_id', employeeId)
    .single()

  if (fetchError || !visit) {
    throw new Error('Visit not found or access denied')
  }

  const visitor = Array.isArray(visit.visitor) ? visit.visitor[0] : visit.visitor
  const employee = Array.isArray(visit.employee) ? visit.employee[0] : visit.employee

  const visitDate = visit.scheduled_date ? new Date(visit.scheduled_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]

  const actorUserId = employee?.user_id ?? null

  // Use the atomic status-change function for pending -> approved transition.
  const result = await applyVisitStatusChange(visitId, 'approved', {
    auditAction: 'Visitor Approved by Host',
    auditDetails: `Host approved visit ${visitId}`,
    approvedBy: actorUserId,
  })

  if (result.outcome !== 'success') {
    throw new Error(result.message || 'Failed to approve visitor')
  }

  // Fetch the updated visit record for backward-compatible response shape.
  const { data: updatedVisit } = await supabaseAdmin
    .from('visits')
    .select('*, visitor:visitors(*), employee:employees(*)')
    .eq('id', visitId)
    .single()

  await sendEmail({
    to: visitor?.email || '',
    recipientName: visitor?.full_name || 'Visitor',
    subject: `Registration Approved - ${visit.registration_number || visitId}`,
    template: 'invitation_approved',
    data: {
      visitorName: visitor?.full_name || 'Visitor',
      registrationNumber: visit.registration_number || visitId,
      date: visitDate,
      time: 'TBD',
      purpose: visit.purpose || 'Business',
      hostName: employee?.full_name || 'Host',
      badgeNumber: 'Print badge upon arrival',
    },
    relatedType: 'visit',
    relatedId: visitId,
  })

  if (employeeId) {
    await createHostNotification(
      employeeId,
      'Visitor Approved',
      `${visitor?.full_name || 'A visitor'}'s registration has been approved for ${visitDate}.`,
      'success',
      'visit',
      visitId
    )
  }

  await logAuditAction('Visitor Approved by Host', 'visit', visitId, `Host approved visit ${visitId}`)

  return (updatedVisit || result) as Record<string, unknown>
}

export async function rejectVisitor(visitId: string, employeeId: string, reason: string): Promise<Record<string, unknown>> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data: visit, error: fetchError } = await supabaseAdmin
    .from('visits')
    .select('*, visitor:visitors(*), employee:employees(*)')
    .eq('id', visitId)
    .eq('employee_id', employeeId)
    .single()

  if (fetchError || !visit) {
    throw new Error('Visit not found or access denied')
  }

  const visitor = Array.isArray(visit.visitor) ? visit.visitor[0] : visit.visitor
  const employee = Array.isArray(visit.employee) ? visit.employee[0] : visit.employee

  const visitDate = visit.scheduled_date ? new Date(visit.scheduled_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]

  const actorUserId = employee?.user_id ?? null

  // Use the atomic status-change function for pending -> rejected transition.
  const result = await applyVisitStatusChange(visitId, 'rejected', {
    rejectionReason: reason,
    auditAction: 'Visitor Rejected by Host',
    auditDetails: `Host rejected visit ${visitId}. Reason: ${reason}`,
    approvedBy: actorUserId,
  })

  if (result.outcome !== 'success') {
    throw new Error(result.message || 'Failed to reject visitor')
  }

  await sendEmail({
    to: visitor?.email || '',
    recipientName: visitor?.full_name || 'Visitor',
    subject: `Registration Rejected - ${visit.registration_number || visitId}`,
    template: 'registration_rejected',
    data: {
      visitorName: visitor?.full_name || 'Visitor',
      registrationNumber: visit.registration_number || visitId,
      date: visitDate,
      hostName: employee?.full_name || 'Host',
      reason: reason || 'No reason provided',
    },
    relatedType: 'visit',
    relatedId: visitId,
  })

  if (employeeId) {
    await createHostNotification(
      employeeId,
      'Visitor Rejected',
      `${visitor?.full_name || 'A visitor'}'s invitation was rejected for ${visitDate}. Reason: ${reason}.`,
      'error',
      'visit',
      visitId
    )
  }

  await logAuditAction('Visitor Rejected by Host', 'visit', visitId, `Host rejected visit ${visitId}. Reason: ${reason}`)

  const { data: updatedVisit } = await supabaseAdmin
    .from('visits')
    .select('*, visitor:visitors(*), employee:employees(*)')
    .eq('id', visitId)
    .single()

  return (updatedVisit || result) as Record<string, unknown>
}

export async function getHostInvitations(employeeId: string): Promise<Record<string, unknown>[]> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function createHostInvitation(employeeId: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')

  const { data: invitation, error } = await supabaseAdmin
    .from('invitations')
    .insert({
      ...data,
      employee_id: employeeId,
      invitation_token: token,
      status: 'pending',
    })
    .select()
    .single()

  if (error || !invitation) {
    throw new Error(error?.message || 'Failed to create invitation')
  }

  await logAuditAction('Invitation Created by Host', 'invitation', invitation.id, `Host created invitation ${invitation.id}`)

  return invitation
}

export async function getHostProfile(employeeId: string): Promise<EmployeeProfile | null> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('employees')
    .select('id, full_name, email, phone, department, office_location, office_extension, availability')
    .eq('id', employeeId)
    .single()

  if (error || !data) {
    return null
  }

  return data as EmployeeProfile
}

export async function updateHostProfile(employeeId: string, updates: Partial<EmployeeProfile>): Promise<EmployeeProfile> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data: profile, error } = await supabaseAdmin
    .from('employees')
    .update(updates)
    .eq('id', employeeId)
    .select()
    .single()

  if (error || !profile) {
    throw new Error(error?.message || 'Failed to update profile')
  }

  return profile as EmployeeProfile
}

export async function getHostReport(employeeId: string, range: 'today' | '7days' | '30days' = '30days'): Promise<HostReport> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const now = new Date()
  const start = new Date()
  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      break
    case '7days':
      start.setDate(now.getDate() - 7)
      break
    case '30days':
      start.setDate(now.getDate() - 30)
      break
  }

  const startStr = start.toISOString()
  const endStr = now.toISOString()

  const [monthlyVisitorsRes, frequentVisitorsRes, pendingVisitorsRes, visitorHistoryRes] = await Promise.all([
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId).gte('created_at', startStr).lte('created_at', endStr),
    supabaseAdmin.from('visits').select('visitor:visitors(full_name)').eq('employee_id', employeeId).gte('created_at', startStr).lte('created_at', endStr),
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId).eq('status', 'pending').gte('created_at', startStr).lte('created_at', endStr),
    supabaseAdmin.from('visits').select('id, visitor:visitors(full_name), purpose, status, check_in_time, check_out_time, created_at').eq('employee_id', employeeId).gte('created_at', startStr).lte('created_at', endStr).order('created_at', { ascending: false }).limit(50),
  ])

  const visitorCounts = new Map<string, number>()
  frequentVisitorsRes.data?.forEach((v: Record<string, unknown>) => {
    const visitor = Array.isArray(v.visitor) ? v.visitor[0] : v.visitor
    const name = visitor?.full_name || 'Unknown'
    visitorCounts.set(name, (visitorCounts.get(name) || 0) + 1)
  })

  const frequentVisitors = Array.from(visitorCounts.entries())
    .map(([visitor_name, visit_count]) => ({ visitor_name, visit_count }))
    .sort((a, b) => b.visit_count - a.visit_count)
    .slice(0, 10)

  return {
    monthlyVisitors: monthlyVisitorsRes.count ?? 0,
    frequentVisitors,
    pendingVisitors: pendingVisitorsRes.count ?? 0,
    visitorHistory: (visitorHistoryRes.data || []).map((v: Record<string, unknown>) => {
      const visitor = Array.isArray(v.visitor) ? v.visitor[0] : v.visitor
      return {
        id: v.id,
        visitor_name: typeof visitor === 'object' && visitor !== null ? String(visitor.full_name || 'Unknown') : 'Unknown',
        purpose: v.purpose,
        status: v.status,
        check_in_time: v.check_in_time,
        check_out_time: v.check_out_time,
        created_at: v.created_at,
      }
    }),
  }
}
