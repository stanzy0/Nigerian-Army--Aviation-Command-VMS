'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS, UserRole } from '@/lib/auth-client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area,
} from 'recharts'
import {
  Users, Clock, Calendar, FileText, ShieldAlert, TrendingUp, AlertTriangle,
  Download, Printer, Loader2, RefreshCw, UserCheck, ShieldCheck, BadgeCheck,
  Building2, MapPin, Repeat, XCircle, CheckCircle, Filter, ChevronDown,
  BadgeX, Car, Package, Hourglass, Eye, FileCheck, FileX, Ban,
  UserPlus, CalendarX, CalendarCheck, Timer, ShieldX, Map,
  Search, MoreVertical, Phone, Bell, PrinterIcon, LogOut,
  Shield, ShieldOff, User, Home, Briefcase, MapPinOff,
  Activity, ArrowRight, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16']

interface OperationsData {
  kpis: {
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
  visitors: {
    data: Array<{
      id: string
      registration_number: string | null
      status: string
      visitor_type: string
      source: string
      check_in_time: string | null
      check_out_time: string | null
      expires_at: string | null
      created_at: string
      visitor: { full_name: string; visitor_organization: string | null; photo_url: string | null } | null
      employee: { full_name: string; department: string | null; office_location: string | null } | null
      badge: { id: string; badge_number: string; badge_status: string; printed_at: string | null; expires_at: string } | null
    }>
    total: number
  }
  activity: Array<{
    id: string
    type: string
    message: string
    timestamp: string
    priority: 'low' | 'medium' | 'high' | 'critical'
    icon: string
    color: string
  }>
  queues: {
    reception: Array<{ id: string; visitor_name: string; company: string | null; host: string | null; department: string | null; waiting_since: string; status: string }>
    badge: Array<{ id: string; visitor_name: string; company: string | null; host: string | null; department: string | null; waiting_since: string; status: string }>
    security: Array<{ id: string; visitor_name: string; company: string | null; host: string | null; department: string | null; waiting_since: string; status: string }>
    document: Array<{ id: string; visitor_name: string; company: string | null; host: string | null; department: string | null; waiting_since: string; status: string }>
    exit: Array<{ id: string; visitor_name: string; company: string | null; host: string | null; department: string | null; waiting_since: string; status: string }>
  }
  overstays: Array<{
    id: string
    visitor_name: string
    company: string | null
    host: string | null
    office: string | null
    hours_overdue: number
    check_in_time: string | null
    badge_number: string | null
  }>
  security: {
    watchlistMatches: number
    deniedEntry: number
    activeHolds: number
    criticalAlerts: number
    emergencyAlerts: number
    recentAlerts: Array<{ id: string; alert_type: string; severity: string; title: string; message: string; is_resolved: boolean; created_at: string }>
  }
  hosts: {
    available: Array<{ id: string; full_name: string; department: string | null }>
    unavailable: Array<{ id: string; full_name: string; department: string | null; reason: string }>
    outsideOffice: Array<{ id: string; full_name: string; office_location: string | null }>
  }
  occupancy: Array<{ department: string; office_location: string; visitor_count: number }>
  badges: Array<{ id: string; badge_number: string; visitor_name: string; company: string | null; issued_at: string; expires_at: string; status: string; visit_id: string }>
  property: Array<{ id: string; visit_id: string; visitor_name: string; property_type: string; description: string | null; status: string; created_at: string }>
  emergency: boolean
}

const DATE_RANGES = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: '7days' },
  { label: 'Last 30 Days', value: '30days' },
  { label: 'This Month', value: 'thisMonth' },
]

