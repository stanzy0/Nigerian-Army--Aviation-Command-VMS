import { supabaseAdmin } from '@/lib/supabase-admin'
import { isDemoMode } from '@/lib/demo'
import { logAuditAction } from '@/lib/server/audit'

export interface OperationsKpis {
  visitorsInside: number
  waitingReception: number
  waitingDocumentVerification: number
  waitingBadgePrinting: number
  waitingSecurityClearance: number
  approvedWaitingCheckIn: number
  checkedIn: number
  checkedOutToday: number
  overstayedVisitors: number
  activeSecurityAlerts: number
  visitorsLeavingToday: number
}

export interface OperationsVisitor {
  id: string
  registration_number: string | null
  status: string
  visitor_type: string
  source: string
  check_in_time: string | null
  check_out_time: string | null
  expires_at: string | null
  created_at: string
  visitor: {
    full_name: string
    visitor_organization: string | null
    photo_url: string | null
  } | null
  employee: {
    full_name: string
    department: string | null
    office_location: string | null
  } | null
  badge: {
    id: string
    badge_number: string
    badge_status: string
    printed_at: string | null
    expires_at: string
  } | null
}

export interface ActivityItem {
  id: string
  type: string
  message: string
  timestamp: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  icon: string
  color: string
}

export interface QueueItem {
  id: string
  visitor_name: string
  company: string | null
  host: string | null
  department: string | null
  waiting_since: string
  status: string
}

export interface OverstayVisitor {
  id: string
  visitor_name: string
  company: string | null
  host: string | null
  office: string | null
  hours_overdue: number
  check_in_time: string | null
  badge_number: string | null
}

export interface SecurityAlertItem {
  id: string
  alert_type: string
  severity: string
  title: string
  message: string
  is_resolved: boolean
  created_at: string
}

export interface HostAvailability {
  available: Array<{ id: string; full_name: string; department: string | null }>
  unavailable: Array<{ id: string; full_name: string; department: string | null; reason: string }>
  outsideOffice: Array<{ id: string; full_name: string; office_location: string | null }>
}

export interface OfficeOccupancy {
  department: string
  office_location: string
  visitor_count: number
}

export interface ActiveBadge {
  id: string
  badge_number: string
  visitor_name: string
  company: string | null
  issued_at: string
  expires_at: string
  status: string
  visit_id: string
}

export interface ActivePropertyItem {
  id: string
  visit_id: string
  visitor_name: string
  property_type: string
  description: string | null
  status: string
  created_at: string
}

export async function getOperationsKpis(): Promise<OperationsKpis> {
  if (!supabaseAdmin) {
    return {
      visitorsInside: 0, waitingReception: 0, waitingDocumentVerification: 0,
      waitingBadgePrinting: 0, waitingSecurityClearance: 0, approvedWaitingCheckIn: 0,
      checkedIn: 0, checkedOutToday: 0, overstayedVisitors: 0, activeSecurityAlerts: 0,
      visitorsLeavingToday: 0,
    }
  }

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const [
    insideRes,
    waitingReceptionRes,
    approvedRes,
    checkedOutTodayRes,
    overstayedRes,
    alertsRes,
  ] = await Promise.all([
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_in'),
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_out').gte('check_out_time', todayStart).lt('check_out_time', todayEnd),
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'overstayed'),
    supabaseAdmin.from('security_alerts').select('id', { count: 'exact', head: true }).eq('is_resolved', false),
  ])

  const checkedInCount = insideRes.count || 0
  const approvedCount = approvedRes.count || 0

  const approvedVisits = await supabaseAdmin
    .from('visits')
    .select('id')
    .eq('status', 'approved')

  const approvedIds = (approvedVisits.data || []).map((v: { id: string }) => v.id)

  const badgesWithNoPrint = await supabaseAdmin
    .from('visitor_badges')
    .select('visit_id', { count: 'exact', head: true })
    .eq('badge_status', 'Active')
    .is('printed_at', null)
    .in('visit_id', approvedIds.length > 0 ? approvedIds : ['00000000-0000-0000-0000-000000000000'])

  const approvedWithBadgeNotPrinted = approvedIds.length > 0
    ? (badgesWithNoPrint.count || 0)
    : 0

  const badgesWithPrint = await supabaseAdmin
    .from('visitor_badges')
    .select('visit_id', { count: 'exact', head: true })
    .eq('badge_status', 'Active')
    .not('printed_at', 'is', null)
    .in('visit_id', approvedIds.length > 0 ? approvedIds : ['00000000-0000-0000-0000-000000000000'])

  const approvedWithBadgePrinted = approvedWithBadgeNotPrinted > 0
    ? (badgesWithPrint.count || 0)
    : 0

  const waitingSecurityClearance = Math.max(0, approvedCount - approvedWithBadgeNotPrinted - approvedWithBadgePrinted)
  const approvedWaitingCheckIn = Math.max(0, approvedCount - approvedWithBadgeNotPrinted)

  const pendingDocVerifications = await supabaseAdmin
    .from('visitor_documents')
    .select('id', { count: 'exact', head: true })
    .eq('verification_status', 'Pending')

  const visitorsLeavingToday = checkedOutTodayRes.count || 0

  return {
    visitorsInside: checkedInCount,
    waitingReception: waitingReceptionRes.count || 0,
    waitingDocumentVerification: pendingDocVerifications.count || 0,
    waitingBadgePrinting: approvedWithBadgeNotPrinted,
    waitingSecurityClearance: Math.max(0, waitingSecurityClearance),
    approvedWaitingCheckIn: Math.max(0, approvedWaitingCheckIn),
    checkedIn: checkedInCount,
    checkedOutToday: visitorsLeavingToday,
    overstayedVisitors: overstayedRes.count || 0,
    activeSecurityAlerts: alertsRes.count || 0,
    visitorsLeavingToday,
  }
}

