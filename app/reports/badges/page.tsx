'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Printer, Ban, CalendarX, RefreshCw, CheckCircle2, TrendingUp } from 'lucide-react'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import {
  PieChart, Pie, Cell, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { VisitorBadge } from '@/lib/badge/badge-types'
import ReportKPICard from '@/components/reports/ReportKPICard'
import ReportFilters from '@/components/reports/ReportFilters'
import ChartCard from '@/components/reports/ChartCard'
import ReportTable from '@/components/reports/ReportTable'
import Link from 'next/link'

const COLORS = ['#0B3D91', '#1F6FEB', '#D4AF37', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

interface BadgeRow {
  id: string
  badge_number: string
  visit?: {
    visitor?: { full_name: string; visitor_organization: string } | null
    employee?: { full_name: string } | null
  } | null
  badge_status: string
  issued_at: string
  expires_at: string
}

export default function BadgeReportsPage() {
  const [authChecking, setAuthChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('today')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [exporting, setExporting] = useState(false)

  const [badgesIssued, setBadgesIssued] = useState(0)
  const [revoked, setRevoked] = useState(0)
  const [expired, setExpired] = useState(0)
  const [reprinted, setReprinted] = useState(0)
  const [activeToday, setActiveToday] = useState(0)
  const [reprintRate, setReprintRate] = useState('0%')

  const [badgeStatusData, setBadgeStatusData] = useState<Array<{ name: string; value: number }>>([])
  const [badgesPerDay, setBadgesPerDay] = useState<Array<{ date: string; count: number }>>([])
  const [reprintTrend, setReprintTrend] = useState<Array<{ date: string; count: number }>>([])
  const [badgeTypeData, setBadgeTypeData] = useState<Array<{ name: string; value: number }>>([])
  const [recentBadges, setRecentBadges] = useState<BadgeRow[]>([])

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
          allBadgesRes,
          activeRes,
          expiredRes,
          revokedRes,
          recentRes,
          perDayRes,
          reprintDayRes,
        ] = await Promise.all([
          supabase.from('visitor_badges').select('*,visit:visits(visitor:visitors(full_name,visitor_organization),employee:employees(full_name))').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Active').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Expired').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Cancelled').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('visitor_badges').select('*,visit:visits(visitor:visitors(full_name,visitor_organization),employee:employees(full_name))').order('created_at', { ascending: false }).limit(10),
          supabase.from('visitor_badges').select('issued_at').gte('issued_at', start.toISOString()).lt('issued_at', end.toISOString()),
          supabase.from('visitor_badges').select('created_at,reprint_count').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
        ])

        if (!active) return

        const badges = (allBadgesRes.data as VisitorBadge[]) || []
        const total = badges.length
        const expiredCount = expiredRes.count ?? 0
        const revokedCount = revokedRes.count ?? 0
        const reprintBadges = badges.filter(b => b.reprint_count > 0).length
        const activeCount = activeRes.count ?? 0

        setBadgesIssued(total)
        setRevoked(revokedCount)
        setExpired(expiredCount)
        setReprinted(reprintBadges)
        setActiveToday(activeCount)
        setReprintRate(total > 0 ? `${((reprintBadges / total) * 100).toFixed(1)}%` : '0%')

        const statusMap: Record<string, number> = {}
        badges.forEach(b => { statusMap[b.badge_status] = (statusMap[b.badge_status] || 0) + 1 })
        setBadgeStatusData(Object.entries(statusMap).map(([name, value]) => ({ name, value })))

        const pdMap: Record<string, number> = {}
        const perDayData = perDayRes.data || []
        perDayData.forEach(b => {
          const d = new Date(b.issued_at).toISOString().split('T')[0]
          pdMap[d] = (pdMap[d] || 0) + 1
        })
        setBadgesPerDay(Object.entries(pdMap).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)))

        const rtMap: Record<string, number> = {}
        const reprintData = reprintDayRes.data || []
        reprintData.forEach(b => {
          if (b.reprint_count > 0) {
            const d = new Date(b.created_at).toISOString().split('T')[0]
            rtMap[d] = (rtMap[d] || 0) + 1
          }
        })
        setReprintTrend(Object.entries(rtMap).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)))

        const typeMap: Record<string, number> = {}
        badges.forEach(b => {
          const type = b.badge_status === 'Active' ? 'Active' : b.badge_status === 'Expired' ? 'Expired' : b.badge_status === 'Checked Out' ? 'Checked Out' : 'Cancelled'
          typeMap[type] = (typeMap[type] || 0) + 1
        })
        setBadgeTypeData(Object.entries(typeMap).map(([name, value]) => ({ name, value })))

        const recentBadgesData = (recentRes.data as BadgeRow[]) || []
        setRecentBadges(recentBadgesData)
      } catch (e) {
        console.error('Badge reports error:', e)
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
        const headers = ['Number', 'Visitor', 'Host', 'Status', 'Issued', 'Expires']
        const rows = [headers.join(',')]
        recentBadges.forEach(b => {
          rows.push([
            b.badge_number,
            b.visit?.visitor?.full_name || '',
            b.visit?.employee?.full_name || '',
            b.badge_status,
            b.issued_at,
            b.expires_at,
          ].join(','))
        })
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `badge-report-${dateRange}.csv`
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
            <h1 className="text-2xl font-bold text-[#F5F5DC]">Badge Reports</h1>
            <p className="text-sm text-[#9A9F87]">Badge issuance and lifecycle analytics</p>
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
          <ReportKPICard title="Badges Issued" value={badgesIssued} icon={Printer} color="blue" loading={loading} index={0} />
          <ReportKPICard title="Revoked" value={revoked} icon={Ban} color="red" loading={loading} index={1} />
          <ReportKPICard title="Expired" value={expired} icon={CalendarX} color="orange" loading={loading} index={2} />
          <ReportKPICard title="Reprinted" value={reprinted} icon={RefreshCw} color="purple" loading={loading} index={3} />
          <ReportKPICard title="Active Today" value={activeToday} icon={CheckCircle2} color="green" loading={loading} index={4} />
          <ReportKPICard title="Reprint Rate" value={reprintRate} icon={TrendingUp} color="amber" loading={loading} index={5} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Badge Status" subtitle="Current badge status distribution" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={badgeStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {badgeStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Badges Per Day" subtitle="Daily badge issuance" icon={TrendingUp} loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={badgesPerDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#0B3D91" strokeWidth={2} dot={{ fill: '#0B3D91' }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Reprint Trend" subtitle="Daily reprint count" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={reprintTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#D4AF37" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Badge Type Distribution" subtitle="Status breakdown" loading={loading}>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={badgeTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {badgeTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ReportTable
          title="Recent Badges"
          subtitle="Last 10 badges"
          columns={[
            { key: 'badge_number', label: 'Number', render: (item: BadgeRow) => item.badge_number },
            { key: 'visitor', label: 'Visitor', render: (item: BadgeRow) => item.visit?.visitor?.full_name || '—' },
            { key: 'host', label: 'Host', render: (item: BadgeRow) => item.visit?.employee?.full_name || '—' },
            { key: 'status', label: 'Status', render: (item: BadgeRow) => item.badge_status },
            { key: 'issued', label: 'Issued', render: (item: BadgeRow) => new Date(item.issued_at).toLocaleString() },
            { key: 'expires', label: 'Expires', render: (item: BadgeRow) => new Date(item.expires_at).toLocaleString() },
          ]}
          data={recentBadges}
          loading={loading}
          emptyMessage="No badges found"
        />
      </div>
    </div>
  )
}


