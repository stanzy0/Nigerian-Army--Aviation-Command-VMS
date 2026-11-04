'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, Loader2 } from 'lucide-react'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'

interface AuditLog {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  performed_by: string
  details: string
  created_at: string
}

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
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchLogs = async () => {
    setLoading(true)
    let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false })

    if (dateFilter) {
      const startOfDay = new Date(dateFilter)
      const endOfDay = new Date(dateFilter)
      endOfDay.setDate(endOfDay.getDate() + 1)
      query = query.gte('created_at', startOfDay.toISOString()).lt('created_at', endOfDay.toISOString())
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching audit logs:', error)
    } else {
      setLogs(data || [])
    }
    setLoading(false)
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
  }, [])

  useEffect(() => {
    if (!authChecking) {
      setTimeout(() => fetchLogs(), 0)
    }
  }, [dateFilter])

  if (authChecking) {
    return (
      <div className="flex h-screen bg-[#0B0F08] relative items-center justify-center">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/afcsc-login.jpg"
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
      (log.details || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#0B0F08] relative">
      <div className="absolute inset-0 z-0">
        <img
          src="/images/afcsc-login.jpg"
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
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
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
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Action</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Entity Type</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Entity ID</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Performed By</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Details</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Date/Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#4B5320]/10 transition-colors">
                      <td className="px-4 py-3 font-medium text-[#F5F5DC]">{log.action}</td>
                      <td className="px-4 py-3 text-[#9A9F87]">{log.entity_type || '—'}</td>
                      <td className="px-4 py-3 text-[#9A9F87]">{log.entity_id || '—'}</td>
                      <td className="px-4 py-3 text-[#9A9F87]">{log.performed_by}</td>
                      <td className="px-4 py-3 text-[#9A9F87]">{log.details || '—'}</td>
                      <td className="px-4 py-3 text-[#9A9F87] whitespace-nowrap">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

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