export async function getLiveVisitors(page: number = 1, limit: number = 50, search: string = '', filters: Record<string, string> = {}): Promise<{ data: OperationsVisitor[]; total: number }> {
  if (!supabaseAdmin) {
    return { data: [], total: 0 }
  }

  const offset = (page - 1) * limit
  let query = supabaseAdmin
    .from('visits')
    .select('*, visitor:visitors(*), employee:employees(*), badge:visitor_badges(*)', { count: 'exact' })
    .in('status', ['pending', 'approved', 'checked_in', 'overstayed'])
    .order('created_at', { ascending: false })

  if (search) {
    query = query.or(`registration_number.ilike.%${search}%,visitor.full_name.ilike.%${search}%,employee.full_name.ilike.%${search}%,badge.badge_number.ilike.%${search}%`)
  }

  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.visitorType) {
    query = query.eq('visitor_type', filters.visitorType)
  }
  if (filters.department) {
    query = query.eq('employee.department', filters.department)
  }
  if (filters.officeLocation) {
    query = query.eq('employee.office_location', filters.officeLocation)
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1)

  if (error) {
    console.error('Error fetching live visitors:', error)
    return { data: [], total: 0 }
  }

  return {
    data: (data || []) as OperationsVisitor[],
    total: count || 0,
  }
}

export async function getActivityFeed(limit: number = 50): Promise<ActivityItem[]> {
  if (!supabaseAdmin) {
    return []
  }

  const activities: ActivityItem[] = []

  const lifecycleEvents = await supabaseAdmin
    .from('lifecycle_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  lifecycleEvents.data?.forEach((event: { id: string; to_status: string; from_status?: string; created_at: string }) => {
    const priority = ['checked_out', 'rejected', 'overstayed'].includes(event.to_status) ? 'high' : 'medium'
    activities.push({
      id: event.id,
      type: 'lifecycle',
      message: `Visit ${event.to_status.replace('_', ' ')}${event.from_status ? ` from ${event.from_status}` : ''}`,
      timestamp: event.created_at,
      priority,
      icon: 'Activity',
      color: priority === 'high' ? 'red' : 'blue',
    })
  })

  const auditLogs = await supabaseAdmin
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  auditLogs.data?.forEach((log: { id: string; action: string; created_at: string }) => {
    let priority: ActivityItem['priority'] = 'low'
    let icon = 'FileText'
    let color = 'gray'

    if (log.action.includes('Rejected') || log.action.includes('Denied')) {
      priority = 'high'
      icon = 'XCircle'
      color = 'red'
    } else if (log.action.includes('Approved') || log.action.includes('Printed')) {
      priority = 'medium'
      icon = 'CheckCircle'
      color = 'green'
    } else if (log.action.includes('Emergency')) {
      priority = 'critical'
      icon = 'AlertTriangle'
      color = 'red'
    }

    activities.push({
      id: log.id,
      type: 'audit',
      message: log.action,
      timestamp: log.created_at,
      priority,
      icon,
      color,
    })
  })

  const notifications = await supabaseAdmin
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  notifications.data?.forEach((notif: { id: string; title: string; type: string; created_at: string }) => {
    let priority: ActivityItem['priority'] = 'medium'
    let icon = 'Bell'
    let color = 'blue'

    if (notif.type === 'watchlist_match') {
      priority = 'critical'
      icon = 'ShieldAlert'
      color = 'red'
    } else if (notif.type === 'security_alert') {
      priority = 'high'
      icon = 'AlertTriangle'
      color = 'amber'
    }

    activities.push({
      id: notif.id,
      type: 'notification',
      message: notif.title,
      timestamp: notif.created_at,
      priority,
      icon,
      color,
    })
  })

  const alerts = await supabaseAdmin
    .from('security_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  alerts.data?.forEach((alert: { id: string; alert_type: string; severity: string; title: string; created_at: string }) => {
    activities.push({
      id: alert.id,
      type: 'security_alert',
      message: `${alert.alert_type}: ${alert.title}`,
      timestamp: alert.created_at,
      priority: alert.severity === 'Critical' ? 'critical' : 'high',
      icon: 'ShieldAlert',
      color: alert.severity === 'Critical' ? 'red' : 'amber',
    })
  })

  return activities
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit)
}

