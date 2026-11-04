'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS, UserRole } from '@/lib/auth-client'
import { getAuthHeaders } from '@/lib/client/api'
import { Search, Plus, Loader2, Trash2 } from 'lucide-react'

interface Visitor {
  id: string
  full_name: string
  email: string
  phone: string
  visitor_organization: string
  photo_url: string | null
  created_at: string
}

interface Employee {
  id: string
  full_name: string
  department: string
  office_location: string
  position: string
}

function getVisitStartDate(filter: 'today' | 'week' | 'month'): string {
  const now = Date.now()
  if (filter === 'today') return new Date(now).toISOString().split('T')[0]
  if (filter === 'week') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

const inputClasses = "w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
const searchInputClasses = "pl-9 pr-4 py-2 border border-gray-300 rounded-lg bg-[#10150D] text-black placeholder:text-[#9A9F87] focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"

export default function VisitorsPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [authChecking, setAuthChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<UserRole>('Receptionist')
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const [dateFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const date = params.get('date')
      if (date === 'today' || date === 'week' || date === 'month') {
        return date
      }
    }
    return ''
  })
  const [missingDocumentsFilter] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('missing_documents') === 'true'
    }
    return false
  })

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
      if (!PERMISSIONS[user.role]?.includes('visitors')) {
        window.location.href = '/unauthorized'
        return
      }
      setUserRole(user.role)
      setAuthChecking(false)
      fetchVisitors()
      fetchEmployees()
      setupRealtime()
    }
    checkAuth()

    return () => {
      if (realtimeChannel.current) {
        supabase.removeChannel(realtimeChannel.current)
      }
    }
  }, [])

  function setupRealtime() {
    if (realtimeChannel.current) {
      supabase.removeChannel(realtimeChannel.current)
    }

    realtimeChannel.current = supabase
      .channel('visitors-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visitors' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setVisitors(prev => [payload.new as Visitor, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setVisitors(prev => prev.map(v => v.id === (payload.new as Visitor).id ? payload.new as Visitor : v))
          } else if (payload.eventType === 'DELETE') {
            setVisitors(prev => prev.filter(v => v.id !== (payload.old as Visitor).id))
          }
        }
      )
      .subscribe()
  }

  async function fetchVisitors() {
    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('visitors')
        .select('*')
        .order('created_at', { ascending: false })

      if (dateFilter === 'today' || dateFilter === 'week' || dateFilter === 'month') {
        const startDate = getVisitStartDate(dateFilter)
        const { data: visitData, error: visitError } = await supabase
          .from('visits')
          .select('visitor_id')
          .gte('created_at', startDate)

        if (visitError) {
          console.error('Failed to load visits for filter:', visitError)
        } else {
          const visitorIds = [...new Set((visitData || []).map((v) => v.visitor_id).filter(Boolean))]
          if (visitorIds.length > 0) {
            query = query.in('id', visitorIds)
          } else {
            setVisitors([])
            setLoading(false)
            return
          }
        }
      }

      const { data, error } = await query
      if (error) {
        console.error('Failed to load visitors:', error)
        setError(error.message)
        setLoading(false)
        return
      }

      setVisitors(data || [])

      if (missingDocumentsFilter) {
        const { data: allDocs } = await supabase
          .from('visitor_documents')
          .select('visitor_id')
        const docVisitors = new Set((allDocs || []).map(d => d.visitor_id).filter(Boolean))
        const missing = (data || []).filter(v => !docVisitors.has(v.id))
        setVisitors(missing)
      }

      setLoading(false)
    } catch (err) {
      console.error('Failed to load visitors:', err)
      setError(err instanceof Error ? err.message : 'Failed to load visitors')
      setLoading(false)
    }
  }

  async function fetchEmployees() {
    const { data, error } = await supabase
      .from('employees')
      .select('id, full_name, department, office_location, position')
      .order('full_name')
    if (error) {
      console.error('Failed to load employees:', error)
      setEmployees([])
      return
    }
    setEmployees(data ?? [])
  }

  function showNotification(type: 'success' | 'error', message: string) {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) return

    setDeletingId(id)
    const res = await fetch(`/api/visitors/${id}?id=${id}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    })
    const result = await res.json().catch(() => ({ success: false }))
    if (!res.ok || !result.success) {
      showNotification('error', result.error || 'Failed to delete visitor')
    } else {
      showNotification('success', 'Visitor deleted successfully')
      setVisitors(prev => prev.filter(v => v.id !== id))
    }
    setDeletingId(null)
  }

  const filteredVisitors = visitors.filter(
    (v) =>
      v.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.visitor_organization.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  if (authChecking) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
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
          <h1 className="text-2xl font-bold text-[#F5F5DC]">Visitors</h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search visitors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={searchInputClasses}
              />
            </div>
            <a
              href="/visitors/new"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Register Visitor
            </a>
          </div>
        </div>

        {notification && (
          <div
            className={`rounded-lg p-4 text-sm ${notification.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
          >
            {notification.message}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-800">Unable to load visitors.</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
            <button
              onClick={fetchVisitors}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-[#10150D] px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <Loader2 className="h-4 w-4" />
              Try Again
            </button>
          </div>
        )}

        {!error && (
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Name</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Visitor Organization</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Created</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87] w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                  {filteredVisitors.map((visitor) => (
                    <tr key={visitor.id} className="hover:bg-[#4B5320]/10 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {visitor.photo_url ? (
                            <img
                              src={visitor.photo_url}
                              alt={visitor.full_name}
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                              <span className="text-xs text-[#9A9F87]">
                                {visitor.full_name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <span className="font-medium text-[#F5F5DC]">
                             <a href={`/visitors/${visitor.id}`} className="hover:text-blue-600 hover:underline">
                                {visitor.full_name}
                              </a>
                           </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#9A9F87]">{visitor.visitor_organization || '—'}</td>
                      <td className="px-4 py-3 text-[#9A9F87]">
                        {visitor.created_at ? new Date(visitor.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <a href={`/visitors/${visitor.id}`} className="p-1 rounded-md hover:bg-gray-100 transition-colors" title="View">
                            <Search className="h-4 w-4 text-[#9A9F87]" />
                          </a>
                          <button
                            onClick={() => handleDelete(visitor.id, visitor.full_name)}
                            disabled={deletingId === visitor.id}
                            className="p-1 rounded-md hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            {deletingId === visitor.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-red-600" />}
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
      </div>
    </div>
  )
}


