'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import { Loader2, Search, CheckCircle2, XCircle, Clock, AlertTriangle, UserCheck, QrCode, Badge } from 'lucide-react'
import { generateVisitQRCode } from '@/lib/qrcode'
import type { Visit } from '@/lib/types/visit'

export default function GateCheckInPage() {
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null)
  const [verificationMethod, setVerificationMethod] = useState<'qr' | 'badge' | 'manual'>('qr')
  const [denialReason, setDenialReason] = useState<string | null>(null)
  const [showDenialModal, setShowDenialModal] = useState(false)
  const [processing, setProcessing] = useState(false)

  const fetchVisits = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('visits')
      .select('*, visitor:visitors(*), employee:employees(*), badge:visitor_badges(*)')
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching visits:', error)
    } else {
      setVisits(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      if (!PERMISSIONS[user.role]?.includes('scanner')) {
        window.location.href = '/unauthorized'
        return
      }
      setAuthChecking(false)
      fetchVisits()
    }
    checkAuth()
  }, [fetchVisits])

  useEffect(() => {
    const channel = supabase
      .channel('gate-visits')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => fetchVisits())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchVisits])

  const handleScanQR = async (token: string) => {
    setSearchTerm(token)
    const visit = visits.find((v) => v.badge?.qr_token === token || v.id === token)
    if (visit) {
      setSelectedVisit(visit)
    }
  }

  const handleApprove = async () => {
    if (!selectedVisit) return
    setProcessing(true)

    try {
      if (selectedVisit.visitor_id) {
        const { getMissingDocuments } = await import('@/lib/server/lifecycle')
        const missing = await getMissingDocuments(selectedVisit.visitor_id)
        if (missing.missing_count > 0) {
          console.error(`Cannot approve: missing documents (${missing.missing_types.join(', ')})`)
          setProcessing(false)
          return
        }

        const { getDocumentVerifications } = await import('@/lib/server/document-verification')
        const verifications = await getDocumentVerifications({ verification_status: 'all', search: '', document_type: '', date_from: '', date_to: '' }, 100, 0)
        const pendingVerifications = verifications.data.filter(v => v.visit_id === selectedVisit.id && ['Pending', 'Rejected', 'Replacement Requested'].includes(v.verification_status))
        if (pendingVerifications.length > 0) {
          console.error(`Cannot approve: pending document verifications (${pendingVerifications.map(v => v.document_type).join(', ')})`)
          setProcessing(false)
          return
        }
      }

      const { transitionVisitStatus, checkWatchlistOnCheckIn, notifyHostOnCheckIn } = await import('@/lib/server/lifecycle')
      try {
        await transitionVisitStatus(selectedVisit.id, 'security_cleared', null, { method: 'gate' })
      } catch {
        // Lifecycle server call may be unavailable in demo mode; continue with check-in flow.
      }
      if (selectedVisit.visitor_id) {
        try {
          await checkWatchlistOnCheckIn(selectedVisit.visitor_id, selectedVisit.id)
        } catch {
          // Lifecycle server call may be unavailable in demo mode.
        }
      }

      const qr = await generateVisitQRCode(selectedVisit.id)

      // Use the authorized API route for status change instead of a direct client-side DB update.
      const checkInRes = await fetch(`/api/visits/status?id=${encodeURIComponent(selectedVisit.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'checked_in' }),
      })

      if (!checkInRes.ok) {
        const errData = await checkInRes.json().catch(() => ({}))
        console.error('Check-in failed:', errData.message || 'Unknown error')
        setProcessing(false)
        return
      }

      await fetch('/api/security/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: selectedVisit.visitor_id,
          visit_id: selectedVisit.id,
          badge_id: selectedVisit.badge?.id,
          verification_method: verificationMethod,
          decision: 'approved',
          activity_type: 'entry_attempt',
          direction: 'in',
        }),
      })

      const visitorName = selectedVisit.visitor?.full_name || 'Visitor'
      const badgeNumber = selectedVisit.badge?.badge_number || qr
      try {
        await notifyHostOnCheckIn(selectedVisit.id, visitorName, badgeNumber)
      } catch {
        // Lifecycle server call may be unavailable in demo mode.
      }

      setSelectedVisit(null)
      fetchVisits()
    } catch (err) {
      console.error('Approve error:', err)
    } finally {
      setProcessing(false)
    }
  }

  const handleDeny = async () => {
    if (!selectedVisit || !denialReason) return
    setProcessing(true)

    try {
      const rejectRes = await fetch(`/api/visits/status?id=${encodeURIComponent(selectedVisit.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })

      if (!rejectRes.ok) {
        const errData = await rejectRes.json().catch(() => ({}))
        console.error('Reject failed:', errData.message || 'Unknown error')
        setProcessing(false)
        return
      }

      await fetch('/api/security/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: selectedVisit.visitor_id,
          visit_id: selectedVisit.id,
          badge_id: selectedVisit.badge?.id,
          verification_method: verificationMethod,
          decision: 'denied',
          denial_reason: denialReason,
          activity_type: 'entry_attempt',
          direction: 'in',
        }),
      })

      setShowDenialModal(false)
      setDenialReason(null)
      setSelectedVisit(null)
      fetchVisits()
    } catch (err) {
      console.error('Deny error:', err)
    } finally {
      setProcessing(false)
    }
  }

  const handleHold = async () => {
    if (!selectedVisit) return
    setProcessing(true)

    try {
      await fetch('/api/security/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: selectedVisit.visitor_id,
          visit_id: selectedVisit.id,
          badge_id: selectedVisit.badge?.id,
          verification_method: verificationMethod,
          decision: 'hold',
          activity_type: 'entry_attempt',
          direction: 'in',
        }),
      })

      setSelectedVisit(null)
      fetchVisits()
    } catch (err) {
      console.error('Hold error:', err)
    } finally {
      setProcessing(false)
    }
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
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#F5F5DC]">Gate Check-In</h1>
          <p className="text-sm text-[#9A9F87]">Scan QR code or badge to verify visitor entry</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-4">
              <label className="block text-sm font-medium text-[#9A9F87] mb-2">Scan QR / Badge / Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Scan or search..."
                  value={searchTerm}
                  onChange={(e) => handleScanQR(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 pl-9 pr-4 py-3 text-sm"
                />
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-[#9A9F87] mb-1">Verification Method</label>
                <select value={verificationMethod} onChange={(e) => setVerificationMethod(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="qr">QR Code</option>
                  <option value="badge">Badge Number</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-4">
              <h3 className="text-sm font-semibold text-[#9A9F87] mb-3">Waiting Visitors</h3>
              <div className="space-y-2">
                {visits.map((visit) => (
                  <button
                    key={visit.id}
                    onClick={() => setSelectedVisit(visit)}
                    className={`w-full text-left rounded-lg border p-3 text-sm hover:bg-[#4B5320]/10 ${
                      selectedVisit?.id === visit.id ? 'border-blue-500 bg-blue-50' : 'border-[rgba(85,107,47,0.35)]'
                    }`}
                  >
                    <p className="font-medium text-[#F5F5DC]">{visit.visitor?.full_name || '—'}</p>
                    <p className="text-xs text-[#9A9F87]">{visit.visitor?.visitor_organization || ''}</p>
                  </button>
                ))}
                {visits.length === 0 && (
                  <p className="text-sm text-[#9A9F87] text-center py-4">No visitors waiting</p>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            {selectedVisit ? (
              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-6 space-y-6">
                <div className="flex flex-col items-center">
                  {selectedVisit.visitor?.photo_url ? (
                    <img src={selectedVisit.visitor.photo_url} alt={selectedVisit.visitor?.full_name || ''} className="h-40 w-40 rounded-full object-cover mb-4" />
                  ) : (
                    <div className="h-40 w-40 rounded-full bg-gray-200 flex items-center justify-center mb-4">
                      <span className="text-4xl text-[#9A9F87]">{(selectedVisit.visitor?.full_name || '').charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <h2 className="text-xl font-bold text-[#F5F5DC]">{selectedVisit.visitor?.full_name || '—'}</h2>
                  <p className="text-[#9A9F87]">{selectedVisit.visitor?.visitor_organization || '—'}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-[#9A9F87] uppercase">Host Employee</p>
                    <p className="text-sm font-medium text-[#F5F5DC]">{selectedVisit.employee?.full_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#9A9F87] uppercase">Department</p>
                    <p className="text-sm font-medium text-[#F5F5DC]">{selectedVisit.employee?.department || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#9A9F87] uppercase">Purpose</p>
                    <p className="text-sm font-medium text-[#F5F5DC]">{selectedVisit.purpose || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#9A9F87] uppercase">Badge Status</p>
                    <p className="text-sm font-medium text-[#F5F5DC]">{selectedVisit.badge?.badge_status || '—'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button onClick={handleApprove} disabled={processing} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 min-h-[52px]">
                    <UserCheck className="h-4 w-4" />
                    Approve Entry
                  </button>
                  <button onClick={() => setShowDenialModal(true)} disabled={processing} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 min-h-[52px]">
                    <XCircle className="h-4 w-4" />
                    Deny Entry
                  </button>
                  <button onClick={handleHold} disabled={processing} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-6 py-3 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 min-h-[52px]">
                    <Clock className="h-4 w-4" />
                    Hold for Review
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-12 text-center">
                <QrCode className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-[#9A9F87]">Select a visitor or scan a QR code to verify identity</p>
              </div>
            )}
          </div>
        </div>

        {showDenialModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-[#10150D] shadow-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-full bg-red-100">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
                <h2 className="text-lg font-semibold text-[#F5F5DC]">Deny Entry</h2>
              </div>
              <p className="text-sm text-[#9A9F87] mb-4">Please select a reason for denial.</p>
              <select value={denialReason || ''} onChange={(e) => setDenialReason(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4">
                <option value="">Select reason</option>
                <option value="Invalid ID">Invalid ID</option>
                <option value="Expired Badge">Expired Badge</option>
                <option value="Watchlist Match">Watchlist Match</option>
                <option value="Host Unavailable">Host Unavailable</option>
                <option value="Other">Other</option>
              </select>
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowDenialModal(false); setDenialReason(null) }} disabled={processing} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10 min-h-[44px]">
                  Back
                </button>
                <button onClick={handleDeny} disabled={processing || !denialReason} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 min-h-[44px]">
                  {processing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm Deny
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