export async function getWaitingQueues(): Promise<{
  reception: QueueItem[]
  badge: QueueItem[]
  security: QueueItem[]
  document: QueueItem[]
  exit: QueueItem[]
}> {
  if (!supabaseAdmin) {
    return { reception: [], badge: [], security: [], document: [], exit: [] }
  }

  const reception = await supabaseAdmin
    .from('visits')
    .select('id, visitor:visitors(full_name, visitor_organization), employee:employees(full_name, department), created_at, status')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(20)

  const approved = await supabaseAdmin
    .from('visits')
    .select('id, visitor:visitors(full_name, visitor_organization), employee:employees(full_name, department), badge:visitor_badges(printed_at), created_at, status')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })

  const approvedData = (approved.data || []) as Array<{ id: string; visitor?: { full_name?: string; visitor_organization?: string | null } | null; employee?: { full_name?: string; department?: string | null } | null; badge?: { printed_at?: string | null } | null; created_at: string; status: string }>

  const badgeQueue = approvedData.filter((v) => !v.badge?.printed_at).map((v) => ({
    id: v.id,
    visitor_name: typeof v.visitor === 'object' && v.visitor !== null ? String(v.visitor.full_name || 'Unknown') : 'Unknown',
    company: typeof v.visitor === 'object' && v.visitor !== null ? v.visitor.visitor_organization ?? null : null,
    host: typeof v.employee === 'object' && v.employee !== null ? v.employee.full_name ?? null : null,
    department: typeof v.employee === 'object' && v.employee !== null ? v.employee.department ?? null : null,
    waiting_since: v.created_at,
    status: v.status,
  }))

  const securityQueue = approvedData.filter((v) => v.badge?.printed_at).map((v) => ({
    id: v.id,
    visitor_name: typeof v.visitor === 'object' && v.visitor !== null ? String(v.visitor.full_name || 'Unknown') : 'Unknown',
    company: typeof v.visitor === 'object' && v.visitor !== null ? v.visitor.visitor_organization ?? null : null,
    host: typeof v.employee === 'object' && v.employee !== null ? v.employee.full_name ?? null : null,
    department: typeof v.employee === 'object' && v.employee !== null ? v.employee.department ?? null : null,
    waiting_since: v.created_at,
    status: v.status,
  }))

  const documentQueue = await supabaseAdmin
    .from('visitor_documents')
    .select('id, visit_id, verification_status, created_at, visitor:visitors(full_name, visitor_organization)')
    .eq('verification_status', 'Pending')
    .order('created_at', { ascending: true })
    .limit(20)

  const documentQueueData = (documentQueue.data || []) as Array<{ id: string; visitor?: { full_name?: string; visitor_organization?: string | null } | null; visit?: { employee?: { full_name?: string; department?: string | null } | null } | null; created_at: string; verification_status: string }>
  const document = documentQueueData.map((d) => ({
    id: d.id,
    visitor_name: typeof d.visitor === 'object' && d.visitor !== null ? String(d.visitor.full_name || 'Unknown') : 'Unknown',
    company: typeof d.visitor === 'object' && d.visitor !== null ? d.visitor.visitor_organization ?? null : null,
    host: typeof d.visit?.employee === 'object' && d.visit.employee !== null ? d.visit.employee.full_name ?? null : null,
    department: typeof d.visit?.employee === 'object' && d.visit.employee !== null ? d.visit.employee.department ?? null : null,
    waiting_since: d.created_at,
    status: d.verification_status,
  }))

  const exitQueue = await supabaseAdmin
    .from('visits')
    .select('id, visitor:visitors(full_name, visitor_organization), employee:employees(full_name, department), created_at, status')
    .in('status', ['checked_out', 'overstayed'])
    .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toISOString())
    .order('created_at', { ascending: true })
    .limit(20)

  const receptionData = (reception.data || []) as Array<{ id: string; visitor?: { full_name?: string; visitor_organization?: string | null } | null; employee?: { full_name?: string; department?: string | null } | null; created_at: string; status: string }>
  const exitQueueData = (exitQueue.data || []) as Array<{ id: string; visitor?: { full_name?: string; visitor_organization?: string | null } | null; employee?: { full_name?: string; department?: string | null } | null; created_at: string; status: string }>

  return {
    reception: receptionData.map((v) => ({
      id: v.id,
      visitor_name: typeof v.visitor === 'object' && v.visitor !== null ? String(v.visitor.full_name || 'Unknown') : 'Unknown',
      company: typeof v.visitor === 'object' && v.visitor !== null ? v.visitor.visitor_organization ?? null : null,
      host: typeof v.employee === 'object' && v.employee !== null ? v.employee.full_name ?? null : null,
      department: typeof v.employee === 'object' && v.employee !== null ? v.employee.department ?? null : null,
      waiting_since: v.created_at,
      status: v.status,
    })),
    badge: badgeQueue,
    security: securityQueue,
    document,
    exit: exitQueueData.map((v) => ({
      id: v.id,
      visitor_name: typeof v.visitor === 'object' && v.visitor !== null ? String(v.visitor.full_name || 'Unknown') : 'Unknown',
      company: typeof v.visitor === 'object' && v.visitor !== null ? v.visitor.visitor_organization ?? null : null,
      host: typeof v.employee === 'object' && v.employee !== null ? v.employee.full_name ?? null : null,
      department: typeof v.employee === 'object' && v.employee !== null ? v.employee.department ?? null : null,
      waiting_since: v.created_at,
      status: v.status,
    })),
  }
}

