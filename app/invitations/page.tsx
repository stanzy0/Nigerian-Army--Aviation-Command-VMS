'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { logAuditAction } from '@/lib/client/audit'
import { Search, Loader2, CheckCircle, XCircle, RefreshCw, Mail, Eye } from 'lucide-react'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import { VisitorInvitation, getInvitationsByHost, getAllInvitations, approveInvitation, rejectInvitation, cancelInvitation } from '@/lib/client/invitations'
import InvitationStatusCard from '@/components/InvitationStatusCard'

const searchInputClasses = "pl-9 pr-4 py-2 border border-gray-300 rounded-lg bg-[#10150D] text-black placeholder:text-[#9A9F87] focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
const selectClasses = "rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<VisitorInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }

  const fetchInvitations = async (hostId: string) => {
    setLoading(true)
    try {
      const data = await getInvitationsByHost(hostId)
      setInvitations(data)
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to fetch invitations')
    }
    setLoading(false)
  }

  const fetchAllInvitations = async () => {
    setLoading(true)
    try {
      const data = await getAllInvitations()
      setInvitations(data)
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to fetch invitations')
    }
    setLoading(false)
  }

  const setupRealtime = () => {
    if (realtimeChannel.current) {
      supabase.removeChannel(realtimeChannel.current)
    }

    realtimeChannel.current = supabase
      .channel('invitations-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_invitations' }, () => {
        if (employeeId) {
          fetchInvitations(employeeId)
        } else {
          fetchAllInvitations()
        }
      })
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
      setAuthChecking(false)

      if (user.role === 'Host Employee') {
        const { data: employee } = await supabase
          .from('employees')
          .select('id')
          .eq('email', user.email)
          .single()

        if (employee) {
          setEmployeeId(employee.id)
          fetchInvitations(employee.id)
        }
      } else {
        fetchAllInvitations()
      }

      setupRealtime()
    }
    checkAuth()

    return () => {
      if (realtimeChannel.current) {
        supabase.removeChannel(realtimeChannel.current)
      }
    }
  }, [])

  const handleApprove = async (token: string) => {
    setActionLoading(token)
    try {
      const invitation = await approveInvitation(token)
      showNotification('success', `Invitation approved for ${invitation.visitor_name}`)
      if (employeeId) {
        fetchInvitations(employeeId)
      } else {
        fetchAllInvitations()
      }
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to approve invitation')
    }
    setActionLoading(null)
  }

  const handleReject = async (token: string) => {
    setActionLoading(token)
    try {
      const invitation = await rejectInvitation(token)
      showNotification('success', `Invitation rejected for ${invitation.visitor_name}`)
      if (employeeId) {
        fetchInvitations(employeeId)
      } else {
        fetchAllInvitations()
      }
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to reject invitation')
    }
    setActionLoading(null)
  }

  const refresh = () => {
    if (employeeId) {
      fetchInvitations(employeeId)
    } else {
      fetchAllInvitations()
    }
  }

  const filteredInvitations = invitations.filter((inv) => {
    const matchesSearch =
      inv.visitor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.visitor_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.purpose.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (authChecking) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F08]">
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="mb-6">
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
            ← Back to Dashboard
          </a>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold text-[#F5F5DC]">Invitations</h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search invitations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={searchInputClasses}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={selectClasses}
            >
              <option value="all">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Expired">Expired</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <button
              onClick={refresh}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {notification && (
          <div className={`rounded-lg p-4 text-sm ${notification.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {notification.message}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-4">
            <p className="text-sm text-[#9A9F87]">Pending</p>
            <p className="text-2xl font-bold text-amber-600">{invitations.filter(i => i.status === 'Pending').length}</p>
          </div>
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-4">
            <p className="text-sm text-[#9A9F87]">Completed</p>
            <p className="text-2xl font-bold text-blue-600">{invitations.filter(i => i.status === 'Completed').length}</p>
          </div>
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-4">
            <p className="text-sm text-[#9A9F87]">Approved</p>
            <p className="text-2xl font-bold text-green-600">{invitations.filter(i => i.status === 'Approved').length}</p>
          </div>
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-4">
            <p className="text-sm text-[#9A9F87]">Expired</p>
            <p className="text-2xl font-bold text-red-600">{invitations.filter(i => i.status === 'Expired').length}</p>
          </div>
        </div>

        <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Visitor</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Host</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Purpose</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Date</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87] w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                  {filteredInvitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#4B5320]/10 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-[#F5F5DC]">{inv.visitor_name}</p>
                          <p className="text-xs text-[#9A9F87]">{inv.visitor_email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#9A9F87]">
                        {(inv.host?.full_name || '—')}
                      </td>
                      <td className="px-4 py-3 text-[#9A9F87]">{inv.purpose}</td>
                      <td className="px-4 py-3 text-[#9A9F87] whitespace-nowrap">
                        {inv.expected_date}
                        {inv.expected_time && <span className="block text-xs text-gray-400">{inv.expected_time}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <InvitationStatusCard status={inv.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {inv.status === 'Completed' && userRole === 'Host Employee' && (
                            <>
                              <button
                                onClick={() => handleApprove(inv.invitation_token)}
                                disabled={actionLoading === inv.invitation_token}
                                className="inline-flex items-center gap-1.5 rounded-full bg-green-50 text-green-700 px-3 py-1.5 text-xs font-medium hover:bg-green-100 disabled:opacity-50"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(inv.invitation_token)}
                                disabled={actionLoading === inv.invitation_token}
                                className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 px-3 py-1.5 text-xs font-medium hover:bg-red-100 disabled:opacity-50"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!loading && filteredInvitations.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-[#9A9F87]">No invitations found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


