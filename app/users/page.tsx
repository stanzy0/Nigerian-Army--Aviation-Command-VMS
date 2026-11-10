'use client'

  import { useState, useEffect, useRef } from 'react'
  import { supabase } from '@/lib/supabase'
  import { getCurrentUser } from '@/lib/auth-client'
import type { UserWithRole, UserRole } from '@/lib/auth-client'

type UserWithHostAssignment = UserWithRole & { user_id: string; host_assignment?: { employee_id: string; full_name: string | null; position: string | null; department: string | null } | null }
  import { logAuditAction } from '@/lib/client/audit'
  import { getAuthHeaders } from '@/lib/client/api'
  import { getCiEmployees, getDirectors } from '@/lib/client/employees'
  import type { Employee } from '@/lib/types/employee'
  import SearchableCombobox from '@/components/ui/SearchableCombobox'
  import { Search, Plus, Edit, Trash2, X, Loader2, Users } from 'lucide-react'

const inputClasses = "w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
const searchInputClasses = "pl-9 pr-4 py-2 border border-gray-300 rounded-lg bg-[#10150D] text-black placeholder:text-[#9A9F87] focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
const selectClasses = "rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"

export default function UsersPage() {
  const [users, setUsers] = useState<UserWithHostAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [userRole, setUserRole] = useState<UserRole>('Receptionist')
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserWithHostAssignment | null>(null)
  const [formData, setFormData] = useState({ email: '', full_name: '', role: 'Receptionist' as UserRole, assigned_host_id: '' as string, assigned_director_id: '' as string })
  const [mustChangePassword, setMustChangePassword] = useState(true)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [credentials, setCredentials] = useState<{ name: string; email: string; role: string; tempPassword: string; assignedHost?: string } | null>(null)
  const [ciEmployees, setCiEmployees] = useState<Employee[]>([])
  const [ciEmployeesLoading, setCiEmployeesLoading] = useState(false)
  const [directors, setDirectors] = useState<Employee[]>([])
  const [directorsLoading, setDirectorsLoading] = useState(false)
  const [hostAssignments, setHostAssignments] = useState<Record<string, { full_name: string | null; position: string | null; department: string | null }>>({})
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const ciEmployeeOptions = ciEmployees.map(emp => ({
    value: emp.id,
    label: emp.full_name || 'Unnamed Employee',
    description: emp.position ? `${emp.position}${emp.department ? ' | ' + emp.department : ''}` : emp.department || undefined,
  }))

  const directorOptions = directors.map(emp => ({
    value: emp.id,
    label: emp.full_name || 'Unnamed Employee',
    description: emp.position ? `${emp.position}${emp.department ? ' | ' + emp.department : ''}` : emp.department || undefined,
  }))

  function showNotification(type: 'success' | 'error', message: string) {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }

  function setupRealtime() {
    if (realtimeChannel.current) {
      supabase.removeChannel(realtimeChannel.current)
    }

    realtimeChannel.current = supabase
      .channel('user-roles-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_roles' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setUsers(prev => [payload.new as UserWithHostAssignment, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setUsers(prev => prev.map(u => u.user_id === (payload.new as UserWithHostAssignment).user_id ? payload.new as UserWithHostAssignment : u))
          } else if (payload.eventType === 'DELETE') {
            setUsers(prev => prev.filter(u => u.user_id !== (payload.old as UserWithHostAssignment).user_id))
          }
        }
      )
      .subscribe()
  }

  async function fetchUsers() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        throw new Error(`Failed to fetch users: ${res.status}`)
      }
      const result = await res.json()
      if (result.success) {
        const usersData = result.data || []
        setUsers(usersData)
        const map: Record<string, { full_name: string | null; position: string | null; department: string | null }> = {}
        usersData.forEach((u: { user_id: string; host_assignment?: { full_name?: string; position?: string; department?: string } | null }) => {
          if (u.host_assignment) {
            map[u.user_id] = {
              full_name: u.host_assignment.full_name || null,
              position: u.host_assignment.position || null,
              department: u.host_assignment.department || null,
            }
          }
        })
        setHostAssignments(map)
      }
    } catch {
      showNotification('error', 'Failed to fetch users')
    }
    setLoading(false)
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

    if (formData.role === 'PA_TO_DIRECTOR' && !formData.assigned_director_id) {
      errors.assigned_director_id = 'Please assign a Director for this PA user'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCredentials(null)

    if (!validateForm()) {
      return
    }

    setSubmitting(true)

    try {
      if (editingUser) {
        const res = await fetch(`/api/users/${editingUser.user_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: formData.role,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          showNotification('error', data.error || 'Failed to update user')
        } else {
          logAuditAction('User Updated', 'user', editingUser.user_id, `${formData.email} updated with ${formData.role} role`)
          showNotification('success', 'User updated successfully')
          setModalOpen(false)
          setEditingUser(null)
          resetForm()
          fetchUsers()
        }
      } else {
        const res = await fetch('/api/users/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            full_name: formData.full_name,
            role: formData.role,
            must_change_password: mustChangePassword,
            assigned_host_id: formData.role === 'PA_TO_CI' ? formData.assigned_host_id || undefined : undefined,
            assigned_director_id: formData.role === 'PA_TO_DIRECTOR' ? formData.assigned_director_id || undefined : undefined,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          showNotification('error', data.error || 'Failed to create user')
        } else {
          const assignedHost = formData.role === 'PA_TO_CI'
            ? ciEmployees.find(e => e.id === formData.assigned_host_id)?.full_name
            : formData.role === 'PA_TO_DIRECTOR'
              ? directors.find(e => e.id === formData.assigned_director_id)?.full_name
              : undefined

          setCredentials({
            name: formData.full_name,
            email: formData.email,
            role: formData.role,
            tempPassword: data.temporary_password,
            assignedHost,
          })
          logAuditAction('User Created', 'user', data.user?.user_id || null, `Created user ${formData.email} with ${formData.role} role`)
          showNotification('success', 'User created successfully')
          fetchUsers()
        }
      }
    } catch {
      showNotification('error', 'An unexpected error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setFormData({ email: '', full_name: '', role: 'Receptionist', assigned_host_id: '', assigned_director_id: '' })
    setMustChangePassword(true)
    setValidationErrors({})
    setCredentials(null)
  }

  function handleEdit(user: UserWithHostAssignment) {
    const role = user.role
    if (!role) return
    setEditingUser(user)
    fetchCiEmployees()
    fetchDirectors()

    const loadAssignment = async () => {
      try {
        const assignedEmployeeId = user.host_assignment?.employee_id || ''

        if (role === 'PA_TO_CI') {
          setFormData({
            email: user.email,
            full_name: user.full_name || '',
            role,
            assigned_host_id: assignedEmployeeId,
            assigned_director_id: '',
          })
        } else if (role === 'PA_TO_DIRECTOR') {
          setFormData({
            email: user.email,
            full_name: user.full_name || '',
            role,
            assigned_host_id: '',
            assigned_director_id: assignedEmployeeId,
          })
        } else {
          setFormData({ email: user.email, full_name: user.full_name || '', role, assigned_host_id: '', assigned_director_id: '' })
        }
      } catch {
        setFormData({ email: user.email, full_name: user.full_name || '', role, assigned_host_id: '', assigned_director_id: '' })
      }
    }

    loadAssignment()
    setModalOpen(true)
  }

  async function handleDelete(userId: string) {
    if (!confirm('Are you sure you want to remove this user assignment?')) return

    const userToDelete = users.find((u) => u.user_id === userId)

    try {
      const res = await fetch('/api/users/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

       const data = await res.json()

       if (!res.ok) {
        showNotification('error', data.error || 'Failed to delete user')
      } else {
        logAuditAction('Role Removed', 'user', userId, `Role removed for ${userToDelete?.email}`)
        showNotification('success', 'User role removed successfully')
      }

       fetchUsers().then(() => {})
    } catch {
      showNotification('error', 'An unexpected error occurred. Please try again.')
    }
  }

  async function fetchCiEmployees() {
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

  async function fetchDirectors() {
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

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (!user || !user.role) {
        window.location.href = '/unauthorized'
        return
      }
      if (user.role !== 'Admin') {
        window.location.href = '/unauthorized'
        return
      }
      setAuthChecking(false)
      setUserRole(user.role)
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
              ← Back to Dashboard
            </a>
            <h1 className="text-2xl font-bold text-[#F5F5DC] mt-2">User Management</h1>
          </div>
          <button
            onClick={() => {
              setEditingUser(null)
              resetForm()
              setModalOpen(true)
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add User
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={searchInputClasses}
            />
          </div>
                    <select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      className={selectClasses}
                    >
                      <option value="all">All Roles</option>
                      <option value="Admin">Admin</option>
                      <option value="Receptionist">Receptionist</option>
                      <option value="Security">Security</option>
                      <option value="Host Employee">Host Employee</option>
                      <option value="PA_TO_DIRECTOR">PA to Director</option>
                      <option value="PA_TO_CI">PA to CI</option>
                    </select>
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
                       <th className="px-4 py-3 font-semibold text-[#9A9F87]">Email</th>
                       <th className="px-4 py-3 font-semibold text-[#9A9F87]">Role</th>
                       <th className="px-4 py-3 font-semibold text-[#9A9F87]">Assigned Host</th>
                       <th className="px-4 py-3 font-semibold text-[#9A9F87]">Created</th>
                       <th className="px-4 py-3 font-semibold text-[#9A9F87] w-24">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                     {filteredUsers.map((user) => {
                       const hostAssignment = hostAssignments[user.user_id]
                       const hostLabel = hostAssignment?.full_name
                         ? `${hostAssignment.full_name}${hostAssignment.position ? ` — ${hostAssignment.position}` : ''}`
                         : '—'
                       return (
                         <tr key={user.user_id} className="hover:bg-[#4B5320]/10 transition-colors">
                           <td className="px-4 py-3 font-medium text-[#F5F5DC]">
                             {user.full_name || (
                               <span className="flex items-center gap-2">
                                 <Users className="h-4 w-4 text-gray-400" />
                                 <span>No name set</span>
                               </span>
                             )}
                           </td>
                           <td className="px-4 py-3 text-[#9A9F87]">{user.email}</td>
                           <td className="px-4 py-3">
                             <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                               {user.role === 'PA_TO_CI' ? 'PA to CI' : user.role === 'PA_TO_DIRECTOR' ? 'PA to Director' : user.role}
                             </span>
                           </td>
                           <td className="px-4 py-3 text-[#9A9F87]">{hostLabel}</td>
                           <td className="px-4 py-3 text-[#9A9F87]">
                             {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                           </td>
                           <td className="px-4 py-3">
                             <div className="flex items-center gap-2">
                               <button
                                 onClick={() => handleEdit(user)}
                                 className="p-1 rounded-md hover:bg-gray-100 transition-colors"
                                 aria-label="Edit user"
                               >
                                 <Edit className="h-4 w-4 text-[#9A9F87]" />
                               </button>
                               <button
                                 onClick={() => handleDelete(user.user_id)}
                                 className="p-1 rounded-md hover:bg-red-50 transition-colors"
                                 aria-label="Delete user"
                               >
                                 <Trash2 className="h-4 w-4 text-red-600" />
                               </button>
                             </div>
                           </td>
                         </tr>
                        )
                      })}
                    </tbody>
               </table>
            )}
          </div>
          {!loading && filteredUsers.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-[#9A9F87]">No users found</p>
            </div>
          )}
        </div>

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-[#10150D] shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-[rgba(85,107,47,0.35)] p-4">
                <h2 className="text-lg font-semibold text-[#F5F5DC]">
                  {editingUser ? 'Edit User' : 'Add User'}
                </h2>
                <button
                  onClick={() => { setModalOpen(false); setCredentials(null) }}
                  className="p-1 rounded-md hover:bg-gray-100"
                  aria-label="Close modal"
                >
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
                        <p>Role: {credentials.role === 'PA_TO_CI' ? 'PA to CI' : credentials.role === 'PA_TO_DIRECTOR' ? 'PA to Director' : credentials.role}</p>
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
                          onClick={() => { navigator.clipboard.writeText(credentials.tempPassword); showNotification('success', 'Password copied to clipboard') }}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                        >
                          Copy Temporary Password
                        </button>
                        <button
                          type="button"
                          onClick={() => { setModalOpen(false); setCredentials(null) }}
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
                            <label className="block text-sm font-medium text-[#9A9F87] mb-1">Email <span className="text-red-500">*</span></label>
                            <input
                              type="email"
                              value={formData.email}
                              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                              required
                              placeholder="Enter email"
                              disabled={!!editingUser}
                              className={validationErrors.email ? 'border-red-300 ' + inputClasses : inputClasses}
                            />
                            {validationErrors.email && <p className="mt-1 text-xs text-red-600">{validationErrors.email}</p>}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-[#9A9F87] mb-1">Full Name <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              value={formData.full_name}
                              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                              required
                              placeholder="Enter full name"
                              className={validationErrors.full_name ? 'border-red-300 ' + inputClasses : inputClasses}
                            />
                            {validationErrors.full_name && <p className="mt-1 text-xs text-red-600">{validationErrors.full_name}</p>}
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs font-semibold text-[#9A9F87] uppercase tracking-wider mb-3">Role</h3>
                        <select
                          value={formData.role}
                          onChange={(e) => {
                            const newRole = e.target.value as UserRole
                            setFormData({ ...formData, role: newRole, assigned_host_id: '', assigned_director_id: '' })
                            if (newRole === 'PA_TO_CI' && ciEmployees.length === 0) {
                              fetchCiEmployees()
                            }
                            if (newRole === 'PA_TO_DIRECTOR' && directors.length === 0) {
                              fetchDirectors()
                            }
                          }}
                          className={validationErrors.role ? 'border-red-300 ' + selectClasses : selectClasses}
                        >
                          <option value="Admin">Admin</option>
                          <option value="Receptionist">Receptionist</option>
                          <option value="Security">Security</option>
                          <option value="Host Employee">Host Employee</option>
                          <option value="PA_TO_DIRECTOR">PA to Director</option>
                          <option value="PA_TO_CI">PA to CI</option>
                        </select>
                        {validationErrors.role && <p className="mt-1 text-xs text-red-600">{validationErrors.role}</p>}
                      </div>

                      {(formData.role === 'PA_TO_CI' || formData.role === 'PA_TO_DIRECTOR') && (
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
                  <div className="flex justify-end gap-3 p-4 border-t border-[rgba(85,107,47,0.35)]">
                    <button
                      type="button"
                      onClick={() => { setModalOpen(false); setCredentials(null) }}
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
                      {editingUser ? 'Update User' : 'Create User'}
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}



