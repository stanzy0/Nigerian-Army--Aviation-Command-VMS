'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import { Loader2, Search, Download, FileSpreadsheet, Printer, Car, Plus, Minus, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { logAuditAction } from '@/lib/client/audit'
import { QRCodeSVG } from 'qrcode.react'

interface Vehicle {
  id: string
  visitor_id: string
  registration_number: string
  vehicle_type: string
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_color: string | null
  parking_slot: string | null
  gate_pass_number: string
  driver_name: string | null
  driver_phone: string | null
  notes: string | null
  is_blacklisted: boolean
  blacklist_reason: string | null
  blacklist_date: string | null
  blacklist_officer: string | null
  created_at: string
  visitor: {
    full_name: string
    visitor_organization: string | null
    photo_url: string | null
  } | null
}

type VehicleType = 'Car' | 'SUV' | 'Truck' | 'Bus' | 'Motorcycle' | 'Military Vehicle' | 'Other'

const inputClasses = "w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
const selectClasses = "w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [showGatePass, setShowGatePass] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [formData, setFormData] = useState({
    visitor_id: '',
    registration_number: '',
    vehicle_type: '' as VehicleType,
    vehicle_make: '',
    vehicle_model: '',
    vehicle_color: '',
    parking_slot: '',
    driver_name: '',
    driver_phone: '',
    notes: '',
  })
  const [visitors, setVisitors] = useState<Array<{ id: string; full_name: string }>>([])
  const [submitting, setSubmitting] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [currentTime, setCurrentTime] = useState<Date>(new Date())
  const [vehicleBlacklisted, setVehicleBlacklisted] = useState(false)
  const [blacklistReason, setBlacklistReason] = useState('')
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)

  function showNotification(type: 'success' | 'error', message: string) {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }

  const fetchVehicles = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vehicles')
      .select(`
        *,
        visitor:visitors(full_name, visitor_organization, photo_url)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      showNotification('error', error.message)
    } else {
      const vehiclesWithVisitorInfo = (data || []).map((v) => ({
        ...v,
        visitor: v.visitor || null
      }))
      setVehicles(vehiclesWithVisitorInfo as unknown as Vehicle[])
    }
    setLoading(false)
  }, [])

  const fetchVisitors = useCallback(async () => {
    const { data } = await supabase.from('visitors').select('id, full_name').order('full_name')
    setVisitors(data || [])
  }, [])

  async function checkVehicleBlacklist(regNumber: string) {
    const { data } = await supabase
      .from('vehicle_blacklist')
      .select('reason')
      .eq('registration_number', regNumber)
      .single()
    
    if (data) {
      setVehicleBlacklisted(true)
      setBlacklistReason(data.reason || '')
    } else {
      setVehicleBlacklisted(false)
      setBlacklistReason('')
    }
  }

  const setupRealtime = useCallback(() => {
    if (realtimeChannel.current) {
      supabase.removeChannel(realtimeChannel.current)
    }

    realtimeChannel.current = supabase
      .channel('vehicles-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicles' },
        () => fetchVehicles()
      )
      .subscribe()
  }, [fetchVehicles])

  async function handleCheckIn(vehicleId: string) {
    const { error } = await supabase
      .from('vehicles')
      .update({ parking_slot: 'Gate Entry' })
      .eq('id', vehicleId)

    if (error) {
      showNotification('error', error.message)
    } else {
      logAuditAction('Vehicle Checked In', 'vehicle', vehicleId, 'Vehicle checked in at gate').catch(() => {})
      showNotification('success', 'Vehicle checked in')
    }
  }

  async function handleCheckOut(vehicleId: string) {
    const { error } = await supabase
      .from('vehicles')
      .update({ parking_slot: null })
      .eq('id', vehicleId)

    if (error) {
      showNotification('error', error.message)
    } else {
      logAuditAction('Vehicle Checked Out', 'vehicle', vehicleId, 'Vehicle checked out').catch(() => {})
      showNotification('success', 'Vehicle checked out')
    }
  }

  async function handleBlacklist(vehicleId: string) {
    if (!confirm('Are you sure you want to blacklist this vehicle?')) return

    const { error } = await supabase
      .from('vehicles')
      .update({ is_blacklisted: true })
      .eq('id', vehicleId)

    if (error) {
      showNotification('error', error.message)
    } else {
      logAuditAction('Vehicle Blacklisted', 'vehicle', vehicleId, 'Vehicle blacklisted').catch(() => {})
      showNotification('success', 'Vehicle blacklisted')
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const today = new Date()
    const year = today.getFullYear()
    const { count } = await supabase.from('vehicles').select('id', { count: 'exact' })
    const gatePassNum = `GP-${year}-${String((count || 0) + 1).padStart(6, '0')}`

    const { error } = await supabase.from('vehicles').insert({
      visitor_id: formData.visitor_id,
      registration_number: formData.registration_number,
      vehicle_type: formData.vehicle_type,
      vehicle_make: formData.vehicle_make || null,
      vehicle_model: formData.vehicle_model || null,
      vehicle_color: formData.vehicle_color || null,
      parking_slot: formData.parking_slot || null,
      gate_pass_number: gatePassNum,
      driver_name: formData.driver_name || null,
      driver_phone: formData.driver_phone || null,
      notes: formData.notes || null,
    })

    if (error) {
      showNotification('error', error.message)
    } else {
      logAuditAction('Vehicle Registered', 'vehicle', null, `Registered ${formData.registration_number}`).catch(() => {})
      showNotification('success', 'Vehicle registered')
      setShowRegisterForm(false)
      setFormData({
        visitor_id: '',
        registration_number: '',
        vehicle_type: '' as VehicleType,
        vehicle_make: '',
        vehicle_model: '',
        vehicle_color: '',
        parking_slot: '',
        driver_name: '',
        driver_phone: '',
        notes: '',
      })
      setVehicleBlacklisted(false)
    }
    setSubmitting(false)
  }

  function getTimeOnSite(createdAt: string) {
    const diff = currentTime.getTime() - new Date(createdAt).getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    return hours
  }

  function getRowHighlight(vehicle: Vehicle) {
    if (vehicle.is_blacklisted) return 'bg-red-200'
    if (getTimeOnSite(vehicle.created_at) > 4) return 'bg-amber-100'
    return ''
  }

  const filteredVehicles = vehicles.filter(v => 
    v.registration_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.driver_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.visitor?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.parking_slot || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.gate_pass_number.toLowerCase().includes(searchTerm.toLowerCase())
  )

  function exportPDF() {
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text('Vehicle Report', 14, 22)
    doc.setFontSize(11)
    doc.text(`Generated: ${currentTime.toLocaleString()}`, 14, 32)

    autoTable(doc, {
      startY: 50,
      head: [['Reg #', 'Type', 'Visitor', 'Organization', 'Slot', 'Gate Pass', 'Status']],
      body: filteredVehicles.map(v => [
        v.registration_number,
        v.vehicle_type,
        v.visitor?.full_name || '—',
        v.visitor?.visitor_organization || '—',
        v.parking_slot || '—',
        v.gate_pass_number,
        v.is_blacklisted ? 'Blacklisted' : 'Active'
      ])
    })

    doc.save('vehicle-report.pdf')
    logAuditAction('Vehicle Report Exported PDF', 'report', null, `Exported ${filteredVehicles.length} vehicles`).catch(() => {})
  }

  function exportExcel() {
    const worksheet = XLSX.utils.json_to_sheet(
      filteredVehicles.map(v => ({
        'Registration': v.registration_number,
        'Type': v.vehicle_type,
        'Make': v.vehicle_make || '—',
        'Model': v.vehicle_model || '—',
        'Color': v.vehicle_color || '—',
        'Driver': v.driver_name || '—',
        'Visitor': v.visitor?.full_name || '—',
        'Organization': v.visitor?.visitor_organization || '—',
        'Slot': v.parking_slot || '—',
        'Gate Pass': v.gate_pass_number,
        'Status': v.is_blacklisted ? 'Blacklisted' : 'Active'
      }))
    )
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehicles')
    XLSX.writeFile(workbook, 'vehicle-report.xlsx')
    logAuditAction('Vehicle Report Exported Excel', 'report', null, `Exported ${filteredVehicles.length} vehicles`).catch(() => {})
  }

  function handlePrintGatePass(vehicle: Vehicle) {
    setSelectedVehicle(vehicle)
    setShowGatePass(true)
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
      if (!PERMISSIONS[user.role]?.includes('vehicles')) {
        window.location.href = '/unauthorized'
        return
      }
      setAuthChecking(false)
      fetchVehicles()
      fetchVisitors()
      setupRealtime()
    }
    checkAuth()

    const timer = setInterval(() => setCurrentTime(new Date()), 60000)

    return () => {
      if (realtimeChannel.current) {
        supabase.removeChannel(realtimeChannel.current)
      }
      clearInterval(timer)
    }
  }, [])

  const vehiclesOnSite = vehicles.filter(v => v.parking_slot).length
  const today = new Date().toISOString().split('T')[0]
  const checkedInToday = vehicles.filter(v => v.parking_slot && v.created_at?.startsWith(today)).length

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
        <div className="mb-6 flex items-center justify-between">
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
            ← Back to Dashboard
          </a>
          <h1 className="text-2xl font-bold text-[#F5F5DC] flex items-center gap-2">
            <Car className="h-6 w-6 text-blue-600" />
            Vehicle Management
          </h1>
        </div>

        <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by reg number, driver, visitor, slot, gate pass..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg bg-[#10150D] text-black placeholder:text-[#9A9F87] focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
            />
          </div>

          {(PERMISSIONS['Admin']?.includes('vehicles') || PERMISSIONS['Receptionist']?.includes('vehicles')) && (
            <button
              onClick={() => setShowRegisterForm(!showRegisterForm)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 mb-4"
            >
              <Plus className="h-4 w-4" /> Register Vehicle
            </button>
          )}

          {(PERMISSIONS['Admin']?.includes('vehicles') || PERMISSIONS['Security']?.includes('vehicles')) && (
            <div className="flex gap-2 mb-4">
              <button onClick={exportPDF} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                <Download className="h-4 w-4" /> Export PDF
              </button>
              <button onClick={exportExcel} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                <FileSpreadsheet className="h-4 w-4" /> Export Excel
              </button>
            </div>
          )}
        </div>

        {showRegisterForm && (
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-6 shadow-sm">
            <h3 className="text-lg font-bold text-[#F5F5DC] mb-4">Register Vehicle</h3>
            
            {vehicleBlacklisted && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 border border-red-200">
                <p className="text-sm font-medium text-red-700">Vehicle Blacklisted</p>
                <p className="text-xs text-red-600 mt-1">{blacklistReason}</p>
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Visitor *</label>
                  <select
                    value={formData.visitor_id}
                    onChange={(e) => setFormData({ ...formData, visitor_id: e.target.value })}
                    required
                    className={selectClasses}
                  >
                    <option value="">Select Visitor</option>
                    {visitors.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Registration Number *</label>
                  <input
                    type="text"
                    value={formData.registration_number}
                    onChange={(e) => {
                      setFormData({ ...formData, registration_number: e.target.value })
                      checkVehicleBlacklist(e.target.value)
                    }}
                    required
                    placeholder="ABC-123-XYZ"
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Vehicle Type *</label>
                  <select
                    value={formData.vehicle_type}
                    onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value as VehicleType })}
                    required
                    className={selectClasses}
                  >
                    <option value="">Select Type</option>
                    <option>Car</option>
                    <option>SUV</option>
                    <option>Truck</option>
                    <option>Bus</option>
                    <option>Motorcycle</option>
                    <option>Military Vehicle</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Make</label>
                  <input
                    type="text"
                    value={formData.vehicle_make}
                    onChange={(e) => setFormData({ ...formData, vehicle_make: e.target.value })}
                    className={inputClasses}
                    placeholder="Toyota"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Model</label>
                  <input
                    type="text"
                    value={formData.vehicle_model}
                    onChange={(e) => setFormData({ ...formData, vehicle_model: e.target.value })}
                    className={inputClasses}
                    placeholder="Camry"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Color</label>
                  <input
                    type="text"
                    value={formData.vehicle_color}
                    onChange={(e) => setFormData({ ...formData, vehicle_color: e.target.value })}
                    className={inputClasses}
                    placeholder="White"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Driver Name</label>
                  <input
                    type="text"
                    value={formData.driver_name}
                    onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Driver Phone</label>
                  <input
                    type="text"
                    value={formData.driver_phone}
                    onChange={(e) => setFormData({ ...formData, driver_phone: e.target.value })}
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9A9F87] mb-1">Parking Slot</label>
                  <input
                    type="text"
                    value={formData.parking_slot}
                    onChange={(e) => setFormData({ ...formData, parking_slot: e.target.value })}
                    className={inputClasses}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={2}
                  className={inputClasses}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterForm(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Register
                </button>
              </div>
            </form>
          </div>
        )}

        {notification && (
          <div className={`rounded-lg p-4 text-sm ${notification.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {notification.message}
          </div>
        )}

        <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-sm font-medium text-[#9A9F87]">Vehicles On Site</p>
              <p className="mt-1 text-2xl font-bold">{loading ? '—' : vehiclesOnSite}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#9A9F87]">Vehicles Checked In Today</p>
              <p className="mt-1 text-2xl font-bold">{loading ? '—' : checkedInToday}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#9A9F87]">Vehicles Checked Out Today</p>
              <p className="mt-1 text-2xl font-bold">{loading ? '—' : vehicles.filter(v => !v.parking_slot && v.created_at?.startsWith(today)).length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                <th className="px-4 py-3 font-semibold text-[#9A9F87]">Reg #</th>
                <th className="px-4 py-3 font-semibold text-[#9A9F87]">Vehicle</th>
                <th className="px-4 py-3 font-semibold text-[#9A9F87]">Color</th>
                <th className="px-4 py-3 font-semibold text-[#9A9F87]">Visitor</th>
                <th className="px-4 py-3 font-semibold text-[#9A9F87]">Organization</th>
                <th className="px-4 py-3 font-semibold text-[#9A9F87]">Parking Slot</th>
                <th className="px-4 py-3 font-semibold text-[#9A9F87]">Gate Pass</th>
                <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                <th className="px-4 py-3 font-semibold text-[#9A9F87]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
              {loading ? (
                <tr><td colSpan={9} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
              ) : filteredVehicles.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-[#9A9F87]">No vehicles found</td></tr>
              ) : (
                filteredVehicles.map(vehicle => (
                  <tr key={vehicle.id} className={`${getRowHighlight(vehicle)} transition-colors`}>
                    <td className="px-4 py-3 font-medium">{vehicle.registration_number}</td>
                    <td className="px-4 py-3">{vehicle.vehicle_type}</td>
                    <td className="px-4 py-3">{vehicle.vehicle_color || '—'}</td>
                    <td className="px-4 py-3">{vehicle.visitor?.full_name || '—'}</td>
                    <td className="px-4 py-3">{vehicle.visitor?.visitor_organization || '—'}</td>
                    <td className="px-4 py-3">{vehicle.parking_slot || '—'}</td>
                    <td className="px-4 py-3 font-mono">{vehicle.gate_pass_number}</td>
                    <td className="px-4 py-3">
                      {vehicle.is_blacklisted ? (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          Blacklisted
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {PERMISSIONS['Security']?.includes('vehicles') && (
                        <div className="flex gap-1">
                          <button onClick={() => handleCheckIn(vehicle.id)} className="p-1 rounded hover:bg-green-50" title="Check In">
                            <Plus className="h-4 w-4 text-green-600" />
                          </button>
                          <button onClick={() => handleCheckOut(vehicle.id)} className="p-1 rounded hover:bg-blue-50" title="Check Out">
                            <Minus className="h-4 w-4 text-blue-600" />
                          </button>
                          <button onClick={() => handlePrintGatePass(vehicle)} className="p-1 rounded hover:bg-[#4B5320]/10" title="Print Gate Pass">
                            <Printer className="h-4 w-4 text-[#9A9F87]" />
                          </button>
                          {PERMISSIONS['Admin']?.includes('vehicles') && (
                            <button onClick={() => handleBlacklist(vehicle.id)} className="p-1 rounded hover:bg-red-50" title="Blacklist">
                              <X className="h-4 w-4 text-red-600" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showGatePass && selectedVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-[#10150D] shadow-xl p-6">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#F5F5DC]">Vehicle Gate Pass</h2>
            </div>
            
            <div className="border border-gray-300 rounded-lg p-4 mb-4">
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-[#9A9F87]">Gate Pass #</p>
                  <p className="font-mono font-bold text-lg">{selectedVehicle.gate_pass_number}</p>
                </div>
                <div>
                  <p className="text-[#9A9F87]">Visitor</p>
                  <p className="font-medium">{selectedVehicle.visitor?.full_name || '—'}</p>
                </div>
                <div>
                  <p className="text-[#9A9F87]">Vehicle</p>
                  <p className="font-medium">{selectedVehicle.vehicle_make || ''} {selectedVehicle.vehicle_model || ''} ({selectedVehicle.vehicle_type})</p>
                </div>
<div>
                   <p className="text-[#9A9F87]">Registration Number</p>
                   <p className="font-medium">{selectedVehicle.registration_number}</p>
                 </div>
                 <div>
                   <p className="text-[#9A9F87]">Organization</p>
                   <p className="font-medium">{selectedVehicle.visitor?.visitor_organization || '—'}</p>
                 </div>
               </div>
              
              <div className="flex justify-center mt-4">
                <QRCodeSVG 
                  value={JSON.stringify({
                    gate_pass: selectedVehicle.gate_pass_number,
                    reg: selectedVehicle.registration_number,
                    visitor: selectedVehicle.visitor?.full_name
                  })} 
                  size={128}
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowGatePass(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10"
              >
                Close
              </button>
              <button
                onClick={() => {
                  logAuditAction('Vehicle Gate Pass Printed', 'vehicle', selectedVehicle.id, `Gate pass printed for ${selectedVehicle.registration_number}`).catch(() => {})
                  window.print()
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


