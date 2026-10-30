import { supabaseAdmin } from '@/lib/supabase-admin'
import type { WatchlistEntry, WatchlistFormData, WatchlistSeverity, SecurityAlert, SecurityAlertType, SecurityAlertSeverity, GateActivity, GateActivityType, GateDirection, GateDecision, SecurityDecision, SecurityDashboardStats, DenialReason } from '@/lib/types/security'

export async function createWatchlistEntry(data: WatchlistFormData, createdBy: string): Promise<WatchlistEntry> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data: entry, error } = await supabaseAdmin
    .from('watchlist')
    .insert({
      full_name: data.full_name,
      reason: data.reason,
      severity: data.severity,
      document_number: data.document_number || null,
      phone: data.phone || null,
      email: data.email || null,
      is_active: data.is_active ?? true,
      created_by: createdBy,
    })
    .select('*')
    .single()

  if (error || !entry) {
    throw new Error(error?.message || 'Failed to create watchlist entry')
  }

  return entry as WatchlistEntry
}

export async function getWatchlistEntries(): Promise<WatchlistEntry[]> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('watchlist')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data || []) as WatchlistEntry[]
}

export async function updateWatchlistEntry(id: string, updates: Partial<WatchlistFormData>): Promise<WatchlistEntry> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data: entry, error } = await supabaseAdmin
    .from('watchlist')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !entry) {
    throw new Error(error?.message || 'Failed to update watchlist entry')
  }

  return entry as WatchlistEntry
}

export async function deleteWatchlistEntry(id: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { error } = await supabaseAdmin
    .from('watchlist')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}

export async function checkWatchlistMatch(visitor: { full_name?: string | null; phone?: string | null; email?: string | null; doc_number?: string | null }): Promise<WatchlistEntry[]> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('watchlist')
    .select('*')
    .eq('is_active', true)

  if (error) {
    throw new Error(error.message)
  }

  if (!data) return []

  return data.filter((entry: WatchlistEntry) => {
    const nameMatch = visitor.full_name && entry.full_name.toLowerCase() === visitor.full_name.toLowerCase()
    const phoneMatch = visitor.phone && entry.phone && entry.phone === visitor.phone
    const emailMatch = visitor.email && entry.email && entry.email.toLowerCase() === visitor.email.toLowerCase()
    const docMatch = visitor.doc_number && entry.document_number && entry.document_number.toLowerCase() === visitor.doc_number.toLowerCase()
    return nameMatch || phoneMatch || emailMatch || docMatch
  }) as WatchlistEntry[]
}

export async function createSecurityAlert(data: {
  alert_type: SecurityAlertType
  severity: SecurityAlertSeverity
  title: string
  message: string
  related_id?: string | null
  related_type?: string | null
}): Promise<SecurityAlert> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data: alert, error } = await supabaseAdmin
    .from('security_alerts')
    .insert({
      alert_type: data.alert_type,
      severity: data.severity,
      title: data.title,
      message: data.message,
      related_id: data.related_id || null,
      related_type: data.related_type || null,
    })
    .select('*')
    .single()

  if (error || !alert) {
    throw new Error(error?.message || 'Failed to create security alert')
  }

  return alert as SecurityAlert
}

export async function getSecurityAlerts(unresolvedOnly = false): Promise<SecurityAlert[]> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  let query = supabaseAdmin
    .from('security_alerts')
    .select('*')
    .order('created_at', { ascending: false })

  if (unresolvedOnly) {
    query = query.eq('is_resolved', false)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return (data || []) as SecurityAlert[]
}

export async function resolveSecurityAlert(id: string, resolvedBy: string): Promise<SecurityAlert> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data: alert, error } = await supabaseAdmin
    .from('security_alerts')
    .update({ is_resolved: true, resolved_at: new Date().toISOString(), resolved_by: resolvedBy })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !alert) {
    throw new Error(error?.message || 'Failed to resolve security alert')
  }

  return alert as SecurityAlert
}

