'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth-client'
import { Loader2, Search, CheckCircle, XCircle, Eye, UserCheck, Clock } from 'lucide-react'

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
  purpose: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  created_at: string
  visitor: Visitor | null
  badge?: { badge_number: string; status: string } | null
}

export default function HostVisitorsPage() {
  const [userRole, setUserRole] = useState<string>('')
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  const fetchVisitors = async () => {
    if (!employeeId) return
    setLoading(true)

    try {
      let query = supabase
        .from('visits')
        .select('*, visitor:visitors(*), badge:visitor_badges(*)')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      if (search) {
        query = query.or(`visitor.full_name.ilike.%${search}%,visitor.visitor_organization.ilike.%${search}%`)
      }

      const { data, error } = await query

      if (error) {
        throw error
      }

      setVisits(data || [])
    } catch (err) {
      console.error('Error fetching visitors:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      setUserRole(user.role)

      if (user.role === 'Host Employee') {
        const { data: empData } = await supabase
          .from('employees')
          .select('id')
          .eq('user_id', user.id)
          .single()
        if (empData) {
          setEmployeeId(empData.id)
        }
      } else if (user.role === 'Admin') {
        setEmployeeId('admin')
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    if (employeeId) {
      setTimeout(() => fetchVisitors(), 0)
    }
  }, [employeeId, statusFilter, search])

  const handleApprove = async (visitId: string) => {
    setActionLoading(visitId)
    try {
      const res = await fetch('/api/host/visitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-employee-id': employeeId || 'default' },
        body: JSON.stringify({ visitId, action: 'approve' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        alert(json.message || 'Approval failed')
      } else {
        fetchVisitors()
      }
    } catch {
      alert('Approval failed')
    }
    setActionLoading(null)
  }

  const handleReject = async (visitId: string) => {
    if (!rejectReason.trim()) {
      alert('Please provide a rejection reason')
      return
    }
    setActionLoading(visitId)

    // Use the authorized API route instead of a direct client-side DB update.
    const res = await fetch(`/api/visits/status?id=${encodeURIComponent(visitId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      alert(errData.message || 'Rejection failed')
    } else {
      setRejectingId(null)
      setRejectReason('')
      fetchVisitors()
    }
    setActionLoading(null)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-amber-50 text-amber-700'
      case 'approved':
        return 'bg-blue-50 text-blue-700'
      case 'checked_in':
        return 'bg-green-50 text-green-700'
      case 'checked_out':
        return 'bg-gray-50 text-[#9A9F87]'
      case 'rejected':
        return 'bg-red-50 text-red-700'
      default:
        return 'bg-gray-50 text-[#9A9F87]'
    }
  }

  const canEdit = userRole === 'Admin' || userRole === 'Host Employee'

  if (!employeeId && userRole !== 'Admin') {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-[#9A9F87]">No employee record found for your account.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F08]">
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="mb-6">
          <a href="/host" className="text-sm text-blue-600 hover:underline">
            ← Back to Host Portal
          </a>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F5DC]">My Visitors</h1>
            <p className="text-sm text-[#9A9F87]">Manage visitors assigned to you</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search visitors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-lg border border-gray-300 bg-[#10150D] pl-9 pr-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="checked_in">Checked In</option>
              <option value="checked_out">Checked Out</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Visitor</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Company</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Purpose</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Badge</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Check-In</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Check-Out</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                {visits.map((visit) => (
                  <tr key={visit.id} className="hover:bg-[#4B5320]/10 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {visit.visitor?.photo_url ? (
                          <img src={visit.visitor.photo_url} alt={visit.visitor.full_name} className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="text-sm text-[#9A9F87]">{(visit.visitor?.full_name || 'V').charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <span className="font-medium text-[#F5F5DC]">{visit.visitor?.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#9A9F87]">{visit.visitor?.visitor_organization || '—'}</td>
                    <td className="px-4 py-3 text-[#9A9F87]">{visit.purpose || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(visit.status)}`}>
                        {visit.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#9A9F87]">
                      {visit.badge?.badge_number || '—'}
                    </td>
                    <td className="px-4 py-3 text-[#9A9F87]">
                      {visit.check_in_time ? new Date(visit.check_in_time).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-[#9A9F87]">
                      {visit.check_out_time ? new Date(visit.check_out_time).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {canEdit && visit.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(visit.id)}
                              disabled={actionLoading === visit.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {actionLoading === visit.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                              Approve
                            </button>
                            <button
                              onClick={() => setRejectingId(visit.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                            >
                              <XCircle className="h-3 w-3" />
                              Reject
                            </button>
                          </>
                        )}
                        {rejectingId === visit.id && (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Reason"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              className="rounded border border-gray-300 px-2 py-1 text-xs text-black"
                            />
                            <button
                              onClick={() => handleReject(visit.id)}
                              disabled={actionLoading === visit.id}
                              className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => { setRejectingId(null); setRejectReason('') }}
                              className="rounded border border-gray-300 px-2 py-1 text-xs text-[#9A9F87] hover:bg-[#4B5320]/10"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visits.length === 0 && !loading && (
            <div className="p-12 text-center">
              <Eye className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-[#9A9F87]">No visitors found</p>
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