export async function getOverstayPanel(): Promise<OverstayVisitor[]> {
  if (!supabaseAdmin) {
    return []
  }

  const { data } = await supabaseAdmin
    .from('visits')
    .select('*, visitor:visitors(full_name, visitor_organization, photo_url, emergency_contact), employee:employees(full_name, office_location), badge:visitor_badges(badge_number)')
    .lt('expires_at', new Date().toISOString())
    .not('status', 'in', '("checked_out","rejected","cancelled")')
    .order('expires_at', { ascending: true })
    .limit(50)

  if (!data) return []

  const overstayData = data as Array<{ id: string; check_in_time?: string | null; expires_at?: string | null; created_at: string; visitor?: { full_name?: string; visitor_organization?: string | null; emergency_contact?: string | null } | null; employee?: { full_name?: string; office_location?: string | null } | null; badge?: { badge_number?: string | null } | null }>

  return overstayData.map((v) => {
    const checkIn = v.check_in_time ? new Date(v.check_in_time) : new Date(v.created_at)
    const expires = v.expires_at ? new Date(v.expires_at) : new Date(checkIn.getTime() + 24 * 60 * 60 * 1000)
    const hoursOverdue = Math.max(0, Math.round((new Date().getTime() - expires.getTime()) / (1000 * 60 * 60)))

    return {
      id: v.id,
      visitor_name: typeof v.visitor === 'object' && v.visitor !== null ? String(v.visitor.full_name || 'Unknown') : 'Unknown',
      company: typeof v.visitor === 'object' && v.visitor !== null ? v.visitor.visitor_organization ?? null : null,
      host: typeof v.employee === 'object' && v.employee !== null ? v.employee.full_name ?? null : null,
      office: typeof v.employee === 'object' && v.employee !== null ? v.employee.office_location ?? null : null,
      hours_overdue: hoursOverdue,
      check_in_time: v.check_in_time ?? null,
      badge_number: typeof v.badge === 'object' && v.badge !== null ? v.badge.badge_number ?? null : null,
    }
  })
}

