'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, UserRole } from '@/lib/auth-client'
import { useNotifications } from '@/contexts/NotificationContext'
import {
  Loader2,
  Users,
  UserCheck,
  Clock,
  Shield,
  Search,
  Check,
  X,
  XCircle,
  Eye,
  CalendarDays,
  LogOut,
  LayoutDashboard,
  History,
  User,
  CheckCircle,
  CheckCircle2,
  CheckCheck,
  Bell,
} from 'lucide-react'
import PremiumSidebar, { type NavSection } from '@/components/dashboard/premium/PremiumSidebar'
import PremiumHeader from '@/components/dashboard/premium/PremiumHeader'
import PremiumStatCard, { type CardColor } from '@/components/dashboard/premium/PremiumStatCard'
import QuickActionCard, { type ActionColor } from '@/components/dashboard/premium/QuickActionCard'
import VisitorReviewModal from '@/components/pa/VisitorReviewModal'

export type VisitStatus = 'pending' | 'approved' | 'rejected' | 'checked_in' | 'checked_out'

interface Visitor {
  id: string
  full_name: string
  visitor_organization?: string | null
  photo_url?: string | null
  phone?: string | null
  email?: string | null
}

interface Employee {
  id: string
  full_name: string
  department?: string | null
  position?: string | null
  office_location?: string | null
}

interface Visit {
  id: string
  visitor_id: string
  employee_id: string
  purpose: string
  status: VisitStatus
  created_at: string
  check_in_time?: string | null
  check_out_time?: string | null
  rejection_reason?: string | null
  scheduled_date?: string | null
  arrival_time?: string | null
  office_location?: string | null
  registration_number?: string
  visitor: Visitor | null
  employee: Employee | null
}

interface PADashboardProps {
  paRole: 'PA_TO_CI' | 'PA_TO_DIRECTOR'
  title: string
  hostTitle: string
}

const statusBadgeMap: Record<VisitStatus, { text: string; border: string; bg: string; textColor: string; icon: typeof Clock }> = {
  pending: { text: 'Pending', border: 'border-amber-200', bg: 'bg-amber-50', textColor: 'text-amber-700', icon: Clock },
  approved: { text: 'Approved', border: 'border-blue-200', bg: 'bg-blue-50', textColor: 'text-blue-700', icon: CheckCircle },
  checked_in: { text: 'Checked In', border: 'border-green-200', bg: 'bg-green-50', textColor: 'text-green-700', icon: UserCheck },
  checked_out: { text: 'Checked Out', border: 'border-gray-200', bg: 'bg-gray-50', textColor: 'text-gray-700', icon: LogOut },
  rejected: { text: 'Rejected', border: 'border-red-200', bg: 'bg-red-50', textColor: 'text-red-700', icon: XCircle },
}

