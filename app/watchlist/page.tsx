'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS, UserRole } from '@/lib/auth-client'
import { Search, Plus, Edit, Trash2, X, Loader2, ShieldAlert, RefreshCw, UserX, Crown } from 'lucide-react'

interface WatchlistEntry {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  id_number: string | null
  visitor_organization: string | null
  vehicle_registration: string | null
  status: 'Active' | 'Expired'
  category: 'Security Alert' | 'Banned' | 'VIP' | 'Contractor' | 'Person of Interest' | 'Fraud Alert'
  reason: string | null
  notes: string | null
  added_by: string
  created_at: string
  updated_at: string
}

interface UserProfile {
  id: string
  full_name: string | null
  email: string | null
}

const CATEGORY_OPTIONS = [
  'Security Alert',
  'Banned',
  'VIP',
  'Contractor',
  'Person of Interest',
  'Fraud Alert',
] as const

const STATUS_OPTIONS = ['Active', 'Expired'] as const

const categoryIcons: Record<string, React.ReactNode> = {
  'Security Alert': <ShieldAlert className="h-4 w-4" />,
  'Banned': <UserX className="h-4 w-4" />,
  'VIP': <Crown className="h-4 w-4" />,
  'Contractor': <RefreshCw className="h-4 w-4" />,
  'Person of Interest': <Search className="h-4 w-4" />,
  'Fraud Alert': <ShieldAlert className="h-4 w-4" />,
}

const categoryColors: Record<string, string> = {
  'Security Alert': 'bg-red-50 text-red-700 border-red-200',
  'Banned': 'bg-gray-50 text-[#9A9F87] border-[rgba(85,107,47,0.35)]',
  'VIP': 'bg-amber-50 text-amber-700 border-amber-200',
  'Contractor': 'bg-blue-50 text-blue-700 border-blue-200',
  'Person of Interest': 'bg-purple-50 text-purple-700 border-purple-200',
  'Fraud Alert': 'bg-orange-50 text-orange-700 border-orange-200',
}

const statusColors: Record<string, string> = {
  'Active': 'bg-green-50 text-green-700 border-green-200',
  'Expired': 'bg-gray-50 text-[#9A9F87] border-[rgba(85,107,47,0.35)]',
}

