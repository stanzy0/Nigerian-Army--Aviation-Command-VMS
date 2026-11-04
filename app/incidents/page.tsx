'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import { Loader2, Plus, Search, Filter, AlertTriangle, CheckCircle2, Clock, XCircle, Eye, FileText, Download, RefreshCw } from 'lucide-react'
import type { Incident, IncidentCategory, IncidentSeverity, IncidentStatus, IncidentStats } from '@/lib/types/incident'

const CATEGORIES: IncidentCategory[] = [
  'Unauthorized Access',
  'Lost Badge',
  'Damaged Badge',
  'Property Issue',
  'Medical Emergency',
  'Fire Alarm',
  'Evacuation',
  'Suspicious Activity',
  'Security Alert',
  'Watchlist Match',
  'Host Complaint',
  'Visitor Complaint',
  'Technical Issue',
  'Other',
]

const SEVERITIES: IncidentSeverity[] = ['Low', 'Medium', 'High', 'Critical']

const STATUSES: IncidentStatus[] = ['Open', 'Assigned', 'Investigating', 'Resolved', 'Closed']

const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  Low: 'bg-gray-50 text-[#9A9F87] border-[rgba(85,107,47,0.35)]',
  Medium: 'bg-blue-50 text-blue-700 border-blue-200',
  High: 'bg-amber-50 text-amber-700 border-amber-200',
  Critical: 'bg-red-50 text-red-700 border-red-200',
}

const STATUS_COLORS: Record<IncidentStatus, string> = {
  Open: 'bg-red-50 text-red-700 border-red-200',
  Assigned: 'bg-blue-50 text-blue-700 border-blue-200',
  Investigating: 'bg-amber-50 text-amber-700 border-amber-200',
  Resolved: 'bg-green-50 text-green-700 border-green-200',
  Closed: 'bg-gray-50 text-[#9A9F87] border-[rgba(85,107,47,0.35)]',
}

