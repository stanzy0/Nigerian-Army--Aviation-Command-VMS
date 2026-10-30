'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/demo'
import { getDashboardStats, getEmployees, getVisits } from '@/lib/demo/mockData'

export type DateRange = 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'custom'

export interface DashboardFilters {
  range: DateRange
  customFrom?: string
  customTo?: string
  department?: string
  host?: string
  company?: string
}

export interface DashboardStats {
  visitorsToday: number
  visitorsThisWeek: number
  visitorsThisMonth: number
  visitorsCurrentlyInside: number
  pendingApprovals: number
  checkedIn: number
  checkedOut: number
  activeBadges: number
  cancelledBadges: number
  expiredBadges: number
  registeredEmployees: number
  officeLocations: number
  auditEventsToday: number
  yesterdayTotal: number
  visitorsTrend: number
  badgesGenerated: number
  badgesPrinted: number
  badgesReprinted: number
  documentsUploadedToday: number
  pendingVerification: number
  verifiedDocuments: number
  rejectedDocuments: number
  missingDocuments: number
  visitorsWaitingVerification: number
  visitorsWaitingBadge: number
  visitorsWaitingSecurity: number
  visitorsOverstayed: number
}

export interface ActivityItem {
  id: string
  action: string
  details: string
  created_at: string
  entity_type?: string
}

export interface ChartDataPoint {
  name: string
  count: number
  value?: number
}

export interface SecurityAlert {
  type: 'overstayed' | 'expired_visit' | 'missing_checkout' | 'cancelled_badge_active'
  label: string
  count: number
  severity: 'critical' | 'warning' | 'info'
}

function getStartEnd(range: DateRange, customFrom?: string, customTo?: string): { start: Date; end: Date } {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (range) {
    case 'today':
      return { start: todayStart, end: now }
    case 'yesterday': {
      const start = new Date(todayStart)
      start.setDate(start.getDate() - 1)
      return { start, end: todayStart }
    }
    case '7days':
      return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now }
    case '30days':
      return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: now }
    case 'thisMonth':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }
    case 'custom':
    default:
      return {
        start: customFrom ? new Date(customFrom) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        end: customTo ? new Date(customTo) : now,
      }
  }
}

