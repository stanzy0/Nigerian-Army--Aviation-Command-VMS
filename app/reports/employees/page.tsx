'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Users, UserCheck, BarChart3, Trophy, TrendingUp } from 'lucide-react'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import ReportKPICard from '@/components/reports/ReportKPICard'
import ReportFilters from '@/components/reports/ReportFilters'
import ChartCard from '@/components/reports/ChartCard'
import ReportTable from '@/components/reports/ReportTable'
import Link from 'next/link'

interface EmployeeRow {
  id: string
  full_name: string
  department: string
  total_visits: number
  last_visit: string
}

export default function EmployeeReportsPage() {
  const [authChecking, setAuthChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('today')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [department, setDepartment] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [exporting, setExporting] = useState(false)

  const [totalHosts, setTotalHosts] = useState(0)
  const [activeHosts, setActiveHosts] = useState(0)
  const [avgVisitsPerHost, setAvgVisitsPerHost] = useState(0)
  const [topDepartment, setTopDepartment] = useState('—')
  const [busiestHost, setBusiestHost] = useState('—')
  const [totalVisits, setTotalVisits] = useState(0)

  const [topHosts, setTopHosts] = useState<Array<{ name: string; count: number }>>([])
  const [visitsByDept, setVisitsByDept] = useState<Array<{ name: string; count: number }>>([])
  const [visitsByLocation, setVisitsByLocation] = useState<Array<{ name: string; count: number }>>([])
  const [visitsPerDay, setVisitsPerDay] = useState<Array<{ date: string; count: number }>>([])
  const [employeePerformance, setEmployeePerformance] = useState<EmployeeRow[]>([])

  const [departments, setDepartments] = useState<string[]>([])

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
          hostsRes,
          visitsWithEmp,
          perDayRes,
          empPerfRes,
        ] = await Promise.all([
          supabase.from('employees').select('id', { count: 'exact', head: true }),
          supabase.from('visits').select('*,employee:employees(full_name,department,office_location)').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('visits').select('created_at').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('visits').select('*,employee:employees(full_name,department)').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()).order('created_at', { ascending: false }),
        ])

        if (!active) return

        const visits = (visitsWithEmp.data || []) as Array<{ employee_id?: string; employee?: { full_name?: string; department?: string; office_location?: string | null } }>
        const hostCount = hostsRes.count ?? 0
        const activeSet = new Set(visits.map(v => v.employee_id).filter(Boolean))
        const activeH = activeSet.size

        setTotalHosts(hostCount)
        setActiveHosts(activeH)
        setAvgVisitsPerHost(hostCount > 0 ? parseFloat((visits.length / hostCount).toFixed(1)) : 0)
        setTotalVisits(visits.length)

        const topHMap: Record<string, number> = {}
        const typedVisits = visitsWithEmp.data as Array<{ employee?: { full_name?: string; department?: string; office_location?: string | null } }> | null
        typedVisits?.forEach(v => {
          const name = v.employee?.full_name || 'Unknown'
          topHMap[name] = (topHMap[name] || 0) + 1
        })
        const sortedHosts = Object.entries(topHMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10)
        setTopHosts(sortedHosts)
        if (sortedHosts.length > 0) setBusiestHost(sortedHosts[0].name)

        const deptMap: Record<string, number> = {}
        typedVisits?.forEach(v => {
          const dept = v.employee?.department || 'Unknown'
          deptMap[dept] = (deptMap[dept] || 0) + 1
        })
        const sortedDepts = Object.entries(deptMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10)
        setVisitsByDept(sortedDepts)
        if (sortedDepts.length > 0) setTopDepartment(sortedDepts[0].name)

        const locMap: Record<string, number> = {}
        typedVisits?.forEach(v => {
          const loc = v.employee?.office_location || 'Unknown'
          locMap[loc] = (locMap[loc] || 0) + 1
        })
        setVisitsByLocation(Object.entries(locMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10))

        const pdMap: Record<string, number> = {}
        const vpdData = perDayRes.data || []
        vpdData.forEach(v => {
          const d = new Date(v.created_at).toISOString().split('T')[0]
          pdMap[d] = (pdMap[d] || 0) + 1
        })
        setVisitsPerDay(Object.entries(pdMap).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)))

        const empVisits: Record<string, { name: string; department: string; dates: string[] }> = {}
        const empPerfData = empPerfRes.data as Array<{ employee?: { full_name?: string; department?: string }; created_at: string }> | null
        empPerfData?.forEach(v => {
          if (!v.employee?.full_name) return
          const key = v.employee.full_name
          if (!empVisits[key]) empVisits[key] = { name: key, department: v.employee.department || 'Unknown', dates: [] }
          empVisits[key].dates.push(new Date(v.created_at).toISOString().split('T')[0])
        })
        const perf = Object.values(empVisits).map(e => ({
          id: e.name,
          full_name: e.name,
          department: e.department,
          total_visits: e.dates.length,
          last_visit: e.dates.sort().reverse()[0] || '—',
        })).sort((a, b) => b.total_visits - a.total_visits).slice(0, 10)
        setEmployeePerformance(perf)
      } catch (e) {
        console.error('Employee reports error:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecking, dateRange, customDateFrom, customDateTo, department])

  useEffect(() => {
    supabase.from('employees').select('department').then(({ data }) => {
      if (data) setDepartments([...new Set(data.map((d: { department: string }) => d.department).filter(Boolean))] as string[])
    })
  }, [])

  const handleExport = async (format: 'pdf' | 'excel' | 'csv' | 'print') => {
    setExporting(true)
    try {
      if (format === 'csv') {
        const headers = ['Name', 'Department', 'Total Visits', 'Last Visit']
        const rows = [headers.join(',')]
        employeePerformance.forEach(e => {
          rows.push([e.full_name, e.department, e.total_visits.toString(), e.last_visit].join(','))
        })
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `employee-report-${dateRange}.csv`
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
            <h1 className="text-2xl font-bold text-[#F5F5DC]">Employee / Host Reports</h1>
            <p className="text-sm text-[#9A9F87]">Employee performance and host analytics</p>
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
          status={''}
          onStatusChange={() => {}}
          onExport={handleExport}
          exporting={exporting}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <ReportKPICard title="Total Hosts" value={totalHosts} icon={Users} color="blue" loading={loading} index={0} />
          <ReportKPICard title="Active Hosts" value={activeHosts} icon={UserCheck} color="green" loading={loading} index={1} />
          <ReportKPICard title="Avg Visits/Host" value={avgVisitsPerHost} icon={BarChart3} color="amber" loading={loading} index={2} />
          <ReportKPICard title="Top Department" value={topDepartment} icon={Trophy} color="amber" loading={loading} index={3} />
          <ReportKPICard title="Busiest Host" value={busiestHost} icon={Trophy} color="purple" loading={loading} index={4} />
          <ReportKPICard title="Total Visits" value={totalVisits} icon={TrendingUp} color="emerald" loading={loading} index={5} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Top Hosts" subtitle="Most active hosts" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topHosts} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="count" fill="#D4AF37" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Visits by Department" subtitle="Department visit distribution" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={visitsByDept}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#0B3D91" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Visits by Office Location" subtitle="Distribution by office" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={visitsByLocation}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#1F6FEB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Visits Per Day" subtitle="Daily visit volume" icon={TrendingUp} loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={visitsPerDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ReportTable
          title="Employee Performance"
          subtitle="Top 10 employees by visits"
          columns={[
            { key: 'name', label: 'Name', render: (item: EmployeeRow) => item.full_name },
            { key: 'department', label: 'Department', render: (item: EmployeeRow) => item.department },
            { key: 'total_visits', label: 'Total Visits', render: (item: EmployeeRow) => item.total_visits.toString() },
            { key: 'last_visit', label: 'Last Visit', render: (item: EmployeeRow) => item.last_visit },
          ]}
          data={employeePerformance}
          loading={loading}
          emptyMessage="No employee data found"
        />
      </div>
    </div>
  )
}


