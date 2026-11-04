'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS, UserRole } from '@/lib/auth-client'
import { logAuditAction } from '@/lib/client/audit'
import { getAuthHeaders } from '@/lib/client/api'
import {
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Plus,
  Bell,
  Loader2,
  RefreshCw,
  AlertTriangle,
  UserCheck,
  Search,
  Timer,
  UserX,
  MessageSquare,
  X,
  Mail,
  LayoutDashboard,
  User,
  FileText,
  BarChart3,
  PackageSearch,
} from 'lucide-react'
import { generateVisitQRCode } from '@/lib/qrcode'
import InvitationForm from '@/components/InvitationForm'
import NotificationBell from '@/components/notifications/NotificationBell'

interface Employee {
  id: string
  full_name: string
  department: string
  office_location: string
}

interface Visitor {
  id: string
  full_name: string
  email: string
  phone: string
  visitor_organization: string | null
  photo_url: string | null
}

interface Visit {
  id: string
  visitor_id: string
  employee_id: string
  purpose: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  created_at: string
  visitor: Visitor | null
  employee: Employee | null
}

interface Stats {
  visitorsToday: number
  waiting: number
  atReception: number
  completedThisWeek: number
  pendingApprovals: number
  onSite: number
  avgDuration: string
}

interface WatchlistHit {
  full_name: string
  category: string
  reason?: string | null
}

