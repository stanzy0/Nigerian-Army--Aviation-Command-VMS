'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'

interface AuditLog {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  performed_by: string
  details: string | { message?: string; role?: string; [key: string]: unknown } | null
  created_at: string
}

function getDetailsMessage(details: AuditLog['details']): string {
  if (!details) return ''
  if (typeof details === 'string') return details
  return details.message || ''
}

function getDetailsRole(details: AuditLog['details']): string {
  if (!details) return '—'
  if (typeof details === 'string') {
    return details.match(/role\s+(\w+)/)?.[1] || '—'
  }
  return details.role || '—'
}

interface AuditLogsResponse {
  success: boolean
  data: AuditLog[]
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

const EVENT_TYPES = ['login_success', 'logout', 'login_failed', 'login_failed_invalid_credentials', 'login_failed_account_locked', 'Other']
const AUTH_EVENT_TYPES = ['login_success', 'logout', 'login_failed', 'login_failed_invalid_credentials', 'login_failed_account_locked']
const USER_ROLES = ['Admin', 'Receptionist', 'Security', 'Commandant', 'Director', 'Host Employee', 'PA_TO_DIRECTOR', 'PA_TO_CI', 'PA_TO_COMMANDER']

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const date = params.get('date')
      if (date === 'today') {
        return new Date().toISOString().split('T')[0]
      }
    }
    return ''
  })
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [currentRole, setCurrentRole] = useState<string | null>(null)
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '50')

      if (searchTerm) params.set('search', searchTerm)
      if (eventTypeFilter) params.set('eventType', eventTypeFilter)
      if (userRoleFilter) params.set('userRole', userRoleFilter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const res = await fetch(`/api/audit?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })

      if (res.ok) {
        const result: AuditLogsResponse = await res.json()
        if (result.success) {
          setLogs(result.data || [])
          setTotalPages(result.pagination?.totalPages || 1)
          setTotalRecords(result.pagination?.total || 0)
        }
      } else {
        console.error('Failed to fetch audit logs')
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err)
    } finally {
      setLoading(false)
    }
  }

  const setupRealtime = () => {
    if (realtimeChannel.current) {
      supabase.removeChannel(realtimeChannel.current)
    }

    realtimeChannel.current = supabase
      .channel('audit-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        (payload) => {
          setLogs(prev => [payload.new as AuditLog, ...prev])
        }
      )
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
      if (!PERMISSIONS[user.role]?.includes('audit-logs')) {
        window.location.href = '/unauthorized'
        return
      }
      setCurrentRole(user.role)
      setAuthChecking(false)
      fetchLogs()
      setupRealtime()
    }
    checkAuth()

    return () => {
      if (realtimeChannel.current) {
        supabase.removeChannel(realtimeChannel.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!authChecking) {
      setTimeout(() => fetchLogs(), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, eventTypeFilter, userRoleFilter, page])

  if (authChecking) {
    return (
      <div className="flex h-screen bg-[#0B0F08] relative items-center justify-center">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/naac-login.jpg"
            alt="Nigerian Army Aviation Command background"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F08]/90 via-[#0B0F08]/70 to-[#0B0F08]/40" />
        </div>
        <Loader2 className="h-8 w-8 animate-spin text-[#C8A646]" />
      </div>
    )
  }

  const filteredLogs = logs.filter(
    (log) =>
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.entity_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.performed_by.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getDetailsMessage(log.details).toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage)
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0F08] relative">
      <div className="absolute inset-0 z-0">
        <img
          src="/images/naac-login.jpg"
          alt="Nigerian Army Aviation Command background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F08]/90 via-[#0B0F08]/70 to-[#0B0F08]/40" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="mb-6">
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
            ← Back to Dashboard
          </a>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold text-[#F5F5DC]">Audit Logs</h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="">All Event Types</option>
                {(currentRole === 'Receptionist' ? AUTH_EVENT_TYPES : EVENT_TYPES).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="">All Roles</option>
                {USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="From"
                />
                <span className="text-gray-400 self-center">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="To"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : (
              <div>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Action</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Entity Type</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Entity ID</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Staff</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Role</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Date/Time</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#4B5320]/10 transition-colors">
                        <td className="px-4 py-3 font-medium text-[#F5F5DC]">{log.action}</td>
                        <td className="px-4 py-3 text-[#9A9F87]">{log.entity_type || '—'}</td>
                        <td className="px-4 py-3 text-[#9A9F87]">{log.entity_id || '—'}</td>
                        <td className="px-4 py-3 text-[#9A9F87]">{log.performed_by}</td>
                        <td className="px-4 py-3 text-[#9A9F87]">
                          <span className="text-xs bg-[#4B5320]/20 px-2 py-1 rounded">
                            {getDetailsRole(log.details)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#9A9F87] whitespace-nowrap">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-[#9A9F87]">{getDetailsMessage(log.details) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between py-4">
              <p className="text-[#9A9F87] text-sm">
                Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, totalRecords)} of {totalRecords} records
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 py-1 text-sm text-[#9A9F87]">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages}
                  className="px-3 py-1 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {!loading && filteredLogs.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-[#9A9F87]">No audit logs found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}