import { supabaseAdmin } from '@/lib/supabase-admin'
import { logAuditAction } from '@/lib/server/audit'
import { createHostNotification, createSecurityNotification, createSystemNotification } from '@/lib/server/notification-service'
import type { VisitLifecycleStatus, LifecycleEvent, MissingDocumentResult, ExpiredVisitResult } from '@/lib/types/lifecycle'

const REQUIRED_DOCUMENT_TYPES = [
  'National ID',
  'Passport',
  'Driver License',
  'Official ID',
  'Employment ID',
]

export async function transitionVisitStatus(
  visitId: string,
  toStatus: VisitLifecycleStatus,
  performedBy: string | null,
  metadata: Record<string, unknown> = {}
): Promise<LifecycleEvent> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data: visit } = await supabaseAdmin
    .from('visits')
    .select('status')
    .eq('id', visitId)
    .single()

  const fromStatus = visit?.status || null

  const { data: event, error } = await supabaseAdmin
    .from('lifecycle_events')
    .insert({
      visit_id: visitId,
      event: `status_changed`,
      from_status: fromStatus,
      to_status: toStatus,
      performed_by: performedBy,
      metadata,
    })
    .select('*')
    .single()

  if (error || !event) {
    throw new Error(error?.message || 'Failed to create lifecycle event')
  }

  // Only update the visits table for statuses that exist in the visit_status enum.
  // 'overstayed', 'documents_verified', 'badge_issued', 'security_cleared',
  // 'cancelled' are lifecycle stages tracked in lifecycle_events, not visit enum values.
  const validVisitStatuses = ['pending', 'approved', 'checked_in', 'checked_out', 'rejected']
  if (validVisitStatuses.includes(toStatus)) {
    const { error: updateError } = await supabaseAdmin
      .from('visits')
      .update({ status: toStatus })
      .eq('id', visitId)

    if (updateError) {
      throw new Error(updateError.message)
    }
  }

  const auditActions: Record<string, string> = {
    documents_verified: 'Documents Verified',
    badge_issued: 'Badge Issued',
    security_cleared: 'Security Cleared',
    checked_in: 'Visitor Checked In',
    checked_out: 'Visitor Checked Out',
    overstayed: 'Visit Expired',
    approved: 'Visit Approved',
    rejected: 'Visit Rejected',
    cancelled: 'Visit Cancelled',
  }

  if (auditActions[toStatus]) {
    await logAuditAction(
      auditActions[toStatus],
      'visit',
      visitId,
      `Visit ${visitId} transitioned from ${fromStatus || 'none'} to ${toStatus}`
    )
  }

  return event as LifecycleEvent
}

export async function getMissingDocuments(visitorId: string): Promise<MissingDocumentResult> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data: existingDocs } = await supabaseAdmin
    .from('visitor_documents')
    .select('document_type')
    .eq('visitor_id', visitorId)

  const existingTypes = new Set((existingDocs || []).map((d: { document_type: string }) => d.document_type))
  const missingTypes = REQUIRED_DOCUMENT_TYPES.filter((t) => !existingTypes.has(t))

  return {
    visitor_id: visitorId,
    missing_count: missingTypes.length,
    required_types: REQUIRED_DOCUMENT_TYPES,
    missing_types: missingTypes,
  }
}

export async function checkWatchlistOnCheckIn(visitorId: string, visitId: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data: visitor } = await supabaseAdmin
    .from('visitors')
    .select('full_name, phone, email, id_number')
    .eq('id', visitorId)
    .single()

  if (!visitor) return

  const { data: watchlistMatches } = await supabaseAdmin
    .from('watchlist')
    .select('*')
    .eq('is_active', true)
    .or(`full_name.ilike.${visitor.full_name},phone.eq.${visitor.phone || ''},email.eq.${visitor.email || ''}`)

  if (watchlistMatches && watchlistMatches.length > 0) {
    await createSecurityNotification(
      'Watchlist Match',
      `Visitor ${visitor.full_name} matched watchlist entry during check-in for visit ${visitId}.`,
      'error',
      'visit',
      visitId
    )

    await supabaseAdmin.from('security_alerts').insert({
      alert_type: 'Watchlist Match',
      severity: 'Critical',
      title: 'Watchlist Match at Gate',
      message: `Visitor ${visitor.full_name} matched watchlist during check-in.`,
      related_id: visitId,
      related_type: 'visit',
    })
  }
}