function StatusBadge({ status }: { status: VisitStatus }) {
  const c = statusBadgeMap[status] || statusBadgeMap.pending
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${c.border} ${c.bg} ${c.textColor}`}>
      <Icon className="h-3 w-3" />
      {c.text}
    </span>
  )
}

const btnBase = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60 disabled:cursor-wait whitespace-nowrap'
const btnGray = `${btnBase} bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100`
const btnGreen = `${btnBase} bg-green-50 text-green-700 border-green-200 hover:bg-green-100`
const btnRed = `${btnBase} bg-red-50 text-red-700 border-red-200 hover:bg-red-100`
const btnBlue = `${btnBase} bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100`
const btnPurple = `${btnBase} bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100`

function VisitorAvatar({ visit }: { visit: Visit }) {
  const initials = (visit.visitor?.full_name || '')
    .split(' ')
    .map((n) => (n || '?').charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
  if (visit.visitor?.photo_url) {
    return <img src={visit.visitor.photo_url} alt={visit.visitor.full_name} className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
  }
  return (
    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/10 to-primary/20 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-primary">{initials || '?'}</span>
    </div>
  )
}

function SectionCard({ id, title, icon: Icon, count, headerExtra, children }: { id: string; title: string; icon: typeof Users; count?: number; headerExtra?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="rounded-[20px] border border-gray-200/60 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon className="h-5 w-5 text-primary flex-shrink-0" />
            <h2 className="text-lg font-semibold text-gray-900 truncate">{title}</h2>
            {count !== undefined && <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full flex-shrink-0">{count}</span>}
          </div>
          {headerExtra}
        </div>
        {children}
      </div>
    </section>
  )
}

interface VisitorsTableProps {
  visits: Visit[]
  variant: 'full' | 'pending' | 'completed'
  onReview: (v: Visit) => void
  onApprove: (v: Visit) => void
  onReject: (v: Visit) => void
  onCheckIn: (v: Visit) => void
  onCheckOut: (v: Visit) => void
  actionLoading: string | null
  emptyLabel: string
  emptyIcon?: ReactNode
}

function VisitorsTable({ visits, variant, onReview, onApprove, onReject, onCheckIn, onCheckOut, actionLoading, emptyLabel, emptyIcon }: VisitorsTableProps) {
  const headers =
    variant === 'pending'
      ? ['Visitor', 'Organization', 'Host', 'Department', 'Office Location', 'Purpose', 'Registration Time', 'Status', 'Actions']
      : variant === 'completed'
        ? ['Visitor', 'Host', 'Department', 'Office Location', 'Check-Out Time', 'Purpose', 'Status', 'Actions']
        : ['Visitor', 'Host', 'Department', 'Office Location', 'Arrival', 'Purpose', 'Status', 'Actions']

  if (visits.length === 0) {
    return (
      <div className="p-10 text-center">
        {emptyIcon}
        <p className="text-sm text-gray-500">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            {headers.map((h) => (
              <th key={h} className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {visits.map((visit) => {
            const busy = actionLoading === visit.id
            const office = visit.office_location || visit.employee?.office_location || '—'
            return (
              <tr key={visit.id} className="hover:bg-gray-50/80 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <VisitorAvatar visit={visit} />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{visit.visitor?.full_name || 'Unknown Visitor'}</p>
                      {variant !== 'pending' && visit.visitor?.phone && <p className="text-xs text-gray-500 truncate">{visit.visitor.phone}</p>}
                    </div>
                  </div>
                </td>
                {variant === 'pending' ? (
                  <td className="px-5 py-3 text-gray-600">{visit.visitor?.visitor_organization || 'N/A'}</td>
                ) : (
                  <td className="px-5 py-3 text-gray-600">{visit.employee?.full_name || '—'}</td>
                )}
                <td className="px-5 py-3 text-gray-600">{visit.employee?.department || '—'}</td>
                <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{office}</td>
                <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                  {variant === 'completed'
                    ? visit.check_out_time
                      ? new Date(visit.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—'
                    : visit.created_at
                      ? new Date(visit.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                </td>
                <td className="px-5 py-3 text-gray-600 max-w-[200px] truncate">{visit.purpose || '—'}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={visit.status} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-1.5 justify-end">
                    {variant === 'pending' ? (
                      <>
                        <button onClick={() => onReview(visit)} disabled={busy} className={btnGray} aria-label="Review">
                          <Eye className="h-3 w-3" /> Review
                        </button>
                        <button onClick={() => onApprove(visit)} disabled={busy} className={btnGreen} aria-label="Accept">
                          <Check className="h-3 w-3" /> Accept
                        </button>
                        <button onClick={() => onReject(visit)} disabled={busy} className={btnRed} aria-label="Reject">
                          <X className="h-3 w-3" /> Reject
                        </button>
                      </>
                    ) : variant === 'completed' ? (
                      <button onClick={() => onReview(visit)} disabled={busy} className={btnGray} aria-label="View details">
                        <Eye className="h-3 w-3" /> View Details
                      </button>
                    ) : (
                      <>
                        {visit.status === 'pending' && (
                          <>
                            <button onClick={() => onReview(visit)} disabled={busy} className={btnGray}>
                              <Eye className="h-3 w-3" /> Review
                            </button>
                            <button onClick={() => onApprove(visit)} disabled={busy} className={btnGreen}>
                              <Check className="h-3 w-3" /> Accept
                            </button>
                            <button onClick={() => onReject(visit)} disabled={busy} className={btnRed}>
                              <X className="h-3 w-3" /> Reject
                            </button>
                          </>
                        )}
                        {visit.status === 'approved' && (
                          <button onClick={() => onCheckIn(visit)} disabled={busy} className={btnBlue}>
                            <UserCheck className="h-3 w-3" /> Check In
                          </button>
                        )}
                        {visit.status === 'checked_in' && (
                          <button onClick={() => onCheckOut(visit)} disabled={busy} className={btnPurple}>
                            <LogOut className="h-3 w-3" /> Check Out
                          </button>
                        )}
                        {(visit.status === 'checked_out' || visit.status === 'rejected' || visit.status === 'approved' || visit.status === 'checked_in') && (
                          <button onClick={() => onReview(visit)} disabled={busy} className={btnGray}>
                            <Eye className="h-3 w-3" /> View Details
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const getDuration = (checkInTime?: string | null) => {
  if (!checkInTime) return '—'
  const diff = Date.now() - new Date(checkInTime).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${minutes}m`
}

