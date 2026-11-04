'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth-client'
import { Loader2, User, Phone, Building2, Mail, Save } from 'lucide-react'

interface EmployeeProfile {
  id: string
  full_name: string
  email: string
  phone: string | null
  department: string
  office_location: string
  office_extension: string | null
  availability: string | null
}

export default function HostProfilePage() {
  const [userRole, setUserRole] = useState<string>('')
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [profile, setProfile] = useState<EmployeeProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [form, setForm] = useState({
    phone: '',
    availability: '',
    office_extension: '',
  })

  const fetchProfile = async () => {
    if (!employeeId) return
    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, email, phone, department, office_location, office_extension, availability')
        .eq('id', employeeId)
        .single()

      if (error) {
        throw error
      }

      setProfile(data as EmployeeProfile)
      setForm({
        phone: data.phone || '',
        availability: data.availability || '',
        office_extension: data.office_extension || '',
      })
    } catch (err) {
      console.error('Error fetching profile:', err)
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
      setTimeout(() => fetchProfile(), 0)
    }
  }, [employeeId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const { error } = await supabase
        .from('employees')
        .update(form)
        .eq('id', employeeId)

      if (error) {
        throw error
      }

      setNotification({ type: 'success', message: 'Profile updated successfully' })
      fetchProfile()
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update profile' })
    } finally {
      setSaving(false)
    }
  }

  if (!employeeId && userRole !== 'Admin') {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-[#9A9F87]">No employee record found for your account.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F08]">
      <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="mb-6">
          <a href="/host" className="text-sm text-blue-600 hover:underline">
            ← Back to Host Portal
          </a>
        </div>

        <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
          <div className="p-6 border-b border-[rgba(85,107,47,0.35)]">
            <h1 className="text-2xl font-bold text-[#F5F5DC]">My Profile</h1>
            <p className="text-sm text-[#9A9F87]">View and edit your profile information</p>
          </div>

          {notification && (
            <div className={`mx-6 mt-6 rounded-lg p-4 text-sm ${notification.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {notification.message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Full Name</label>
                <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-[#F5F5DC]">{profile?.full_name || '—'}</span>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Email</label>
                <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-[#F5F5DC]">{profile?.email || '—'}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Department</label>
                <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-[#F5F5DC]">{profile?.department || '—'}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Office Location</label>
                <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-[#F5F5DC]">{profile?.office_location || '—'}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Phone</label>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Office Extension</label>
                <input
                  type="text"
                  value={form.office_extension}
                  onChange={(e) => setForm({ ...form, office_extension: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Availability</label>
                <textarea
                  value={form.availability}
                  onChange={(e) => setForm({ ...form, availability: e.target.value })}
                  rows={3}
                  placeholder="e.g., Mon-Fri 9am - 5pm"
                  className="w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}


