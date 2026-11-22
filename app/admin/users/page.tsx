'use client'

  import { useState, useEffect } from 'react'
  import { supabase } from '@/lib/supabase'
  import { getCurrentUser } from '@/lib/auth-client'
  import { AdminUser } from '@/lib/types/admin'
  import type { Employee } from '@/lib/types/employee'
  import { getAuthHeaders } from '@/lib/client/api'
  import { getCiEmployees, getDirectors, getCommanders } from '@/lib/client/employees'
  import SearchableCombobox from '@/components/ui/SearchableCombobox'
  import { Loader2, Plus, Edit, Trash2, X, Save, UserCheck, UserX, Key, LogOut, Users, Search, RefreshCw } from 'lucide-react'

const ROLE_OPTIONS = [
  { value: 'Admin', label: 'Admin' },
  { value: 'Receptionist', label: 'Receptionist' },
  { value: 'Security', label: 'Security' },
  { value: 'Host Employee', label: 'Host Employee' },
  { value: 'PA_TO_DIRECTOR', label: 'PA to Director' },
  { value: 'PA_TO_COMMANDER', label: 'PA to Commander' },
  { value: 'PA_TO_CI', label: 'PA to CI' },
]

const getRoleLabel = (role: string) => ROLE_OPTIONS.find(r => r.value === role)?.label || role

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'Receptionist',
    assigned_host_id: '',
    assigned_director_id: '',
  })
  const [mustChangePassword, setMustChangePassword] = useState(true)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [credentials, setCredentials] = useState<{ name: string; email: string; role: string; tempPassword: string; assignedHost?: string } | null>(null)
  const [resetPasswordUser, setResetPasswordUser] = useState<AdminUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const [ciEmployees, setCiEmployees] = useState<Employee[]>([])
  const [ciEmployeesLoading, setCiEmployeesLoading] = useState(false)
  const [directors, setDirectors] = useState<Employee[]>([])
  const [directorsLoading, setDirectorsLoading] = useState(false)
  const [commanders, setCommanders] = useState<Employee[]>([])
  const [commandersLoading, setCommandersLoading] = useState(false)

  const ciEmployeeOptions = ciEmployees.map(emp => ({
    value: emp.id,
    label: emp.full_name || 'Unnamed Employee',
    description: emp.position ? emp.position : undefined,
  }))

  const directorOptions = directors.map(emp => ({
    value: emp.id,
    label: emp.full_name || 'Unnamed Employee',
    description: emp.position ? emp.position : undefined,
  }))

  const commanderOptions = commanders.map(emp => ({
    value: emp.id,
    label: emp.full_name || 'Unnamed Employee',
    description: emp.position ? emp.position : undefined,
  }))

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }

      const res = await fetch('/api/admin/users', { headers })
      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Failed to fetch users')
      }

      setUsers(result.data)
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load users' })
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
      if (user.role !== 'Admin') {
        window.location.href = '/unauthorized'
        return
      }
      fetchUsers()
    }
    checkAuth()
  }, [])

  const handleOpenCreate = () => {
    setEditingUser(null)
    setFormData({ email: '', full_name: '', role: 'Receptionist', assigned_host_id: '', assigned_director_id: '' })
    setMustChangePassword(true)
    setValidationErrors({})
    setCredentials(null)
    setModalOpen(true)
  }

  const handleOpenEdit = (user: AdminUser) => {
    setEditingUser(user)
    setFormData({
      email: user.email,
      full_name: user.full_name || '',
      role: user.role,
      assigned_host_id: user.host_assignment?.employee_id || '',
      assigned_director_id: '',
    })
    if (user.role === 'PA_TO_CI') {
      fetchCiEmployees()
    }
    if (user.role === 'PA_TO_DIRECTOR') {
      fetchDirectors()
    }
    if (user.role === 'PA_TO_COMMANDER') {
      fetchCommanders()
    }
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setEditingUser(null)
    setFormData({ email: '', full_name: '', role: 'Receptionist', assigned_host_id: '', assigned_director_id: '' })
    setValidationErrors({})
    setCredentials(null)
  }

  const fetchDirectors = async () => {
    setDirectorsLoading(true)
    try {
      const directorList = await getDirectors()
      setDirectors(directorList)
    } catch (err) {
      console.error('Failed to fetch Director employees:', err)
    } finally {
      setDirectorsLoading(false)
    }
  }

  const fetchCommanders = async () => {
    setCommandersLoading(true)
    try {
      const commanderList = await getCommanders()
      setCommanders(commanderList)
    } catch (err) {
      console.error('Failed to fetch Commander employees:', err)
    } finally {
      setCommandersLoading(false)
    }
  }

  const fetchCiEmployees = async () => {
    setCiEmployeesLoading(true)
    try {
      const employees = await getCiEmployees()
      setCiEmployees(employees)
    } catch (err) {
      console.error('Failed to fetch CI employees:', err)
    } finally {
      setCiEmployeesLoading(false)
    }
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {}

    if (!formData.email.trim()) {
      errors.email = 'Email is required'
    }

    if (!formData.full_name.trim()) {
      errors.full_name = 'Full Name is required'
    }

    if (!formData.role) {
      errors.role = 'Role is required'
    }

    if (formData.role === 'PA_TO_CI' && !formData.assigned_host_id) {
      errors.assigned_host_id = 'Please assign a CI for this PA user'
    }

    if ((formData.role === 'PA_TO_DIRECTOR' || formData.role === 'PA_TO_COMMANDER') && !formData.assigned_director_id) {
      errors.assigned_director_id = 'Please assign a Commander for this PA user'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCredentials(null)

    if (!validateForm()) {
      return
    }

    setSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }

      const url = '/api/admin/users'
      const method = editingUser ? 'PUT' : 'POST'

      const body = editingUser
        ? {
            user_id: editingUser.user_id,
            email: formData.email,
            full_name: formData.full_name,
            role: formData.role,
            assigned_host_id: formData.role === 'PA_TO_CI' ? (formData.assigned_host_id || null) : null,
            assigned_director_id: (formData.role === 'PA_TO_DIRECTOR' || formData.role === 'PA_TO_COMMANDER') ? (formData.assigned_director_id || null) : null,
          }
        : {
            email: formData.email,
            full_name: formData.full_name,
            role: formData.role,
            must_change_password: mustChangePassword,
            assigned_host_id: formData.role === 'PA_TO_CI' ? formData.assigned_host_id : undefined,
            assigned_director_id: (formData.role === 'PA_TO_DIRECTOR' || formData.role === 'PA_TO_COMMANDER') ? formData.assigned_director_id : undefined,
          }

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Failed to save user')
      }

      const assignedHost = formData.role === 'PA_TO_CI'
        ? ciEmployees.find(e => e.id === formData.assigned_host_id)?.full_name
        : (formData.role === 'PA_TO_DIRECTOR' || formData.role === 'PA_TO_COMMANDER')
          ? directors.find(e => e.id === formData.assigned_director_id)?.full_name
          : undefined

      if (!editingUser && result.data?.temporary_password) {
        setCredentials({
          name: formData.full_name,
          email: formData.email,
          role: formData.role,
          tempPassword: result.data.temporary_password,
          assignedHost,
        })
      }

      setNotification({ type: 'success', message: editingUser ? 'User updated successfully' : 'User created successfully' })
      fetchUsers()
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save user' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleBan = async (user: AdminUser) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }

      const newBanDuration = user.ban_duration === '876000h' ? null : '876000h'

      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ user_id: user.user_id, ban_duration: newBanDuration }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Failed to update user status')
      }

      setNotification({ type: 'success', message: newBanDuration ? 'User disabled successfully' : 'User enabled successfully' })
      fetchUsers()
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update user status' })
    }
  }

  const handleDelete = async (user: AdminUser) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }

      const res = await fetch(`/api/admin/users?user_id=${user.user_id}`, {
        method: 'DELETE',
        headers,
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Failed to delete user')
      }

      setNotification({ type: 'success', message: 'User deleted successfully' })
      fetchUsers()
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete user' })
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetPasswordUser) return

    setResetSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }

      const res = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: resetPasswordUser.user_id, new_password: newPassword }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Failed to reset password')
      }

      setNotification({ type: 'success', message: 'Password reset successfully' })
      setResetPasswordUser(null)
      setNewPassword('')
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Failed to reset password' })
    } finally {
      setResetSubmitting(false)
    }
  }

  const handleForceLogout = async (user: AdminUser) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }

      const res = await fetch('/api/admin/users/force-logout', {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: user.user_id }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Failed to force logout')
      }

      setNotification({ type: 'success', message: 'User logged out successfully' })
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Failed to force logout' })
    }
  }

  const filteredUsers = users.filter((user) => {
    const term = searchTerm.toLowerCase()
    return (
      user.email.toLowerCase().includes(term) ||
      (user.full_name && user.full_name.toLowerCase().includes(term))
    )
  })

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-[#0B0F08]">
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="mb-6">
          <a href="/admin" className="text-sm text-blue-600 hover:underline">
            ← Back to Admin Portal
          </a>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F5DC]">User Management</h1>
            <p className="text-sm text-[#9A9F87]">Create and manage system users</p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create User
          </button>
        </div>

        {notification && (
          <div className={`rounded-lg p-4 text-sm ${notification.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {notification.message}
          </div>
        )}

        <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
          <div className="p-4 border-b border-[rgba(85,107,47,0.35)] flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-[#10150D] pl-9 pr-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={fetchUsers}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Name</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Email</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Role</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Assigned Host</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Department</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Last Login</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Created</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-[#4B5320]/10 transition-colors">
                    <td className="px-4 py-3 font-medium text-[#F5F5DC]">{user.full_name || '—'}</td>
                    <td className="px-4 py-3 text-[#9A9F87]">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#9A9F87]">
                      {user.host_assignment
                        ? `${user.host_assignment.full_name || 'Unnamed'} — ${user.host_assignment.position || ''}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-[#9A9F87]">{user.employee?.department || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${user.ban_duration === '876000h' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                        {user.ban_duration === '876000h' ? 'Disabled' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#9A9F87]">—</td>
                    <td className="px-4 py-3 text-[#9A9F87]">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="p-1 rounded-md hover:bg-gray-100"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4 text-[#9A9F87]" />
                        </button>
                        <button
                          onClick={() => handleToggleBan(user)}
                          className="p-1 rounded-md hover:bg-gray-100"
                          title={user.ban_duration === '876000h' ? 'Enable' : 'Disable'}
                        >
                          {user.ban_duration === '876000h' ? <UserCheck className="h-4 w-4 text-green-600" /> : <UserX className="h-4 w-4 text-red-600" />}
                        </button>
                        <button
                          onClick={() => setResetPasswordUser(user)}
                          className="p-1 rounded-md hover:bg-gray-100"
                          title="Reset Password"
                        >
                          <Key className="h-4 w-4 text-[#9A9F87]" />
                        </button>
                        <button
                          onClick={() => handleForceLogout(user)}
                          className="p-1 rounded-md hover:bg-gray-100"
                          title="Force Logout"
                        >
                          <LogOut className="h-4 w-4 text-[#9A9F87]" />
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          className="p-1 rounded-md hover:bg-gray-100 text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && !loading && (
            <div className="p-12 text-center">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-[#9A9F87]">
                {searchTerm ? 'No users match your search' : 'No users found'}
              </p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-[400px] rounded-xl bg-[#10150D] shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[rgba(85,107,47,0.35)] p-4">
              <h2 className="text-lg font-semibold text-[#F5F5DC]">{editingUser ? 'Edit User' : 'Create User'}</h2>
              <button onClick={handleCloseModal} className="p-1 rounded-md hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
             <form onSubmit={handleSubmit}>
               <div className="p-4 space-y-5">
                 {credentials ? (
                   <div className="rounded-lg bg-green-50 p-4 space-y-3">
                     <div className="flex items-center gap-2">
                       <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center">
                         <svg className="h-3 w-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                       </div>
                       <p className="text-sm font-medium text-green-800">User Account Created</p>
                     </div>
                     <div className="ml-7 text-xs text-green-700 space-y-1">
                       <p>Name: {credentials.name}</p>
                       <p>Email: {credentials.email}</p>
                        <p>Role: {credentials.role === 'PA_TO_CI' ? 'PA to CI' : credentials.role === 'PA_TO_DIRECTOR' ? 'PA to Director' : credentials.role === 'PA_TO_COMMANDER' ? 'PA to Commander' : credentials.role}</p>
                       {credentials.assignedHost && <p>Assigned Host: {credentials.assignedHost}</p>}
                       <div className="mt-2 pt-2 border-t border-green-200">
                         <p className="font-medium text-green-800">Temporary Password:</p>
                         <p className="font-mono font-bold text-green-900 mt-1">{credentials.tempPassword}</p>
                       </div>
                       <p className="mt-2 text-green-600">Give these temporary credentials to the user. They must change the password on first login.</p>
                     </div>
                     <div className="ml-7 flex gap-2 mt-3">
                       <button
                         type="button"
                         onClick={() => { navigator.clipboard.writeText(credentials.tempPassword); setNotification({ type: 'success', message: 'Password copied to clipboard' }) }}
                         className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                       >
                         Copy Temporary Password
                       </button>
                       <button
                         type="button"
                         onClick={handleCloseModal}
                         className="rounded-lg border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                       >
                         Done
                       </button>
                     </div>
                   </div>
                 ) : (
                   <>
                     <div>
                       <h3 className="text-xs font-semibold text-[#9A9F87] uppercase tracking-wider mb-3">Account Information</h3>
                       <div className="space-y-3">
                         <div>
                           <label className="block text-sm font-medium text-[#9A9F87] mb-1">Full Name <span className="text-red-500">*</span></label>
                           <input
                             type="text"
                             required
                             value={formData.full_name}
                             onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                             className={validationErrors.full_name ? 'border-red-300 w-full rounded-lg border bg-[#10150D] px-3 py-2 text-sm text-black' : 'w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-sm text-black'}
                           />
                           {validationErrors.full_name && <p className="mt-1 text-xs text-red-600">{validationErrors.full_name}</p>}
                         </div>
                         <div>
                           <label className="block text-sm font-medium text-[#9A9F87] mb-1">Email <span className="text-red-500">*</span></label>
                           <input
                             type="email"
                             required
                             value={formData.email}
                             onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                             className={validationErrors.email ? 'border-red-300 w-full rounded-lg border bg-[#10150D] px-3 py-2 text-sm text-black' : 'w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-sm text-black'}
                           />
                           {validationErrors.email && <p className="mt-1 text-xs text-red-600">{validationErrors.email}</p>}
                         </div>
                       </div>
                     </div>

                     <div>
                       <h3 className="text-xs font-semibold text-[#9A9F87] uppercase tracking-wider mb-3">Role</h3>
                       <select
                         required
                         value={formData.role}
                         onChange={(e) => {
                           const newRole = e.target.value
                           setFormData({ ...formData, role: newRole, assigned_host_id: '', assigned_director_id: '' })
                            if (newRole === 'PA_TO_CI' && ciEmployees.length === 0) {
                              fetchCiEmployees()
                            }
                            if ((newRole === 'PA_TO_DIRECTOR' || newRole === 'PA_TO_COMMANDER') && directors.length === 0) {
                              fetchDirectors()
                            }
                         }}
                         className={validationErrors.role ? 'border-red-300 w-full rounded-lg border bg-[#10150D] px-3 py-2 text-sm text-black' : 'w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-sm text-black'}
                       >
                         {ROLE_OPTIONS.map(({ value, label }) => (
                           <option key={value} value={value}>{label}</option>
                         ))}
                       </select>
                       {validationErrors.role && <p className="mt-1 text-xs text-red-600">{validationErrors.role}</p>}
                     </div>

                      {(formData.role === 'PA_TO_CI' || formData.role === 'PA_TO_DIRECTOR' || formData.role === 'PA_TO_COMMANDER') && (
                        <div>
                          <h3 className="text-xs font-semibold text-[#9A9F87] uppercase tracking-wider mb-3">Host Assignment</h3>
                          {formData.role === 'PA_TO_CI' && (
                            <div>
                              <label className="block text-sm font-medium text-[#9A9F87] mb-1">Assigned CI <span className="text-red-500">*</span></label>
                              <SearchableCombobox
                                options={ciEmployeeOptions}
                                value={formData.assigned_host_id}
                                onChange={(val) => setFormData({ ...formData, assigned_host_id: val })}
                                placeholder="Search and select a CI..."
                                searchPlaceholder="Search CIs..."
                                noResultsText="No CI found"
                                loading={ciEmployeesLoading}
                                required
                                className="w-full"
                              />
                              {validationErrors.assigned_host_id && <p className="mt-1 text-xs text-red-600">{validationErrors.assigned_host_id}</p>}
                            </div>
                          )}
                          {formData.role === 'PA_TO_DIRECTOR' && (
                            <div>
                              <label className="block text-sm font-medium text-[#9A9F87] mb-1">Assigned Director <span className="text-red-500">*</span></label>
                              <SearchableCombobox
                                options={directorOptions}
                                value={formData.assigned_director_id}
                                onChange={(val) => setFormData({ ...formData, assigned_director_id: val })}
                                placeholder="Search and select a Director..."
                                searchPlaceholder="Search Directors..."
                                noResultsText="No Director found"
                                loading={directorsLoading}
                                required
                                className="w-full"
                              />
                              {validationErrors.assigned_director_id && <p className="mt-1 text-xs text-red-600">{validationErrors.assigned_director_id}</p>}
                            </div>
                          )}
                          {formData.role === 'PA_TO_COMMANDER' && (
                            <div>
                              <label className="block text-sm font-medium text-[#9A9F87] mb-1">Assigned Commander <span className="text-red-500">*</span></label>
                              <SearchableCombobox
                                options={commanderOptions}
                                value={formData.assigned_director_id}
                                onChange={(val) => setFormData({ ...formData, assigned_director_id: val })}
                                placeholder="Search and select a Commander..."
                                searchPlaceholder="Search Commanders..."
                                noResultsText="No Commander found"
                                loading={commandersLoading}
                                required
                                className="w-full"
                              />
                              {validationErrors.assigned_director_id && <p className="mt-1 text-xs text-red-600">{validationErrors.assigned_director_id}</p>}
                            </div>
                          )}
                        </div>
                      )}

                     {!editingUser && (
                       <div>
                         <h3 className="text-xs font-semibold text-[#9A9F87] uppercase tracking-wider mb-3">Account Password</h3>
                         <div className="space-y-3">
                           <div className="flex items-center gap-2">
                             <input
                               id="mustChangePassword"
                               type="checkbox"
                               checked={mustChangePassword}
                               onChange={(e) => setMustChangePassword(e.target.checked)}
                               className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                             />
                             <label htmlFor="mustChangePassword" className="text-sm text-[#9A9F87]">
                               Require user to change password on first login
                             </label>
                           </div>
                           <p className="text-xs text-[#9A9F87]">A secure temporary password will be generated automatically.</p>
                         </div>
                       </div>
                     )}
                   </>
                 )}
               </div>
               {!credentials && (
                 <div className="border-t border-[rgba(85,107,47,0.35)] p-4 flex justify-end gap-2">
                   <button type="button" onClick={handleCloseModal} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10">Cancel</button>
                   <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                     {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                     {editingUser ? 'Update User' : 'Create User'}
                   </button>
                 </div>
               )}
             </form>
          </div>
        </div>
      )}

      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-[400px] rounded-xl bg-[#10150D] shadow-xl">
            <div className="flex items-center justify-between border-b border-[rgba(85,107,47,0.35)] p-4">
              <h2 className="text-lg font-semibold text-[#F5F5DC]">Reset Password</h2>
              <button onClick={() => { setResetPasswordUser(null); setNewPassword('') }} className="p-1 rounded-md hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">New Password *</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-sm text-black"
                />
              </div>
              <div className="border-t border-[rgba(85,107,47,0.35)] pt-4 flex justify-end gap-2">
                <button type="button" onClick={() => { setResetPasswordUser(null); setNewPassword('') }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10">Cancel</button>
                <button type="submit" disabled={resetSubmitting} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {resetSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Reset Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


