'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Users, UserPlus, RefreshCw, Clock, CheckCircle2, LogOut, TrendingUp } from 'lucide-react'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import ReportKPICard from '@/components/reports/ReportKPICard'
import ReportFilters from '@/components/reports/ReportFilters'
import ChartCard from '@/components/reports/ChartCard'
import ReportTable from '@/components/reports/ReportTable'
import Link from 'next/link'

const COLORS = ['#0B3D91', '#1F6FEB', '#D4AF37', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

interface VisitorRow {
  id: string
  visitor: { full_name: string; visitor_organization: string } | null
  employee: { full_name: string; department: string } | null
  purpose: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  created_at: string
}

export default function VisitorReportsPage() {
  const [authChecking, setAuthChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('today')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [exporting, setExporting] = useState(false)
  const [departments, setDepartments] = useState<string[]>([])

  const [totalVisitors, setTotalVisitors] = useState(0)
  const [newThisPeriod, setNewThisPeriod] = useState(0)
  const [returningVisitors, setReturningVisitors] = useState(0)
  const [avgDuration, setAvgDuration] = useState('0h 0m')
  const [totalCheckins, setTotalCheckins] = useState(0)
  const [totalCheckouts, setTotalCheckouts] = useState(0)

  const [visitorsPerDay, setVisitorsPerDay] = useState<Array<{ date: string; count: number }>>([])
  const [statusData, setStatusData] = useState<Array<{ name: string; value: number }>>([])
  const [nationalityData, setNationalityData] = useState<Array<{ name: string; count: number }>>([])
  const [companyData, setCompanyData] = useState<Array<{ name: string; count: number }>>([])
  const [peakHours, setPeakHours] = useState<Array<{ hour: string; count: number }>>([])
  const [recentVisitors, setRecentVisitors] = useState<VisitorRow[]>([])

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

  const calcAvgDuration = (visits: Array<{ check_in_time: string | null; check_out_time: string | null }>) => {
    const completed = visits.filter(v => v.check_in_time && v.check_out_time)
    if (completed.length === 0) return '0h 0m'
    const totalMs = completed.reduce((sum, v) => sum + (new Date(v.check_out_time!).getTime() - new Date(v.check_in_time!).getTime()), 0)
    const avgMs = totalMs / completed.length
    const hours = Math.floor(avgMs / (1000 * 60 * 60))
    const minutes = Math.floor((avgMs % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${minutes}m`
  }

  useEffect(() => {
    if (authChecking) return
    let active = true
    const fetchData = async () => {
      setLoading(true)
      const { start, end } = getDateRange()
      try {
        const [
          visitorsRes,
          visitsRes,
          checkedInRes,
          checkedOutRes,
          statusRes,
          nationalityRes,
          companyRes,
          peakRes,
          recentRes,
        ] = await Promise.all([
          supabase.from('visitors').select('id,created_at', { count: 'exact' }),
          supabase.from('visits').select('id,visitor_id,status,check_in_time,check_out_time,created_at', { count: 'exact' }).gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('visits').select('id', { count: 'exact' }).eq('status', 'checked_in').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('visits').select('id', { count: 'exact' }).eq('status', 'checked_out').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('visits').select('status').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('visitors').select('nationality').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('visitors').select('visitor_organization').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('visits').select('check_in_time').eq('status', 'checked_in').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('visits').select('*,visitor:visitors(full_name,visitor_organization),employee:employees(full_name,department)').order('created_at', { ascending: false }).limit(10),
        ])

        if (!active) return

        const visits = visitsRes.data || []
        const visitorIds = [...new Set(visits.map(v => v.visitor_id))]
        const uniqueVisitors = visitorIds.length
        const returning = Math.max(0, uniqueVisitors - newThisPeriod)

        setTotalVisitors(visitorsRes.count ?? 0)
        setNewThisPeriod(uniqueVisitors)
        setReturningVisitors(returning)
        setAvgDuration(calcAvgDuration(visits))
        setTotalCheckins(checkedInRes.count ?? 0)
        setTotalCheckouts(checkedOutRes.count ?? 0)

        const sc = statusRes.data || []
        const scMap: Record<string, number> = {}
        sc.forEach(v => { scMap[v.status] = (scMap[v.status] || 0) + 1 })
        setStatusData([
          { name: 'Pending', value: scMap.pending || 0 },
          { name: 'Approved', value: scMap.approved || 0 },
          { name: 'Rejected', value: scMap.rejected || 0 },
          { name: 'Checked In', value: scMap.checked_in || 0 },
          { name: 'Checked Out', value: scMap.checked_out || 0 },
        ])

        const nat = nationalityRes.data || []
        const natMap: Record<string, number> = {}
        nat.forEach(v => { const n = v.nationality || 'Unknown'; natMap[n] = (natMap[n] || 0) + 1 })
        setNationalityData(Object.entries(natMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10))

        const comp = companyRes.data || []
        const compMap: Record<string, number> = {}
        comp.forEach(v => { const c = v.visitor_organization || 'Unknown'; compMap[c] = (compMap[c] || 0) + 1 })
        setCompanyData(Object.entries(compMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10))

        const peak = peakRes.data || []
        const hourlyCounts: Record<string, number> = {}
        for (let i = 0; i < 24; i++) hourlyCounts[`${String(i).padStart(2, '0')}:00`] = 0
        peak.forEach(v => {
          if (v.check_in_time) {
            const h = new Date(v.check_in_time).getHours()
            hourlyCounts[`${String(h).padStart(2, '0')}:00`]++
          }
        })
        setPeakHours(Object.entries(hourlyCounts).map(([hour, count]) => ({ hour, count })))

        const vpd: Record<string, number> = {}
        visits.forEach(v => {
          const d = new Date(v.created_at).toISOString().split('T')[0]
          vpd[d] = (vpd[d] || 0) + 1
        })
        setVisitorsPerDay(Object.entries(vpd).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)))

        setRecentVisitors((recentRes.data as VisitorRow[]) || [])
      } catch (e) {
        console.error('Visitor reports error:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecking, dateRange, customDateFrom, customDateTo, department, status])

  useEffect(() => {
    supabase.from('employees').select('department').then(({ data }) => {
      if (data) setDepartments([...new Set(data.map((d: { department: string }) => d.department).filter(Boolean))] as string[])
    })
  }, [])

  const handleExport = async (format: 'pdf' | 'excel' | 'csv' | 'print') => {
    setExporting(true)
    try {
      if (format === 'csv') {
        const headers = ['Visitor', 'Organization', 'Host', 'Purpose', 'Status', 'Check-In', 'Check-Out']
        const rows = [headers.join(',')]
        recentVisitors.forEach(v => {
          rows.push([
            v.visitor?.full_name || '',
            v.visitor?.visitor_organization || '',
            v.employee?.full_name || '',
            v.purpose || '',
            v.status,
            v.check_in_time ? new Date(v.check_in_time).toLocaleString() : '',
            v.check_out_time ? new Date(v.check_out_time).toLocaleString() : '',
          ].join(','))
        })
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `visitor-report-${dateRange}.csv`
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
            <h1 className="text-2xl font-bold text-[#F5F5DC]">Visitor Reports</h1>
            <p className="text-sm text-[#9A9F87]">Detailed visitor analytics and history</p>
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
          <ReportKPICard title="Total Visitors" value={totalVisitors} icon={Users} color="blue" loading={loading} index={0} />
          <ReportKPICard title="New This Period" value={newThisPeriod} icon={UserPlus} color="green" loading={loading} index={1} />
          <ReportKPICard title="Returning Visitors" value={returningVisitors} icon={RefreshCw} color="purple" loading={loading} index={2} />
          <ReportKPICard title="Avg Duration" value={avgDuration} icon={Clock} color="amber" loading={loading} index={3} />
          <ReportKPICard title="Check-ins" value={totalCheckins} icon={CheckCircle2} color="emerald" loading={loading} index={4} />
          <ReportKPICard title="Check-outs" value={totalCheckouts} icon={LogOut} color="gray" loading={loading} index={5} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Visitors Per Day" subtitle="Daily visitor volume" icon={TrendingUp} loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={visitorsPerDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#0B3D91" fill="#0B3D91" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Visitor Status" subtitle="Current status breakdown" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Nationality Distribution" subtitle="Visitors by country" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={nationalityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#1F6FEB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Company Distribution" subtitle="Visitors by organization" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={companyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#D4AF37" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Peak Hours" subtitle="Hourly check-in distribution" loading={loading}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={peakHours}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ReportTable
          title="Recent Visitors"
          subtitle="Last 10 visitors"
          columns={[
            { key: 'name', label: 'Name', render: (item: VisitorRow) => item.visitor?.full_name || '—' },
            { key: 'organization', label: 'Organization', render: (item: VisitorRow) => item.visitor?.visitor_organization || '—' },
            { key: 'host', label: 'Host', render: (item: VisitorRow) => item.employee?.full_name || '—' },
            { key: 'purpose', label: 'Purpose', render: (item: VisitorRow) => item.purpose || '—' },
            { key: 'status', label: 'Status', render: (item: VisitorRow) => item.status.replace(/_/g, ' ') },
            { key: 'checkIn', label: 'Check-In', render: (item: VisitorRow) => item.check_in_time ? new Date(item.check_in_time).toLocaleString() : '—' },
            { key: 'checkOut', label: 'Check-Out', render: (item: VisitorRow) => item.check_out_time ? new Date(item.check_out_time).toLocaleString() : '—' },
          ]}
          data={recentVisitors}
          loading={loading}
          emptyMessage="No visitors found"
        />
      </div>
    </div>
  )
}

