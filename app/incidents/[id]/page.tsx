'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import { Loader2, ArrowLeft, AlertTriangle, CheckCircle2, Clock, XCircle, FileText, Download, Send, UserCheck, ShieldAlert, Package, BadgeCheck, Home, Plus } from 'lucide-react'
import type { Incident, IncidentTimelineEntry, IncidentCategory, IncidentSeverity, IncidentStatus } from '@/lib/types/incident'

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
  Low: 'bg-gray-50 text-gray-700 border-gray-200',
  Medium: 'bg-blue-50 text-blue-700 border-blue-200',
  High: 'bg-amber-50 text-amber-700 border-amber-200',
  Critical: 'bg-red-50 text-red-700 border-red-200',
}

const STATUS_COLORS: Record<IncidentStatus, string> = {
  Open: 'bg-red-50 text-red-700 border-red-200',
  Assigned: 'bg-blue-50 text-blue-700 border-blue-200',
  Investigating: 'bg-amber-50 text-amber-700 border-amber-200',
  Resolved: 'bg-green-50 text-green-700 border-green-200',
  Closed: 'bg-gray-50 text-gray-700 border-gray-200',
}

const TIMELINE_ACTIONS: Array<{ value: IncidentTimelineEntry['action']; label: string }> = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'visitor_contacted', label: 'Visitor Contacted' },
  { value: 'host_contacted', label: 'Host Contacted' },
  { value: 'security_arrived', label: 'Security Arrived' },
  { value: 'badge_cancelled', label: 'Badge Cancelled' },
  { value: 'property_released', label: 'Property Released' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'note_added', label: 'Note Added' },
]