export function useDashboardData(filters: DashboardFilters, enabled = true) {
  const [stats, setStats] = useState<DashboardStats>({
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
    yesterdayTotal: 0,
    visitorsTrend: 0,
    badgesGenerated: 0,
    badgesPrinted: 0,
    badgesReprinted: 0,
    documentsUploadedToday: 0,
    pendingVerification: 0,
    verifiedDocuments: 0,
    rejectedDocuments: 0,
    missingDocuments: 0,
    visitorsWaitingVerification: 0,
    visitorsWaitingBadge: 0,
    visitorsWaitingSecurity: 0,
    visitorsOverstayed: 0,
  })
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([])
  const [visitorsByDay, setVisitorsByDay] = useState<ChartDataPoint[]>([])
  const [visitorsByMonth, setVisitorsByMonth] = useState<ChartDataPoint[]>([])
  const [visitorsByDepartment, setVisitorsByDepartment] = useState<ChartDataPoint[]>([])
  const [visitorsByHost, setVisitorsByHost] = useState<ChartDataPoint[]>([])
  const [visitorsByCompany, setVisitorsByCompany] = useState<ChartDataPoint[]>([])
  const [visitorsByPurpose, setVisitorsByPurpose] = useState<ChartDataPoint[]>([])
  const [badgeStatusDistribution, setBadgeStatusDistribution] = useState<ChartDataPoint[]>([])
  const [employeesByDepartment, setEmployeesByDepartment] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (silent = false) => {
    if (isDemoMode()) {
      if (!silent) setLoading(true)
      setError(null)
      try {
        const d = getDashboardStats()
        setStats(prev => ({
          ...prev,
          visitorsToday: d.totalVisitors,
          visitorsThisWeek: d.totalVisitors,
          visitorsThisMonth: d.totalVisitors,
          visitorsCurrentlyInside: d.checkedIn,
          pendingApprovals: d.pending,
          checkedIn: d.checkedIn,
          checkedOut: d.checkedOut,
          registeredEmployees: getEmployees().length,
        }))
      } catch {
        setError('Demo data unavailable')
      } finally {
        if (!silent) setLoading(false)
      }
      return
    }
    if (!silent) {
      setLoading(true)
    }
    setError(null)
    try {
      const response = await fetch('/api/dashboard/stats')
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data')
      }
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch dashboard data')
      }
      const d = result.data

      setStats({
        visitorsToday: d.visitorsToday,
        visitorsThisWeek: d.visitorsThisWeek,
        visitorsThisMonth: d.visitorsThisMonth,
        visitorsCurrentlyInside: d.visitorsCurrentlyInside,
        pendingApprovals: d.pendingApprovals,
        checkedIn: d.checkedIn,
        checkedOut: d.checkedOut,
        activeBadges: d.activeBadges,
        cancelledBadges: d.cancelledBadges,
        expiredBadges: d.expiredBadges,
        registeredEmployees: d.registeredEmployees,
        officeLocations: d.officeLocations,
        auditEventsToday: d.auditEventsToday,
        yesterdayTotal: d.yesterdayTotal,
        visitorsTrend: d.visitorsTrend,
        badgesGenerated: d.badgesGenerated,
        badgesPrinted: d.badgesPrinted,
        badgesReprinted: d.badgesReprinted,
        documentsUploadedToday: d.documentsUploadedToday,
        pendingVerification: d.pendingVerification,
        verifiedDocuments: d.verifiedDocuments,
        rejectedDocuments: d.rejectedDocuments,
        missingDocuments: d.missingDocuments,
        visitorsWaitingVerification: d.visitorsWaitingVerification,
        visitorsWaitingBadge: d.visitorsWaitingBadge,
        visitorsWaitingSecurity: d.visitorsWaitingSecurity,
        visitorsOverstayed: d.visitorsOverstayed,
      })

      const cd = d.chartData
      setVisitorsByDay(cd.visitorsByDay || [])
      setVisitorsByMonth(cd.visitorsByMonth || [])
      setVisitorsByDepartment(cd.visitorsByDepartment || [])
      setVisitorsByHost(cd.visitorsByHost || [])
      setVisitorsByCompany(cd.visitorsByCompany || [])
      setVisitorsByPurpose(cd.visitorsByPurpose || [])
      setBadgeStatusDistribution(cd.badgeStatusDistribution || [])
      setEmployeesByDepartment(cd.employeesByDepartment || [])

      setSecurityAlerts(d.securityAlerts || [])
      setActivity(d.activity || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [filters])

  const fetchAllRef = useRef(fetchAll)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchAllRef.current = fetchAll
  }, [fetchAll])

  const silentRefresh = useCallback(async () => {
    setError(null)
    try {
      await fetchAllRef.current(true)
    } catch {
      // ignore realtime refresh errors
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    if (isDemoMode()) return
    fetchAllRef.current()
  }, [filters, enabled])

  useEffect(() => {
    if (!enabled) return
    if (isDemoMode()) return

    const debouncedRefresh = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = setTimeout(() => {
        silentRefresh()
      }, 300)
    }

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitors' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_badges' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_documents' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, debouncedRefresh)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Dashboard] Realtime subscription active')
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[Dashboard] Realtime subscription failed, falling back to polling')
        }
      })

    const pollInterval = setInterval(() => {
      silentRefresh()
    }, 10000)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      clearInterval(pollInterval)
      supabase.removeChannel(channel)
    }
  }, [enabled, silentRefresh])

  const trendLabel = useMemo(() => {
    if (stats.visitorsTrend > 0) return `+${(stats.visitorsTrend * 100).toFixed(0)}%`
    if (stats.visitorsTrend < 0) return `${(stats.visitorsTrend * 100).toFixed(0)}%`
    return '0%'
  }, [stats.visitorsTrend])

  return { stats, activity, securityAlerts, visitorsByDay, visitorsByMonth, visitorsByDepartment, visitorsByHost, visitorsByCompany, visitorsByPurpose, badgeStatusDistribution, employeesByDepartment, loading, error, trendLabel, refetch: fetchAll }
}
