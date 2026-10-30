import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth'
import { isDemoMode } from '@/lib/demo'
import { SecurityAlert, ActivityItem, ChartDataPoint } from '@/hooks/useDashboardData'

export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({
      success: true,
      data: {
        visitorsToday: 0,
        visitorsThisWeek: 0,
        visitorsThisMonth: 0,
        visitorsCurrentlyInside: 0,
        pendingApprovals: 0,
        checkedIn: 0,
        checkedOut: 0,
        activeBadges: 0,
        cancelledBadges: 0,
        expiredBadges: 0,
        registeredEmployees: 0,
        officeLocations: 0,
        auditEventsToday: 0,
        badgesGenerated: 0,
        badgesPrinted: 0,
        badgesReprinted: 0,
        documentsUploadedToday: 0,
        pendingVerification: 0,
        verifiedDocuments: 0,
        rejectedDocuments: 0,
        missingDocuments: 0,
        badgesAwaitingPrint: 0,
        expiringToday: 0,
        visitorsTrend: 0,
        yesterdayTotal: 0,
        visitorsWaitingVerification: 0,
        visitorsWaitingBadge: 0,
        visitorsWaitingSecurity: 0,
        visitorsOverstayed: 0,
        chartData: {
          visitorsByDay: [],
          visitorsByMonth: [],
          visitorsByDepartment: [],
          visitorsByHost: [],
          visitorsByCompany: [],
          visitorsByPurpose: [],
          badgeStatusDistribution: [],
          employeesByDepartment: [],
        },
        securityAlerts: [],
        activity: [],
        recentVisitors: [],
      }
    })
  }

  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: 'Service role not configured' }, { status: 500 })
    }

    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString()
    const todayStart = new Date(todayStr + 'T00:00:00.000Z').toISOString()
    const todayEnd = new Date(todayStr + 'T23:59:59.999Z').toISOString()

    const [
      todayVisitorsRes,
      weekVisitorsRes,
      monthVisitorsRes,
      onSiteRes,
      pendingRes,
      checkedInRes,
      checkedOutRes,
      activeBadgesRes,
      cancelledBadgesRes,
      expiredBadgesRes,
      employeesRes,
      officesRes,
      auditTodayRes,
      badgesGeneratedRes,
      badgesPrintedRes,
      badgesReprintedRes,
      docsTodayRes,
      pendingVerificationRes,
      verifiedDocumentsRes,
      rejectedDocumentsRes,
      visitorsWaitingVerificationRes,
      visitorsWaitingBadgeRes,
      visitorsWaitingSecurityRes,
      visitorsOverstayedRes,
      yesterdayVisitorsRes,
    ] = await Promise.all([
      supabaseAdmin.from('visitors').select('id', { count: 'exact', head: true }).gte('created_at', todayStart).lte('created_at', todayEnd),
      supabaseAdmin.from('visitors').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabaseAdmin.from('visitors').select('id', { count: 'exact', head: true }).gte('created_at', monthAgo),
      supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_in'),
      supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_in'),
      supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_out'),
      supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Active'),
      supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Cancelled'),
      supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Expired'),
      supabaseAdmin.from('employees').select('id', { count: 'exact', head: true }).not('user_id', 'is', null),
      supabaseAdmin.from('office_locations').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('audit_logs').select('id', { count: 'exact', head: true }).gte('created_at', todayStart).lte('created_at', todayEnd),
      supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).gte('created_at', todayStart).lte('created_at', todayEnd),
      supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).not('printed_at', 'is', null).gte('printed_at', todayStart).lte('printed_at', todayEnd),
      supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).gte('reprint_count', 1).gte('updated_at', todayStart).lte('updated_at', todayEnd),
      supabaseAdmin.from('visitor_documents').select('id', { count: 'exact', head: true }).gte('created_at', todayStart).lte('created_at', todayEnd),
      supabaseAdmin.from('visitor_documents').select('id', { count: 'exact', head: true }).eq('verification_status', 'Pending'),
      supabaseAdmin.from('visitor_documents').select('id', { count: 'exact', head: true }).eq('verification_status', 'Verified'),
      supabaseAdmin.from('visitor_documents').select('id', { count: 'exact', head: true }).eq('verification_status', 'Rejected'),
      supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', todayStart).lte('created_at', todayEnd),
      (async () => {
        const { data: approvedVisits } = await supabaseAdmin.from('visits').select('id').eq('status', 'approved')
        const visitIds = (approvedVisits || []).map((v: { id: string }) => v.id)
        if (visitIds.length === 0) return { count: 0 }
        const { count } = await supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).in('visit_id', visitIds)
        return { count: Math.max(0, visitIds.length - (count ?? 0)) }
      })(),
      supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_in').lt('expires_at', now.toISOString()),
      supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_in').lt('check_in_time', new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString()),
      supabaseAdmin.from('visitors').select('id', { count: 'exact', head: true }).gte('created_at', yesterday).lt('created_at', todayStart),
    ])

    const todayVisitors = todayVisitorsRes.count ?? 0
    const yesterdayTotal = yesterdayVisitorsRes.count ?? 0
    const visitorsTrend = yesterdayTotal > 0 ? ((todayVisitors - yesterdayTotal) / yesterdayTotal) : 0

    const missingDocsRes = await (async () => {
      const { data: docVisitorIds } = await supabaseAdmin
        .from('visitor_documents')
        .select('visitor_id')
        .not('visitor_id', 'is', null)
      const uniqueVisitorIds = [...new Set((docVisitorIds || []).map((d: { visitor_id: string }) => d.visitor_id).filter(Boolean))]
      if (uniqueVisitorIds.length === 0) {
        const { count } = await supabaseAdmin.from('visitors').select('id', { count: 'exact', head: true })
        return { count: count ?? 0 }
      }
      const filter = `(${uniqueVisitorIds.join(',')})`
      const { count } = await supabaseAdmin.from('visitors').select('id', { count: 'exact', head: true }).not('id', 'in', filter)
      return { count: count ?? 0 }
    })()

    const badgesAwaitingPrintRes = await (async () => {
      const { data: visits } = await supabaseAdmin.from('visits').select('id').eq('status', 'approved')
      const visitIds = (visits || []).map((v: { id: string }) => v.id)
      if (visitIds.length === 0) return { count: 0 }
      const { count } = await supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).in('visit_id', visitIds)
      return { count: Math.max(0, visitIds.length - (count ?? 0)) }
    })()

    const expiringTodayRes = await supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_in').lt('expires_at', todayEnd).gte('expires_at', todayStart)

    const [
      byDayRes,
      byMonthRes,
      byDeptRes,
      byHostRes,
      byOrgRes,
      byPurposeRes,
      badgeStatusRes,
      empByDeptRes,
      overstayedRes,
      expiredVisitsRes,
      missingCheckoutRes,
      cancelledBadgeActiveRes,
    ] = await Promise.all([
      supabaseAdmin.from('visits').select('created_at').gte('created_at', monthAgo).order('created_at', { ascending: true }),
      supabaseAdmin.from('visits').select('created_at').gte('created_at', yearStart),
      supabaseAdmin.from('visits').select('employee:employees(department)').gte('created_at', monthAgo).neq('status', 'rejected'),
      supabaseAdmin.from('visits').select('employee:employees(full_name)').gte('created_at', monthAgo).neq('status', 'rejected'),
      supabaseAdmin.from('visits').select('visitor:visitors(visitor_organization)').gte('created_at', monthAgo).neq('status', 'rejected'),
      supabaseAdmin.from('visits').select('purpose').gte('created_at', monthAgo).neq('status', 'rejected'),
      supabaseAdmin.from('visitor_badges').select('badge_status').gte('created_at', monthAgo),
      supabaseAdmin.from('employees').select('department').eq('status', 'active'),
      supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_in').lt('check_in_time', new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString()),
      supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_in').lt('expires_at', now.toISOString()),
      supabaseAdmin.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_out').is('check_out_time', null),
      supabaseAdmin.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Cancelled').eq('is_active', true),
    ])

    const activityRes = await supabaseAdmin
      .from('audit_logs')
      .select('action, details, created_at, entity_type')
      .order('created_at', { ascending: false })
      .limit(20)

    const recentVisitorsRes = await supabaseAdmin
      .from('visits')
      .select('id, status, created_at, purpose, visitor:visitors(full_name, photo_url), employee:employees(full_name, department)')
      .order('created_at', { ascending: false })
      .limit(8)

    const processByDay = (data: { created_at: string | null | undefined }[] | undefined): ChartDataPoint[] => {
      const map = new Map<string, number>()
      data?.forEach((r) => {
        if (!r.created_at) return
        const d = new Date(r.created_at).toISOString().split('T')[0]
        map.set(d, (map.get(d) || 0) + 1)
      })
      return Array.from(map.entries())
        .map(([date, count]) => ({ name: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }

    const processByMonth = (data: { created_at: string | null | undefined }[] | undefined): ChartDataPoint[] => {
      const map = new Map<string, number>()
      data?.forEach((r) => {
        if (!r.created_at) return
        const d = new Date(r.created_at)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        map.set(key, (map.get(key) || 0) + 1)
      })
      return Array.from(map.entries())
        .map(([month, count]) => ({ name: month, count }))
    }

    const processField = (data: Record<string, unknown>[] | undefined, field: string): ChartDataPoint[] => {
      const map = new Map<string, number>()
      data?.forEach((r) => {
        const val = typeof r[field] === 'object' && r[field] !== null ? Object.values(r[field])[0] : r[field]
        const key = val || 'Unknown'
        map.set(key as string, (map.get(key as string) || 0) + 1)
      })
      return Array.from(map.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    }

    const visitorsByDay = processByDay(byDayRes.data || [])
    const visitorsByMonth = processByMonth(byMonthRes.data || [])
    const visitorsByDepartment = processField(byDeptRes.data || [], 'department')
    const visitorsByHost = processField(byHostRes.data || [], 'full_name')
    const visitorsByCompany = processField(byOrgRes.data || [], 'visitor_organization')
    const visitorsByPurpose = processField(byPurposeRes.data || [], 'purpose')

    const badgeStatusMap = new Map<string, number>()
    badgeStatusRes.data?.forEach((r: { badge_status: string }) => {
      const status = r.badge_status || 'Unknown'
      badgeStatusMap.set(status, (badgeStatusMap.get(status) || 0) + 1)
    })
    const badgeStatusDistribution = Array.from(badgeStatusMap.entries()).map(([name, count]) => ({ name, count }))

    const empDeptMap = new Map<string, number>()
    empByDeptRes.data?.forEach((r: { department: string }) => {
      const dept = r.department || 'Unknown'
      empDeptMap.set(dept, (empDeptMap.get(dept) || 0) + 1)
    })
    const employeesByDepartment = Array.from(empDeptMap.entries()).map(([name, count]) => ({ name, count }))

    const alerts: SecurityAlert[] = []
    if ((overstayedRes.count ?? 0) > 0) alerts.push({ type: 'overstayed', label: 'Overstayed Visitors', count: overstayedRes.count ?? 0, severity: 'critical' })
    if ((expiredVisitsRes.count ?? 0) > 0) alerts.push({ type: 'expired_visit', label: 'Expired Visits', count: expiredVisitsRes.count ?? 0, severity: 'warning' })
    if ((missingCheckoutRes.count ?? 0) > 0) alerts.push({ type: 'missing_checkout', label: 'Missing Check-Out', count: missingCheckoutRes.count ?? 0, severity: 'critical' })
    if ((cancelledBadgeActiveRes.count ?? 0) > 0) alerts.push({ type: 'cancelled_badge_active', label: 'Cancelled Badges Still Active', count: cancelledBadgeActiveRes.count ?? 0, severity: 'warning' })

    const activity: ActivityItem[] = (activityRes.data || []).map((r: { created_at: string; action: string; details: string; entity_type?: string }) => ({
      id: `${r.created_at}-${r.action}`,
      action: r.action,
      details: r.details,
      created_at: r.created_at,
      entity_type: r.entity_type,
    }))

    return NextResponse.json({
      success: true,
      data: {
        visitorsToday: todayVisitors,
        visitorsThisWeek: weekVisitorsRes.count ?? 0,
        visitorsThisMonth: monthVisitorsRes.count ?? 0,
        visitorsCurrentlyInside: onSiteRes.count ?? 0,
        pendingApprovals: pendingRes.count ?? 0,
        checkedIn: checkedInRes.count ?? 0,
        checkedOut: checkedOutRes.count ?? 0,
        activeBadges: activeBadgesRes.count ?? 0,
        cancelledBadges: cancelledBadgesRes.count ?? 0,
        expiredBadges: expiredBadgesRes.count ?? 0,
        registeredEmployees: employeesRes.count ?? 0,
        officeLocations: officesRes.count ?? 0,
        auditEventsToday: auditTodayRes.count ?? 0,
        badgesGenerated: badgesGeneratedRes.count ?? 0,
        badgesPrinted: badgesPrintedRes.count ?? 0,
        badgesReprinted: badgesReprintedRes.count ?? 0,
        documentsUploadedToday: docsTodayRes.count ?? 0,
        pendingVerification: pendingVerificationRes.count ?? 0,
        verifiedDocuments: verifiedDocumentsRes.count ?? 0,
        rejectedDocuments: rejectedDocumentsRes.count ?? 0,
        missingDocuments: missingDocsRes.count ?? 0,
        badgesAwaitingPrint: badgesAwaitingPrintRes.count ?? 0,
        expiringToday: expiringTodayRes.count ?? 0,
        visitorsTrend,
        yesterdayTotal,
        visitorsWaitingVerification: visitorsWaitingVerificationRes.count ?? 0,
        visitorsWaitingBadge: visitorsWaitingBadgeRes.count ?? 0,
        visitorsWaitingSecurity: visitorsWaitingSecurityRes.count ?? 0,
        visitorsOverstayed: visitorsOverstayedRes.count ?? 0,
        chartData: {
          visitorsByDay,
          visitorsByMonth,
          visitorsByDepartment,
          visitorsByHost,
          visitorsByCompany,
          visitorsByPurpose,
          badgeStatusDistribution,
          employeesByDepartment,
        },
        securityAlerts: alerts,
        activity,
        recentVisitors: recentVisitorsRes.data || [],
      }
    })
  } catch (err) {
    console.error('[Dashboard Stats API] Error:', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}