'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS, UserRole } from '@/lib/auth-client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area,
} from 'recharts'
import { LucideIcon } from 'lucide-react'
import {
  Users, Clock, Calendar, FileText, ShieldAlert, TrendingUp, AlertTriangle,
  Download, Printer, Loader2, RefreshCw, UserCheck, ShieldCheck, BadgeCheck,
  Building2, MapPin,   Repeat, XCircle, CheckCircle, Filter, ChevronDown,
  BadgeX, Car, Package, Hourglass, Eye, FileCheck, FileX, Ban,
  UserPlus, CalendarX, CalendarCheck, Timer, ShieldX, Map,
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16']

interface AnalyticsData {
  stats: {
    visitorsToday: number
    visitorsThisWeek: number
    visitorsThisMonth: number
    activeVisitors: number
    checkedIn: number
    checkedOut: number
    pendingApproval: number
    pendingDocumentVerification: number
    securityHolds: number
    rejectedVisitors: number
    noShows: number
    overstayedVisitors: number
    badgesPrintedToday: number
    assetsRegisteredToday: number
  }
  visitorTrends: {
    daily: Array<{ date: string; count: number }>
    weekly: Array<{ week: string; count: number }>
    monthly: Array<{ month: string; count: number }>
    peakHours: Array<{ hour: string; count: number }>
    peakDays: Array<{ day: string; count: number }>
    avgVisitDuration: string
    avgWaitingTime: string
    avgApprovalToCheckIn: string
  }
  hostAnalytics: {
    topHosts: Array<{ name: string; visits: number; department: string }>
    topDepartments: Array<{ name: string; visits: number }>
    visitorsPerDepartment: Array<{ name: string; count: number }>
    visitorsPerOfficeLocation: Array<{ name: string; count: number }>
    topEmployees: Array<{ name: string; visits: number }>
    repeatVisitorsByHost: Array<{ host: string; repeatVisitors: number }>
  }
  securityAnalytics: {
    rejectedVisitors: number
    deniedEntryReasons: Array<{ reason: string; count: number }>
    watchlistMatches: number
    criticalAlerts: number
    avgGateProcessingTime: string
    securityHolds: number
    visitorExitDelays: number
  }
  documentAnalytics: {
    pending: number
    rejected: number
    replacementRequests: number
    avgVerificationTime: string
    verificationSuccessRate: number
  }
  badgeAnalytics: {
    issued: number
    revoked: number
    expired: number
    reprinted: number
  }
  propertyAnalytics: {
    registered: number
    confiscated: number
    released: number
    pendingRelease: number
    commonTypes: Array<{ type: string; count: number }>
  }
  visitorTypes: {
    types: Array<{ name: string; value: number }>
  }
  visitorSources: {
    sources: Array<{ name: string; value: number }>
  }
  repeatVisitors: {
    visitors: Array<{ id: string; full_name: string; visitor_organization: string | null; photo_url: string | null; visits: number; lastVisit: string }>
  }
}

const DATE_RANGES = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: '7days' },
  { label: 'Last 30 Days', value: '30days' },
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Custom Range', value: 'custom' },
]

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [userRole, setUserRole] = useState<UserRole>('Receptionist')
  const [exporting, setExporting] = useState(false)
  const [dateRange, setDateRange] = useState('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [department, setDepartment] = useState('')
  const [visitorType, setVisitorType] = useState('')
  const [hostFilter, setHostFilter] = useState('')
  const [officeLocation, setOfficeLocation] = useState('')
  const [departments, setDepartments] = useState<string[]>([])
  const [visitorTypes, setVisitorTypes] = useState<string[]>([])
  const [hosts, setHosts] = useState<Array<{ id: string; full_name: string }>>([])
  const [officeLocations, setOfficeLocations] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchAnalytics = async () => {
    setTimeout(() => setLoading(true), 0)
    try {
      const params = new URLSearchParams()
      params.set('dateRange', dateRange)
      if (department) params.set('department', department)
      if (visitorType) params.set('visitorType', visitorType)
      if (hostFilter) params.set('hostId', hostFilter)
      if (officeLocation) params.set('officeLocation', officeLocation)
      if (dateRange === 'custom' && customStart) params.set('startDate', customStart)
      if (dateRange === 'custom' && customEnd) params.set('endDate', customEnd)

      const res = await fetch(`/api/analytics?${params.toString()}`)
      const json = await res.json()
      if (json.success) {
        setTimeout(() => setData(json.data), 0)
      }
    } catch (err) {
      console.error('Error fetching analytics:', err)
    } finally {
      setTimeout(() => setLoading(false), 0)
    }
  }

  const fetchFilterOptions = async () => {
    try {
      const [deptRes, typeRes, hostRes, officeRes] = await Promise.all([
        supabase.from('employees').select('department').not('department', 'is', null),
        supabase.from('visitors').select('visitor_type').not('visitor_type', 'is', null),
        supabase.from('employees').select('id, full_name').order('full_name'),
        supabase.from('employees').select('office_location').not('office_location', 'is', null),
      ])

      const deptSet = new Set<string>()
      deptRes.data?.forEach((d: { department: string }) => deptSet.add(d.department))
      setDepartments(Array.from(deptSet).sort())

      const typeSet = new Set<string>()
      typeRes.data?.forEach((t: { visitor_type: string }) => typeSet.add(t.visitor_type))
      setVisitorTypes(Array.from(typeSet).sort())

      setHosts(hostRes.data || [])

      const officeSet = new Set<string>()
      officeRes.data?.forEach((o: { office_location: string }) => officeSet.add(o.office_location))
      setOfficeLocations(Array.from(officeSet).sort())
    } catch (err) {
      console.error('Error fetching filter options:', err)
    }
  }

  const setupRealtime = () => {
    if (realtimeChannel.current) {
      supabase.removeChannel(realtimeChannel.current)
    }

    realtimeChannel.current = supabase
      .channel('analytics-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => fetchAnalytics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_documents' }, () => fetchAnalytics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_badges' }, () => fetchAnalytics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, () => fetchAnalytics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_watchlist' }, () => fetchAnalytics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => fetchAnalytics())
      .subscribe()
  }

  const logExport = async (exportType: string) => {
    try {
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exportType,
          dateRange,
          department,
          visitorType,
        }),
      })
    } catch (err) {
      console.error('Export log error:', err)
    }
  }

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      if (!user.role) {
        window.location.href = '/unauthorized'
        return
      }
      if (!PERMISSIONS[user.role]?.includes('analytics')) {
        window.location.href = '/unauthorized'
        return
      }
      setUserRole(user.role)
      setAuthChecking(false)
      fetchAnalytics()
      fetchFilterOptions()
      setupRealtime()
    }
    checkAuth()

    return () => {
      if (realtimeChannel.current) {
        supabase.removeChannel(realtimeChannel.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!authChecking) {
      fetchAnalytics()
    }
  }, [dateRange, department, visitorType, hostFilter, officeLocation, customStart, customEnd])

  const exportPDF = async () => {
    setExporting(true)
    try {
      await logExport('PDF')
      const doc = new jsPDF()
      doc.setFontSize(20)
      doc.text('Executive Analytics Report', 14, 20)
      doc.setFontSize(11)
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28)
      doc.text(`Date Range: ${dateRange}`, 14, 34)

      if (data) {
        autoTable(doc, {
          startY: 42,
          head: [['KPI', 'Value']],
          body: [
            ['Visitors Today', String(data.stats.visitorsToday)],
            ['Visitors This Week', String(data.stats.visitorsThisWeek)],
            ['Visitors This Month', String(data.stats.visitorsThisMonth)],
            ['Active Visitors', String(data.stats.activeVisitors)],
            ['Checked In', String(data.stats.checkedIn)],
            ['Checked Out', String(data.stats.checkedOut)],
            ['Pending Approval', String(data.stats.pendingApproval)],
            ['Pending Doc Verification', String(data.stats.pendingDocumentVerification)],
            ['Security Holds', String(data.stats.securityHolds)],
            ['Rejected Visitors', String(data.stats.rejectedVisitors)],
            ['Overstayed Visitors', String(data.stats.overstayedVisitors)],
            ['Badges Printed Today', String(data.stats.badgesPrintedToday)],
            ['Assets Registered Today', String(data.stats.assetsRegisteredToday)],
          ],
        })

        let yPos = 100
        doc.setFontSize(14)
        doc.text('Security Analytics', 14, yPos)
        yPos += 8
        autoTable(doc, {
          startY: yPos,
          head: [['Metric', 'Value']],
          body: [
            ['Rejected Visitors', String(data.securityAnalytics.rejectedVisitors)],
            ['Watchlist Matches', String(data.securityAnalytics.watchlistMatches)],
            ['Critical Alerts', String(data.securityAnalytics.criticalAlerts)],
            ['Avg Gate Processing Time', data.securityAnalytics.avgGateProcessingTime],
          ],
        })
      }
      doc.save(`executive-analytics-${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (err) {
      console.error('PDF export error:', err)
    } finally {
      setExporting(false)
    }
  }

  const exportExcel = () => {
    setExporting(true)
    try {
      logExport('Excel')
      if (!data) return

      const wsData: unknown[][] = [
        ['Executive Analytics Report'],
        [`Generated: ${new Date().toLocaleString()}`],
        [`Date Range: ${dateRange}`],
        [],
        ['KPI', 'Value'],
        ['Visitors Today', data.stats.visitorsToday],
        ['Visitors This Week', data.stats.visitorsThisWeek],
        ['Visitors This Month', data.stats.visitorsThisMonth],
        ['Active Visitors', data.stats.activeVisitors],
        ['Checked In', data.stats.checkedIn],
        ['Checked Out', data.stats.checkedOut],
        ['Pending Approval', data.stats.pendingApproval],
        ['Pending Doc Verification', data.stats.pendingDocumentVerification],
        ['Security Holds', data.stats.securityHolds],
        ['Rejected Visitors', data.stats.rejectedVisitors],
        ['Overstayed Visitors', data.stats.overstayedVisitors],
        ['Badges Printed Today', data.stats.badgesPrintedToday],
        ['Assets Registered Today', data.stats.assetsRegisteredToday],
        [],
        ['Visitor Trends - Daily'],
        ['Date', 'Count'],
        ...data.visitorTrends.daily.map(d => [d.date, d.count]),
        [],
        ['Visitor Trends - Peak Hours'],
        ['Hour', 'Count'],
        ...data.visitorTrends.peakHours.map(d => [d.hour, d.count]),
      ]

      const ws = XLSX.utils.aoa_to_sheet(wsData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Analytics')
      XLSX.writeFile(wb, `executive-analytics-${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (err) {
      console.error('Excel export error:', err)
    } finally {
      setExporting(false)
    }
  }

  const exportCSV = () => {
    setExporting(true)
    try {
      logExport('CSV')
      if (!data) return

      const rows = [
        ['KPI', 'Value'],
        ['Visitors Today', data.stats.visitorsToday],
        ['Visitors This Week', data.stats.visitorsThisWeek],
        ['Visitors This Month', data.stats.visitorsThisMonth],
        ['Active Visitors', data.stats.activeVisitors],
        ['Checked In', data.stats.checkedIn],
        ['Checked Out', data.stats.checkedOut],
        ['Pending Approval', data.stats.pendingApproval],
        ['Pending Doc Verification', data.stats.pendingDocumentVerification],
        ['Security Holds', data.stats.securityHolds],
        ['Rejected Visitors', data.stats.rejectedVisitors],
        ['Overstayed Visitors', data.stats.overstayedVisitors],
        ['Badges Printed Today', data.stats.badgesPrintedToday],
        ['Assets Registered Today', data.stats.assetsRegisteredToday],
      ]

      const csvContent = rows.map(r => r.join(',')).join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `executive-analytics-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CSV export error:', err)
    } finally {
      setExporting(false)
    }
  }

  if (authChecking) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-[#0B0F08] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const kpis = [
    { title: 'Visitors Today', value: data.stats.visitorsToday, icon: Users, color: 'blue' },
    { title: 'Visitors This Week', value: data.stats.visitorsThisWeek, icon: Calendar, color: 'green' },
    { title: 'Visitors This Month', value: data.stats.visitorsThisMonth, icon: TrendingUp, color: 'purple' },
    { title: 'Active Visitors', value: data.stats.activeVisitors, icon: UserCheck, color: 'indigo' },
            { title: 'Checked In', value: data.stats.checkedIn, icon: CheckCircle, color: 'green' },
    { title: 'Checked Out', value: data.stats.checkedOut, icon: XCircle, color: 'gray' },
    { title: 'Pending Approval', value: data.stats.pendingApproval, icon: Hourglass, color: 'amber' },
    { title: 'Pending Doc Verification', value: data.stats.pendingDocumentVerification, icon: FileText, color: 'orange' },
    { title: 'Security Holds', value: data.stats.securityHolds, icon: ShieldAlert, color: 'red' },
    { title: 'Rejected Visitors', value: data.stats.rejectedVisitors, icon: ShieldX, color: 'red' },
    { title: 'No Shows', value: data.stats.noShows, icon: CalendarX, color: 'gray' },
    { title: 'Overstayed Visitors', value: data.stats.overstayedVisitors, icon: Clock, color: 'amber' },
    { title: 'Badges Printed Today', value: data.stats.badgesPrintedToday, icon: BadgeCheck, color: 'blue' },
    { title: 'Assets Registered Today', value: data.stats.assetsRegisteredToday, icon: Package, color: 'purple' },
  ]

  return (
    <div className="min-h-screen bg-[#0B0F08]">
      <div className="max-w-[1920px] mx-auto p-4 lg:p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F5DC]">Executive Analytics & Intelligence Dashboard</h1>
            <p className="text-sm text-[#9A9F87]">Real-time visitor intelligence and security analytics for senior leadership</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => setShowFilters(!showFilters)} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10">
              <Filter className="h-4 w-4" />
              Filters
              <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={fetchAnalytics} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button onClick={exportPDF} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Download className="h-4 w-4" />
              PDF
            </button>
            <button onClick={exportExcel} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              <Download className="h-4 w-4" />
              Excel
            </button>
            <button onClick={exportCSV} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
              <Download className="h-4 w-4" />
              CSV
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Date Range</label>
                <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {dateRange === 'custom' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Start Date</label>
                    <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">End Date</label>
                    <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Department</label>
                <select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">All Departments</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Visitor Type</label>
                <select value={visitorType} onChange={(e) => setVisitorType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">All Types</option>
                  {visitorTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Host</label>
                <select value={hostFilter} onChange={(e) => setHostFilter(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">All Hosts</option>
                  {hosts.map(h => <option key={h.id} value={h.id}>{h.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Office Location</label>
                <select value={officeLocation} onChange={(e) => setOfficeLocation(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">All Locations</option>
                  {officeLocations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        <KPICards kpis={kpis} />

        <VisitorTrendsSection data={data.visitorTrends} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <HostAnalyticsSection data={data.hostAnalytics} />
          <SecurityAnalyticsSection data={data.securityAnalytics} />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <DocumentAnalyticsSection data={data.documentAnalytics} />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <BadgeAnalyticsSection data={data.badgeAnalytics} />
          <PropertyAnalyticsSection data={data.propertyAnalytics} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <VisitorTypesSection data={data.visitorTypes} />
          <VisitorSourcesSection data={data.visitorSources} />
          <MapViewSection />
        </div>
        <RepeatVisitorsSection visitors={data.repeatVisitors.visitors} />
      </div>
    </div>
  )
}

function KPICards({ kpis }: { kpis: Array<{ title: string; value: number; icon: LucideIcon; color: string }> }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600', purple: 'bg-purple-50 text-purple-600',
    indigo: 'bg-indigo-50 text-indigo-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600', gray: 'bg-gray-50 text-[#9A9F87]',
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {kpis.map((kpi, i) => {
        const Icon = kpi.icon
        return (
          <div key={i} className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-[#9A9F87]">{kpi.title}</p>
              <div className={`p-2 rounded-lg ${colorClasses[kpi.color] || 'bg-gray-50 text-[#9A9F87]'}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-[#F5F5DC]">{kpi.value}</p>
          </div>
        )
      })}
    </div>
  )
}