export default function WatchlistPage() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([])
  const [users, setUsers] = useState<UserProfile[]>([])
  const [userRole, setUserRole] = useState<UserRole>('Receptionist')
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<WatchlistEntry | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    id_number: '',
    visitor_organization: '',
    vehicle_registration: '',
    status: 'Active' as 'Active' | 'Expired',
    category: 'Security Alert' as WatchlistEntry['category'],
    reason: '',
    notes: '',
  })
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)

  function showNotification(type: 'success' | 'error', message: string) {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }

  function setupRealtime() {
    if (realtimeChannel.current) {
      supabase.removeChannel(realtimeChannel.current)
    }

    realtimeChannel.current = supabase
      .channel('watchlist-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visitor_watchlist' },
        () => {
          fetchEntries()
        }
      )
      .subscribe()
  }

  async function fetchEntries() {
    setLoading(true)
    const { data, error } = await supabase
      .from('visitor_watchlist')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      showNotification('error', error.message)
    } else {
      setEntries(data || [])
    }
    setLoading(false)
  }

  async function fetchUsers() {
    const { data } = await supabase
      .from('user_roles')
      .select('user_id, full_name, email')
      .eq('role', 'Admin')

    const profiles: UserProfile[] = []
    data?.forEach((u: { user_id: string; full_name: string; email: string }) => {
      profiles.push({
        id: u.user_id,
        full_name: u.full_name,
        email: u.email,
      })
    })
    setUsers(profiles)
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
      if (!PERMISSIONS[user.role]?.includes('watchlist')) {
        window.location.href = '/unauthorized'
        return
      }
      setUserRole(user.role)
      setAuthChecking(false)
      fetchEntries()
      fetchUsers()
      setupRealtime()
    }
    checkAuth()

    return () => {
      if (realtimeChannel.current) {
        supabase.removeChannel(realtimeChannel.current)
      }
    }
  }, [])

  const openCreateModal = () => {
    setEditingEntry(null)
    setFormData({
      full_name: '',
      email: '',
      phone: '',
      id_number: '',
      visitor_organization: '',
      vehicle_registration: '',
      status: 'Active',
      category: 'Security Alert',
      reason: '',
      notes: '',
    })
    setModalOpen(true)
  }

  const openEditModal = (entry: WatchlistEntry) => {
    setEditingEntry(entry)
    setFormData({
      full_name: entry.full_name,
      email: entry.email || '',
      phone: entry.phone || '',
      id_number: entry.id_number || '',
      visitor_organization: entry.visitor_organization || '',
      vehicle_registration: entry.vehicle_registration || '',
      status: entry.status,
      category: entry.category,
      reason: entry.reason || '',
      notes: entry.notes || '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    const user = await getCurrentUser()
    if (!user) return

    const payload = {
      full_name: formData.full_name,
      email: formData.email || null,
      phone: formData.phone || null,
      id_number: formData.id_number || null,
      visitor_organization: formData.visitor_organization || null,
      vehicle_registration: formData.vehicle_registration || null,
      status: formData.status,
      category: formData.category,
      reason: formData.reason || null,
      notes: formData.notes || null,
      added_by: user.id,
    }

    let error
    if (editingEntry) {
      const result = await supabase
        .from('visitor_watchlist')
        .update(payload)
        .eq('id', editingEntry.id)
      error = result.error
      if (!error) {
        showNotification('success', 'Watchlist entry updated')
      }
    } else {
      const result = await supabase
        .from('visitor_watchlist')
        .insert([payload])
      error = result.error
      if (!error) {
        showNotification('success', 'Watchlist entry created')
      }
    }

    if (error) {
      showNotification('error', error.message)
    }

    setSubmitting(false)
    setModalOpen(false)
  }

  const handleDelete = async (entry: WatchlistEntry) => {
    if (!confirm(`Delete watchlist entry for ${entry.full_name}?`)) return

    const { error } = await supabase
      .from('visitor_watchlist')
      .delete()
      .eq('id', entry.id)

    if (error) {
      showNotification('error', error.message)
    } else {
      showNotification('success', 'Watchlist entry deleted')
    }
  }

  const handleStatusToggle = async (entry: WatchlistEntry) => {
    const newStatus = entry.status === 'Active' ? 'Expired' : 'Active'
    const { error } = await supabase
      .from('visitor_watchlist')
      .update({ status: newStatus })
      .eq('id', entry.id)

    if (error) {
      showNotification('error', error.message)
    } else {
      showNotification('success', `Entry marked as ${newStatus}`)
    }
  }

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      entry.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (entry.phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (entry.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (entry.visitor_organization || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (entry.vehicle_registration || '').toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCategory = !categoryFilter || entry.category === categoryFilter
    const matchesStatus = !statusFilter || entry.status === statusFilter

    return matchesSearch && matchesCategory && matchesStatus
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
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-red-600" />
            <h1 className="text-2xl font-bold text-[#F5F5DC]">Visitor Watchlist</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchEntries}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            {userRole === 'Admin' && (
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Entry
              </button>
            )}
          </div>
        </div>

        {notification && (
          <div
            className={`rounded-lg p-4 text-sm ${
              notification.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {notification.message}
          </div>
        )}

        <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
          <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, phone, email, organization, vehicle..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg bg-[#10150D] text-black placeholder:text-[#9A9F87] focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Categories</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Status</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Name</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Category</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Organization</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Reason</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Added By</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Created</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87] w-28">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-[#4B5320]/10 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-[#F5F5DC]">{entry.full_name}</span>
                          {entry.phone && <span className="text-xs text-[#9A9F87]">{entry.phone}</span>}
                          {entry.email && <span className="text-xs text-[#9A9F87]">{entry.email}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${categoryColors[entry.category] || 'bg-gray-50 text-[#9A9F87]'}`}>
                          {categoryIcons[entry.category]}
                          {entry.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleStatusToggle(entry)}
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium cursor-pointer hover:opacity-80 ${statusColors[entry.status]}`}
                        >
                          {entry.status}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-[#9A9F87]">{entry.visitor_organization || '—'}</td>
                      <td className="px-4 py-3 text-[#9A9F87] max-w-xs truncate" title={entry.reason || ''}>
                        {entry.reason || '—'}
                      </td>
                      <td className="px-4 py-3 text-[#9A9F87]">
                        {entry.added_by}
                      </td>
                      <td className="px-4 py-3 text-[#9A9F87] whitespace-nowrap">
                         {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(entry)}
                            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4 text-[#9A9F87]" />
                          </button>
                          <button
                            onClick={() => handleStatusToggle(entry)}
                            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
                            title={entry.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                          >
                            <RefreshCw className="h-4 w-4 text-[#9A9F87]" />
                          </button>
                          {userRole === 'Admin' && (
                            <button
                              onClick={() => handleDelete(entry)}
                              className="p-1 rounded-md hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!loading && filteredEntries.length === 0 && (
              <div className="py-12 text-center">
                <ShieldAlert className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-[#9A9F87]">No watchlist entries found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-[#10150D] shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex-shrink-0 flex items-center justify-between border-b border-[rgba(85,107,47,0.35)] p-4">
              <h2 className="text-lg font-semibold text-[#F5F5DC]">
                {editingEntry ? 'Edit Watchlist Entry' : 'Add Watchlist Entry'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-md hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                    placeholder="Enter full name"
                    className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="Enter email"
                      className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="Enter phone"
                      className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">ID Number</label>
                    <input
                      type="text"
                      value={formData.id_number}
                      onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
                      placeholder="Enter ID number"
                      className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Vehicle Registration</label>
                    <input
                      type="text"
                      value={formData.vehicle_registration}
                      onChange={(e) => setFormData({ ...formData, vehicle_registration: e.target.value })}
                      placeholder="Enter registration"
                      className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Organization</label>
                  <input
                    type="text"
                    value={formData.visitor_organization}
                    onChange={(e) => setFormData({ ...formData, visitor_organization: e.target.value })}
                    placeholder="Enter organization"
                    className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as WatchlistEntry['category'] })}
                      className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {CATEGORY_OPTIONS.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#9A9F87] mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as 'Active' | 'Expired' })}
                      className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Reason</label>
                  <textarea
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="Enter reason"
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Enter notes"
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex-shrink-0 flex justify-end gap-3 p-4 border-t border-[rgba(85,107,47,0.35)]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingEntry ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