export default function IncidentDetailPage({ params }: { params: { id: string } }) {
  const [authChecking, setAuthChecking] = useState(true)
  const [incident, setIncident] = useState<Incident | null>(null)
  const [timeline, setTimeline] = useState<IncidentTimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [showAddTimeline, setShowAddTimeline] = useState(false)
  const [timelineAction, setTimelineAction] = useState<IncidentTimelineEntry['action']>('note_added')
  const [timelineDescription, setTimelineDescription] = useState('')

  const fetchIncident = async () => {
    setLoading(true)
    try {
      const [incidentRes, timelineRes] = await Promise.all([
        fetch(`/api/incidents/${params.id}`),
        fetch(`/api/incidents/${params.id}/timeline`),
      ])

      const incidentData = await incidentRes.json()
      const timelineData = await timelineRes.json()

      if (incidentData.success) {
        setIncident(incidentData.data)
      }
      if (timelineData.success) {
        setTimeline(timelineData.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch incident:', err)
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
      fetchIncident()
    }

    checkAuth()
  }, [params.id])

  useEffect(() => {
    const channel = supabase
      .channel(`incident-${params.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents', filter: `id=eq.${params.id}` }, () => {
        fetchIncident()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_timeline', filter: `incident_id=eq.${params.id}` }, () => {
        fetchIncident()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [params.id])

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }

  const handleUpdate = async (updates: Partial<Incident>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/incidents/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      const data = await res.json()

      if (data.success) {
        setIncident(data.data)
        setEditing(false)
        showNotification('success', 'Incident updated successfully')
      } else {
        showNotification('error', data.error || 'Failed to update incident')
      }
    } catch (err) {
      showNotification('error', 'Failed to update incident')
    } finally {
      setSaving(false)
    }
  }

  const handleAddTimelineEntry = async () => {
    if (!timelineDescription.trim()) return

    setSaving(true)
    try {
      const res = await fetch(`/api/incidents/${params.id}/timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: timelineAction,
          description: timelineDescription,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setTimeline([...timeline, data.data])
        setTimelineDescription('')
        setShowAddTimeline(false)
        showNotification('success', 'Timeline entry added')
      } else {
        showNotification('error', data.error || 'Failed to add timeline entry')
      }
    } catch (err) {
      showNotification('error', 'Failed to add timeline entry')
    } finally {
      setSaving(false)
    }
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'created': return <FileText className="h-4 w-4" />
      case 'assigned': return <UserCheck className="h-4 w-4" />
      case 'visitor_contacted': return <ShieldAlert className="h-4 w-4" />
      case 'host_contacted': return <Home className="h-4 w-4" />
      case 'security_arrived': return <ShieldAlert className="h-4 w-4" />
      case 'badge_cancelled': return <BadgeCheck className="h-4 w-4" />
      case 'property_released': return <Package className="h-4 w-4" />
      case 'resolved': return <CheckCircle2 className="h-4 w-4" />
      case 'closed': return <XCircle className="h-4 w-4" />
      case 'note_added': return <FileText className="h-4 w-4" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  if (authChecking || loading) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!incident) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Incident not found</p>
          <Link href="/incidents" className="text-blue-600 hover:underline mt-2 inline-block">Back to incidents</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {notification && (
        <div className={`fixed top-0 left-0 right-0 z-50 p-4 text-center text-base font-medium shadow-lg ${
          notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {notification.message}
        </div>
      )}

      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/incidents" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-5 w-5" />
            Back
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{incident.title}</h1>
              <span className="text-sm text-gray-500">{incident.incident_number}</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {incident.category} • Reported {incident.created_at ? new Date(incident.created_at).toLocaleString() : '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Severity</p>
            {editing ? (
              <select
                value={incident.severity}
                onChange={(e) => handleUpdate({ severity: e.target.value as IncidentSeverity })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {SEVERITIES.map((sev) => (
                  <option key={sev} value={sev}>{sev}</option>
                ))}
              </select>
            ) : (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${SEVERITY_COLORS[incident.severity]}`}>
                {incident.severity}
              </span>
            )}
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Status</p>
            {editing ? (
              <select
                value={incident.status}
                onChange={(e) => handleUpdate({ status: e.target.value as IncidentStatus })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            ) : (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[incident.status]}`}>
                {incident.status}
              </span>
            )}
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Location</p>
            {editing ? (
              <input
                type="text"
                value={incident.location || ''}
                onChange={(e) => handleUpdate({ location: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            ) : (
              <p className="text-sm font-medium text-gray-900">{incident.location || '—'}</p>
            )}
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Assigned To</p>
            {editing ? (
              <input
                type="text"
                value={incident.assigned_to || ''}
                onChange={(e) => handleUpdate({ assigned_to: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            ) : (
              <p className="text-sm font-medium text-gray-900">{incident.assigned_to || 'Unassigned'}</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Description</h3>
          {editing ? (
            <textarea
              value={incident.description}
              onChange={(e) => handleUpdate({ description: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{incident.description}</p>
          )}
        </div>

        {incident.resolution && (
          <div className="bg-green-50 rounded-xl border border-green-200 p-6">
            <h3 className="text-lg font-semibold text-green-900 mb-2">Resolution</h3>
            <p className="text-sm text-green-800">{incident.resolution}</p>
            {incident.resolved_at && (
              <p className="text-xs text-green-700 mt-2">Resolved at {incident.resolved_at ? new Date(incident.resolved_at).toLocaleString() : '—'}</p>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Timeline</h3>
            <button
              onClick={() => setShowAddTimeline(!showAddTimeline)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Entry
            </button>
          </div>

          {showAddTimeline && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
              <select
                value={timelineAction}
                onChange={(e) => setTimelineAction(e.target.value as IncidentTimelineEntry['action'])}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {TIMELINE_ACTIONS.map((action) => (
                  <option key={action.value} value={action.value}>{action.label}</option>
                ))}
              </select>
              <textarea
                value={timelineDescription}
                onChange={(e) => setTimelineDescription(e.target.value)}
                placeholder="Enter timeline description..."
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddTimelineEntry}
                  disabled={saving || !timelineDescription.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Adding...' : 'Add Entry'}
                </button>
                <button
                  onClick={() => setShowAddTimeline(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {timeline.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="mt-0.5 text-gray-400">{getActionIcon(entry.action)}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{entry.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'} • By {entry.performed_by || 'System'}
                  </p>
                </div>
              </div>
            ))}
            {timeline.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No timeline entries yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