export default function IncidentsPage() {
  const [authChecking, setAuthChecking] = useState(true)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [stats, setStats] = useState<IncidentStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<IncidentCategory | 'all'>('all')
  const [severityFilter, setSeverityFilter] = useState<IncidentSeverity | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'all'>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fetchIncidents = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set('search', searchTerm)
      if (categoryFilter !== 'all') params.set('category', categoryFilter)
      if (severityFilter !== 'all') params.set('severity', severityFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await fetch(`/api/incidents?${params}`)
      const data = await res.json()

      if (data.success) {
        setIncidents(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch incidents:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/incidents/stats')
      const data = await res.json()

      if (data.success) {
        setStats(data.data)
      }
    } catch (err) {
      console.error('Failed to fetch incident stats:', err)
    }
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
      const allowedRoles = ['Admin', 'Security', 'Operations', 'Receptionist', 'Commandant']
      if (!allowedRoles.includes(user.role)) {
        window.location.href = '/unauthorized'
        return
      }
      setAuthChecking(false)
      fetchIncidents()
      fetchStats()
    }

    checkAuth()
  }, [searchTerm, categoryFilter, severityFilter, statusFilter])

  useEffect(() => {
    const channel = supabase
      .channel('incidents-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => {
        fetchIncidents()
        fetchStats()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }

  if (authChecking || loading) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F08]">
      {notification && (
        <div className={`fixed top-0 left-0 right-0 z-50 p-4 text-center text-base font-medium shadow-lg ${
          notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {notification.message}
        </div>
      )}

      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F5DC]">Incident Management</h1>
            <p className="text-sm text-[#9A9F87]">Track and manage security incidents</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
          >
            <Plus className="h-4 w-4" />
            New Incident
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#10150D] rounded-xl p-4 border border-[rgba(85,107,47,0.35)]">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <p className="text-sm text-[#9A9F87]">Open Incidents</p>
              </div>
              <p className="text-3xl font-bold text-[#F5F5DC]">{stats.open}</p>
            </div>
            <div className="bg-[#10150D] rounded-xl p-4 border border-[rgba(85,107,47,0.35)]">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <p className="text-sm text-[#9A9F87]">Critical Incidents</p>
              </div>
              <p className="text-3xl font-bold text-[#F5F5DC]">{stats.critical}</p>
            </div>
            <div className="bg-[#10150D] rounded-xl p-4 border border-[rgba(85,107,47,0.35)]">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="text-sm text-[#9A9F87]">Resolved Today</p>
              </div>
              <p className="text-3xl font-bold text-[#F5F5DC]">{stats.resolvedToday}</p>
            </div>
            <div className="bg-[#10150D] rounded-xl p-4 border border-[rgba(85,107,47,0.35)]">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <p className="text-sm text-[#9A9F87]">Avg Resolution</p>
              </div>
              <p className="text-3xl font-bold text-[#F5F5DC]">{stats.averageResolutionMinutes ? `${stats.averageResolutionMinutes}m` : '—'}</p>
            </div>
          </div>
        )}

        <div className="bg-[#10150D] rounded-xl border border-[rgba(85,107,47,0.35)] p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search incidents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 pl-9 pr-4 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as any)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as any)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="all">All Severities</option>
                {SEVERITIES.map((sev) => (
                  <option key={sev} value={sev}>{sev}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="all">All Statuses</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-[#10150D] rounded-xl border border-[rgba(85,107,47,0.35)] overflow-hidden">
          {incidents.length === 0 ? (
            <div className="p-12 text-center text-[#9A9F87]">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium">No incidents found</p>
              <p className="text-sm">Try adjusting your filters or create a new incident</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Incident</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Category</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Severity</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Assigned To</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Created</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                  {incidents.map((incident) => (
                    <tr key={incident.id} className="hover:bg-[#4B5320]/10">
                      <td className="px-4 py-4">
                        <p className="font-medium text-[#F5F5DC]">{incident.title}</p>
                        <p className="text-xs text-[#9A9F87]">{incident.incident_number}</p>
                      </td>
                      <td className="px-4 py-4 text-[#9A9F87]">{incident.category}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${SEVERITY_COLORS[incident.severity]}`}>
                          {incident.severity}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[incident.status]}`}>
                          {incident.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-[#9A9F87]">{incident.assigned_to || '—'}</td>
                      <td className="px-4 py-4 text-[#9A9F87] whitespace-nowrap">
                         {incident.created_at ? new Date(incident.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <a
                          href={`/incidents/${incident.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-[#10150D] px-3 py-1.5 text-xs font-medium text-[#9A9F87] hover:bg-[#4B5320]/10"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateIncidentModal onClose={() => setShowCreateModal(false)} onSuccess={() => { fetchIncidents(); fetchStats(); setShowCreateModal(false); }} />
      )}
    </div>
  )
}

function CreateIncidentModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Other' as IncidentCategory,
    severity: 'Medium' as IncidentSeverity,
    location: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (data.success) {
        onSuccess()
      } else {
        alert(data.error || 'Failed to create incident')
      }
    } catch (err) {
      alert('Failed to create incident')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#10150D] rounded-2xl max-w-lg w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-[#F5F5DC]">Create Incident</h3>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100">
            <XCircle className="h-5 w-5 text-[#9A9F87]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#9A9F87] mb-1">Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9A9F87] mb-1">Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#9A9F87] mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as IncidentCategory })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#9A9F87] mb-1">Severity</label>
              <select
                value={formData.severity}
                onChange={(e) => setFormData({ ...formData, severity: e.target.value as IncidentSeverity })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {SEVERITIES.map((sev) => (
                  <option key={sev} value={sev}>{sev}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9A9F87] mb-1">Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
            >
              {submitting ? 'Creating...' : 'Create Incident'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 rounded-lg font-medium hover:bg-[#4B5320]/10 min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