function VisitorTrendsSection({ data }: { data: AnalyticsData['visitorTrends'] }) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
        <h3 className="text-lg font-semibold text-[#F5F5DC]">Visitor Trends</h3>
      </div>
      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-medium text-[#9A9F87] mb-2">Daily Visitors (Last 30 Days)</h4>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data.daily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h4 className="text-sm font-medium text-[#9A9F87] mb-2">Weekly Visitors</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.weekly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h4 className="text-sm font-medium text-[#9A9F87] mb-2">Monthly Visitors</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h4 className="text-sm font-medium text-[#9A9F87] mb-2">Peak Visit Hours</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.peakHours}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h4 className="text-sm font-medium text-[#9A9F87] mb-2">Peak Visit Days</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.peakDays}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#ec4899" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-[rgba(85,107,47,0.35)] bg-gray-50 p-4">
            <p className="text-xs text-[#9A9F87] mb-1">Avg Visit Duration</p>
            <p className="text-lg font-bold text-[#F5F5DC]">{data.avgVisitDuration}</p>
          </div>
          <div className="rounded-lg border border-[rgba(85,107,47,0.35)] bg-gray-50 p-4">
            <p className="text-xs text-[#9A9F87] mb-1">Avg Waiting Time</p>
            <p className="text-lg font-bold text-[#F5F5DC]">{data.avgWaitingTime}</p>
          </div>
          <div className="rounded-lg border border-[rgba(85,107,47,0.35)] bg-gray-50 p-4">
            <p className="text-xs text-[#9A9F87] mb-1">Avg Approval to Check-in</p>
            <p className="text-lg font-bold text-[#F5F5DC]">{data.avgApprovalToCheckIn}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function HostAnalyticsSection({ data }: { data: AnalyticsData['hostAnalytics'] }) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
        <h3 className="text-lg font-semibold text-[#F5F5DC]">Host Analytics</h3>
      </div>
      <div className="p-4 space-y-6">
        <div>
          <h4 className="text-sm font-medium text-[#9A9F87] mb-2">Top Hosts</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-[rgba(85,107,47,0.35)]"><th className="px-3 py-2 font-semibold text-[#9A9F87]">Host</th><th className="px-3 py-2 font-semibold text-[#9A9F87]">Department</th><th className="px-3 py-2 font-semibold text-[#9A9F87]">Visits</th></tr></thead>
              <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">{data.topHosts.map((h, i) => <tr key={i}><td className="px-3 py-2 text-[#9A9F87]">{h.name}</td><td className="px-3 py-2 text-[#9A9F87]">{h.department}</td><td className="px-3 py-2 text-[#9A9F87]">{h.visits}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-[#9A9F87] mb-2">Visitors per Department</h4>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={data.visitorsPerDepartment} cx="50%" cy="50%" outerRadius={70} dataKey="count" label>{data.visitorsPerDepartment.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h4 className="text-sm font-medium text-[#9A9F87] mb-2">Visitors per Office Location</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.visitorsPerOfficeLocation} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} /><Tooltip /><Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-medium text-[#9A9F87] mb-2">Most Visited Departments</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.topDepartments}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="visits" fill="#14b8a6" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function SecurityAnalyticsSection({ data }: { data: AnalyticsData['securityAnalytics'] }) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
        <h3 className="text-lg font-semibold text-[#F5F5DC]">Security Analytics</h3>
      </div>
      <div className="p-4 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <KPIBadge title="Rejected Visitors" value={data.rejectedVisitors} icon={ShieldX} color="red" />
          <KPIBadge title="Watchlist Matches" value={data.watchlistMatches} icon={ShieldAlert} color="amber" />
          <KPIBadge title="Critical Alerts" value={data.criticalAlerts} icon={AlertTriangle} color="red" />
          <KPIBadge title="Security Holds" value={data.securityHolds} icon={Hourglass} color="amber" />
          <KPIBadge title="Visitor Exit Delays" value={data.visitorExitDelays} icon={Timer} color="orange" />
          <KPIBadge title="Avg Gate Processing" value={data.avgGateProcessingTime} icon={Clock} color="blue" />
        </div>
        <div>
          <h4 className="text-sm font-medium text-[#9A9F87] mb-2">Denied Entry Reasons</h4>
          {data.deniedEntryReasons.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-[rgba(85,107,47,0.35)]"><th className="px-3 py-2 font-semibold text-[#9A9F87]">Reason</th><th className="px-3 py-2 font-semibold text-[#9A9F87]">Count</th></tr></thead>
                <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">{data.deniedEntryReasons.map((r, i) => <tr key={i}><td className="px-3 py-2 text-[#9A9F87]">{r.reason}</td><td className="px-3 py-2 text-[#9A9F87]">{r.count}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="text-sm text-[#9A9F87]">No denied entry records</p>}
        </div>
      </div>
    </div>
  )
}

function KPIBadge({ title, value, icon: Icon, color }: { title: string; value: number | string; icon: LucideIcon; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600', purple: 'bg-purple-50 text-purple-600',
    indigo: 'bg-indigo-50 text-indigo-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600', gray: 'bg-gray-50 text-[#9A9F87]',
  }
  return (
    <div className="rounded-lg border border-[rgba(85,107,47,0.35)] bg-gray-50 p-3">
      <div className="flex items-center gap-2">
        <div className={`p-2 rounded-lg ${colorClasses[color] || 'bg-gray-50 text-[#9A9F87]'}`}><Icon className="h-4 w-4" /></div>
        <div>
          <p className="text-xs text-[#9A9F87]">{title}</p>
          <p className="text-lg font-bold text-[#F5F5DC]">{value}</p>
        </div>
      </div>
    </div>
  )
}

function DocumentAnalyticsSection({ data }: { data: AnalyticsData['documentAnalytics'] }) {
  const successRate = data.verificationSuccessRate
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]"><h3 className="text-lg font-semibold text-[#F5F5DC]">Document Analytics</h3></div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <KPIBadge title="Pending Documents" value={data.pending} icon={FileText} color="amber" />
          <KPIBadge title="Rejected Documents" value={data.rejected} icon={FileX} color="red" />
          <KPIBadge title="Replacement Requests" value={data.replacementRequests} icon={Repeat} color="orange" />
          <KPIBadge title="Avg Verification Time" value={data.avgVerificationTime} icon={Timer} color="blue" />
          <KPIBadge title="Success Rate" value={`${successRate}%`} icon={FileCheck} color="green" />
        </div>
        <div>
          <h4 className="text-sm font-medium text-[#9A9F87] mb-2">Verification Success Rate</h4>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart><Pie data={[{ name: 'Approved', value: successRate }, { name: 'Other', value: 100 - successRate }]} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value"><Cell fill="#10b981" /><Cell fill="#e5e7eb" /></Pie><Tooltip formatter={(value) => `${Number(value ?? 0)}%`} /></PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function BadgeAnalyticsSection({ data }: { data: AnalyticsData['badgeAnalytics'] }) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]"><h3 className="text-lg font-semibold text-[#F5F5DC]">Badge Analytics</h3></div>
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KPIBadge title="Issued" value={data.issued} icon={BadgeCheck} color="green" />
          <KPIBadge title="Revoked" value={data.revoked} icon={BadgeX} color="red" />
          <KPIBadge title="Expired" value={data.expired} icon={Ban} color="gray" />
          <KPIBadge title="Reprinted" value={data.reprinted} icon={RefreshCw} color="amber" />
        </div>
      </div>
    </div>
  )
}

function PropertyAnalyticsSection({ data }: { data: AnalyticsData['propertyAnalytics'] }) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]"><h3 className="text-lg font-semibold text-[#F5F5DC]">Property Analytics</h3></div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KPIBadge title="Registered" value={data.registered} icon={Package} color="blue" />
          <KPIBadge title="Confiscated" value={data.confiscated} icon={ShieldAlert} color="red" />
          <KPIBadge title="Released" value={data.released} icon={CheckCircle} color="green" />
          <KPIBadge title="Pending Release" value={data.pendingRelease} icon={Hourglass} color="amber" />
        </div>
        <div>
          <h4 className="text-sm font-medium text-[#9A9F87] mb-2">Most Common Property Types</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.commonTypes}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="type" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function VisitorTypesSection({ data }: { data: AnalyticsData['visitorTypes'] }) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]"><h3 className="text-lg font-semibold text-[#F5F5DC]">Visitor Types</h3></div>
      <div className="p-4">
        {data.types.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart><Pie data={data.types} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>{data.types.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-[#9A9F87]">No visitor type data</p>}
      </div>
    </div>
  )
}

function VisitorSourcesSection({ data }: { data: AnalyticsData['visitorSources'] }) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]"><h3 className="text-lg font-semibold text-[#F5F5DC]">Visitor Sources</h3></div>
      <div className="p-4">
        {data.sources.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.sources} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} /><Tooltip /><Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} /></BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-[#9A9F87]">No visitor source data</p>}
      </div>
    </div>
  )
}