export async function notifyHostOnCheckIn(visitId: string, visitorName: string, badgeNumber?: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data: visit } = await supabaseAdmin
    .from('visits')
    .select('employee_id, employee:employees(user_id, full_name)')
    .eq('id', visitId)
    .single()

  if (!visit?.employee) return

  const employee = Array.isArray(visit.employee) ? visit.employee[0] : visit.employee
  if (!employee) return

  const hostUserId = employee.user_id
  const hostName = employee.full_name

  if (!hostUserId) return

  const message = `Your visitor ${visitorName} has arrived at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${badgeNumber ? ` with badge ${badgeNumber}` : ''}.`

  await createHostNotification(
    visit.employee_id as string,
    'Visitor Arrived',
    message,
    'visitor',
    'visit',
    visitId
  )

  await createSystemNotification(
    'Visitor Arrived',
    `${visitorName} checked in. Host: ${hostName}.`,
    'visitor',
    'visit',
    visitId
  )
}

export async function processExpiredVisits(): Promise<ExpiredVisitResult[]> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const now = new Date().toISOString()

  const { data: overstayedVisits } = await supabaseAdmin
    .from('visits')
    .select('id, visitor_id, check_in_time, visitor:visitors(full_name)')
    .eq('status', 'checked_in')
    .eq('is_overdue', false)
    .lt('check_in_time', new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString())

  if (!overstayedVisits || overstayedVisits.length === 0) {
    return []
  }

  const results: ExpiredVisitResult[] = []

  for (const visit of overstayedVisits) {
    const visitor = Array.isArray(visit.visitor) ? visit.visitor[0] : visit.visitor
    const checkInTime = visit.check_in_time ? new Date(visit.check_in_time) : new Date()
    const hoursOverdue = (new Date().getTime() - checkInTime.getTime()) / (1000 * 60 * 60)

    // Mark the visit as overdue using the is_overdue boolean column.
    // 'overstayed' is NOT a valid visit_status enum value, so we do not write it to visits.status.
    await supabaseAdmin.from('visits').update({ is_overdue: true }).eq('id', visit.id)

    await supabaseAdmin.from('security_alerts').insert({
      alert_type: 'Visitor Overstayed',
      severity: 'Critical',
      title: 'Visitor Overstayed',
      message: `Visitor ${visitor?.full_name || 'Unknown'} has overstayed their visit (${hoursOverdue.toFixed(1)} hours).`,
      related_id: visit.id,
      related_type: 'visit',
    })

    await createSecurityNotification(
      'Visitor Overstayed',
      `Visitor ${visitor?.full_name || 'Unknown'} has overstayed their visit.`,
      'error',
      'visit',
      visit.id
    )

    await logAuditAction(
      'Overstay Alert',
      'visit',
      visit.id,
      `Visitor ${visitor?.full_name || 'Unknown'} overstayed by ${hoursOverdue.toFixed(1)} hours`
    )

    results.push({
      id: visit.id,
      visitor_id: visit.visitor_id,
      visitor_name: visitor?.full_name || 'Unknown',
      check_in_time: visit.check_in_time || now,
      hours_overdue: hoursOverdue,
    })
  }

  return results
}

export async function getLifecycleEvents(visitId: string): Promise<LifecycleEvent[]> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('lifecycle_events')
    .select('*')
    .eq('visit_id', visitId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data || []) as LifecycleEvent[]
}

