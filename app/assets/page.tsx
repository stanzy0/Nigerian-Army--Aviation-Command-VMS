'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import { Loader2, Plus, Search, Filter, Download, Eye, QrCode, FileText, Printer, Trash2, ShieldAlert } from 'lucide-react'
import type { PropertyItem, PropertyStatus } from '@/lib/types/property'

export default function AssetsPage() {
  const [userRole, setUserRole] = useState<string>('')
  const [items, setItems] = useState<PropertyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'all'>('all')
  const [selectedItem, setSelectedItem] = useState<PropertyItem | null>(null)

  const fetchItems = async () => {
    setTimeout(() => setLoading(true), 0)
    try {
      const res = await fetch('/api/assets' + (statusFilter !== 'all' ? `?status=${statusFilter}` : '') + (search ? `?search=${search}` : ''))
      const json = await res.json()
      if (json.success) {
        setItems(json.data)
      }
    } catch (err) {
      console.error('Failed to fetch property items:', err)
    } finally {
      setTimeout(() => setLoading(false), 0)
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
      fetchItems()
    }
    checkAuth()
  }, [])

  useEffect(() => {
    setTimeout(() => fetchItems(), 0)
  }, [statusFilter, search])

  useEffect(() => {
    const channel = supabase
      .channel('property-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_items' }, () => fetchItems())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const handleExport = async (format: 'csv' | 'pdf' | 'excel') => {
    try {
      const res = await fetch(`/api/assets/export?format=${format}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `property-items.${format === 'excel' ? 'xlsx' : format}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Export error:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#F5F5DC]">Assets & Property</h1>
          <p className="text-[#9A9F87] mt-1">Track and manage visitor property items</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleExport('csv')} className="px-4 py-2 bg-gray-100 text-[#9A9F87] rounded-lg hover:bg-gray-200 flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button onClick={() => handleExport('excel')} className="px-4 py-2 bg-gray-100 text-[#9A9F87] rounded-lg hover:bg-gray-200 flex items-center gap-2">
            <Download className="h-4 w-4" />
            Excel
          </button>
          <button onClick={() => window.location.href = '/assets/register'} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Register Property
          </button>
        </div>
      </div>

      <div className="bg-[#10150D] rounded-xl shadow-sm border border-[rgba(85,107,47,0.35)] p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by property number, visitor, serial number, category, brand..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PropertyStatus | 'all')}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              <option value="Pending Entry">Pending Entry</option>
              <option value="Inside">Inside</option>
              <option value="Released">Released</option>
              <option value="Confiscated">Confiscated</option>
              <option value="Lost">Lost</option>
              <option value="Damaged">Damaged</option>
            </select>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12">
          <ShieldAlert className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-[#F5F5DC] mb-2">No property items found</h3>
          <p className="text-[#9A9F87] mb-4">Get started by registering a new property item</p>
          <button onClick={() => window.location.href = '/assets/register'} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Register Property
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-[#10150D] rounded-xl shadow-sm border border-[rgba(85,107,47,0.35)] p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedItem(item)}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-[#F5F5DC]">{item.name}</h3>
                  <p className="text-sm text-[#9A9F87]">#{item.property_number}</p>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  item.status === 'Inside' ? 'bg-green-100 text-green-800' :
                  item.status === 'Confiscated' ? 'bg-red-100 text-red-800' :
                  item.status === 'Released' ? 'bg-blue-100 text-blue-800' :
                  item.status === 'Lost' ? 'bg-orange-100 text-orange-800' :
                  item.status === 'Damaged' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-[#F5F5DC]'
                }`}>
                  {item.status}
                </span>
              </div>
              <div className="space-y-1 text-sm text-[#9A9F87]">
                <p><span className="font-medium">Category:</span> {item.category}</p>
                <p><span className="font-medium">Visitor:</span> {item.visitor?.full_name || 'Unknown'}</p>
                <p><span className="font-medium">Serial:</span> {item.serial_number || 'N/A'}</p>
                <p><span className="font-medium">Quantity:</span> {item.quantity}</p>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-[rgba(85,107,47,0.25)]">
                <button className="flex-1 px-3 py-1.5 bg-gray-100 text-[#9A9F87] rounded hover:bg-gray-200 flex items-center justify-center gap-1 text-sm">
                  <Eye className="h-4 w-4" />
                  View
                </button>
                <button className="flex-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 flex items-center justify-center gap-1 text-sm">
                  <QrCode className="h-4 w-4" />
                  QR
                </button>
                <button className="flex-1 px-3 py-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100 flex items-center justify-center gap-1 text-sm">
                  <Printer className="h-4 w-4" />
                  Print
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#10150D] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-[#F5F5DC]">{selectedItem.name}</h2>
                <button onClick={() => setSelectedItem(null)} className="text-[#9A9F87] hover:text-[#9A9F87]">
                  <span className="text-2xl">&times;</span>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-[#F5F5DC] mb-2">Property Details</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="font-medium">Property Number:</span> {selectedItem.property_number}</div>
                    <div><span className="font-medium">Category:</span> {selectedItem.category}</div>
                    <div><span className="font-medium">Brand:</span> {selectedItem.brand || 'N/A'}</div>
                    <div><span className="font-medium">Model:</span> {selectedItem.model || 'N/A'}</div>
                    <div><span className="font-medium">Serial Number:</span> {selectedItem.serial_number || 'N/A'}</div>
                    <div><span className="font-medium">Color:</span> {selectedItem.color || 'N/A'}</div>
                    <div><span className="font-medium">Quantity:</span> {selectedItem.quantity}</div>
                    <div><span className="font-medium">Condition:</span> {selectedItem.condition}</div>
                    <div><span className="font-medium">Status:</span> {selectedItem.status}</div>
                    <div><span className="font-medium">Remarks:</span> {selectedItem.remarks || 'N/A'}</div>
                  </div>
                </div>
                {selectedItem.photo_url && (
                  <div>
                    <h3 className="font-semibold text-[#F5F5DC] mb-2">Photo</h3>
                    <img src={selectedItem.photo_url} alt={selectedItem.name} className="w-full max-w-xs rounded-lg border border-[rgba(85,107,47,0.35)]" />
                  </div>
                )}
                <div className="flex gap-2 pt-4 border-t border-[rgba(85,107,47,0.35)]">
                  <button onClick={() => setSelectedItem(null)} className="flex-1 px-4 py-2 bg-gray-100 text-[#9A9F87] rounded-lg hover:bg-gray-200">
                    Close
                  </button>
                  <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2">
                    <Printer className="h-4 w-4" />
                    Print Receipt
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


