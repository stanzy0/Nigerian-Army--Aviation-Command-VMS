'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth-client'
import { Loader2, Users, UserCheck, Clock, AlertTriangle, ShieldAlert, Printer, Search, Plus, Phone, UserPlus, LogOut, Lock, Siren, FileText, BadgeCheck, CalendarDays, RefreshCw, X, Check, ChevronDown, Maximize2, Minimize2, Bell, Activity, Timer } from 'lucide-react'

type VisitStatus = 'pending' | 'approved' | 'rejected' | 'checked_in' | 'checked_out'
type AlertSeverity = 'Critical' | 'High' | 'Medium' | 'Low'

interface Visitor {
  id: string
  full_name: string
  visitor_organization: string
  phone?: string
  photo_url?: string
}

interface Employee {
  id: string
  full_name: string
  department?: string
}

interface Badge {
  id: string
  visit_id: string
  badge_number: string
  badge_status: string
  qr_token: string
  issued_at: string
  expires_at: string
  printed_at?: string
  reprint_count: number
  visit?: {
    id: string
    visitor: Visitor
    check_in_time?: string
  }
}

interface Visit {
  id: string
  visitor_id: string
  employee_id: string
  purpose: string
  status: VisitStatus
  check_in_time?: string
  check_out_time?: string
  created_at: string
  visitor: Visitor
  employee: Employee
  badge?: Badge | null
}

interface SecurityAlert {
  id: string
  alert_type: string
  severity: AlertSeverity
  message: string
  is_resolved: boolean
  created_at: string
}

interface Incident {
  id: string
  title: string
  status: string
  priority: string
  created_at: string
}

const today = () => new Date().toISOString().split('T')[0]
const todayStart = `${today()}T00:00:00`
const todayEnd = `${today()}T23:59:59.999`