export async function getSecurityPanel(): Promise<{
  watchlistMatches: number
  deniedEntry: number
  activeHolds: number
  criticalAlerts: number
  emergencyAlerts: number
  recentAlerts: SecurityAlertItem[]
}> {
  if (!supabaseAdmin) {
    return { watchlistMatches: 0, deniedEntry: 0, activeHolds: 0, criticalAlerts: 0, emergencyAlerts: 0, recentAlerts: [] }
  }

  const today = new Date().toISOString().split('T')[0]

  const [watchlist, denied, holds, critical, emergency] = await Promise.all([
    supabaseAdmin.from('notifications').select('id', { count: 'exact', head: true }).eq('type', 'watchlist_match').gte('created_at', today),
    supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'rejected').gte('created_at', today),
    supabaseAdmin.from('security_alerts').select('id', { count: 'exact', head: true }).eq('is_resolved', false),
    supabaseAdmin.from('security_alerts').select('id', { count: 'exact', head: true }).eq('is_resolved', false).eq('severity', 'Critical'),
    supabaseAdmin.from('security_alerts').select('id', { count: 'exact', head: true }).eq('is_resolved', false).eq('alert_type', 'Emergency'),
  ])

  const recentAlerts = await supabaseAdmin
    .from('security_alerts')
    .select('id, alert_type, severity, title, message, is_resolved, created_at')
    .eq('is_resolved', false)
    .order('created_at', { ascending: false })
    .limit(10)

  return {
    watchlistMatches: watchlist.count || 0,
    deniedEntry: denied.count || 0,
    activeHolds: holds.count || 0,
    criticalAlerts: critical.count || 0,
    emergencyAlerts: emergency.count || 0,
    recentAlerts: (recentAlerts.data || []) as SecurityAlertItem[],
  }
}

export async function getHostAvailability(): Promise<HostAvailability> {
  if (!supabaseAdmin) {
    return { available: [], unavailable: [], outsideOffice: [] }
  }

  const employees = await supabaseAdmin
    .from('employees')
    .select('id, full_name, department, office_location, status')
    .order('full_name', { ascending: true })

  const activeVisits = await supabaseAdmin
    .from('visits')
    .select('employee_id')
    .eq('status', 'checked_in')

  const activeVisitEmployeeIds = new Set((activeVisits.data || []).map((v: { employee_id: string }) => v.employee_id))

  const available: Array<{ id: string; full_name: string; department: string | null }> = []
  const unavailable: Array<{ id: string; full_name: string; department: string | null; reason: string }> = []
  const outsideOffice: Array<{ id: string; full_name: string; office_location: string | null }> = []

  const employeesList = (employees.data || []) as Array<{ id: string; full_name: string; department: string | null; office_location: string | null; status: string }>

  employeesList.forEach((emp: { id: string; full_name: string; department: string | null; office_location: string | null; status: string }) => {
    if (emp.status !== 'active') {
      unavailable.push({ id: emp.id, full_name: emp.full_name, department: emp.department, reason: 'Inactive' })
      return
    }

    if (activeVisitEmployeeIds.has(emp.id)) {
      return
    }

    available.push({ id: emp.id, full_name: emp.full_name, department: emp.department })

    if (!emp.office_location) {
      outsideOffice.push({ id: emp.id, full_name: emp.full_name, office_location: emp.office_location })
    }
  })

  return { available, unavailable, outsideOffice }
}

export async function getOfficeOccupancy(): Promise<OfficeOccupancy[]> {
  if (!supabaseAdmin) {
    return []
  }

  const { data } = await supabaseAdmin
    .from('visits')
    .select('employee:employees(department, office_location)')
    .eq('status', 'checked_in')

  if (!data) return []

  const map = new Map<string, { department: string; office_location: string; visitor_count: number }>()

  const officeData = data as Array<{ employee?: { department?: string; office_location?: string } | null }>
  officeData.forEach((v) => {
    const dept = typeof v.employee === 'object' && v.employee !== null ? String(v.employee.department || 'Unknown') : 'Unknown'
    const office = typeof v.employee === 'object' && v.employee !== null ? String(v.employee.office_location || 'Unknown') : 'Unknown'
    const key = `${dept}|${office}`
    const existing = map.get(key)
    if (existing) {
      existing.visitor_count++
    } else {
      map.set(key, { department: dept, office_location: office, visitor_count: 1 })
    }
  })

  return Array.from(map.values()).sort((a, b) => b.visitor_count - a.visitor_count)
}

