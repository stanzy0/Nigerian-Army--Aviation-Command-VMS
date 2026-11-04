'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Shield, UserX, AlertTriangle, Clock, Ban, ArrowRightFromLine, TrendingUp } from 'lucide-react'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { SecurityAlert, GateActivity, SecurityDecision } from '@/lib/types/security'
import ReportKPICard from '@/components/reports/ReportKPICard'
import ReportFilters from '@/components/reports/ReportFilters'
import ChartCard from '@/components/reports/ChartCard'
import ReportTable from '@/components/reports/ReportTable'
import Link from 'next/link'

const COLORS = ['#0B3D91', '#1F6FEB', '#D4AF37', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

interface SecurityEventRow {
  id: string
  alert_type: string
  severity: string
  title: string
  message: string
  is_resolved: boolean
  created_at: string
}

export default function SecurityReportsPage() {
  const [authChecking, setAuthChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('today')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [exporting, setExporting] = useState(false)

  const [rejectedVisitors, setRejectedVisitors] = useState(0)
  const [watchlistMatches, setWatchlistMatches] = useState(0)
  const [criticalAlerts, setCriticalAlerts] = useState(0)
  const [avgGateTime, setAvgGateTime] = useState('0s')
  const [securityHolds, setSecurityHolds] = useState(0)
  const [exitDelays, setExitDelays] = useState(0)

  const [rejectionReasons, setRejectionReasons] = useState<Array<{ name: string; value: number }>>([])
  const [alertsBySeverity, setAlertsBySeverity] = useState<Array<{ name: string; count: number }>>([])
  const [dailySecurityEvents, setDailySecurityEvents] = useState<Array<{ date: string; count: number }>>([])
  const [watchlistMatchesData, setWatchlistMatchesData] = useState<Array<{ name: string; count: number }>>([])
  const [securityEvents, setSecurityEvents] = useState<SecurityEventRow[]>([])

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (!user) { window.location.href = '/login'; return }
      if (!user.role) { window.location.href = '/unauthorized'; return }
      if (!PERMISSIONS[user.role]?.includes('reports')) { window.location.href = '/unauthorized'; return }
      setAuthChecking(false)
    }
    checkAuth()
  }, [])

  const getDateRange = () => {
    const now = new Date()
    let start: Date, end: Date = now
    switch (dateRange) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        break
      case 'yesterday':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case '7days':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        end = now
        break
      case '30days':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        end = now
        break
      case '90days':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        end = now
        break
      case 'thisMonth':
        start = new Date(now.getFullYear(), now.getMonth(), 1)
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        break
      case 'lastMonth':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        end = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      case 'thisYear':
        start = new Date(now.getFullYear(), 0, 1)
        end = new Date(now.getFullYear() + 1, 0, 1)
        break
      default:
        start = new Date(0)
        end = now
    }
    if (dateRange === 'custom' && customDateFrom && customDateTo) {
      return { start: new Date(customDateFrom), end: new Date(customDateTo) }
    }
    return { start, end }
  }

  useEffect(() => {
    if (authChecking) return
    let active = true
    const fetchData = async () => {
      setLoading(true)
      const { start, end } = getDateRange()
      try {
        const [
          rejectedRes,
          watchlistRes,
          alertsRes,
          gateRes,
          decisionsRes,
          gateDailyRes,
          securityEventsRes,
        ] = await Promise.all([
          supabase.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'rejected').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('watchlist').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('security_alerts').select('*').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('gate_activity').select('*').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('security_decisions').select('*').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('security_alerts').select('created_at').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('security_alerts').select('*').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()).order('created_at', { ascending: false }).limit(10),
        ])

        if (!active) return

        setRejectedVisitors(rejectedRes.count ?? 0)
        setWatchlistMatches(watchlistRes.count ?? 0)

        const alerts = (alertsRes.data as SecurityAlert[]) || []
        const criticalCount = alerts.filter(a => a.severity === 'Critical').length
        setCriticalAlerts(criticalCount)

        const gateActivities = (gateRes.data as GateActivity[]) || []
        const holds = gateActivities.filter(g => g.decision === 'hold').length
        setSecurityHolds(holds)

        const gateTimes = gateActivities.filter(g => g.verified_by).map(g => {
          const entry = gateActivities.find(eg => eg.visitor_id === g.visitor_id && eg.direction === 'in')
          const exit = gateActivities.find(eg => eg.visitor_id === g.visitor_id && eg.direction === 'out')
          if (entry && exit) {
            return new Date(exit.created_at).getTime() - new Date(entry.created_at).getTime()
          }
          return 0
        }).filter(t => t > 0)
        const avgMs = gateTimes.length > 0 ? gateTimes.reduce((s, t) => s + t, 0) / gateTimes.length : 0
        const avgSec = Math.round(avgMs / 1000)
        setAvgGateTime(`${avgSec}s`)

        const decisions = (decisionsRes.data as SecurityDecision[]) || []
        const exitDelaysCount = decisions.filter(d => d.reason?.toLowerCase().includes('delay') || d.reason?.toLowerCase().includes('exit')).length
        setExitDelays(exitDelaysCount)

        const reasons: Record<string, number> = {}
        decisions.forEach(d => {
          const reason = d.reason || 'Other'
          reasons[reason] = (reasons[reason] || 0) + 1
        })
        setRejectionReasons(Object.entries(reasons).map(([name, value]) => ({ name, value })).slice(0, 10))

        const sevMap: Record<string, number> = {}
        alerts.forEach(a => { sevMap[a.severity] = (sevMap[a.severity] || 0) + 1 })
        setAlertsBySeverity([
          { name: 'Low', count: sevMap['Low'] || 0 },
          { name: 'Medium', count: sevMap['Medium'] || 0 },
          { name: 'High', count: sevMap['High'] || 0 },
          { name: 'Critical', count: sevMap['Critical'] || 0 },
        ])

        const dailyMap: Record<string, number> = {}
        const gd = gateDailyRes.data || []
        gd.forEach(g => {
          const d = new Date(g.created_at).toISOString().split('T')[0]
          dailyMap[d] = (dailyMap[d] || 0) + 1
        })
        setDailySecurityEvents(Object.entries(dailyMap).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)))

        const watchlistAlerts = alerts.filter(a => a.alert_type === 'Watchlist Match')
        const wlMap: Record<string, number> = {}
        watchlistAlerts.forEach(a => {
          const key = a.alert_type
          wlMap[key] = (wlMap[key] || 0) + 1
        })
        setWatchlistMatchesData(Object.entries(wlMap).map(([name, count]) => ({ name, count })))

        setSecurityEvents((securityEventsRes.data as SecurityEventRow[]) || [])
      } catch (e) {
        console.error('Security reports error:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecking, dateRange, customDateFrom, customDateTo])

  const handleExport = async (format: 'pdf' | 'excel' | 'csv' | 'print') => {
    setExporting(true)
    try {
      if (format === 'csv') {
        const headers = ['Alert Type', 'Severity', 'Title', 'Message', 'Resolved', 'Date']
        const rows = [headers.join(',')]
        securityEvents.forEach(e => {
          rows.push([e.alert_type, e.severity, e.title, e.message, e.is_resolved ? 'Yes' : 'No', e.created_at].join(','))
        })
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `security-report-${dateRange}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } else if (format === 'print') {
        window.print()
      } else {
        alert(`${format.toUpperCase()} export would be processed server-side.`)
      }
    } finally {
      setExporting(false)
    }
  }

  if (authChecking) {
    return (
      <div className="flex h-screen bg-dashboard-bg items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dashboard-bg">
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link href="/reports" className="text-sm text-primary hover:underline mb-1 inline-block">← Back to Reports</Link>
            <h1 className="text-2xl font-bold text-[#F5F5DC]">Security Reports</h1>
            <p className="text-sm text-[#9A9F87]">Security incidents, alerts and gate analytics</p>
          </div>
        </div>

        <ReportFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          customDateFrom={customDateFrom}
          onCustomDateFromChange={setCustomDateFrom}
          customDateTo={customDateTo}
          onCustomDateToChange={setCustomDateTo}
          department={''}
          onDepartmentChange={() => {}}
          departments={[]}
          status={''}
          onStatusChange={() => {}}
          onExport={handleExport}
          exporting={exporting}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <ReportKPICard title="Rejected Visitors" value={rejectedVisitors} icon={UserX} color="red" loading={loading} index={0} />
          <ReportKPICard title="Watchlist Matches" value={watchlistMatches} icon={Shield} color="orange" loading={loading} index={1} />
          <ReportKPICard title="Critical Alerts" value={criticalAlerts} icon={AlertTriangle} color="red" loading={loading} index={2} />
          <ReportKPICard title="Avg Gate Time" value={avgGateTime} icon={Clock} color="blue" loading={loading} index={3} />
          <ReportKPICard title="Security Holds" value={securityHolds} icon={Ban} color="amber" loading={loading} index={4} />
          <ReportKPICard title="Exit Delays" value={exitDelays} icon={ArrowRightFromLine} color="purple" loading={loading} index={5} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Rejection Reasons" subtitle="Breakdown by reason" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={rejectionReasons} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {rejectionReasons.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Alerts by Severity" subtitle="Security alert distribution" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={alertsBySeverity}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Daily Security Events" subtitle="Security events per day" icon={TrendingUp} loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dailySecurityEvents}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444' }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Watchlist Matches" subtitle="Matches by type" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={watchlistMatchesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#D4AF37" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ReportTable
          title="Recent Security Events"
          subtitle="Last 10 events"
          columns={[
            { key: 'alert_type', label: 'Type', render: (item: SecurityEventRow) => item.alert_type },
            { key: 'severity', label: 'Severity', render: (item: SecurityEventRow) => item.severity },
            { key: 'title', label: 'Title', render: (item: SecurityEventRow) => item.title },
            { key: 'message', label: 'Message', render: (item: SecurityEventRow) => item.message },
            { key: 'is_resolved', label: 'Resolved', render: (item: SecurityEventRow) => item.is_resolved ? 'Yes' : 'No' },
            { key: 'created_at', label: 'Date', render: (item: SecurityEventRow) => new Date(item.created_at).toLocaleString() },
          ]}
          data={securityEvents}
          loading={loading}
          emptyMessage="No security events found"
        />
      </div>
    </div>
  )
}