export default function ReceptionPage() {
  const [visitsToday, setVisitsToday] = useState<Visit[]>([])
  const [currentlyInside, setCurrentlyInside] = useState<Visit[]>([])
  const [pendingVisits, setPendingVisits] = useState<Visit[]>([])
  const [alerts, setAlerts] = useState<SecurityAlert[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [expiringBadges, setExpiringBadges] = useState<Badge[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  const [authChecking, setAuthChecking] = useState(true)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [largeDisplayMode, setLargeDisplayMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [showEmergencyPanel, setShowEmergencyPanel] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())

  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const refreshInterval = useRef<NodeJS.Timeout | null>(null)
  const clockInterval = useRef<NodeJS.Timeout | null>(null)

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }, [])

  const fetchAllData = useCallback(async () => {
    try {
      const [
        visitsTodayRes,
        currentlyInsideRes,
        pendingVisitsRes,
        alertsRes,
        incidentsRes,
        expiringBadgesRes,
        employeesRes,
      ] = await Promise.all([
        supabase
          .from('visits')
          .select('*, visitor:visitors(*), employee:employees(*), badge:visitor_badges(*)')
          .gte('created_at', todayStart)
          .lt('created_at', todayEnd)
          .order('created_at', { ascending: false }),
        supabase
          .from('visits')
          .select('*, visitor:visitors(*), employee:employees(*), badge:visitor_badges(*)')
          .eq('status', 'checked_in'),
        supabase
          .from('visits')
          .select('*, visitor:visitors(*), employee:employees(*), badge:visitor_badges(*)')
          .eq('status', 'pending'),
        supabase
          .from('security_alerts')
          .select('*')
          .eq('is_resolved', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('incidents')
          .select('*')
          .in('status', ['Open', 'Assigned', 'Investigating'])
          .order('created_at', { ascending: false }),
        supabase
          .from('visitor_badges')
          .select('*, visit:visits(*, visitor:visitors(*))')
          .eq('badge_status', 'Active')
          .lt('expires_at', new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()),
        supabase.from('employees').select('id, full_name, department'),
      ])

      if (visitsTodayRes.data) setVisitsToday(visitsTodayRes.data as Visit[])
      if (currentlyInsideRes.data) setCurrentlyInside(currentlyInsideRes.data as Visit[])
      if (pendingVisitsRes.data) setPendingVisits(pendingVisitsRes.data as Visit[])
      if (alertsRes.data) setAlerts(alertsRes.data as SecurityAlert[])
      if (incidentsRes.data) setIncidents(incidentsRes.data as Incident[])
      if (expiringBadgesRes.data) setExpiringBadges(expiringBadgesRes.data as Badge[])
      if (employeesRes.data) setEmployees(employeesRes.data as Employee[])
    } catch (err) {
      console.error('Failed to fetch data:', err)
    }
  }, [])

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
      const allowed = ['Admin', 'Receptionist', 'Security', 'PA_TO_DIRECTOR', 'PA_TO_CI']
      if (!allowed.includes(user.role)) {
        window.location.href = '/unauthorized'
        return
      }
      setAuthChecking(false)
      fetchAllData()

      realtimeChannel.current = supabase
        .channel('reception-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => fetchAllData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'security_alerts' }, () => fetchAllData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_badges' }, () => fetchAllData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => fetchAllData())
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[Reception] Realtime subscription active')
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('[Reception] Realtime subscription failed, using polling fallback')
          }
        })

      refreshInterval.current = setInterval(() => {
        fetchAllData()
      }, 30000)
    }
    checkAuth()

    return () => {
      if (realtimeChannel.current) {
        supabase.removeChannel(realtimeChannel.current)
      }
    }
  }, [fetchAllData])

  useEffect(() => {
    clockInterval.current = setInterval(() => setCurrentTime(new Date()), 1000)
    if (largeDisplayMode) {
      refreshInterval.current = setInterval(() => fetchAllData(), 10000)
    }
    return () => {
      if (clockInterval.current) clearInterval(clockInterval.current)
      if (refreshInterval.current) clearInterval(refreshInterval.current)
    }
  }, [fetchAllData, largeDisplayMode])

  useEffect(() => {
    refreshInterval.current = setInterval(() => fetchAllData(), 30000)
    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current)
    }
  }, [fetchAllData])

  const handleQuickRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    const visitorName = formData.get('visitorName') as string
    const organization = formData.get('organization') as string
    const phone = formData.get('phone') as string
    const purpose = formData.get('purpose') as string
    const hostId = formData.get('host') as string

    if (!visitorName || !hostId) {
      showNotification('error', 'Visitor name and host are required')
      return
    }

    try {
      const { data: visitor, error: visitorError } = await supabase
        .from('visitors')
        .insert({
          full_name: visitorName,
          visitor_organization: organization,
          phone,
        })
        .select('id')
        .single()

      if (visitorError) throw visitorError

      const { error: visitError } = await supabase.from('visits').insert({
        visitor_id: visitor.id,
        employee_id: hostId,
        purpose: purpose || 'General Visit',
        status: 'pending',
      })

      if (visitError) throw visitError

      showNotification('success', 'Visitor registered successfully')
      form.reset()
      fetchAllData()
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Registration failed')
    }
  }

  const handleStatusChange = async (visitId: string, newStatus: VisitStatus) => {
    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'checked_in') updates.check_in_time = new Date().toISOString()
    if (newStatus === 'checked_out') updates.check_out_time = new Date().toISOString()

    // Use the authorized API route instead of a direct client-side DB update.
    const res = await fetch(`/api/visits/status?id=${encodeURIComponent(visitId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      showNotification('error', errData.message || 'Status change failed')
    } else {
      showNotification('success', `Visit ${newStatus.replace('_', ' ')} successfully`)
      fetchAllData()
    }
  }

  const handleCallNext = async () => {
    if (pendingVisits.length === 0) return
    const next = pendingVisits[0]
    await handleStatusChange(next.id, 'approved')
  }

  const handleNotifyHost = async (visitId: string) => {
    const visit = [...visitsToday, ...pendingVisits, ...currentlyInside].find(v => v.id === visitId)
    if (!visit) return
    showNotification('success', `Host notified for ${visit.visitor.full_name}`)
  }

  const handlePrintBadge = async (badgeId: string) => {
    try {
      const { printBadgeWindow } = await import('@/lib/badge/badge-print')
      await printBadgeWindow(badgeId)
      showNotification('success', 'Badge printed successfully')
    } catch {
      showNotification('error', 'Failed to print badge')
    }
  }

  const handleReprintBadge = async (badgeId: string) => {
    try {
      const { reprintBadge } = await import('@/lib/client/badges')
      await reprintBadge(badgeId)
      showNotification('success', 'Badge reprinted successfully')
      fetchAllData()
    } catch {
      showNotification('error', 'Failed to reprint badge')
    }
  }

  const handleEmergencyAction = (action: string) => {
    showNotification('success', `${action} initiated`)
    setShowEmergencyPanel(false)
  }

  const getDuration = (checkInTime?: string) => {
    if (!checkInTime) return '—'
    const diff = new Date().getTime() - new Date(checkInTime).getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${minutes}m`
  }

  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case 'Critical': return 'bg-red-50 text-red-700 border-red-200'
      case 'High': return 'bg-orange-50 text-orange-700 border-orange-200'
      case 'Medium': return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'Low': return 'bg-blue-50 text-blue-700 border-blue-200'
      default: return 'bg-gray-50 text-[#9A9F87] border-[rgba(85,107,47,0.35)]'
    }
  }

  const getStatusColor = (status: VisitStatus) => {
    switch (status) {
      case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'approved': return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'rejected': return 'bg-red-50 text-red-700 border-red-200'
      case 'checked_in': return 'bg-green-50 text-green-700 border-green-200'
      case 'checked_out': return 'bg-gray-50 text-[#9A9F87] border-[rgba(85,107,47,0.35)]'
      default: return 'bg-gray-50 text-[#9A9F87] border-[rgba(85,107,47,0.35)]'
    }
  }

  const searchResults = searchQuery.length >= 2
    ? [
        ...visitsToday.map(v => ({ type: 'visit' as const, id: v.id, label: v.visitor.full_name, sub: `Badge: ${v.badge?.badge_number || 'None'}` })),
        ...currentlyInside.map(v => ({ type: 'visit' as const, id: v.id, label: v.visitor.full_name, sub: `Currently Inside` })),
        ...pendingVisits.map(v => ({ type: 'visit' as const, id: v.id, label: v.visitor.full_name, sub: `Waiting` })),
        ...visitsToday.filter(v => v.badge).map(v => ({ type: 'badge' as const, id: v.badge!.id, label: v.badge!.badge_number, sub: v.visitor.full_name })),
      ].filter(r => r.label.toLowerCase().includes(searchQuery.toLowerCase()) || r.sub.toLowerCase().includes(searchQuery.toLowerCase()))
    : []

  if (authChecking) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const kpis = [
    { title: 'Currently Inside', value: currentlyInside.length.toString(), icon: UserCheck, color: 'green' },
    { title: 'Checked Out Today', value: visitsToday.filter(v => v.status === 'checked_out').length.toString(), icon: LogOut, color: 'blue' },
    { title: 'Waiting', value: pendingVisits.length.toString(), icon: Clock, color: 'amber' },
    { title: 'Overdue/Overstay', value: expiringBadges.length.toString(), icon: AlertTriangle, color: 'red' },
  ]

  return (
    <div className={`min-h-screen bg-[#0B0F08] ${largeDisplayMode ? 'text-xl' : ''}`}>
      <div className={`mx-auto ${largeDisplayMode ? 'max-w-7xl' : 'max-w-7xl'} p-4 lg:p-6 space-y-6`}>
        {notification && (
          <div className={`fixed top-4 right-4 z-50 rounded-lg p-4 shadow-lg text-sm ${notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
            {notification.message}
          </div>
        )}

        <div className={`rounded-xl border border-gray-900 bg-gray-900 text-white ${largeDisplayMode ? 'p-4' : 'p-6'}`}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4">
              <ShieldAlert className={`${largeDisplayMode ? 'h-8 w-8' : 'h-6 w-6'} text-blue-400`} />
              <div>
                <h1 className={`${largeDisplayMode ? 'text-3xl' : 'text-2xl'} font-bold`}>Reception & Security Operations Center</h1>
                <p className={`text-gray-400 ${largeDisplayMode ? 'text-base' : 'text-sm'}`}>Live visitor management and security monitoring</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className={`flex items-center gap-2 bg-gray-800 rounded-lg px-4 py-2 ${largeDisplayMode ? 'text-lg' : ''}`}>
                <Activity className="h-4 w-4 text-green-400" />
                <span className="font-mono">{currentTime.toLocaleTimeString()}</span>
              </div>
              <button
                onClick={() => setLargeDisplayMode(!largeDisplayMode)}
                className={`inline-flex items-center gap-2 rounded-lg ${largeDisplayMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-blue-600 hover:bg-blue-700'} px-4 py-2 text-sm font-medium text-white transition-colors`}
              >
                {largeDisplayMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                {largeDisplayMode ? 'Normal Mode' : 'Large Display'}
              </button>
              <button
                onClick={() => setShowEmergencyPanel(!showEmergencyPanel)}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                <Siren className="h-4 w-4" />
                Emergency Panel
                <ChevronDown className={`h-4 w-4 transition-transform ${showEmergencyPanel ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {!largeDisplayMode && (
            <div className="mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search visitors, badges, QR tokens... (Ctrl+K)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 pl-10 pr-4 py-2 text-white placeholder:text-[#9A9F87] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {searchFocused && searchResults.length > 0 && (
                <div className="mt-2 bg-[#10150D] rounded-lg shadow-lg border border-[rgba(85,107,47,0.35)] overflow-hidden">
                  {searchResults.map((result, i) => (
                    <div
                      key={`${result.type}-${result.id}-${i}`}
                      className="px-4 py-3 hover:bg-[#4B5320]/10 cursor-pointer border-b border-[rgba(85,107,47,0.25)] last:border-b-0"
                    >
                      <p className="text-sm font-medium text-[#F5F5DC]">{result.label}</p>
                      <p className="text-xs text-[#9A9F87]">{result.sub}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showEmergencyPanel && (
            <div className="mt-4 bg-red-900/20 border border-red-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-red-400 mb-3 flex items-center gap-2">
                <Siren className="h-5 w-5" />
                Emergency Controls
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <button onClick={() => handleEmergencyAction('Lock Reception')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-3 text-sm font-medium text-white transition-colors">
                  <Lock className="h-4 w-4" /> Lock Reception
                </button>
                <button onClick={() => handleEmergencyAction('Evacuation Mode')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-3 text-sm font-medium text-white transition-colors">
                  <Siren className="h-4 w-4" /> Evacuation Mode
                </button>
                <button onClick={() => handleEmergencyAction('Print Occupancy List')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-3 text-sm font-medium text-white transition-colors">
                  <Printer className="h-4 w-4" /> Print Occupancy List
                </button>
                <button onClick={() => handleEmergencyAction('Notify Security')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-3 text-sm font-medium text-white transition-colors">
                  <ShieldAlert className="h-4 w-4" /> Notify Security
                </button>
                <button onClick={() => handleEmergencyAction('Generate Emergency Report')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-3 text-sm font-medium text-white transition-colors col-span-2 lg:col-span-1">
                  <FileText className="h-4 w-4" /> Generate Report
                </button>
              </div>
            </div>
          )}
        </div>

        {!largeDisplayMode && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {kpis.map((kpi) => (
              <div key={kpi.title} className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[#9A9F87]">{kpi.title}</p>
                  <kpi.icon className={`h-4 w-4 ${
                    kpi.color === 'green' ? 'text-green-600' :
                    kpi.color === 'blue' ? 'text-blue-600' :
                    kpi.color === 'amber' ? 'text-amber-600' :
                    kpi.color === 'purple' ? 'text-purple-600' :
                    kpi.color === 'red' ? 'text-red-600' : 'text-[#9A9F87]'
                  }`} />
                </div>
                <p className="mt-2 text-3xl font-bold text-[#F5F5DC]">{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {largeDisplayMode && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {kpis.map((kpi) => (
              <div key={kpi.title} className="rounded-xl border-2 border-gray-300 bg-[#10150D] p-6 shadow-lg">
                <p className="text-lg font-medium text-[#9A9F87]">{kpi.title}</p>
                <p className="mt-2 text-5xl font-bold text-[#F5F5DC]">{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {largeDisplayMode && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
              <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
                <h3 className="text-xl font-semibold text-[#F5F5DC]">Today&apos;s Visitors</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base">
                  <thead>
                    <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Visitor</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Host</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                    {visitsToday.slice(0, 10).map((visit) => (
                      <tr key={visit.id} className="hover:bg-[#4B5320]/10">
                        <td className="px-4 py-3 font-medium text-[#F5F5DC]">{visit.visitor.full_name}</td>
                        <td className="px-4 py-3 text-[#9A9F87]">{visit.employee.full_name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${getStatusColor(visit.status)}`}>
                            {visit.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
              <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
                <h3 className="text-xl font-semibold text-[#F5F5DC]">Currently Inside</h3>
              </div>
              <div className="p-4 space-y-3">
                {currentlyInside.slice(0, 10).map((visit) => (
                  <div key={visit.id} className="flex items-center justify-between border-b border-[rgba(85,107,47,0.25)] pb-2 last:border-0">
                    <div>
                      <p className="font-medium text-[#F5F5DC]">{visit.visitor.full_name}</p>
                      <p className="text-sm text-[#9A9F87]">Host: {visit.employee.full_name}</p>
                    </div>
                    <span className="text-sm font-medium text-[#9A9F87]">{getDuration(visit.check_in_time)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm lg:col-span-2">
              <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
                <h3 className="text-xl font-semibold text-[#F5F5DC]">Security Alerts</h3>
              </div>
              <div className="p-4 space-y-2">
                {alerts.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between border-b border-[rgba(85,107,47,0.25)] pb-2 last:border-0">
                    <div>
                      <p className="font-medium text-[#F5F5DC]">{alert.message}</p>
                      <p className="text-sm text-[#9A9F87]">{alert.alert_type}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${getSeverityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!largeDisplayMode && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
                <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
                  <h3 className="text-lg font-semibold text-[#F5F5DC] flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-blue-600" />
                    Today&apos;s Visitors
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  {visitsToday.length === 0 ? (
                    <div className="py-12 text-center">
                      <Users className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                      <p className="text-[#9A9F87]">No visitors today</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                          <th className="px-4 py-3 font-semibold text-[#9A9F87]">Visitor</th>
                          <th className="px-4 py-3 font-semibold text-[#9A9F87]">Host</th>
                          <th className="px-4 py-3 font-semibold text-[#9A9F87]">Dept</th>
                          <th className="px-4 py-3 font-semibold text-[#9A9F87]">Arrival</th>
                          <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                          <th className="px-4 py-3 font-semibold text-[#9A9F87]">Badge</th>
                          <th className="px-4 py-3 font-semibold text-[#9A9F87] w-48">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                        {visitsToday.map((visit) => (
                          <tr key={visit.id} className="hover:bg-[#4B5320]/10 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-medium text-xs">
                                  {visit.visitor.full_name.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium text-[#F5F5DC]">{visit.visitor.full_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[#9A9F87]">{visit.employee.full_name}</td>
                            <td className="px-4 py-3 text-[#9A9F87]">{visit.employee.department || '—'}</td>
                            <td className="px-4 py-3 text-[#9A9F87] whitespace-nowrap">
                              {visit.created_at ? new Date(visit.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit ${getStatusColor(visit.status)}`}>
                                  {visit.status.replace('_', ' ')}
                                </span>
                                {visit.badge && (
                                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit ${
                                    visit.badge.badge_status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' :
                                    'bg-gray-50 text-[#9A9F87] border-[rgba(85,107,47,0.35)]'
                                  }`}>
                                    {visit.badge.badge_status}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[#9A9F87] font-mono text-xs">{visit.badge?.badge_number || '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {visit.status === 'pending' && (
                                  <>
                                    <button onClick={() => handleStatusChange(visit.id, 'approved')} className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 px-2.5 py-1 text-xs font-medium hover:bg-green-100 border border-green-200">
                                      <Check className="h-3 w-3" /> Approve
                                    </button>
                                    <button onClick={() => handleStatusChange(visit.id, 'rejected')} className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 px-2.5 py-1 text-xs font-medium hover:bg-red-100 border border-red-200">
                                      <X className="h-3 w-3" /> Reject
                                    </button>
                                  </>
                                )}
                                {visit.status === 'approved' && (
                                  <button onClick={() => handleStatusChange(visit.id, 'checked_in')} className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2.5 py-1 text-xs font-medium hover:bg-blue-100 border border-blue-200">
                                    <UserCheck className="h-3 w-3" /> Check In
                                  </button>
                                )}
                                {visit.status === 'checked_in' && (
                                  <button onClick={() => handleStatusChange(visit.id, 'checked_out')} className="inline-flex items-center gap-1 rounded-full bg-purple-50 text-purple-700 px-2.5 py-1 text-xs font-medium hover:bg-purple-100 border border-purple-200">
                                    <LogOut className="h-3 w-3" /> Check Out
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
                <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
                  <h3 className="text-lg font-semibold text-[#F5F5DC] flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-green-600" />
                    Currently Inside
                  </h3>
                </div>
                <div className="p-4">
                  {currentlyInside.length === 0 ? (
                    <div className="py-8 text-center">
                      <UserCheck className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                      <p className="text-[#9A9F87]">No visitors currently inside</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {currentlyInside.map((visit) => (
                        <div key={visit.id} className="flex items-center justify-between rounded-lg border border-[rgba(85,107,47,0.35)] p-4 hover:bg-[#4B5320]/10 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-medium text-lg">
                              {visit.visitor.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-[#F5F5DC]">{visit.visitor.full_name}</p>
                              <p className="text-sm text-[#9A9F87]">Host: {visit.employee.full_name} {visit.employee.department ? `(${visit.employee.department})` : ''}</p>
                              <p className="text-xs text-gray-400">Purpose: {visit.purpose || 'General'}</p>
                            </div>
                          </div>
                          <div className="text-right flex items-center gap-4">
                            <div>
                              <p className="text-xs text-[#9A9F87]">Duration</p>
                              <p className="text-sm font-medium text-[#F5F5DC] flex items-center gap-1">
                                <Timer className="h-3 w-3" /> {getDuration(visit.check_in_time)}
                              </p>
                            </div>
                            <button onClick={() => handleStatusChange(visit.id, 'checked_out')} className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 px-3 py-1.5 text-xs font-medium hover:bg-red-100 border border-red-200">
                              <LogOut className="h-3 w-3" /> Check Out
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
                <div className="p-4 border-b border-[rgba(85,107,47,0.35)] flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[#F5F5DC] flex items-center gap-2">
                    <Clock className="h-5 w-5 text-amber-600" />
                    Waiting Queue
                  </h3>
                  <button onClick={handleCallNext} disabled={pendingVisits.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed">
                    <Bell className="h-3.5 w-3.5" /> Call Next
                  </button>
                </div>
                <div className="p-4">
                  {pendingVisits.length === 0 ? (
                    <div className="py-8 text-center">
                      <Clock className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                      <p className="text-[#9A9F87]">No visitors waiting</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pendingVisits.map((visit, index) => (
                        <div key={visit.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-100 text-amber-700 font-bold text-sm">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-medium text-[#F5F5DC]">{visit.visitor.full_name}</p>
                              <p className="text-xs text-[#9A9F87]">Host: {visit.employee.full_name} • {visit.visitor.visitor_organization || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleNotifyHost(visit.id)} className="inline-flex items-center gap-1 rounded-full bg-[#10150D] text-blue-700 px-2.5 py-1 text-xs font-medium hover:bg-blue-50 border border-blue-200">
                              <Phone className="h-3 w-3" /> Notify Host
                            </button>
                            <button onClick={() => handleStatusChange(visit.id, 'approved')} className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 px-2.5 py-1 text-xs font-medium hover:bg-green-100 border border-green-200">
                              <Check className="h-3 w-3" /> Approve
                            </button>
                            {visit.badge && (
                              <button onClick={() => handlePrintBadge(visit.badge!.id)} className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2.5 py-1 text-xs font-medium hover:bg-blue-100 border border-blue-200">
                                <Printer className="h-3 w-3" /> Print
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
                <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
                  <h3 className="text-lg font-semibold text-[#F5F5DC] flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-blue-600" />
                    Quick Registration
                  </h3>
                </div>
                <form onSubmit={handleQuickRegister} className="p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Visitor Name *</label>
                    <input name="visitorName" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Full name" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Organization</label>
                    <input name="organization" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Company / Org" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Phone</label>
                    <input name="phone" type="tel" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Phone number" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Purpose</label>
                    <input name="purpose" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Visit purpose" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Host *</label>
                    <select name="host" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select host...</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.full_name} {emp.department ? `(${emp.department})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors">
                    <Plus className="h-4 w-4" /> Register Visitor
                  </button>
                </form>
              </div>

              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
                <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
                  <h3 className="text-lg font-semibold text-[#F5F5DC] flex items-center gap-2">
                    <BadgeCheck className="h-5 w-5 text-indigo-600" />
                    Quick Badge Print
                  </h3>
                </div>
                <div className="p-4">
                  <QuickBadgeSearch visits={[...visitsToday, ...currentlyInside, ...pendingVisits]} onPrint={handlePrintBadge} onReprint={handleReprintBadge} />
                </div>
              </div>

              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
                <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
                  <h3 className="text-lg font-semibold text-[#F5F5DC] flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-red-600" />
                    Security Alerts
                  </h3>
                </div>
                <div className="p-4">
                  {alerts.length === 0 ? (
                    <div className="py-8 text-center">
                      <ShieldAlert className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                      <p className="text-[#9A9F87]">No active alerts</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {alerts.map((alert) => (
                        <div key={alert.id} className="rounded-lg border border-[rgba(85,107,47,0.35)] p-3 hover:bg-[#4B5320]/10 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="font-medium text-[#F5F5DC] text-sm">{alert.message}</p>
                              <p className="text-xs text-[#9A9F87] mt-1">{alert.alert_type}</p>
                            </div>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${getSeverityColor(alert.severity)}`}>
                              {alert.severity}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {incidents.length > 0 && (
                <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
                  <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
                    <h3 className="text-lg font-semibold text-[#F5F5DC] flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-orange-600" />
                      Open Incidents
                    </h3>
                  </div>
                  <div className="p-4 space-y-2">
                    {incidents.map((incident) => (
                      <div key={incident.id} className="flex items-center justify-between rounded-lg border border-[rgba(85,107,47,0.35)] p-3">
                        <div>
                          <p className="font-medium text-[#F5F5DC] text-sm">{incident.title}</p>
                          <p className="text-xs text-[#9A9F87]">Priority: {incident.priority}</p>
                        </div>
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-orange-50 text-orange-700 border-orange-200">
                          {incident.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function QuickBadgeSearch({ visits, onPrint, onReprint }: { visits: Visit[]; onPrint: (id: string) => void; onReprint: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const badgesWithVisits = visits.filter(v => v.badge).map(v => v.badge!).filter(Boolean)

  const filtered = badgesWithVisits.filter(b => {
    const visit = visits.find(v => v.badge?.id === b.id)
    const name = visit?.visitor.full_name || ''
    return name.toLowerCase().includes(search.toLowerCase()) || b.badge_number.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or badge number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 pl-9 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="py-6 text-center">
          <BadgeCheck className="mx-auto h-10 w-10 text-gray-400 mb-2" />
          <p className="text-sm text-[#9A9F87]">No badges found</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {filtered.map((badge) => {
            const visit = visits.find(v => v.badge?.id === badge.id)
            return (
              <div key={badge.id} className="flex items-center justify-between rounded-lg border border-[rgba(85,107,47,0.35)] p-3 hover:bg-[#4B5320]/10">
                <div>
                  <p className="font-medium text-[#F5F5DC] text-sm">{visit?.visitor.full_name || 'Unknown'}</p>
                  <p className="text-xs text-[#9A9F87] font-mono">Badge: {badge.badge_number}</p>
                  <p className="text-xs text-gray-400">Expires: {badge.expires_at ? new Date(badge.expires_at).toLocaleString() : '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => onPrint(badge.id)} className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 px-2.5 py-1 text-xs font-medium hover:bg-green-100 border border-green-200">
                    <Printer className="h-3 w-3" /> Print
                  </button>
                  {badge.reprint_count > 0 && (
                    <button onClick={() => onReprint(badge.id)} className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2.5 py-1 text-xs font-medium hover:bg-amber-100 border border-amber-200">
                      <RefreshCw className="h-3 w-3" /> Reprint
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


