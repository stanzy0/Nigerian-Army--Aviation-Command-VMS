'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import { Loader2, Search, CheckCircle2, XCircle, Clock, LogOut, Package, QrCode, FileText, AlertTriangle, UserCheck, Printer, ShieldAlert, Home } from 'lucide-react'
import type { Visit } from '@/lib/types/visit'
import { logAuditAction } from '@/lib/client/audit'
import { parseQrPayload } from '@/lib/qr-parser'

type Tab = 'search' | 'pending' | 'reports'
type BadgeReturnStatus = 'returned' | 'lost' | 'damaged'
type PropertyStatus = 'returned' | 'leaving_with_visitor' | 'confiscated'

interface PropertyItem {
  id: string
  item_name: string
  category: string
  status: string
  condition: string | null
  notes: string | null
  released_at: string | null
}

interface SecurityAlert {
  id: string
  alert_type: string
  severity: string
  title: string
  message: string
  is_resolved: boolean
}

interface ExitReport {
  visitorsCurrentlyInside: number
  visitorsExitedToday: number
  averageVisitDuration: number
  badgeLosses: number
  propertyIncidents: number
}

export default function ExitControlPage() {
  const [authChecking, setAuthChecking] = useState(true)
  const [userRole, setUserRole] = useState<string>('Security')
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchMethod, setSearchMethod] = useState<'name' | 'registration' | 'badge' | 'qr'>('name')
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null)
  const [processing, setProcessing] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [properties, setProperties] = useState<PropertyItem[]>([])
  const [propertyStatuses, setPropertyStatuses] = useState<Record<string, PropertyStatus>>({})
  const [badgeReturnStatus, setBadgeReturnStatus] = useState<BadgeReturnStatus | null>(null)
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([])
  const [hostReleaseRequired, setHostReleaseRequired] = useState(false)
  const [hostApproved, setHostApproved] = useState(false)
  const [overstayMinutes, setOverstayMinutes] = useState(0)
  const [overstayReason, setOverstayReason] = useState('')
  const [showReceipt, setShowReceipt] = useState(false)
  const [showIncidentReport, setShowIncidentReport] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [report, setReport] = useState<ExitReport | null>(null)
  const [scanningQr, setScanningQr] = useState(false)
  const qrScannerRef = useRef<any>(null)

  const resetSelection = useCallback(() => {
    setSelectedVisit(null)
    setProperties([])
    setPropertyStatuses({})
    setBadgeReturnStatus(null)
    setSecurityAlerts([])
    setHostReleaseRequired(false)
    setHostApproved(false)
    setOverstayMinutes(0)
    setOverstayReason('')
    setShowReceipt(false)
    setShowIncidentReport(false)
  }, [])

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }

  const fetchVisits = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('visits')
      .select('*, visitor:visitors(*), employee:employees(*), badge:visitor_badges(*)')
      .eq('status', 'checked_in')
      .order('check_in_time', { ascending: true })

    if (!error) {
      setVisits(data || [])
    }
    setLoading(false)
  }

  const fetchReport = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const [
        insideRes,
        exitedTodayRes,
        avgDurationRes,
        badgeLossesRes,
        propertyIncidentsRes,
      ] = await Promise.all([
        supabase.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_in'),
        supabase.from('visits').select('id', { count: 'exact', head: true }).eq('status', 'checked_out').gte('check_out_time', `${today}T00:00:00`),
        supabase.from('visits').select('expected_duration, check_in_time, check_out_time').eq('status', 'checked_out').gte('check_out_time', `${today}T00:00:00`),
        supabase.from('visitor_badges').select('id', { count: 'exact', head: true }).eq('badge_status', 'Lost').gte('updated_at', `${today}T00:00:00`),
        supabase.from('property_items').select('id', { count: 'exact', head: true }).eq('status', 'Confiscated').gte('created_at', `${today}T00:00:00`),
      ])

      const durations = (avgDurationRes.data || [])
        .filter((v: any) => v.check_in_time && v.check_out_time)
        .map((v: any) => (new Date(v.check_out_time).getTime() - new Date(v.check_in_time).getTime()) / 60000)

      setReport({
        visitorsCurrentlyInside: insideRes.count ?? 0,
        visitorsExitedToday: exitedTodayRes.count ?? 0,
        averageVisitDuration: durations.length ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length) : 0,
        badgeLosses: badgeLossesRes.count ?? 0,
        propertyIncidents: propertyIncidentsRes.count ?? 0,
      })
    } catch (err) {
      console.error('Failed to fetch exit report:', err)
    }
  }

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      const allowed = ['Security', 'Admin', 'Receptionist']
      if (!allowed.includes(user.role)) {
        window.location.href = '/unauthorized'
        return
      }
      setUserRole(user.role)
      setAuthChecking(false)
      fetchVisits()
      if (activeTab === 'reports') fetchReport()
    }

    checkAuth()
  }, [activeTab])

  const loadProperties = async (visitId: string) => {
    const { data } = await supabase
      .from('property_items')
      .select('*')
      .eq('visit_id', visitId)

    if (data) {
      setProperties(data)
      const statuses: Record<string, PropertyStatus> = {}
      data.forEach((item) => {
        statuses[item.id] = (item.status as PropertyStatus) || 'returned'
      })
      setPropertyStatuses(statuses)
    }
  }

  const loadSecurityAlerts = async (visitId: string) => {
    const visit = visits.find((v) => v.id === visitId)
    if (!visit) return

    const alerts: SecurityAlert[] = []

    const { data: watchlist } = await supabase
      .from('watchlist')
      .select('*')
      .eq('is_active', true)
      .or(`full_name.ilike.%${visit.visitor?.full_name || ''}%,phone.eq.${visit.visitor?.phone || ''}`)

    if (watchlist && watchlist.length > 0) {
      alerts.push({
        id: 'watchlist-' + visitId,
        alert_type: 'Watchlist Match',
        severity: 'High',
        title: 'Watchlist Match',
        message: `Visitor matches ${watchlist.length} active watchlist entry/entries`,
        is_resolved: false,
      })
    }

    const { data: alertData } = await supabase
      .from('security_alerts')
      .select('*')
      .or(`related_id.eq.${visitId},related_id.eq.${visit.visitor_id}`)
      .eq('is_resolved', false)

    if (alertData) {
      alerts.push(...alertData)
    }

    setSecurityAlerts(alerts)
  }

  useEffect(() => {
    const channel = supabase
      .channel('exit-control')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => {
        fetchVisits()
        if (activeTab === 'reports') fetchReport()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_items' }, () => {
        if (selectedVisit) loadProperties(selectedVisit.id)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_alerts' }, () => {
        if (selectedVisit) loadSecurityAlerts(selectedVisit.id)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedVisit, activeTab])

  const handleSearch = async () => {
    if (!searchTerm.trim()) return

    setLoading(true)
    try {
      let query = supabase
        .from('visits')
        .select('*, visitor:visitors(*), employee:employees(*), badge:visitor_badges(*)')
        .eq('status', 'checked_in')

      if (searchMethod === 'name') {
        query = query.ilike('visitor.full_name', `%${searchTerm}%`)
      } else if (searchMethod === 'registration') {
        query = query.ilike('registration_number', `%${searchTerm}%`)
      } else if (searchMethod === 'badge') {
        query = query.ilike('badge.badge_number', `%${searchTerm}%`)
      } else if (searchMethod === 'qr') {
        query = query.ilike('badge.qr_token', `%${searchTerm}%`)
      }

      const { data } = await query.limit(10)
      if (data && data.length > 0) {
        setSelectedVisit(data[0])
        await loadProperties(data[0].id)
        await loadSecurityAlerts(data[0].id)
        calculateOverstay(data[0])
      } else {
        showNotification('error', 'No matching visitor found')
      }
    } catch (err) {
      showNotification('error', 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const startQrScan = async () => {
    setScanningQr(true)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      qrScannerRef.current = new Html5Qrcode('exit-qr-reader')
      await qrScannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          console.log('QR RAW:', decodedText)
          setScanningQr(false)
          qrScannerRef.current?.stop()

          try {
            const parsed = parseQrPayload(decodedText)
            console.log('QR PARSED PAYLOAD:', parsed)

            if (parsed.kind === 'portal') {
              const token = parsed.value
              if (!token) {
                showNotification('error', 'Invalid Portal QR Code')
                return
              }

              await logAuditAction('Portal QR Scanned', 'portal', token, JSON.stringify({ qr_token: token }))
              window.location.href = `/portal/${encodeURIComponent(token)}`
              return
            }

            let lookupValue = decodedText
            if (parsed.kind === 'visit' || parsed.kind === 'registration') {
              lookupValue = parsed.value
            }

            console.log('QR LOOKUP VALUE:', lookupValue)

            const { data, error } = await supabase
              .from('visits')
              .select('*, visitor:visitors(*), employee:employees(*), badge:visitor_badges(*)')
              .eq('status', 'checked_in')
              .or(`badge.qr_token.eq.${lookupValue},registration_number.eq.${lookupValue},id.eq.${lookupValue}`)
              .limit(1)
              .maybeSingle()

            console.log('QR EXIT LOOKUP RESULT:', { lookupValue, data, error })

            if (error || !data) {
              showNotification('error', 'No matching checked-in visitor found')
              return
            }

            setSelectedVisit(data as Visit)
            await loadProperties(data.id)
            await loadSecurityAlerts(data.id)
            calculateOverstay(data as Visit)
            showNotification('success', 'Visitor found')
          } catch {
            showNotification('error', 'Failed to process QR code')
          }
        },
        () => {}
      )
    } catch (err) {
      showNotification('error', 'Unable to access camera')
      setScanningQr(false)
    }
  }

  const stopQrScan = async () => {
    if (qrScannerRef.current) {
      try {
        await qrScannerRef.current.stop()
      } catch {
        // ignore
      }
      qrScannerRef.current = null
    }
    setScanningQr(false)
  }

  const calculateOverstay = (visit: Visit) => {
    if (!visit.check_in_time) {
      setOverstayMinutes(0)
      return
    }
    setOverstayMinutes(0)
  }

  const validateExit = () => {
    if (securityAlerts.some((a) => !a.is_resolved && ['Watchlist Match', 'Visitor Overstayed', 'Badge Expired'].includes(a.alert_type))) {
      showNotification('error', 'Resolve all outstanding security alerts before allowing exit')
      return false
    }

    const unreturnedProperty = properties.filter((item) => {
      const status = propertyStatuses[item.id]
      return !status || status === 'leaving_with_visitor'
    })

    if (unreturnedProperty.length > 0) {
      showNotification('error', 'All property items must be accounted for before exit')
      return false
    }

    if (!badgeReturnStatus) {
      showNotification('error', 'Badge return status must be recorded')
      return false
    }

    if (badgeReturnStatus === 'lost' && !showIncidentReport) {
      showNotification('error', 'Incident report is required for lost badges')
      return false
    }

    if (hostReleaseRequired && !hostApproved) {
      showNotification('error', 'Host approval is required for exit')
      return false
    }

    return true
  }

  const handleApproveExit = async () => {
    if (!selectedVisit || !validateExit()) return

    setProcessing(true)
    try {
      const now = new Date().toISOString()
      const { transitionVisitStatus } = await import('@/lib/server/lifecycle')
      try {
        await transitionVisitStatus(selectedVisit.id, 'checked_out', null, { method: 'security_exit' })
      } catch {
        // Lifecycle server call may be unavailable in demo mode.
      }

      // Use the authorized API route for status change instead of a direct client-side DB update.
      const checkOutRes = await fetch(`/api/visits/status?id=${encodeURIComponent(selectedVisit.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'checked_out' }),
      })

      if (!checkOutRes.ok) {
        const errData = await checkOutRes.json().catch(() => ({}))
        console.error('Check-out failed:', errData.message || 'Unknown error')
        setProcessing(false)
        return
      }

      if (selectedVisit.badge?.id) {
        await supabase.from('visitor_badges').update({
          badge_status: badgeReturnStatus === 'returned' ? 'Checked Out' : badgeReturnStatus === 'lost' ? 'Lost' : 'Damaged',
        }).eq('id', selectedVisit.badge.id)
      }

      await fetch('/api/security/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: selectedVisit.visitor_id,
          visit_id: selectedVisit.id,
          badge_id: selectedVisit.badge?.id,
          verification_method: 'badge',
          decision: 'approved',
          activity_type: 'exit_attempt',
          direction: 'out',
          metadata: {
            badge_return_status: badgeReturnStatus,
            overstay_minutes: overstayMinutes,
            property_count: properties.length,
          },
        }),
      })

      await logAuditAction('Exit Approved', 'visit', selectedVisit.id, `Visitor ${selectedVisit.visitor?.full_name} exit approved by security`)

      if (overstayMinutes > 0) {
        await supabase.from('incident_reports').insert({
          visit_id: selectedVisit.id,
          visitor_id: selectedVisit.visitor_id,
          incident_type: 'overstay',
          description: `Visitor overstayed by ${overstayMinutes} minutes. ${overstayReason}`,
          reported_by: userRole,
        })
      }

      showNotification('success', 'Exit approved successfully')
      setShowReceipt(true)
      fetchVisits()
    } catch (err) {
      console.error('Exit approval error:', err)
      showNotification('error', 'Exit approval failed')
    } finally {
      setProcessing(false)
    }
  }

  const handleDenyExit = async () => {
    if (!selectedVisit) return
    setProcessing(true)

    try {
      await fetch('/api/security/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: selectedVisit.visitor_id,
          visit_id: selectedVisit.id,
          badge_id: selectedVisit.badge?.id,
          verification_method: 'badge',
          decision: 'denied',
          denial_reason: 'Security hold - unresolved alerts or property',
          activity_type: 'exit_attempt',
          direction: 'out',
        }),
      })

      await logAuditAction('Exit Denied', 'visit', selectedVisit.id, `Visitor ${selectedVisit.visitor?.full_name} exit denied by security`)
      showNotification('error', 'Exit denied')
      resetSelection()
      fetchVisits()
    } catch (err) {
      showNotification('error', 'Failed to record denial')
    } finally {
      setProcessing(false)
    }
  }

  const printReceipt = () => {
    if (!selectedVisit) return
    const receiptWindow = window.open('', '_blank')
    if (!receiptWindow) return

    const duration = selectedVisit.check_in_time
      ? Math.round((Date.now() - new Date(selectedVisit.check_in_time).getTime()) / 60000)
      : 0

    receiptWindow.document.write(`
      <html>
        <head><title>Exit Receipt</title></head>
        <body style="margin:0;padding:24px;font-family:sans-serif;">
          <div style="max-width:400px;margin:0 auto;padding:24px;border:2px solid #000;">
            <h2 style="text-align:center;margin:0 0 16px 0;font-size:22px;">EXIT RECEIPT</h2>
            <p style="margin:6px 0;"><strong>Visitor:</strong> ${selectedVisit.visitor?.full_name || ''}</p>
            <p style="margin:6px 0;"><strong>Company:</strong> ${selectedVisit.visitor?.visitor_organization || ''}</p>
            <p style="margin:6px 0;"><strong>Host:</strong> ${selectedVisit.employee?.full_name || ''}</p>
            <p style="margin:6px 0;"><strong>Department:</strong> ${selectedVisit.employee?.department || ''}</p>
            <p style="margin:6px 0;"><strong>Office:</strong> ${selectedVisit.employee?.office_location || ''}</p>
            <p style="margin:6px 0;"><strong>Arrival:</strong> ${selectedVisit.check_in_time ? new Date(selectedVisit.check_in_time).toLocaleString() : ''}</p>
            <p style="margin:6px 0;"><strong>Departure:</strong> ${new Date().toLocaleString()}</p>
            <p style="margin:6px 0;"><strong>Duration:</strong> ${duration} minutes</p>
            <p style="margin:6px 0;"><strong>Badge:</strong> ${selectedVisit.badge?.badge_number || 'N/A'}</p>
            <p style="margin:6px 0;"><strong>Badge Status:</strong> ${badgeReturnStatus || 'N/A'}</p>
            <p style="margin:6px 0;"><strong>Property:</strong> ${properties.length} item(s)</p>
            <p style="margin:6px 0;"><strong>Security Officer:</strong> ${userRole}</p>
            <div style="margin-top:16px;text-align:center;">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(selectedVisit.id)}" alt="QR" />
            </div>
            <p style="text-align:center;font-size:11px;margin-top:8px;">Scan to verify exit</p>
          </div>
          <script>setTimeout(() => { window.print(); window.close(); }, 500);</script>
        </body>
      </html>
    `)
    receiptWindow.document.close()
  }

  const unresolvedAlerts = securityAlerts.filter((a) => !a.is_resolved)

  if (authChecking || loading) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const [durationOnSite, setDurationOnSite] = useState('—')

  useEffect(() => {
    if (!selectedVisit?.check_in_time) {
      setTimeout(() => setDurationOnSite('—'), 0)
      return
    }
    const diff = Date.now() - new Date(selectedVisit.check_in_time).getTime()
    setTimeout(() => setDurationOnSite(`${Math.round(diff / 60000)} min`), 0)
  }, [selectedVisit?.check_in_time])

  return (
    <div className="min-h-screen bg-[#0B0F08]">
      {notification && (
        <div className={`fixed top-0 left-0 right-0 z-50 p-3 text-center text-sm sm:text-base font-medium shadow-lg ${
          notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {notification.message}
        </div>
      )}

      <div className="max-w-7xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-2 sm:gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#F5F5DC]">Gate Pass & Exit Control</h1>
              <p className="text-xs sm:text-sm text-[#9A9F87]">Validate and process visitor exits</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setActiveTab('pending'); fetchVisits(); }}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'pending' ? 'bg-blue-600 text-white' : 'bg-[#10150D] text-[#9A9F87] border border-gray-300'}`}
            >
              Pending Exit
            </button>
            <button
              onClick={() => { setActiveTab('reports'); fetchReport(); }}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'reports' ? 'bg-blue-600 text-white' : 'bg-[#10150D] text-[#9A9F87] border border-gray-300'}`}
            >
              Reports
            </button>
          </div>
        </div>

        {activeTab === 'pending' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-4">
                <label className="block text-sm font-medium text-[#9A9F87] mb-2">Search Method</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {[
                    { key: 'name', label: 'Name' },
                    { key: 'registration', label: 'Registration' },
                    { key: 'badge', label: 'Badge #' },
                    { key: 'qr', label: 'QR Scan' },
                  ].map((method) => (
                    <button
                      key={method.key}
                      onClick={() => setSearchMethod(method.key as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                        searchMethod === method.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-[#10150D] text-[#9A9F87] border-gray-300'
                      }`}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>

                {scanningQr ? (
                  <div className="space-y-3">
                    <div id="exit-qr-reader" className="rounded-xl overflow-hidden border-2 border-[rgba(85,107,47,0.35)]" />
                    <button onClick={stopQrScan} className="w-full py-2 rounded-lg border border-gray-300 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10">
                      Stop Scanner
                    </button>
                  </div>
                ) : searchMethod === 'qr' ? (
                  <button onClick={startQrScan} className="w-full py-3 rounded-lg border-2 border-dashed border-gray-300 text-sm font-medium text-[#9A9F87] hover:border-blue-500 hover:text-blue-600">
                    Start QR Scanner
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder={searchMethod === 'name' ? 'Visitor name...' : searchMethod === 'registration' ? 'Registration #...' : 'Badge number...'}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm"
                      />
                    </div>
                    <button onClick={handleSearch} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 min-h-[44px]">
                      Search
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-4">
                <h3 className="text-sm font-semibold text-[#9A9F87] mb-3">Visitors Inside ({visits.length})</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {visits.map((visit) => (
                    <button
                      key={visit.id}
                      onClick={() => {
                        setSelectedVisit(visit)
                        loadProperties(visit.id)
                        loadSecurityAlerts(visit.id)
                        calculateOverstay(visit)
                      }}
                      className={`w-full text-left rounded-lg border p-3 text-sm hover:bg-[#4B5320]/10 ${
                        selectedVisit?.id === visit.id ? 'border-blue-500 bg-blue-50' : 'border-[rgba(85,107,47,0.35)]'
                      }`}
                    >
                      <p className="font-medium text-[#F5F5DC]">{visit.visitor?.full_name || '—'}</p>
                      <p className="text-xs text-[#9A9F87]">Badge: {visit.badge?.badge_number || '—'}</p>
                      <p className="text-xs text-[#9A9F87]">Host: {visit.employee?.full_name || '—'}</p>
                    </button>
                  ))}
                  {visits.length === 0 && (
                    <p className="text-sm text-[#9A9F87] text-center py-4">No visitors currently inside</p>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              {selectedVisit ? (
                <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-6 space-y-6">
                  <div className="flex items-start gap-6">
                    {selectedVisit.visitor?.photo_url ? (
                      <img src={selectedVisit.visitor.photo_url} alt="" className="h-24 w-24 rounded-2xl object-cover border border-[rgba(85,107,47,0.35)]" />
                    ) : (
                      <div className="h-24 w-24 rounded-2xl bg-gray-200 flex items-center justify-center text-3xl font-bold text-[#9A9F87]">
                        {(selectedVisit.visitor?.full_name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-[#F5F5DC]">{selectedVisit.visitor?.full_name || 'Unknown'}</h2>
                      <p className="text-[#9A9F87]">{selectedVisit.visitor?.visitor_organization || 'No company'}</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                          {selectedVisit.status.replace('_', ' ')}
                        </span>
                        {selectedVisit.badge && (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            Badge: {selectedVisit.badge.badge_number}
                          </span>
                        )}
                        {overstayMinutes > 0 && (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                            Overstay: {overstayMinutes} min
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <p className="text-xs text-[#9A9F87] uppercase tracking-wide mb-1">Host Employee</p>
                      <p className="text-base font-medium text-[#F5F5DC]">{selectedVisit.employee?.full_name || '—'}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <p className="text-xs text-[#9A9F87] uppercase tracking-wide mb-1">Department</p>
                      <p className="text-base font-medium text-[#F5F5DC]">{selectedVisit.employee?.department || '—'}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <p className="text-xs text-[#9A9F87] uppercase tracking-wide mb-1">Office</p>
                      <p className="text-base font-medium text-[#F5F5DC]">{selectedVisit.employee?.office_location || '—'}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <p className="text-xs text-[#9A9F87] uppercase tracking-wide mb-1">Arrival Time</p>
                      <p className="text-base font-medium text-[#F5F5DC]">{selectedVisit.check_in_time ? new Date(selectedVisit.check_in_time).toLocaleString() : '—'}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <p className="text-xs text-[#9A9F87] uppercase tracking-wide mb-1">Duration on Site</p>
                      <p className="text-base font-medium text-[#F5F5DC]">{durationOnSite}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <p className="text-xs text-[#9A9F87] uppercase tracking-wide mb-1">Badge Number</p>
                      <p className="text-base font-medium text-[#F5F5DC]">{selectedVisit.badge?.badge_number || '—'}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[rgba(85,107,47,0.35)] p-4">
                    <h3 className="text-sm font-semibold text-[#F5F5DC] mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4" /> Property Items ({properties.length})
                    </h3>
                    {properties.length === 0 ? (
                      <p className="text-sm text-[#9A9F87]">No property items registered</p>
                    ) : (
                      <div className="space-y-2">
                        {properties.map((item) => (
                          <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="text-sm font-medium text-[#F5F5DC]">{item.item_name}</p>
                              <p className="text-xs text-[#9A9F87]">{item.category}</p>
                            </div>
                            <select
                              value={propertyStatuses[item.id] || item.status || 'returned'}
                              onChange={(e) => setPropertyStatuses((prev) => ({ ...prev, [item.id]: e.target.value as PropertyStatus }))}
                              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
                            >
                              <option value="returned">Returned</option>
                              <option value="leaving_with_visitor">Leaving With Visitor</option>
                              <option value="confiscated">Confiscated</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-[rgba(85,107,47,0.35)] p-4">
                    <h3 className="text-sm font-semibold text-[#F5F5DC] mb-3 flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4" /> Badge Return
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {(['returned', 'lost', 'damaged'] as BadgeReturnStatus[]).map((status) => (
                        <button
                          key={status}
                          onClick={() => setBadgeReturnStatus(status)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                            badgeReturnStatus === status
                              ? status === 'returned' ? 'bg-green-600 text-white border-green-600'
                              : status === 'lost' ? 'bg-red-600 text-white border-red-600'
                              : 'bg-amber-600 text-white border-amber-600'
                              : 'bg-[#10150D] text-[#9A9F87] border-gray-300 hover:bg-[#4B5320]/10'
                          }`}
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </button>
                      ))}
                    </div>
                    {badgeReturnStatus === 'lost' && (
                      <div className="mt-3">
                        <button
                          onClick={() => setShowIncidentReport(!showIncidentReport)}
                          className="text-sm text-red-700 hover:text-red-800 font-medium"
                        >
                          {showIncidentReport ? 'Hide Incident Report' : 'File Incident Report'}
                        </button>
                        {showIncidentReport && (
                          <textarea
                            value={overstayReason}
                            onChange={(e) => setOverstayReason(e.target.value)}
                            placeholder="Describe circumstances of badge loss..."
                            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            rows={3}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {unresolvedAlerts.length > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                      <h3 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> Outstanding Alerts
                      </h3>
                      <div className="space-y-2">
                        {unresolvedAlerts.map((alert) => (
                          <div key={alert.id} className="text-sm text-red-700">
                            <span className="font-medium">{alert.alert_type}:</span> {alert.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {overstayMinutes > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <h3 className="text-sm font-semibold text-amber-800 mb-2">Overstay Detected</h3>
                      <p className="text-sm text-amber-700">Visitor overstayed by {overstayMinutes} minutes</p>
                      <input
                        type="text"
                        value={overstayReason}
                        onChange={(e) => setOverstayReason(e.target.value)}
                        placeholder="Reason for overstay (optional)"
                        className="mt-2 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleApproveExit}
                      disabled={processing}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 min-h-[52px]"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve Exit
                    </button>
                    <button
                      onClick={handleDenyExit}
                      disabled={processing}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 min-h-[52px]"
                    >
                      <XCircle className="h-4 w-4" />
                      Deny Exit
                    </button>
                    {showReceipt && (
                      <button
                        onClick={printReceipt}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 min-h-[52px]"
                      >
                        <Printer className="h-4 w-4" />
                        Print Receipt
                      </button>
                    )}
                    <button
                      onClick={resetSelection}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-[#10150D] px-6 py-3 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10 min-h-[52px]"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-12 text-center">
                  <LogOut className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-[#9A9F87]">Search or select a visitor to process exit</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reports' && report && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-[#10150D] rounded-xl p-4 border border-[rgba(85,107,47,0.35)]">
              <p className="text-xs text-[#9A9F87] uppercase tracking-wide">Currently Inside</p>
              <p className="text-2xl font-bold text-[#F5F5DC]">{report.visitorsCurrentlyInside}</p>
            </div>
            <div className="bg-[#10150D] rounded-xl p-4 border border-[rgba(85,107,47,0.35)]">
              <p className="text-xs text-[#9A9F87] uppercase tracking-wide">Exited Today</p>
              <p className="text-2xl font-bold text-[#F5F5DC]">{report.visitorsExitedToday}</p>
            </div>
            <div className="bg-[#10150D] rounded-xl p-4 border border-[rgba(85,107,47,0.35)]">
              <p className="text-xs text-[#9A9F87] uppercase tracking-wide">Avg Duration</p>
              <p className="text-2xl font-bold text-[#F5F5DC]">{report.averageVisitDuration} min</p>
            </div>
            <div className="bg-[#10150D] rounded-xl p-4 border border-[rgba(85,107,47,0.35)]">
              <p className="text-xs text-[#9A9F87] uppercase tracking-wide">Badge Losses</p>
              <p className="text-2xl font-bold text-red-700">{report.badgeLosses}</p>
            </div>
            <div className="bg-[#10150D] rounded-xl p-4 border border-[rgba(85,107,47,0.35)]">
              <p className="text-xs text-[#9A9F87] uppercase tracking-wide">Property Incidents</p>
              <p className="text-2xl font-bold text-red-700">{report.propertyIncidents}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