export default function PADashboard({ paRole, title, hostTitle }: PADashboardProps) {
  const [visitsToday, setVisitsToday] = useState<Visit[]>([])
  const [pendingVisits, setPendingVisits] = useState<Visit[]>([])
  const [approvedVisits, setApprovedVisits] = useState<Visit[]>([])
  const [checkedInVisits, setCheckedInVisits] = useState<Visit[]>([])
  const [checkedOutVisits, setCheckedOutVisits] = useState<Visit[]>([])
  const [hostEmployee, setHostEmployee] = useState<Employee | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [userRole, setUserRole] = useState<UserRole>('Receptionist')
  const [userEmail, setUserEmail] = useState('')
  const [userName, setUserName] = useState('')
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [tableQuery, setTableQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [reviewVisitId, setReviewVisitId] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'custom'>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const rangeLabel = (r: typeof dateRange) => {
    switch (r) {
      case 'today': return "Today's Visitors"
      case 'yesterday': return 'Yesterday\'s Visitors'
      case '7days': return 'Visitors (Last 7 Days)'
      case '30days': return 'Visitors (Last 30 Days)'
      case 'thisMonth': return 'Visitors (This Month)'
      case 'custom': return 'Visitors (Custom Range)'
      default: return "Today's Visitors"
    }
  }
  const { notifications: recentNotifications } = useNotifications()

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }, [])

  const fetchAllData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ range: dateRange })
      if (dateRange === 'custom' && customFrom && customTo) {
        params.set('from', customFrom)
        params.set('to', customTo)
      }
      const res = await fetch(`/api/pa/dashboard?${params.toString()}`)
      if (!res.ok) {
        const text = await res.text()
        console.error(`PA dashboard API ${res.status}: ${text}`)
        return
      }
      const json = await res.json()
      if (!json.success) {
        console.error('Failed to fetch PA dashboard data:', json)
        return
      }
      const { visitsToday, pendingVisits, approvedVisits, checkedInVisits, checkedOutVisits, hostEmployee } = json.data
      setVisitsToday(visitsToday || [])
      setPendingVisits(pendingVisits || [])
      setApprovedVisits(approvedVisits || [])
      setCheckedInVisits(checkedInVisits || [])
      setCheckedOutVisits(checkedOutVisits || [])
      setHostEmployee(hostEmployee || null)
    } catch (err) {
      console.error('Failed to fetch data:', err)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null

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
      const allowed: UserRole[] = [paRole, 'Admin']
      if (!allowed.includes(user.role)) {
        window.location.href = '/unauthorized'
        return
      }
      setUserRole(user.role)
      setUserEmail(user.email || '')
      setUserName(user.full_name || '')
      setAuthChecking(false)
      fetchAllData()

      realtimeChannel = supabase
        .channel(`pa-${paRole}-changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => fetchAllData())
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[PA Dashboard ${paRole}] Realtime subscription active`)
          } else if (status === 'CHANNEL_ERROR') {
            console.warn(`[PA Dashboard ${paRole}] Realtime subscription failed, using polling fallback`)
          }
        })

      pollInterval = setInterval(() => {
        fetchAllData()
      }, 10000)
    }

    checkAuth()

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval)
      }
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel)
      }
    }
  }, [paRole, fetchAllData, dateRange])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchAllData()
      }
    }
    const onFocus = () => {
      fetchAllData()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchAllData])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const handleModalClose = () => {
    setReviewVisitId(null)
    fetchAllData()
  }

  const runAction = async (visitId: string, fn: () => Promise<{ ok: boolean; message: string }>, label: string) => {
    setActionLoading(visitId)
    try {
      const res = await fn()
      if (res.ok) {
        showNotification('success', res.message)
        fetchAllData()
      } else {
        showNotification('error', res.message)
      }
    } catch {
      showNotification('error', `Failed to ${label} visitor`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleApprove = (visit: Visit) =>
    runAction(visit.id, async () => {
      const res = await fetch(`/api/pa/visits/${visit.id}/approve`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      return { ok: res.ok && json.success, message: res.ok && json.success ? 'Visitor approved' : (json.message || 'Failed to approve visitor') }
    }, 'approve')

  const handleReject = (visit: Visit) =>
    runAction(visit.id, async () => {
      const res = await fetch(`/api/pa/visits/${visit.id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const json = await res.json().catch(() => ({}))
      return { ok: res.ok && json.success, message: res.ok && json.success ? 'Visitor rejected' : (json.message || 'Failed to reject visitor') }
    }, 'reject')

  const handleCheckIn = (visit: Visit) =>
    runAction(visit.id, async () => {
      const res = await fetch(`/api/visits/${visit.id}/status?id=${visit.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'checked_in' }) })
      const json = await res.json().catch(() => ({}))
      return { ok: res.ok && json.success, message: res.ok && json.success ? 'Visitor checked in' : (json.message || 'Failed to check in visitor') }
    }, 'check in')

  const handleCheckOut = (visit: Visit) =>
    runAction(visit.id, async () => {
      const res = await fetch(`/api/visits/${visit.id}/status?id=${visit.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'checked_out' }) })
      const json = await res.json().catch(() => ({}))
      return { ok: res.ok && json.success, message: res.ok && json.success ? 'Visitor checked out' : (json.message || 'Failed to check out visitor') }
    }, 'check out')

  const scrollToId = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const navSections: NavSection[] = [
    {
      title: 'MAIN',
      items: [
        { label: 'Dashboard', icon: LayoutDashboard, href: paRole === 'PA_TO_CI' ? '/pa-ci' : '/pa-director', permission: 'dashboard' },
        { label: "Today's Visitors", icon: Users, href: '#today-visitors', permission: 'dashboard' },
        { label: 'Pending Approvals', icon: Clock, href: '#pending-approvals', permission: 'dashboard' },
        { label: 'Check-In / Check-Out', icon: LogOut, href: '#currently-checked-in', permission: 'dashboard' },
        { label: 'Visitor History', icon: History, href: '#completed-visits', permission: 'dashboard' },
        { label: 'Search Visitors', icon: Search, href: '#search-visitors', permission: 'dashboard' },
      ],
    },
    {
      title: 'ACCOUNT',
      items: [
        { label: 'Profile', icon: User, href: '#account', permission: 'dashboard' },
      ],
    },
  ]

  const quickActions = [
    { label: 'Pending Approvals', description: 'Review awaiting visitors', icon: Clock, color: 'amber' as ActionColor, onClick: () => scrollToId('pending-approvals') },
    { label: 'Check In', description: 'Process visitor arrival', icon: UserCheck, color: 'green' as ActionColor, onClick: () => scrollToId('today-visitors') },
    { label: 'Check Out', description: 'Process visitor departure', icon: LogOut, color: 'purple' as ActionColor, onClick: () => scrollToId('currently-checked-in') },
    { label: 'Search Visitor', description: 'Find visitor records', icon: Search, color: 'blue' as ActionColor, onClick: () => scrollToId('search-visitors') },
    { label: 'Visitor History', description: 'View past visits', icon: History, color: 'indigo' as ActionColor, onClick: () => scrollToId('completed-visits') },
  ]

  const kpis = [
    { title: "Today's Visitors", value: visitsToday.length, icon: Users, color: 'blue' as CardColor },
    { title: 'Pending Approvals', value: pendingVisits.length, icon: Clock, color: 'amber' as CardColor },
    { title: 'Awaiting Check-In', value: approvedVisits.length, icon: UserCheck, color: 'blue' as CardColor },
    { title: 'Currently Checked-In', value: checkedInVisits.length, icon: CheckCircle2, color: 'green' as CardColor },
    { title: 'Completed Visits', value: checkedOutVisits.length, icon: CheckCheck, color: 'emerald' as CardColor },
  ]

  const filteredVisitsToday = tableQuery.length >= 2
    ? visitsToday.filter((v) =>
        `${v.visitor?.full_name || ''} ${v.purpose || ''} ${v.visitor?.visitor_organization || ''} ${v.visitor?.email || ''} ${v.visitor?.phone || ''} ${v.office_location || ''} ${v.employee?.department || ''}`
          .toLowerCase()
          .includes(tableQuery.toLowerCase())
      )
    : visitsToday

  const filteredSearchVisits = searchQuery.length >= 2
    ? visitsToday.filter((v) =>
        `${v.visitor?.full_name || ''} ${v.purpose || ''} ${v.visitor?.visitor_organization || ''} ${v.visitor?.email || ''} ${v.visitor?.phone || ''} ${v.office_location || ''} ${v.employee?.department || ''}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : []

  if (authChecking || loading) {
    return (
      <div className="flex h-screen bg-dashboard-bg items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-dashboard-bg">
      <PremiumSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userRole={userRole}
        userEmail={userEmail}
        onLogout={handleSignOut}
        currentPath={paRole === 'PA_TO_CI' ? '/pa-ci' : '/pa-director'}
        navSections={navSections}
        brandSubtitle="Visitor Operations"
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <PremiumHeader
          userName={userName}
          userRole={userRole}
          filters={{ range: dateRange, customFrom, customTo }}
           onFilterChange={(filters) => {
             if (filters.range && filters.range !== dateRange) {
               setDateRange(filters.range as typeof dateRange)
             }
             if (filters.customFrom !== undefined) {
               setCustomFrom(filters.customFrom)
             }
             if (filters.customTo !== undefined) {
               setCustomTo(filters.customTo)
             }
           }}
           onExport={() => {}}
          exporting={false}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          title={title}
          showExport={false}
          showSettings={false}
          showFilter={true}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          assignedHostLabel={hostTitle}
          assignedHostName={hostEmployee?.full_name}
          roleLabel={userRole === 'PA_TO_CI' ? 'PA TO CI' : userRole === 'PA_TO_DIRECTOR' ? 'PA TO DIRECTOR' : userRole.replace(/_/g, ' ')}
        />

        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
            {notification && (
              <div
                className={`fixed top-4 right-4 z-50 rounded-lg p-4 shadow-lg text-sm ${
                  notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                }`}
              >
                {notification.message}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {kpis.map((kpi, index) => (
                <PremiumStatCard
                  key={kpi.title}
                  title={kpi.title}
                  value={kpi.value}
                  icon={kpi.icon}
                  color={kpi.color}
                  index={index}
                />
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {quickActions.map((action, index) => (
                <QuickActionCard
                  key={action.label}
                  label={action.label}
                  description={action.description}
                  icon={action.icon}
                  color={action.color}
                  index={index}
                  href={`#${action.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  onClick={action.onClick}
                />
              ))}
            </div>

            {recentNotifications.length > 0 && (
              <SectionCard id="recent-notifications" title="Recent Notifications" icon={Bell} count={recentNotifications.length}>
                <div className="divide-y divide-gray-50">
                  {recentNotifications.slice(0, 10).map((notification) => (
                    <div key={notification.id} className="p-4 hover:bg-gray-50/80 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm">{notification.title}</p>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{notification.message}</p>
                          <p className="text-xs text-gray-500 mt-2">
                            {new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t border-gray-100">
                  <a href="/notifications" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    View All Notifications
                  </a>
                </div>
              </SectionCard>
            )}

            <SectionCard id="today-visitors" title={rangeLabel(dateRange)} icon={CalendarDays} count={visitsToday.length}>
              <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-gray-500">{dateRange === 'today' ? 'Visitor schedule for today' : `Showing results for "${rangeLabel(dateRange)}"`}</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search visitors..."
                    value={tableQuery}
                    onChange={(e) => setTableQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
              <VisitorsTable
                visits={filteredVisitsToday}
                variant="full"
                onReview={(v) => setReviewVisitId(v.id)}
                onApprove={handleApprove}
                onReject={handleReject}
                onCheckIn={handleCheckIn}
                onCheckOut={handleCheckOut}
                actionLoading={actionLoading}
                emptyLabel="No visitors scheduled for today"
                emptyIcon={<CalendarDays className="h-12 w-12 mx-auto mb-3 text-gray-300" />}
              />
            </SectionCard>

            <SectionCard id="pending-approvals" title="Pending Approvals" icon={Clock} count={pendingVisits.length}>
              <VisitorsTable
                visits={pendingVisits}
                variant="pending"
                onReview={(v) => setReviewVisitId(v.id)}
                onApprove={handleApprove}
                onReject={handleReject}
                onCheckIn={handleCheckIn}
                onCheckOut={handleCheckOut}
                actionLoading={actionLoading}
                emptyLabel="No pending approvals"
                emptyIcon={<Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />}
              />
            </SectionCard>

            <SectionCard id="currently-checked-in" title="Currently Checked-In" icon={UserCheck} count={checkedInVisits.length}>
              {checkedInVisits.length === 0 ? (
                <div className="p-10 text-center">
                  <UserCheck className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500">No visitors currently checked in</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        {['Visitor', 'Host', 'Check-In Time', 'Duration', 'Status', 'Action'].map((h) => (
                          <th key={h} className="px-5 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {checkedInVisits.map((visit) => {
                        const busy = actionLoading === visit.id
                        return (
                          <tr key={visit.id} className="hover:bg-gray-50/80 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <VisitorAvatar visit={visit} />
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-900 truncate">{visit.visitor?.full_name || 'Unknown Visitor'}</p>
                                  {visit.visitor?.visitor_organization && <p className="text-xs text-gray-500 truncate">{visit.visitor.visitor_organization}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-gray-600">{visit.employee?.full_name || '—'}</td>
                            <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                              {visit.check_in_time ? new Date(visit.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                            <td className="px-5 py-3 text-gray-600 whitespace-nowrap font-mono">{getDuration(visit.check_in_time)}</td>
                            <td className="px-5 py-3"><StatusBadge status={visit.status} /></td>
                            <td className="px-5 py-3">
                              <div className="flex justify-end">
                                <button onClick={() => handleCheckOut(visit)} disabled={busy} className={btnPurple}>
                                  <LogOut className="h-3 w-3" /> Check Out
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard id="completed-visits" title="Completed Visits" icon={CheckCircle2} count={checkedOutVisits.length}>
              <VisitorsTable
                visits={checkedOutVisits}
                variant="completed"
                onReview={(v) => setReviewVisitId(v.id)}
                onApprove={handleApprove}
                onReject={handleReject}
                onCheckIn={handleCheckIn}
                onCheckOut={handleCheckOut}
                actionLoading={actionLoading}
                emptyLabel="No completed visits"
                emptyIcon={<CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />}
              />
            </SectionCard>

            <SectionCard id="search-visitors" title="Search Visitors" icon={Search}>
              <div className="p-4 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name, email, phone, organization, purpose, or office location..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
              <VisitorsTable
                visits={filteredSearchVisits}
                variant="full"
                onReview={(v) => setReviewVisitId(v.id)}
                onApprove={handleApprove}
                onReject={handleReject}
                onCheckIn={handleCheckIn}
                onCheckOut={handleCheckOut}
                actionLoading={actionLoading}
                emptyLabel={searchQuery.length >= 2 ? 'No matching visitors found' : 'Type at least 2 characters to search'}
                emptyIcon={<Search className="h-12 w-12 mx-auto mb-3 text-gray-300" />}
              />
            </SectionCard>

            <SectionCard id="account" title="Account" icon={Shield}>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Signed in as</p>
                <p className="text-sm font-medium text-gray-900 mt-1 break-all">{userEmail}</p>
              </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{hostTitle}</p>
                  <p className="text-sm font-medium text-gray-900 mt-1">{hostEmployee?.full_name || '—'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{hostEmployee?.department || ''}</p>
                </div>
              </div>
              <div className="px-5 pb-5">
                <button
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50"
                >
                  <LogOut className="h-4 w-4" /> Sign Out
                </button>
              </div>
            </SectionCard>
          </div>
        </main>
      </div>

      {reviewVisitId && (
        <VisitorReviewModal visitId={reviewVisitId} hostLabel={hostTitle.replace('Assigned ', '')} paRole={paRole} onClose={handleModalClose} />
      )}
    </div>
  )
}