function MapViewSection() {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]"><h3 className="text-lg font-semibold text-[#F5F5DC]">Visitor Origins Map</h3></div>
      <div className="p-4 flex items-center justify-center h-64">
        <div className="text-center">
          <Map className="h-12 w-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-[#9A9F87]">No visitor location data available.</p>
        </div>
      </div>
    </div>
  )
}

function RepeatVisitorsSection({ visitors }: { visitors: AnalyticsData['repeatVisitors']['visitors'] }) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]"><h3 className="text-lg font-semibold text-[#F5F5DC]">Top 20 Repeat Visitors</h3></div>
      <div className="p-4 overflow-x-auto">
        {visitors.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-[rgba(85,107,47,0.35)]"><th className="px-3 py-2 font-semibold text-[#9A9F87]">Photo</th><th className="px-3 py-2 font-semibold text-[#9A9F87]">Visitor Name</th><th className="px-3 py-2 font-semibold text-[#9A9F87]">Company</th><th className="px-3 py-2 font-semibold text-[#9A9F87]">Visits</th><th className="px-3 py-2 font-semibold text-[#9A9F87]">Last Visit</th></tr></thead>
            <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
              {visitors.map((v, i) => (
                <tr key={i}>
                  <td className="px-3 py-2"><img src={v.photo_url || '/placeholder-avatar.png'} alt={v.full_name} className="h-10 w-10 rounded-full object-cover" /></td>
                  <td className="px-3 py-2 text-[#F5F5DC] font-medium">{v.full_name}</td>
                  <td className="px-3 py-2 text-[#9A9F87]">{v.visitor_organization || '-'}</td>
                  <td className="px-3 py-2 text-[#9A9F87]">{v.visits}</td>
                  <td className="px-3 py-2 text-[#9A9F87]">{v.lastVisit ? new Date(v.lastVisit).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-[#9A9F87]">No repeat visitors found</p>}
      </div>
    </div>
  )
}