export async function getLifecycleStats(range: 'today' | '7days' | '30days' = 'today') {
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

  const [
    avgRegistrationRes,
    avgDocVerificationRes,
    avgSecurityRes,
    avgCheckInRes,
    avgVisitDurationRes,
    avgOverstayRes,
    lifecycleCountRes,
  ] = await Promise.all([
    supabaseAdmin
      .from('lifecycle_events')
      .select('created_at, visit_id')
      .eq('event', 'status_changed')
      .eq('to_status', 'approved')
      .gte('created_at', startStr)
      .lte('created_at', endStr),
    supabaseAdmin
      .from('lifecycle_events')
      .select('created_at, visit_id')
      .eq('event', 'status_changed')
      .eq('to_status', 'documents_verified')
      .gte('created_at', startStr)
      .lte('created_at', endStr),
    supabaseAdmin
      .from('lifecycle_events')
      .select('created_at, visit_id')
      .eq('event', 'status_changed')
      .eq('to_status', 'security_cleared')
      .gte('created_at', startStr)
      .lte('created_at', endStr),
    supabaseAdmin
      .from('lifecycle_events')
      .select('created_at, visit_id')
      .eq('event', 'status_changed')
      .eq('to_status', 'checked_in')
      .gte('created_at', startStr)
      .lte('created_at', endStr),
    supabaseAdmin
      .from('visits')
      .select('check_in_time, check_out_time')
      .eq('status', 'checked_out')
      .gte('check_out_time', startStr)
      .lte('check_out_time', endStr),
    supabaseAdmin
      .from('visits')
      .select('check_in_time, created_at')
      .eq('is_overdue', true)
      .gte('created_at', startStr)
      .lte('created_at', endStr),
    supabaseAdmin
      .from('lifecycle_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startStr)
      .lte('created_at', endStr),
  ])

  const avgMinutes = (events: { created_at: string; visit_id: string }[] | undefined) => {
    if (!events || events.length === 0) return 0
    const groups = new Map<string, string[]>()
    events.forEach((e) => {
      const list = groups.get(e.visit_id) || []
      list.push(e.created_at)
      groups.set(e.visit_id, list)
    })
    let total = 0
    let count = 0
    groups.forEach((times) => {
      if (times.length >= 2) {
        const first = new Date(times[0]).getTime()
        const last = new Date(times[times.length - 1]).getTime()
        total += (last - first) / (1000 * 60)
        count++
      }
    })
    return count > 0 ? Math.round(total / count) : 0
  }

  const avgDuration = (visits: { check_in_time: string; check_out_time: string }[] | undefined) => {
    if (!visits || visits.length === 0) return 0
    const durations = visits
      .filter((v) => v.check_in_time && v.check_out_time)
      .map((v) => (new Date(v.check_out_time).getTime() - new Date(v.check_in_time).getTime()) / 60000)
    if (durations.length === 0) return 0
    return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
  }

  const avgOverstay = (visits: { check_in_time: string; created_at: string }[] | undefined) => {
    if (!visits || visits.length === 0) return 0
    const now = new Date()
    const durations = visits
      .filter((v) => v.check_in_time)
      .map((v) => (now.getTime() - new Date(v.check_in_time).getTime()) / 60000)
    if (durations.length === 0) return 0
    return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
  }

  return {
    lifecycleEvents: lifecycleCountRes.count ?? 0,
    avgRegistrationMinutes: avgMinutes(avgRegistrationRes.data ?? undefined),
    avgDocumentVerificationMinutes: avgMinutes(avgDocVerificationRes.data ?? undefined),
    avgSecurityClearanceMinutes: avgMinutes(avgSecurityRes.data ?? undefined),
    avgCheckInMinutes: avgMinutes(avgCheckInRes.data ?? undefined),
    avgVisitDurationMinutes: avgDuration(avgVisitDurationRes.data ?? undefined),
    avgOverstayMinutes: avgOverstay(avgOverstayRes.data ?? undefined),
    totalVisits: lifecycleCountRes.count ?? 0,
  }
}
