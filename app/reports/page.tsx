'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, BarChart3, TrendingUp, Users, Calendar, Clock, CheckCircle2, XCircle, AlertTriangle, Printer, LogOut } from 'lucide-react'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import { logAuditAction } from '@/lib/client/audit'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts'
import ReportKPICard from '@/components/reports/ReportKPICard'
import ReportFilters from '@/components/reports/ReportFilters'
import ChartCard from '@/components/reports/ChartCard'
import ReportTable from '@/components/reports/ReportTable'
import Link from 'next/link'

interface Stats {
  totalVisitors: number
  totalVisits: number
  approvedVisits: number
  pendingVisits: number
  rejectedVisits: number
  checkedInVisits: number
  checkedOutVisits: number
  avgVisitDuration: string
  activeVisitors: number
  pendingVerification: number
  visitorsWaitingBadge: number
  visitorsOverstayed: number
  documentsReviewed: number
  documentsPending: number
  documentsRejected: number
  avgReviewTime: string
}

const COLORS = ['#0B3D91', '#1F6FEB', '#D4AF37', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export default function ReportsDashboardPage() {
  const [authChecking, setAuthChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('today')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [exporting, setExporting] = useState(false)
  const [stats, setStats] = useState<Stats>({
    totalVisitors: 0, totalVisits: 0, approvedVisits: 0, pendingVisits: 0, rejectedVisits: 0,
    checkedInVisits: 0, checkedOutVisits: 0, avgVisitDuration: '0h 0m', activeVisitors: 0,
    pendingVerification: 0, visitorsWaitingBadge: 0, visitorsOverstayed: 0,
    documentsReviewed: 0, documentsPending: 0, documentsRejected: 0, avgReviewTime: '0h 0m',
  })
  const [visitorsPerDay, setVisitorsPerDay] = useState<Array<{ date: string; count: number }>>([])
  const [visitsByStatus, setVisitsByStatus] = useState<Array<{ name: string; value: number }>>([])
  const [departmentsData, setDepartmentsData] = useState<Array<{ name: string; count: number }>>([])
  const [hostEmployeesData, setHostEmployeesData] = useState<Array<{ name: string; count: number }>>([])
  const [companiesData, setCompaniesData] = useState<Array<{ name: string; count: number }>>([])
  const [hourlyData, setHourlyData] = useState<Array<{ hour: string; count: number }>>([])
  const [recentVisits, setRecentVisits] = useState<Array<{ id: string; visitor: { full_name: string; visitor_organization: string } | null; employee: { full_name: string; department: string } | null; purpose: string; status: string; check_in_time: string | null; check_out_time: string | null; created_at: string }>>([])
  const [departments, setDepartments] = useState<string[]>([])

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (!user) { window.location.href = '/login'; return }
      if (!user.role) { window.location.href = '/unauthorized'; return }
      if (!PERMISSIONS[user.role]?.includes('reports')) { window.location.href = '/unauthorized'; return }
      setAuthChecking(false)
      logAuditAction('Analytics Viewed', 'report', null, 'User viewed analytics dashboard')
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

  function calculateAvgDuration(visits: Array<{ check_in_time: string | null; check_out_time: string | null }>) {
    const completed = visits.filter(v => v.check_in_time && v.check_out_time)
    if (completed.length === 0) return '0h 0m'
    const totalMs = completed.reduce((sum, v) => sum + (new Date(v.check_out_time!).getTime() - new Date(v.check_in_time!).getTime()), 0)
    const avgMs = totalMs / completed.length
    const hours = Math.floor(avgMs / (1000 * 60 * 60))
    const minutes = Math.floor((avgMs % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${minutes}m`
  }

  async function fetchVisitorsPerDay(start: Date, end: Date) {
    const { data } = await supabase.from('visits').select('created_at').gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
    const dailyCounts: Record<string, number> = {}
    data?.forEach(v => {
      const date = new Date(v.created_at).toISOString().split('T')[0]
      dailyCounts[date] = (dailyCounts[date] || 0) + 1
    })
    setVisitorsPerDay(Object.entries(dailyCounts).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)))
  }

  async function fetchVisitsByStatus(start: Date, end: Date) {
    const { data } = await supabase.from('visits').select('status').gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
    const statusCounts: Record<string, number> = {}
    data?.forEach(v => { statusCounts[v.status] = (statusCounts[v.status] || 0) + 1 })
    setVisitsByStatus([
      { name: 'Pending', value: statusCounts.pending || 0 },
      { name: 'Approved', value: statusCounts.approved || 0 },
      { name: 'Rejected', value: statusCounts.rejected || 0 },
      { name: 'Checked In', value: statusCounts.checked_in || 0 },
      { name: 'Checked Out', value: statusCounts.checked_out || 0 },
    ])
  }

  async function fetchDepartmentsData(start: Date, end: Date) {
    const { data } = await supabase.from('visits').select('employee:employees(department)').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()) as { data: Array<{ employee?: { department?: string } }> | null }
    const deptCounts: Record<string, number> = {}
    data?.forEach(v => { const dept = v.employee?.department || 'Unknown'; deptCounts[dept] = (deptCounts[dept] || 0) + 1 })
    setDepartmentsData(Object.entries(deptCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10))
  }

  async function fetchHostEmployeesData(start: Date, end: Date) {
    const { data } = await supabase.from('visits').select('employee:employees(full_name)').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()) as { data: Array<{ employee?: { full_name?: string } }> | null }
    const hostCounts: Record<string, number> = {}
    data?.forEach(v => { const name = v.employee?.full_name || 'Unknown'; hostCounts[name] = (hostCounts[name] || 0) + 1 })
    setHostEmployeesData(Object.entries(hostCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10))
  }

  async function fetchCompaniesData(start: Date, end: Date) {
    const { data } = await supabase.from('visits').select('visitor:visitors(visitor_organization)').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()) as { data: Array<{ visitor?: { visitor_organization?: string } }> | null }
    const orgCounts: Record<string, number> = {}
    data?.forEach(v => { const org = v.visitor?.visitor_organization || 'Unknown'; orgCounts[org] = (orgCounts[org] || 0) + 1 })
    setCompaniesData(Object.entries(orgCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10))
  }

  async function fetchHourlyData() {
    const { data } = await supabase.from('visits').select('check_in_time').eq('status', 'checked_in')
    const hourlyCounts: Record<string, number> = {}
    for (let i = 0; i < 24; i++) hourlyCounts[`${String(i).padStart(2, '0')}:00`] = 0
    data?.forEach(v => {
      if (v.check_in_time) {
        const hour = new Date(v.check_in_time).getHours()
        hourlyCounts[`${String(hour).padStart(2, '0')}:00`] = (hourlyCounts[`${String(hour).padStart(2, '0')}:00`] || 0) + 1
      }
    })
    setHourlyData(Object.entries(hourlyCounts).map(([hour, count]) => ({ hour, count })))
  }

  async function fetchRecentVisits() {
    const { data } = await supabase.from('visits').select('*, visitor:visitors(full_name, visitor_organization), employee:employees(full_name)').order('created_at', { ascending: false }).limit(10)
    setRecentVisits(data || [])
  }

  const fetchAllData = async () => {
    const { start, end } = getDateRange()

    try {
      const [visitorsRes, visitsRes, pendingRes, approvedRes, rejectedRes, checkedOutRes, pendingVerificationRes, documentsReviewedRes, documentsPendingRes, documentsRejectedRes] = await Promise.all([
        supabase.from('visitors').select('id', { count: 'exact' }),
        supabase.from('visits').select('id,status,check_in_time,check_out_time', { count: 'exact' }).gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
        supabase.from('visits').select('id', { count: 'exact' }).eq('status', 'pending').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
        supabase.from('visits').select('id', { count: 'exact' }).eq('status', 'approved').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
        supabase.from('visits').select('id', { count: 'exact' }).eq('status', 'rejected').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
        supabase.from('visits').select('id', { count: 'exact' }).eq('status', 'checked_out').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
        supabase.from('visitor_documents').select('id', { count: 'exact', head: true }).eq('verification_status', 'Pending').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
        supabase.from('visitor_badges').select('id', { count: 'exact' }).gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toISOString()),
        supabase.from('visitor_documents').select('id', { count: 'exact', head: true }).eq('verification_status', 'Verified').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
        supabase.from('visitor_documents').select('id', { count: 'exact', head: true }).eq('verification_status', 'Pending').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
        supabase.from('visitor_documents').select('id', { count: 'exact', head: true }).eq('verification_status', 'Rejected').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
      ])

      const checkedInVisits = (visitsRes.data || []).filter((v: { status: string; check_in_time: string | null; check_out_time: string | null }) => v.status === 'checked_in')
      const avgDuration = calculateAvgDuration(checkedInVisits)

      setStats({
        totalVisitors: visitorsRes.count ?? 0,
        totalVisits: visitsRes.count ?? 0,
        approvedVisits: approvedRes.count ?? 0,
        pendingVisits: pendingRes.count ?? 0,
        rejectedVisits: rejectedRes.count ?? 0,
        checkedInVisits: checkedInVisits.length,
        checkedOutVisits: checkedOutRes.count ?? 0,
        avgVisitDuration: avgDuration,
        activeVisitors: checkedInVisits.length,
        pendingVerification: pendingVerificationRes.count ?? 0,
        visitorsWaitingBadge: 0,
        visitorsOverstayed: 0,
        documentsReviewed: documentsReviewedRes.count ?? 0,
        documentsPending: documentsPendingRes.count ?? 0,
        documentsRejected: documentsRejectedRes.count ?? 0,
        avgReviewTime: '0h 0m',
      })

      await Promise.all([
        fetchVisitorsPerDay(start, end),
        fetchVisitsByStatus(start, end),
        fetchDepartmentsData(start, end),
        fetchHostEmployeesData(start, end),
        fetchCompaniesData(start, end),
        fetchHourlyData(),
        fetchRecentVisits(),
      ])
    } catch (error) {
      console.error('Error fetching reports data:', error)
    } finally {
      setLoading(false)
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!authChecking) fetchAllData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, customDateFrom, customDateTo, authChecking])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    supabase.from('employees').select('department').then(({ data }) => {
      if (data) setDepartments([...new Set(data.map((d: { department: string }) => d.department).filter(Boolean))] as string[])
    })
  }, [])

  const handleExport = async (format: 'pdf' | 'excel' | 'csv' | 'print') => {
    setExporting(true)
    logAuditAction('Report Exported', 'report', null, `Report exported as ${format.toUpperCase()}`)
    try {
      if (format === 'csv') {
        const headers = ['Visitor', 'Organization', 'Host', 'Purpose', 'Status', 'Check-In', 'Check-Out']
        const rows = [headers.join(',')]
        recentVisits.forEach(v => {
          rows.push([v.visitor?.full_name || '', v.visitor?.visitor_organization || '', v.employee?.full_name || '', v.purpose || '', v.status, v.check_in_time ? new Date(v.check_in_time).toLocaleString() : '', v.check_out_time ? new Date(v.check_out_time).toLocaleString() : ''].join(','))
        })
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `report-${dateRange}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } else if (format === 'print') {
        window.print()
      } else {
        alert(`${format.toUpperCase()} export would be processed server-side.`)
      }
    } catch (err) {
      console.error('Export error:', err)
    } finally {
      setExporting(false)
    }
  }

  const statusColors: Record<string, string> = { pending: '#f59e0b', approved: '#0B3D91', rejected: '#ef4444', checked_in: '#10b981', checked_out: '#6b7280' }

if (authChecking) {
    return (
      <div className="flex h-screen bg-[#0B0F08] relative items-center justify-center">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/afcsc-login.jpg"
            alt="Nigerian Army Aviation Command background"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F08]/90 via-[#0B0F08]/70 to-[#0B0F08]/40" />
        </div>
        <Loader2 className="h-8 w-8 animate-spin text-[#C8A646]" />
      </div>
    )
  }

return (
    <div className="min-h-screen bg-[#0B0F08] relative">
      <div className="absolute inset-0 z-0">
        <img
          src="/images/afcsc-login.jpg"
          alt="Nigerian Army Aviation Command background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F08]/90 via-[#0B0F08]/70 to-[#0B0F08]/40" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F5DC]">Reports & Analytics</h1>
            <p className="text-sm text-[#9A9F87]">Real-time operational insights and reporting</p>
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
          department={department}
          onDepartmentChange={setDepartment}
          departments={departments}
          status={status}
          onStatusChange={setStatus}
          onExport={handleExport}
          exporting={exporting}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <ReportKPICard title="Total Visitors" value={stats.totalVisitors} icon={Users} color="blue" loading={loading} index={0} />
          <ReportKPICard title="Total Visits" value={stats.totalVisits} icon={Calendar} color="purple" loading={loading} index={1} />
          <ReportKPICard title="Visitors Today" value={stats.totalVisitors} icon={TrendingUp} color="green" loading={loading} index={2} />
          <ReportKPICard title="Badges Printed" value={0} icon={Printer} color="emerald" loading={loading} index={3} />
          <ReportKPICard title="Avg Duration" value={stats.avgVisitDuration} icon={Clock} color="gray" loading={loading} index={5} />
          <ReportKPICard title="Pending" value={stats.pendingVisits} icon={AlertTriangle} color="orange" loading={loading} index={6} />
          <ReportKPICard title="Approved" value={stats.approvedVisits} icon={CheckCircle2} color="green" loading={loading} index={7} />
          <ReportKPICard title="Active" value={stats.activeVisitors} icon={Users} color="blue" loading={loading} index={8} />
          <ReportKPICard title="Checked Out" value={stats.checkedOutVisits} icon={LogOut} color="gray" loading={loading} index={9} />
          <ReportKPICard title="Rejected" value={stats.rejectedVisits} icon={XCircle} color="red" loading={loading} index={10} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Visitor Trends" subtitle="Daily visitor volume" icon={TrendingUp} loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={visitorsPerDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#0B3D91" fill="#0B3D91" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Visits by Status" subtitle="Current status breakdown" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={visitsByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {visitsByStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={statusColors[entry.name.toLowerCase().replace(' ', '_')] || COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Top Departments" subtitle="Most visited departments" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={departmentsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#0B3D91" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Top Hosts" subtitle="Most active hosts" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={hostEmployeesData} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="count" fill="#D4AF37" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Visitor Companies" subtitle="Top visiting organizations" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={companiesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Hourly Check-In Trend" subtitle="Peak hours analysis" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ReportTable
          title="Recent Visits"
          subtitle="Last 10 visits"
          columns={[
            { key: 'visitor', label: 'Visitor', render: (item) => item.visitor?.full_name || '—' },
            { key: 'organization', label: 'Organization', render: (item) => item.visitor?.visitor_organization || '—' },
            { key: 'host', label: 'Host', render: (item) => item.employee?.full_name || '—' },
            { key: 'purpose', label: 'Purpose', render: (item) => item.purpose || '—' },
            { key: 'status', label: 'Status', render: (item) => item.status.replace('_', ' ') },
            { key: 'checkIn', label: 'Check-In', render: (item) => item.check_in_time ? new Date(item.check_in_time).toLocaleString() : '—' },
          ]}
          data={recentVisits}
          loading={loading}
          emptyMessage="No visits found"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link href="/reports/visitors" className="rounded-[20px] border border-[rgba(85,107,47,0.35)]/60 bg-[#10150D] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:shadow-[0_10px_40px_rgba(0,0,0,0.1)] transition-shadow">
            <h3 className="text-sm font-semibold text-[#F5F5DC] mb-1">Visitor Reports</h3>
            <p className="text-xs text-[#9A9F87]">Detailed visitor analytics and history</p>
          </Link>
          <Link href="/reports/security" className="rounded-[20px] border border-[rgba(85,107,47,0.35)]/60 bg-[#10150D] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:shadow-[0_10px_40px_rgba(0,0,0,0.1)] transition-shadow">
            <h3 className="text-sm font-semibold text-[#F5F5DC] mb-1">Security Reports</h3>
            <p className="text-xs text-[#9A9F87]">Security incidents and alerts</p>
          </Link>
        </div>
      </div>
    </div>
  )
}