export async function getActiveBadges(): Promise<ActiveBadge[]> {
  if (!supabaseAdmin) {
    return []
  }

  const { data } = await supabaseAdmin
    .from('visitor_badges')
    .select('id, badge_number, badge_status, issued_at, expires_at, visit_id, visit:visits(visitor:visitors(full_name, visitor_organization))')
    .eq('badge_status', 'Active')
    .order('issued_at', { ascending: false })
    .limit(100)

  if (!data) return []

  const badgeData = data as Array<{ id: string; badge_number: string; badge_status: string; issued_at: string; expires_at: string; visit_id: string; visit?: { visitor?: { full_name?: string; visitor_organization?: string | null } | null } | null }>

  return badgeData.map((b) => {
    const visitorName = typeof b.visit?.visitor === 'object' && b.visit?.visitor !== null ? String(b.visit.visitor.full_name || 'Unknown') : 'Unknown'
    const company = typeof b.visit?.visitor === 'object' && b.visit?.visitor !== null ? b.visit.visitor.visitor_organization ?? null : null
    return {
      id: b.id,
      badge_number: b.badge_number,
      visitor_name: visitorName,
      company: company,
      issued_at: b.issued_at,
      expires_at: b.expires_at,
      status: b.badge_status,
      visit_id: b.visit_id,
    }
  })
}

export async function getActiveProperty(): Promise<ActivePropertyItem[]> {
  if (!supabaseAdmin) {
    return []
  }

  const { data } = await supabaseAdmin
    .from('property_items')
    .select('id, visit_id, property_type, description, status, created_at, visit:visits(visitor:visitors(full_name))')
    .in('status', ['Registered', 'Confiscated', 'Pending Release'])
    .order('created_at', { ascending: false })
    .limit(100)

  if (!data) return []

  const propertyData = data as Array<{ id: string; visit_id: string; property_type: string; description: string | null; status: string; created_at: string; visit?: { visitor?: { full_name?: string | null } | null } | null }>

  return propertyData.map((p) => {
    const visitorName = typeof p.visit?.visitor === 'object' && p.visit?.visitor !== null ? String(p.visit.visitor.full_name || 'Unknown') : 'Unknown'
    return {
      id: p.id,
      visit_id: p.visit_id,
      visitor_name: visitorName,
      property_type: p.property_type,
      description: p.description,
      status: p.status,
      created_at: p.created_at,
    }
  })
}

export async function forceCheckout(visitId: string, performedBy: string | null): Promise<boolean> {
  if (isDemoMode()) {
    await logAuditAction('Force Check-out', 'visit', visitId, `Force check-out performed on visit ${visitId} (demo mode)`)
    return true
  }

  if (!supabaseAdmin) return false

  // Use the atomic status-change function for checked_in -> checked_out transition.
  const { applyVisitStatusChange } = await import('./visit-status')
  const result = await applyVisitStatusChange(visitId, 'checked_out', {
    auditAction: 'Force Check-out',
    auditDetails: `Force check-out performed on visit ${visitId}`,
    approvedBy: performedBy,
  })

  if (result.outcome !== 'success') {
    console.error('Force checkout error:', result.message)
    return false
  }

  await logAuditAction('Force Check-out', 'visit', visitId, `Force check-out performed on visit ${visitId}`)
  return true
}

export async function activateEmergencyLockdown(performedBy: string): Promise<boolean> {
  if (!supabaseAdmin) return false

  const { error } = await supabaseAdmin
    .from('emergency_sessions')
    .insert({
      is_active: true,
      started_by: performedBy,
      started_at: new Date().toISOString(),
    })

  if (error) {
    console.error('Emergency lockdown error:', error)
    return false
  }

  await logAuditAction('Emergency Lockdown Enabled', 'system', null, `Emergency lockdown activated by ${performedBy}`)
  return true
}

export async function deactivateEmergencyLockdown(performedBy: string): Promise<boolean> {
  if (!supabaseAdmin) return false

  const { data: activeSession } = await supabaseAdmin
    .from('emergency_sessions')
    .select('id')
    .eq('is_active', true)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!activeSession) return false

  const { error } = await supabaseAdmin
    .from('emergency_sessions')
    .update({ is_active: false, ended_at: new Date().toISOString(), ended_by: performedBy })
    .eq('id', activeSession.id)

  if (error) {
    console.error('Emergency deactivation error:', error)
    return false
  }

  await logAuditAction('Emergency Lockdown Disabled', 'system', null, `Emergency lockdown deactivated by ${performedBy}`)
  return true
}

export async function isEmergencyActive(): Promise<boolean> {
  if (!supabaseAdmin) return false

  const { data } = await supabaseAdmin
    .from('emergency_sessions')
    .select('id', { head: true })
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  return !!data
}