export default function HostPortalPage() {
  const [userRole, setUserRole] = useState<UserRole>('Receptionist')
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [propertyItems, setPropertyItems] = useState<any[]>([])
  const [waitingVisitors, setWaitingVisitors] = useState<Visit[]>([])
  const [stats, setStats] = useState<Stats>({
    visitorsToday: 0,
    waiting: 0,
    atReception: 0,
    completedThisWeek: 0,
    pendingApprovals: 0,
    onSite: 0,
    avgDuration: '0 min',
  })
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [showPreRegister, setShowPreRegister] = useState(false)
  const [showInviteVisitor, setShowInviteVisitor] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [preRegisterData, setPreRegisterData] = useState({
    full_name: '',
    email: '',
    phone: '',
    visitor_organization: '',
    purpose: '',
    vehicle_type: '',
    registration_number: '',
    id_number: '',
  })
  const [watchlistHit, setWatchlistHit] = useState<WatchlistHit | null>(null)
  const [showWatchlistWarning, setShowWatchlistWarning] = useState(false)
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchData = async () => {
    if (!employeeId && userRole === 'Host Employee') return
    setLoading(true)

    const today = new Date().toISOString().split('T')[0]
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    try {
      let visitQuery = supabase
        .from('visits')
        .select('*, visitor:visitors(*), employee:employees(*)')
        .order('created_at', { ascending: false })

      if (userRole === 'Host Employee' && employeeId) {
        visitQuery = visitQuery.eq('employee_id', employeeId)
      }

      const [visitRes, completedRes, pendingRes, waitingRes, onSiteRes] = await Promise.all([
        visitQuery,
        visitQuery.gte('created_at', weekStart).eq('status', 'checked_out'),
        visitQuery.eq('status', 'pending'),
        visitQuery.eq('status', 'checked_in'),
        visitQuery.eq('status', 'checked_in'),
      ])

      setVisits(visitRes.data || [])

      const visitorIds = Array.from(new Set((visitRes.data || []).map((v: any) => v.visitor_id).filter(Boolean)))
      let propertyRes: { data: any[] | null } = { data: null }
      if (visitorIds.length > 0) {
        propertyRes = await supabase
          .from('property_items')
          .select('*')
          .in('visitor_id', visitorIds)
      }
      setPropertyItems(propertyRes.data || [])

      const waiting = (waitingRes.data || []).filter(v => !v.check_out_time)
      setWaitingVisitors(waiting)

      const todayVisits = (visitRes.data || []).filter(v => {
        const d = new Date(v.created_at).toISOString().split('T')[0]
        return d === today
      })

      let totalDuration = 0
      let durationCount = 0
      ;(visitRes.data || []).forEach(v => {
        if (v.check_in_time && v.check_out_time) {
          const mins = (new Date(v.check_out_time).getTime() - new Date(v.check_in_time).getTime()) / (1000 * 60)
          totalDuration += mins
          durationCount++
        }
      })
      const avgMin = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0

      setStats({
        visitorsToday: todayVisits.length,
        waiting: waiting.length,
        atReception: (onSiteRes.data || []).length,
        completedThisWeek: (completedRes.data || []).length,
        pendingApprovals: (pendingRes.data || []).length,
        onSite: (onSiteRes.data || []).length,
        avgDuration: `${avgMin} min`,
      })
    } catch (err) {
      console.error('Error fetching host data:', err)
    } finally {
      setLoading(false)
    }
  }

  const setupRealtime = () => {
    if (realtimeChannel.current) {
      supabase.removeChannel(realtimeChannel.current)
    }

    realtimeChannel.current = supabase
      .channel('host-portal-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_items' }, () => fetchData())
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
      if (!PERMISSIONS[user.role]?.includes('host')) {
        window.location.href = '/unauthorized'
        return
      }
      setUserRole(user.role)

      if (user.role === 'Host Employee') {
        const { data: empData } = await supabase
          .from('employees')
          .select('*')
          .eq('user_id', user.id)
          .single()
        if (empData) {
          setEmployee(empData)
          setEmployeeId(empData.id)
        }
      }

      setAuthChecking(false)
      fetchData()
      setupRealtime()
    }
    checkAuth()

    const pollInterval = setInterval(() => {
      fetchData()
    }, 10000)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchData()
      }
    }
    const onFocus = () => {
      fetchData()
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

  const handleAdmitVisitor = async (visit: Visit) => {
    setActionLoading(visit.id)
    try {
      const res = await fetch(`/api/visits/${visit.id}/status?id=${visit.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'checked_in' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        showNotification('error', json.message || 'Failed to admit visitor')
      } else {
        logAuditAction('Host Admitted Visitor', 'visit', visit.id, `${visit.visitor?.full_name} admitted by host`)
        showNotification('success', 'Visitor admitted')
        fetchData()
      }
    } catch {
      showNotification('error', 'Failed to admit visitor')
    }
    setActionLoading(null)
  }

  const handleRequestAssistance = async (visit: Visit) => {
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/host/assistance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          visitId: visit.id,
          hostName: employee?.full_name || 'Host',
          visitorName: visit.visitor?.full_name || 'Unknown',
        }),
      })
      const result = await res.json().catch(() => ({ success: false }))
      if (!res.ok || !result.success) {
        showNotification('error', result.error || 'Failed to send notification')
      } else {
        logAuditAction('Host Requested Assistance', 'visit', visit.id, `Assistance requested for ${visit.visitor?.full_name}`)
        showNotification('success', 'Reception has been notified')
      }
    } catch {
      showNotification('error', 'Failed to send notification')
    }
  }

  const handlePreRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    const user = await getCurrentUser()
    if (!user || !employeeId) return

    const hit = await checkWatchlist(preRegisterData)
    if (hit) {
      setShowWatchlistWarning(true)
      setSubmitting(false)
      return
    }

    const { data: visitorData, error: visitorError } = await supabase
      .from('visitors')
      .insert([
        {
          full_name: preRegisterData.full_name,
          email: preRegisterData.email,
          phone: preRegisterData.phone,
          visitor_organization: preRegisterData.visitor_organization,
          photo_url: null,
        },
      ])
      .select()

    if (visitorError) {
      showNotification('error', visitorError.message)
      setSubmitting(false)
      return
    }

    const { data: visitData, error: visitError } = await supabase
      .from('visits')
      .insert([
        {
          visitor_id: visitorData![0].id,
          employee_id: employeeId,
          purpose: preRegisterData.purpose,
          status: 'approved',
        },
      ])
      .select()

    if (visitError) {
      showNotification('error', visitError.message)
    } else {
      await generateVisitQRCode(visitData![0].id)
      logAuditAction('Host Pre-Registered Visitor', 'visit', visitData![0].id, `Host pre-registered ${preRegisterData.full_name}`)
      showNotification('success', 'Visitor pre-registered successfully')
      setShowPreRegister(false)
      setPreRegisterData({
        full_name: '',
        email: '',
        phone: '',
        visitor_organization: '',
        purpose: '',
        vehicle_type: '',
        registration_number: '',
        id_number: '',
      })
      fetchData()
    }
    setSubmitting(false)
  }

  const handleInviteVisitor = async (data: {
    visitor_name: string
    visitor_email: string
    visitor_phone: string
    visitor_organization: string
    purpose: string
    expected_date: string
    expected_time: string
    vehicle_required: boolean
    number_of_visitors: number
    notes: string
  }) => {
    setInviteLoading(true)
    try {
      const user = await getCurrentUser()
      if (!user || !employeeId) return

      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          ...data,
          host_employee_id: employeeId,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Failed to send invitation')
      }

      await logAuditAction('Invitation Sent', 'invitation', result.data.id, `Invitation sent to ${data.visitor_name} for ${data.expected_date}`)
      showNotification('success', `Invitation sent to ${data.visitor_email}`)
      setShowInviteVisitor(false)
      fetchData()
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to send invitation')
    } finally {
      setInviteLoading(false)
    }
  }

  const checkWatchlist = async (data: typeof preRegisterData): Promise<boolean> => {
    const { data: hit } = await supabase
      .from('visitor_watchlist')
      .select('*')
      .eq('status', 'Active')
      .or(`full_name.ilike.%${data.full_name}%,phone.ilike.%${data.phone}%,email.ilike.%${data.email}%`)
      .maybeSingle()

    if (hit) {
      setWatchlistHit(hit)
      return true
    }
    return false
  }

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }

  if (authChecking) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const canEdit = userRole === 'Admin' || userRole === 'Host Employee'

  return (
    <div className="min-h-screen bg-[#0B0F08]">
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="mb-6">
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
            ← Back to Dashboard
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <NavPill href="/host" label="Dashboard" icon={LayoutDashboard} />
          <NavPill href="/host/visitors" label="My Visitors" icon={Users} />
          <NavPill href="/host/invitations" label="Invitations" icon={Mail} />
          <NavPill href="/host/reports" label="Reports" icon={BarChart3} />
          <NavPill href="/host/profile" label="Profile" icon={User} />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F5DC]">Host Portal</h1>
            <p className="text-sm text-[#9A9F87]">
              {employee ? `Welcome, ${employee.full_name}` : 'Manage your visitors'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            {canEdit && (
              <>
                <button
                  onClick={() => setShowInviteVisitor(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  Invite Visitor
                </button>
                <button
                  onClick={() => setShowPreRegister(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Pre-Register Visitor
                </button>
              </>
            )}
          </div>
        </div>

        {notification && (
          <div className={`rounded-lg p-4 text-sm ${notification.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {notification.message}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard title="Visitors Today" value={stats.visitorsToday.toString()} icon={Users} color="blue" />
          <SummaryCard title="Waiting" value={stats.waiting.toString()} icon={Timer} color="amber" />
          <SummaryCard title="At Reception" value={stats.atReception.toString()} icon={UserCheck} color="purple" />
          <SummaryCard title="Completed This Week" value={stats.completedThisWeek.toString()} icon={CheckCircle} color="green" />
          <SummaryCard title="Pending Approvals" value={stats.pendingApprovals.toString()} icon={Clock} color="red" />
          <SummaryCard title="On Site" value={stats.onSite.toString()} icon={Users} color="blue" />
        </div>

        {/* Waiting Visitors */}
        {waitingVisitors.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
            <div className="p-4 border-b border-amber-200">
              <h3 className="text-lg font-semibold text-[#F5F5DC] flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-600" />
                Waiting Visitors
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-amber-200 bg-amber-100">
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Visitor</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Purpose</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Arrived</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-200">
                  {waitingVisitors.map((visit) => (
                    <tr key={visit.id} className="hover:bg-amber-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {visit.visitor?.photo_url ? (
                            <img src={visit.visitor.photo_url} alt={visit.visitor.full_name} className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                              <span className="text-xs text-[#9A9F87]">{(visit.visitor?.full_name || '').charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <span className="font-medium text-[#F5F5DC]">{visit.visitor?.full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#9A9F87]">{visit.purpose || '—'}</td>
                      <td className="px-4 py-3 text-[#9A9F87]">
                        {visit.check_in_time ? new Date(visit.check_in_time).toLocaleTimeString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {canEdit && (
                            <button
                              onClick={() => handleAdmitVisitor(visit)}
                              disabled={actionLoading === visit.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {actionLoading === visit.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                              Admit
                            </button>
                          )}
                          <button
                            onClick={() => handleRequestAssistance(visit)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-[#9A9F87] hover:bg-[#4B5320]/10"
                          >
                            <MessageSquare className="h-3 w-3" />
                            Assist
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Visitor Property */}
        {propertyItems.length > 0 && (
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
            <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
              <h3 className="text-lg font-semibold text-[#F5F5DC]">Visitor Property</h3>
              <p className="text-sm text-[#9A9F87]">Items brought by your visitors</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Property #</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Item</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Category</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Serial Number</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                  {propertyItems.map((item) => (
                    <tr key={item.id} className="hover:bg-[#4B5320]/10 transition-colors">
                      <td className="px-4 py-3 font-mono text-[#9A9F87]">{item.property_number}</td>
                      <td className="px-4 py-3 font-medium text-[#F5F5DC]">{item.name}</td>
                      <td className="px-4 py-3 text-[#9A9F87]">{item.category}</td>
                      <td className="px-4 py-3 text-[#9A9F87]">{item.serial_number || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.status === 'Inside' ? 'bg-green-50 text-green-700' :
                          item.status === 'Confiscated' ? 'bg-red-50 text-red-700' :
                          item.status === 'Released' ? 'bg-blue-50 text-blue-700' :
                          item.status === 'Lost' ? 'bg-orange-50 text-orange-700' :
                          item.status === 'Damaged' ? 'bg-yellow-50 text-yellow-700' :
                          'bg-gray-50 text-[#9A9F87]'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Visitor History */}
        <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
          <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
            <h3 className="text-lg font-semibold text-[#F5F5DC]">Visitor History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Visitor</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Purpose</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Date</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                {visits.slice(0, 20).map((visit) => (
                  <tr key={visit.id} className="hover:bg-[#4B5320]/10 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {visit.visitor?.photo_url ? (
                          <img src={visit.visitor.photo_url} alt={visit.visitor.full_name} className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="text-xs text-[#9A9F87]">{(visit.visitor?.full_name || '').charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <span className="font-medium text-[#F5F5DC]">{visit.visitor?.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#9A9F87]">{visit.purpose || '—'}</td>
                    <td className="px-4 py-3 text-[#9A9F87] whitespace-nowrap">
                      {visit.created_at ? new Date(visit.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        visit.status === 'checked_in' ? 'bg-green-50 text-green-700' :
                        visit.status === 'checked_out' ? 'bg-gray-50 text-[#9A9F87]' :
                        'bg-blue-50 text-blue-700'
                      }`}>
                        {visit.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#9A9F87]">
                      {visit.check_in_time && visit.check_out_time
                        ? `${Math.round((new Date(visit.check_out_time).getTime() - new Date(visit.check_in_time).getTime()) / (1000 * 60))} min`
                        : visit.check_in_time ? 'In progress' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visits.length === 0 && (
            <div className="p-12 text-center">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-[#9A9F87]">No visit history</p>
            </div>
          )}
        </div>
      </div>

      {/* Pre-Register Modal */}
      {showPreRegister && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-[#10150D] shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex-shrink-0 flex items-center justify-between border-b border-[rgba(85,107,47,0.35)] p-4">
              <h2 className="text-lg font-semibold text-[#F5F5DC]">Pre-Register Visitor</h2>
              <button onClick={() => setShowPreRegister(false)} className="p-1 rounded-md hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handlePreRegister} className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Full Name *</label>
                    <input type="text" value={preRegisterData.full_name} onChange={(e) => setPreRegisterData({ ...preRegisterData, full_name: e.target.value })} required className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Email *</label>
                    <input type="email" value={preRegisterData.email} onChange={(e) => setPreRegisterData({ ...preRegisterData, email: e.target.value })} required className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Phone</label>
                    <input type="tel" value={preRegisterData.phone} onChange={(e) => setPreRegisterData({ ...preRegisterData, phone: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Organization</label>
                    <input type="text" value={preRegisterData.visitor_organization} onChange={(e) => setPreRegisterData({ ...preRegisterData, visitor_organization: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Purpose *</label>
                  <textarea value={preRegisterData.purpose} onChange={(e) => setPreRegisterData({ ...preRegisterData, purpose: e.target.value })} required rows={2} className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black" />
                </div>
                <div className="border-t border-[rgba(85,107,47,0.35)] pt-4">
                  <p className="text-sm font-medium text-[#9A9F87] mb-2">Vehicle Information (Optional)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#9A9F87] mb-1">Vehicle Type</label>
                      <select value={preRegisterData.vehicle_type} onChange={(e) => setPreRegisterData({ ...preRegisterData, vehicle_type: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black">
                        <option value="">Select type</option>
                        {['Car', 'SUV', 'Truck', 'Bus', 'Motorcycle', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#9A9F87] mb-1">Registration Number</label>
                      <input type="text" value={preRegisterData.registration_number} onChange={(e) => setPreRegisterData({ ...preRegisterData, registration_number: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">ID Number</label>
                  <input type="text" value={preRegisterData.id_number} onChange={(e) => setPreRegisterData({ ...preRegisterData, id_number: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black" />
                </div>
              </div>
              <div className="border-t border-[rgba(85,107,47,0.35)] p-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowPreRegister(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10">Cancel</button>
                <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Pre-Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Visitor Modal */}
      {showInviteVisitor && (
        <InvitationForm
          onSubmit={handleInviteVisitor}
          onClose={() => setShowInviteVisitor(false)}
          loading={inviteLoading}
        />
      )}

      {/* Watchlist Warning Modal */}
      {showWatchlistWarning && watchlistHit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-[#10150D] shadow-2xl border-2 border-red-500">
            <div className="p-6 text-center border-b border-red-100 bg-red-50">
              <AlertTriangle className="h-16 w-16 text-red-600 mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-red-900">SECURITY ALERT</h2>
              <p className="text-sm text-red-700 mt-2">This visitor appears on the Watchlist.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <span className="text-xs font-medium text-[#9A9F87] uppercase">Name</span>
                <p className="text-sm font-semibold text-[#F5F5DC]">{watchlistHit.full_name}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-[#9A9F87] uppercase">Category</span>
                <p className="text-sm text-[#F5F5DC]">{watchlistHit.category}</p>
              </div>
              {watchlistHit.reason && (
                <div>
                  <span className="text-xs font-medium text-[#9A9F87] uppercase">Reason</span>
                  <p className="text-sm text-[#F5F5DC]">{watchlistHit.reason}</p>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button onClick={() => { setShowWatchlistWarning(false); setWatchlistHit(null) }} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10">Cancel Registration</button>
                {(userRole === 'Admin' || userRole === 'Security') && (
                  <button onClick={() => { setShowWatchlistWarning(false); setWatchlistHit(null); document.querySelector('form')?.requestSubmit() }} className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Override & Continue</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NavPill({ href, label, icon: Icon }: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10"
    >
      <Icon className="h-4 w-4" />
      {label}
    </a>
  )
}

function SummaryCard({ title, value, icon: Icon, color }: { title: string; value: string; icon: React.ComponentType<{ className?: string }>; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    red: 'bg-red-50 text-red-600',
  }
  return (
    <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#9A9F87]">{title}</p>
        <div className={`p-2 rounded-lg ${colorClasses[color] || 'bg-gray-50 text-[#9A9F87]'}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-3xl font-bold text-[#F5F5DC]">{value}</p>
    </div>
  )
}