export async function createGateActivity(data: {
  visitor_id: string
  visit_id?: string | null
  badge_id?: string | null
  activity_type: GateActivityType
  direction: GateDirection
  gate?: string | null
  verified_by?: string | null
  verification_method?: string | null
  decision?: GateDecision | null
  denial_reason?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<GateActivity> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data: activity, error } = await supabaseAdmin
    .from('gate_activities')
    .insert({
      visitor_id: data.visitor_id,
      visit_id: data.visit_id || null,
      badge_id: data.badge_id || null,
      activity_type: data.activity_type,
      direction: data.direction,
      gate: data.gate || null,
      verified_by: data.verified_by || null,
      verification_method: data.verification_method || null,
      decision: data.decision || null,
      denial_reason: data.denial_reason || null,
      metadata: data.metadata || null,
    })
    .select('*')
    .single()

  if (error || !activity) {
    throw new Error(error?.message || 'Failed to create gate activity')
  }

  return activity as GateActivity
}

export async function getGateActivities(limit = 100): Promise<GateActivity[]> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data, error } = await supabaseAdmin
    .from('gate_activities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return (data || []) as GateActivity[]
}

export async function createSecurityDecision(data: {
  visitor_id: string
  visit_id?: string | null
  decision: GateDecision
  reason?: string | null
  decided_by?: string | null
}): Promise<SecurityDecision> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const { data: decision, error } = await supabaseAdmin
    .from('security_decisions')
    .insert({
      visitor_id: data.visitor_id,
      visit_id: data.visit_id || null,
      decision: data.decision,
      reason: data.reason || null,
      decided_by: data.decided_by || null,
    })
    .select('*')
    .single()

  if (error || !decision) {
    throw new Error(error?.message || 'Failed to create security decision')
  }

  return decision as SecurityDecision
}

export async function getSecurityDashboardStats(): Promise<SecurityDashboardStats> {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  const today = new Date().toISOString().split('T')[0]

  const [visitorsWaiting, visitorsCleared, visitorsDenied, visitorsInside, expiredBadges, vehiclesInside, visitorsDueToExit, watchlistMatches] = await Promise.all([
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'pending').gte('created_at', today),
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_in').gte('check_in_time', `${today}T00:00:00`),
    supabaseAdmin.from('security_decisions').select('id', { count: 'exact', head: true }).eq('decision', 'denied').gte('created_at', `${today}T00:00:00`),
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_in'),
    supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Expired'),
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_in').not('visitor_id', 'is', null).gte('check_in_time', `${today}T00:00:00`),
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_in').lt('check_in_time', new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()),
    supabaseAdmin.from('watchlist').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ])

  return {
    visitorsWaitingAtGate: visitorsWaiting.count ?? 0,
    visitorsCleared: visitorsCleared.count ?? 0,
    visitorsDenied: visitorsDenied.count ?? 0,
    visitorsCurrentlyInside: visitorsInside.count ?? 0,
    expiredBadges: expiredBadges.count ?? 0,
    vehiclesInside: vehiclesInside.count ?? 0,
    visitorsDueToExit: visitorsDueToExit.count ?? 0,
    watchlistMatches: watchlistMatches.count ?? 0,
  }
}

export async function getSecurityReports(dateRange?: { start: string; end: string }) {
  if (!supabaseAdmin) throw new Error('Service role key not configured')

  let query = supabaseAdmin
    .from('gate_activities')
    .select('*')

  if (dateRange?.start) {
    query = query.gte('created_at', dateRange.start)
  }

  if (dateRange?.end) {
    query = query.lte('created_at', dateRange.end)
  }

  const { data: activities } = await query

  const approvals = (activities || []).filter((a: { decision: string }) => a.decision === 'approved').length
  const denials = (activities || []).filter((a: { decision: string }) => a.decision === 'denied').length
  const vehicleEntries = (activities || []).filter((a: { activity_type: string }) => a.activity_type === 'vehicle_entry').length
  const vehicleExits = (activities || []).filter((a: { activity_type: string }) => a.activity_type === 'vehicle_exit').length

  return {
    approvals,
    denials,
    gateTraffic: (activities || []).length,
    vehicleTraffic: vehicleEntries + vehicleExits,
    vehicleEntries,
    vehicleExits,
  }
}