export default function OperationsPage() {
  const [data, setData] = useState<OperationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [userRole, setUserRole] = useState<UserRole>('Receptionist')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [visitorTypeFilter, setVisitorTypeFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [officeLocationFilter, setOfficeLocationFilter] = useState('')
  const [departments, setDepartments] = useState<string[]>([])
  const [visitorTypes, setVisitorTypes] = useState<string[]>([])
  const [officeLocations, setOfficeLocations] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchFilterOptions = async () => {
    try {
      const [deptRes, typeRes, officeRes] = await Promise.all([
        supabase.from('employees').select('department').not('department', 'is', null),
        supabase.from('visitors').select('visitor_type').not('visitor_type', 'is', null),
        supabase.from('employees').select('office_location').not('office_location', 'is', null),
      ])

      const deptSet = new Set<string>()
      deptRes.data?.forEach((d: any) => deptSet.add(d.department))
      setDepartments(Array.from(deptSet).sort())

      const typeSet = new Set<string>()
      typeRes.data?.forEach((t: any) => typeSet.add(t.visitor_type))
      setVisitorTypes(Array.from(typeSet).sort())

      const officeSet = new Set<string>()
      officeRes.data?.forEach((o: any) => officeSet.add(o.office_location))
      setOfficeLocations(Array.from(officeSet).sort())
    } catch (err) {
      console.error('Error fetching filter options:', err)
    }
  }

  const fetchOperations = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (visitorTypeFilter) params.set('visitorType', visitorTypeFilter)
      if (departmentFilter) params.set('department', departmentFilter)
      if (officeLocationFilter) params.set('officeLocation', officeLocationFilter)

      const res = await fetch(`/api/operations?${params.toString()}`)
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      }
    } catch (err) {
      console.error('Error fetching operations data:', err)
    } finally {
      setLoading(false)
    }
  }

  const setupRealtime = () => {
    if (realtimeChannel.current) {
      supabase.removeChannel(realtimeChannel.current)
    }

    realtimeChannel.current = supabase
      .channel('operations-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => fetchOperations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_badges' }, () => fetchOperations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => fetchOperations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_alerts' }, () => fetchOperations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lifecycle_events' }, () => fetchOperations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_items' }, () => fetchOperations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_documents' }, () => fetchOperations())
      .subscribe()
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
      if (!PERMISSIONS[user.role]?.includes('operations')) {
        window.location.href = '/unauthorized'
        return
      }
      setUserRole(user.role)
      setAuthChecking(false)
      fetchOperations()
      fetchFilterOptions()
      setupRealtime()
    }
    checkAuth()

    const pollInterval = setInterval(() => {
      fetchOperations()
    }, 10000)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchOperations()
      }
    }
    const onFocus = () => {
      fetchOperations()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    return () => {
      if (realtimeChannel.current) {
        supabase.removeChannel(realtimeChannel.current)
      }
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    if (!authChecking) {
      setTimeout(() => fetchOperations(), 0)
    }
  }, [search, statusFilter, visitorTypeFilter, departmentFilter, officeLocationFilter])

  const handleEmergencyAction = async (action: 'emergency_lockdown' | 'emergency_unlock') => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (json.success) {
        fetchOperations()
      }
    } catch (err) {
      console.error('Emergency action error:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleForceCheckout = async (visitId: string) => {
    if (!confirm('Are you sure you want to force check out this visitor?')) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force_checkout', visitId }),
      })
      const json = await res.json()
      if (json.success) {
        fetchOperations()
      }
    } catch (err) {
      console.error('Force checkout error:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleNotifyHost = async (visitId: string) => {
    try {
      const res = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'notify_host', visitId }),
      })
      const json = await res.json()
      if (json.success) {
        alert('Host notified successfully')
      }
    } catch (err) {
      console.error('Notify host error:', err)
    }
  }

  const handleReprintBadge = async (visitId: string) => {
    try {
      const res = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'print_badge', visitId }),
      })
      const json = await res.json()
      if (json.success) {
        alert('Badge reprint queued')
      }
    } catch (err) {
      console.error('Reprint badge error:', err)
    }
  }

  const generateOccupancyReport = () => {
    if (!data) return
    const doc = new jsPDF()
    doc.setFontSize(20)
    doc.text('Occupancy Report', 14, 20)
    doc.setFontSize(11)
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28)
    doc.text(`Total Inside: ${data.kpis.visitorsInside}`, 14, 34)

    const tableData = data.visitors.data
      .filter(v => v.status === 'checked_in')
      .map(v => [
        v.visitor?.full_name || 'Unknown',
        v.employee?.full_name || 'Unknown',
        v.employee?.office_location || 'Unknown',
        v.employee?.department || 'Unknown',
        v.check_in_time ? new Date(v.check_in_time).toLocaleString() : 'N/A',
        v.badge?.badge_number || 'N/A',
      ])

    autoTable(doc, {
      startY: 42,
      head: [['Visitor', 'Host', 'Office', 'Department', 'Check-in Time', 'Badge']],
      body: tableData,
    })

    doc.save(`occupancy-report-${new Date().toISOString().split('T')[0]}.pdf`)
  }

  const exportCSV = () => {
    if (!data) return
    const rows = [
      ['Visitor', 'Registration', 'Company', 'Host', 'Department', 'Status', 'Check-in', 'Badge'],
      ...data.visitors.data.map(v => [
        v.visitor?.full_name || '',
        v.registration_number || '',
        v.visitor?.visitor_organization || '',
        v.employee?.full_name || '',
        v.employee?.department || '',
        v.status,
        v.check_in_time ? new Date(v.check_in_time).toLocaleString() : '',
        v.badge?.badge_number || '',
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `operations-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
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
    { title: 'Visitors Inside', value: data.kpis.visitorsInside, icon: Users, color: 'blue' },
    { title: 'Waiting Reception', value: data.kpis.waitingReception, icon: UserPlus, color: 'amber' },
    { title: 'Waiting Doc Verification', value: data.kpis.waitingDocumentVerification, icon: FileText, color: 'orange' },
    { title: 'Waiting Badge Printing', value: data.kpis.waitingBadgePrinting, icon: Printer, color: 'purple' },
    { title: 'Waiting Security', value: data.kpis.waitingSecurityClearance, icon: ShieldCheck, color: 'indigo' },
    { title: 'Approved Waiting Check-in', value: data.kpis.approvedWaitingCheckIn, icon: CheckCircle, color: 'green' },
    { title: 'Checked In', value: data.kpis.checkedIn, icon: UserCheck, color: 'green' },
    { title: 'Checked Out Today', value: data.kpis.checkedOutToday, icon: LogOut, color: 'gray' },
    { title: 'Overstayed', value: data.kpis.overstayedVisitors, icon: Clock, color: 'red' },
    { title: 'Active Security Alerts', value: data.kpis.activeSecurityAlerts, icon: ShieldAlert, color: 'red' },
    { title: 'Leaving Today', value: data.kpis.visitorsLeavingToday, icon: LogOut, color: 'amber' },
  ]

  return (
    <div className="min-h-screen bg-[#0B0F08]">
      {data.emergency && (
        <div className="bg-red-600 text-white text-center py-3 font-bold text-lg animate-pulse">
          EMERGENCY MODE ACTIVE
        </div>
      )}

      <div className="max-w-[1920px] mx-auto p-4 lg:p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F5DC]">Operations Control Center</h1>
            <p className="text-sm text-[#9A9F87]">Live operational picture of everyone currently on base</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {userRole === 'Admin' && (
              <>
                {!data.emergency ? (
                  <button
                    onClick={() => handleEmergencyAction('emergency_lockdown')}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <ShieldOff className="h-4 w-4" />
                    Emergency Lockdown
                  </button>
                ) : (
                  <button
                    onClick={() => handleEmergencyAction('emergency_unlock')}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <Shield className="h-4 w-4" />
                    Disable Emergency
                  </button>
                )}
              </>
            )}
            <button onClick={fetchOperations} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button onClick={generateOccupancyReport} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Download className="h-4 w-4" />
              Occupancy Report
            </button>
            <button onClick={exportCSV} className="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
              <Download className="h-4 w-4" />
              CSV
            </button>
          </div>
        </div>

        <KPICards kpis={kpis} />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <LiveVisitorTable
              visitors={data.visitors.data}
              total={data.visitors.total}
              search={search}
              onSearchChange={setSearch}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              visitorTypeFilter={visitorTypeFilter}
              onVisitorTypeFilterChange={setVisitorTypeFilter}
              departmentFilter={departmentFilter}
              onDepartmentFilterChange={setDepartmentFilter}
              officeLocationFilter={officeLocationFilter}
              onOfficeLocationFilterChange={setOfficeLocationFilter}
              departments={departments}
              visitorTypes={visitorTypes}
              officeLocations={officeLocations}
              onForceCheckout={handleForceCheckout}
              onNotifyHost={handleNotifyHost}
              onReprintBadge={handleReprintBadge}
              actionLoading={actionLoading}
            />
          </div>
          <div className="space-y-6">
            <ActivityFeedSection activities={data.activity} />
            <SecurityPanelSection security={data.security} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          <WaitingQueuesSection queues={data.queues} />
          <OverstayPanel overstays={data.overstays} onForceCheckout={handleForceCheckout} onNotifyHost={handleNotifyHost} actionLoading={actionLoading} />
          <HostAvailabilitySection hosts={data.hosts} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <OfficeOccupancySection occupancy={data.occupancy} />
          <ActiveBadgesSection badges={data.badges} onReprintBadge={handleReprintBadge} />
        </div>

        <ActivePropertySection property={data.property} />
      </div>
    </div>
  )
}

function KPICards({ kpis }: { kpis: Array<{ title: string; value: number; icon: any; color: string }> }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600', purple: 'bg-purple-50 text-purple-600',
    indigo: 'bg-indigo-50 text-indigo-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600', gray: 'bg-gray-50 text-[#9A9F87]',
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
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

function LiveVisitorTable({
  visitors, total, search, onSearchChange, statusFilter, onStatusFilterChange,
  visitorTypeFilter, onVisitorTypeFilterChange, departmentFilter, onDepartmentFilterChange,
  officeLocationFilter, onOfficeLocationFilterChange, departments, visitorTypes, officeLocations,
  onForceCheckout, onNotifyHost, onReprintBadge, actionLoading,
}: {
  visitors: OperationsData['visitors']['data']
  total: number
  search: string
  onSearchChange: (v: string) => void
  statusFilter: string
  onStatusFilterChange: (v: string) => void
  visitorTypeFilter: string
  onVisitorTypeFilterChange: (v: string) => void
  departmentFilter: string
  onDepartmentFilterChange: (v: string) => void
  officeLocationFilter: string
  onOfficeLocationFilterChange: (v: string) => void
  departments: string[]
  visitorTypes: string[]
  officeLocations: string[]
  onForceCheckout: (id: string) => void
  onNotifyHost: (id: string) => void
  onReprintBadge: (id: string) => void
  actionLoading: boolean
}) {
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    checked_in: 'bg-green-100 text-green-800',
    checked_out: 'bg-gray-100 text-[#F5F5DC]',
    overstayed: 'bg-red-100 text-red-800',
    rejected: 'bg-red-100 text-red-800',
  }

  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="text-lg font-semibold text-[#F5F5DC]">Live Visitor Table</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search visitors..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">All Status</option>
              <option value="pending">Waiting</option>
              <option value="approved">Approved</option>
              <option value="checked_in">Checked In</option>
              <option value="overstayed">Overstayed</option>
            </select>
            <select value={visitorTypeFilter} onChange={(e) => onVisitorTypeFilterChange(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">All Types</option>
              {visitorTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={departmentFilter} onChange={(e) => onDepartmentFilterChange(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Photo</th>
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Reg No.</th>
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Visitor</th>
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Company</th>
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Type</th>
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Host</th>
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Dept</th>
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Office</th>
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Status</th>
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Check-in</th>
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Expected Out</th>
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Badge</th>
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Security</th>
              <th className="px-3 py-3 font-semibold text-[#9A9F87]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
            {visitors.map((v) => (
              <tr key={v.id} className="hover:bg-[#4B5320]/10">
                <td className="px-3 py-3">
                  <img src={v.visitor?.photo_url || '/placeholder-avatar.png'} alt={v.visitor?.full_name || ''} className="h-10 w-10 rounded-full object-cover" />
                </td>
                <td className="px-3 py-3 text-[#9A9F87] font-mono text-xs">{v.registration_number || 'N/A'}</td>
                <td className="px-3 py-3 text-[#F5F5DC] font-medium">{v.visitor?.full_name || 'Unknown'}</td>
                <td className="px-3 py-3 text-[#9A9F87]">{v.visitor?.visitor_organization || '-'}</td>
                <td className="px-3 py-3 text-[#9A9F87]">{v.visitor_type}</td>
                <td className="px-3 py-3 text-[#9A9F87]">{v.employee?.full_name || '-'}</td>
                <td className="px-3 py-3 text-[#9A9F87]">{v.employee?.department || '-'}</td>
                <td className="px-3 py-3 text-[#9A9F87]">{v.employee?.office_location || '-'}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[v.status] || 'bg-gray-100 text-[#F5F5DC]'}`}>
                    {v.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-3 py-3 text-[#9A9F87]">{v.check_in_time ? new Date(v.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                <td className="px-3 py-3 text-[#9A9F87]">{v.expires_at ? new Date(v.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                <td className="px-3 py-3 text-[#9A9F87]">{v.badge?.badge_number || '-'}</td>
                <td className="px-3 py-3 text-[#9A9F87]">{v.badge?.badge_status || '-'}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => {}} className="p-1 rounded hover:bg-gray-200" title="View"><Eye className="h-4 w-4 text-[#9A9F87]" /></button>
                    <button onClick={() => {}} className="p-1 rounded hover:bg-gray-200" title="Locate"><MapPin className="h-4 w-4 text-[#9A9F87]" /></button>
                    <button onClick={() => onNotifyHost(v.id)} className="p-1 rounded hover:bg-gray-200" title="Notify Host"><Bell className="h-4 w-4 text-[#9A9F87]" /></button>
                    <button onClick={() => {}} className="p-1 rounded hover:bg-gray-200" title="Emergency Contact"><Phone className="h-4 w-4 text-[#9A9F87]" /></button>
                    {v.status !== 'checked_out' && (
                      <button onClick={() => onForceCheckout(v.id)} disabled={actionLoading} className="p-1 rounded hover:bg-gray-200" title="Force Check-out"><LogOut className="h-4 w-4 text-red-500" /></button>
                    )}
                    <button onClick={() => onReprintBadge(v.id)} className="p-1 rounded hover:bg-gray-200" title="Print Badge"><PrinterIcon className="h-4 w-4 text-[#9A9F87]" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {visitors.length === 0 && (
              <tr><td colSpan={14} className="px-3 py-8 text-center text-[#9A9F87]">No visitors found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-[rgba(85,107,47,0.35)] text-sm text-[#9A9F87]">
        Showing {visitors.length} of {total} visitors
      </div>
    </div>
  )
}

function ActivityFeedSection({ activities }: { activities: OperationsData['activity'] }) {
  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-[#9A9F87]',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-amber-100 text-amber-700',
    critical: 'bg-red-100 text-red-700',
  }

  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
        <h3 className="text-lg font-semibold text-[#F5F5DC] flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          Live Activity Feed
        </h3>
      </div>
      <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
        {activities.length === 0 && <p className="text-sm text-[#9A9F87] text-center py-4">No recent activity</p>}
        {activities.map((activity) => (
          <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
            <div className={`p-2 rounded-lg ${priorityColors[activity.priority]}`}>
              <Activity className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#F5F5DC] font-medium">{activity.message}</p>
              <p className="text-xs text-[#9A9F87]">{activity.timestamp ? new Date(activity.timestamp).toLocaleString() : '—'}</p>
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityColors[activity.priority]}`}>
              {activity.priority}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SecurityPanelSection({ security }: { security: OperationsData['security'] }) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
        <h3 className="text-lg font-semibold text-[#F5F5DC] flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-600" />
          Security Panel
        </h3>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <KPIBadge title="Watchlist Matches" value={security.watchlistMatches} icon={ShieldAlert} color="red" />
          <KPIBadge title="Denied Entry" value={security.deniedEntry} icon={XCircle} color="red" />
          <KPIBadge title="Active Holds" value={security.activeHolds} icon={Hourglass} color="amber" />
          <KPIBadge title="Critical Alerts" value={security.criticalAlerts} icon={AlertTriangle} color="red" />
        </div>
        {security.recentAlerts.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-[#9A9F87] mb-2">Recent Alerts</h4>
            <div className="space-y-2">
              {security.recentAlerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div>
                    <p className="text-sm text-[#F5F5DC] font-medium">{alert.title}</p>
                    <p className="text-xs text-[#9A9F87]">{alert.alert_type} - {alert.severity}</p>
                  </div>
                  <span className="text-xs text-[#9A9F87]">{alert.created_at ? new Date(alert.created_at).toLocaleTimeString() : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function KPIBadge({ title, value, icon: Icon, color }: { title: string; value: number | string; icon: any; color: string }) {
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

function WaitingQueuesSection({ queues }: { queues: OperationsData['queues'] }) {
  const queues_config = [
    { title: 'Reception Queue', items: queues.reception, icon: UserPlus, color: 'amber' },
    { title: 'Badge Queue', items: queues.badge, icon: Printer, color: 'purple' },
    { title: 'Security Queue', items: queues.security, icon: ShieldCheck, color: 'indigo' },
    { title: 'Document Queue', items: queues.document, icon: FileText, color: 'orange' },
    { title: 'Exit Queue', items: queues.exit, icon: LogOut, color: 'gray' },
  ]

  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
        <h3 className="text-lg font-semibold text-[#F5F5DC]">Waiting Queues</h3>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {queues_config.map((queue) => {
          const Icon = queue.icon
          return (
            <div key={queue.title} className="rounded-lg border border-[rgba(85,107,47,0.35)] bg-gray-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-[#9A9F87]">{queue.title}</h4>
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-200 text-xs font-bold text-[#9A9F87]">{queue.items.length}</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {queue.items.length === 0 && <p className="text-xs text-[#9A9F87]">No one waiting</p>}
                {queue.items.map((item) => (
                  <div key={item.id} className="p-2 bg-[#10150D] rounded border border-[rgba(85,107,47,0.25)]">
                    <p className="text-sm font-medium text-[#F5F5DC]">{item.visitor_name}</p>
                    <p className="text-xs text-[#9A9F87]">{item.host || 'No host'} - {item.department || 'No dept'}</p>
                    <p className="text-xs text-gray-400">{item.waiting_since ? new Date(item.waiting_since).toLocaleTimeString() : '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OverstayPanel({ overstays, onForceCheckout, onNotifyHost, actionLoading }: { overstays: OperationsData['overstays']; onForceCheckout: (id: string) => void; onNotifyHost: (id: string) => void; actionLoading: boolean }) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
        <h3 className="text-lg font-semibold text-[#F5F5DC] flex items-center gap-2">
          <Clock className="h-5 w-5 text-red-600" />
          Overstay Panel
        </h3>
      </div>
      <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
        {overstays.length === 0 && <p className="text-sm text-[#9A9F87] text-center py-4">No overstayed visitors</p>}
        {overstays.map((v) => (
          <div key={v.id} className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#F5F5DC]">{v.visitor_name}</p>
              <p className="text-xs text-[#9A9F87]">Host: {v.host || 'N/A'} | Office: {v.office || 'N/A'}</p>
              <p className="text-xs text-red-600 font-medium">{v.hours_overdue}h overdue</p>
              <p className="text-xs text-gray-400">Badge: {v.badge_number || 'N/A'}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => onNotifyHost(v.id)} className="p-1.5 rounded hover:bg-red-100" title="Notify Host"><Bell className="h-4 w-4 text-[#9A9F87]" /></button>
              <button onClick={() => onForceCheckout(v.id)} disabled={actionLoading} className="p-1.5 rounded hover:bg-red-100" title="Force Check-out"><LogOut className="h-4 w-4 text-red-600" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HostAvailabilitySection({ hosts }: { hosts: OperationsData['hosts'] }) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
        <h3 className="text-lg font-semibold text-[#F5F5DC]">Host Availability</h3>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <h4 className="text-sm font-medium text-green-700 mb-2">Available ({hosts.available.length})</h4>
          <div className="space-y-1">
            {hosts.available.slice(0, 10).map((h) => (
              <div key={h.id} className="flex items-center gap-2 p-2 bg-green-50 rounded">
                <User className="h-4 w-4 text-green-600" />
                <span className="text-sm text-[#F5F5DC]">{h.full_name}</span>
                <span className="text-xs text-[#9A9F87]">{h.department || ''}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-medium text-red-700 mb-2">Unavailable ({hosts.unavailable.length})</h4>
          <div className="space-y-1">
            {hosts.unavailable.slice(0, 10).map((h) => (
              <div key={h.id} className="flex items-center gap-2 p-2 bg-red-50 rounded">
                <User className="h-4 w-4 text-red-600" />
                <span className="text-sm text-[#F5F5DC]">{h.full_name}</span>
                <span className="text-xs text-[#9A9F87]">{h.reason}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function OfficeOccupancySection({ occupancy }: { occupancy: OperationsData['occupancy'] }) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
        <h3 className="text-lg font-semibold text-[#F5F5DC]">Office Occupancy</h3>
      </div>
      <div className="p-4">
        {occupancy.length === 0 ? (
          <p className="text-sm text-[#9A9F87] text-center py-4">No occupancy data</p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {occupancy.map((o, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                  <p className="text-sm font-medium text-[#F5F5DC]">{o.department}</p>
                  <p className="text-xs text-[#9A9F87]">{o.office_location}</p>
                </div>
                <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">{o.visitor_count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ActiveBadgesSection({ badges, onReprintBadge }: { badges: OperationsData['badges']; onReprintBadge: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
        <h3 className="text-lg font-semibold text-[#F5F5DC]">Active Badges</h3>
      </div>
      <div className="p-4 overflow-x-auto">
        {badges.length === 0 ? (
          <p className="text-sm text-[#9A9F87] text-center py-4">No active badges</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[rgba(85,107,47,0.35)]">
                <th className="px-3 py-2 font-semibold text-[#9A9F87]">Badge</th>
                <th className="px-3 py-2 font-semibold text-[#9A9F87]">Visitor</th>
                <th className="px-3 py-2 font-semibold text-[#9A9F87]">Issued</th>
                <th className="px-3 py-2 font-semibold text-[#9A9F87]">Expires</th>
                <th className="px-3 py-2 font-semibold text-[#9A9F87]">Status</th>
                <th className="px-3 py-2 font-semibold text-[#9A9F87]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
              {badges.slice(0, 20).map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-2 text-[#F5F5DC] font-medium">{b.badge_number}</td>
                  <td className="px-3 py-2 text-[#9A9F87]">{b.visitor_name}</td>
                  <td className="px-3 py-2 text-[#9A9F87]">{b.issued_at ? new Date(b.issued_at).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-[#9A9F87]">{b.expires_at ? new Date(b.expires_at).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-[#9A9F87]">{b.status}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => onReprintBadge(b.visit_id)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Reprint</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function ActivePropertySection({ property }: { property: OperationsData['property'] }) {
  const statusColors: Record<string, string> = {
    Registered: 'bg-blue-100 text-blue-800',
    Confiscated: 'bg-red-100 text-red-800',
    'Pending Release': 'bg-amber-100 text-amber-800',
    Released: 'bg-green-100 text-green-800',
  }

  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
      <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
        <h3 className="text-lg font-semibold text-[#F5F5DC]">Active Property Items</h3>
      </div>
      <div className="p-4 overflow-x-auto">
        {property.length === 0 ? (
          <p className="text-sm text-[#9A9F87] text-center py-4">No active property items</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[rgba(85,107,47,0.35)]">
                <th className="px-3 py-2 font-semibold text-[#9A9F87]">Visitor</th>
                <th className="px-3 py-2 font-semibold text-[#9A9F87]">Type</th>
                <th className="px-3 py-2 font-semibold text-[#9A9F87]">Description</th>
                <th className="px-3 py-2 font-semibold text-[#9A9F87]">Status</th>
                <th className="px-3 py-2 font-semibold text-[#9A9F87]">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
              {property.slice(0, 20).map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 text-[#F5F5DC] font-medium">{p.visitor_name}</td>
                  <td className="px-3 py-2 text-[#9A9F87]">{p.property_type}</td>
                  <td className="px-3 py-2 text-[#9A9F87]">{p.description || '-'}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status] || 'bg-gray-100 text-[#F5F5DC]'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#9A9F87]">{new Date(p.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}


