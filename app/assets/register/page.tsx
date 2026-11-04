'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import { Loader2, Plus, X } from 'lucide-react'
import type { PropertyFormData } from '@/lib/types/property'
import { PROPERTY_CATEGORIES, PROPERTY_CONDITIONS } from '@/lib/types/property'

export default function RegisterPropertyPage() {
  const [userRole, setUserRole] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [visits, setVisits] = useState<any[]>([])
  const [selectedVisit, setSelectedVisit] = useState<any>(null)
  const [formData, setFormData] = useState<PropertyFormData>({
    visit_id: '',
    visitor_id: '',
    employee_id: '',
    name: '',
    category: 'Laptop',
    brand: '',
    model: '',
    serial_number: '',
    color: '',
    quantity: 1,
    condition: 'Good',
    photo_url: '',
    remarks: '',
  })

  const fetchVisits = async () => {
    try {
      const res = await fetch('/api/visits')
      const json = await res.json()
      if (json.success) {
        setVisits(json.data.filter((v: any) => v.status === 'checked_in'))
      }
    } catch (err) {
      console.error('Failed to fetch visits:', err)
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
      fetchVisits()
    }
    checkAuth()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const json = await res.json()
      if (json.success) {
        alert('Property item registered successfully')
        window.location.href = '/assets'
      } else {
        alert(json.error || 'Failed to register property item')
      }
    } catch (err) {
      console.error('Register property error:', err)
      alert('Failed to register property item')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#F5F5DC]">Register Property</h1>
        <p className="text-[#9A9F87] mt-1">Register a new property item for a visitor</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#10150D] rounded-xl shadow-sm border border-[rgba(85,107,47,0.35)] p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-[#9A9F87] mb-2">Select Visit *</label>
          <select
            value={formData.visit_id}
            onChange={(e) => {
              const visit = visits.find(v => v.id === e.target.value)
              setFormData({
                ...formData,
                visit_id: e.target.value,
                visitor_id: visit?.visitor_id || '',
                employee_id: visit?.employee_id || '',
              })
              setSelectedVisit(visit)
            }}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select a visit</option>
            {visits.map((visit) => (
              <option key={visit.id} value={visit.id}>
                {visit.visitor?.full_name} - {visit.employee?.full_name} ({new Date(visit.check_in_time).toLocaleString()})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#9A9F87] mb-2">Item Name *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#9A9F87] mb-2">Category *</label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {PROPERTY_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#9A9F87] mb-2">Brand</label>
            <input
              type="text"
              value={formData.brand}
              onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9A9F87] mb-2">Model</label>
            <input
              type="text"
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#9A9F87] mb-2">Serial Number</label>
            <input
              type="text"
              value={formData.serial_number}
              onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9A9F87] mb-2">Color</label>
            <input
              type="text"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#9A9F87] mb-2">Quantity *</label>
            <input
              type="number"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
              required
              min="1"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9A9F87] mb-2">Condition *</label>
            <select
              value={formData.condition}
              onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {PROPERTY_CONDITIONS.map((cond) => (
                <option key={cond} value={cond}>{cond}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#9A9F87] mb-2">Photo URL</label>
          <input
            type="url"
            value={formData.photo_url}
            onChange={(e) => setFormData({ ...formData, photo_url: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#9A9F87] mb-2">Remarks</label>
          <textarea
            value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button type="submit" disabled={loading} className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Register Property
          </button>
          <button type="button" onClick={() => window.location.href = '/assets'} className="px-6 py-2 bg-gray-100 text-[#9A9F87] rounded-lg hover:bg-gray-200">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

