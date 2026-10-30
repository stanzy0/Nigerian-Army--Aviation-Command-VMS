'use client'

import type { Html5Qrcode } from 'html5-qrcode'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, CheckCircle2, XCircle, Search, QrCode, Keyboard, Clock, MapPin, UserCheck, Printer, ShieldCheck, AlertCircle, ChevronRight, Home, Settings, Camera, X } from 'lucide-react'
import { logAuditAction } from '@/lib/client/audit'
import { printBadgeWindow } from '@/lib/badge/badge-print'
import { createBadge } from '@/lib/client/badges'
import { parseQrPayload } from '@/lib/qr-parser'

type Screen = 'welcome' | 'qr-scanner' | 'registration' | 'search' | 'confirmation' | 'processing' | 'waiting' | 'denied' | 'settings'

interface Visit {
  id: string
  registration_number: string
  status: string
  purpose: string
  created_at: string
  check_in_time: string | null
  visitor?: {
    full_name: string
    phone: string | null
    email: string | null
    visitor_organization: string | null
    photo_url: string | null
  } | null
  employee?: {
    full_name: string
    department: string
    office_location: string
  } | null
  badge?: {
    badge_number: string | null
    badge_status: string | null
    qr_token: string | null
    expires_at: string | null
  } | null
}

const TOUCH = 'min-h-[56px] px-6 py-3 rounded-xl text-lg font-semibold transition-all duration-200 touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100'
const INACTIVITY_TIMEOUT = 60 * 1000

export default function KioskPage() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [loading, setLoading] = useState(false)
  const [visit, setVisit] = useState<Visit | null>(null)
  const [searchResults, setSearchResults] = useState<Visit[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [qrError, setQrError] = useState<string | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [kioskEnabled, setKioskEnabled] = useState(true)
  const [idleTimeout, setIdleTimeout] = useState(INACTIVITY_TIMEOUT)
  const [showSettings, setShowSettings] = useState(false)

  const inactivityTimer = useRef<NodeJS.Timeout | null>(null)
  const qrScannerRef = useRef<HTMLDivElement | null>(null)
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    if (screen !== 'welcome') {
      inactivityTimer.current = setTimeout(() => {
        setScreen('welcome')
        setVisit(null)
        setSearchResults([])
        setSearchTerm('')
        setRegistrationNumber('')
        setMessage(null)
      }, idleTimeout)
    }
  }, [screen, idleTimeout])

  useEffect(() => {
    resetInactivityTimer()
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    }
  }, [screen, resetInactivityTimer])

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const searchVisits = async (term: string) => {
    if (!term || term.trim().length < 2) {
      setSearchResults([])
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/public/kiosk-search?q=${encodeURIComponent(term.trim())}`)
      const data = await res.json()

      if (res.ok && data.success) {
        setSearchResults(data.data || [])
      } else {
        setSearchResults([])
      }
    } catch {
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }

  const lookupByRegistration = async () => {
    if (!registrationNumber.trim()) {
      showMessage('error', 'Please enter a badge QR token or credential')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/public/status?q=${encodeURIComponent(registrationNumber.trim())}`)
      const data = await res.json()

      if (res.ok && data.data) {
        const visitData = data.data
        const mappedVisit: Visit = {
          id: visitData.registration_number,
          registration_number: visitData.registration_number,
          status: visitData.status,
          purpose: '',
          created_at: visitData.visit_date || '',
          check_in_time: visitData.check_in_time,
          visitor: {
            full_name: 'Visitor',
            phone: null,
            email: null,
            visitor_organization: null,
            photo_url: null,
          },
          employee: {
            full_name: 'N/A',
            department: 'N/A',
            office_location: 'N/A',
          },
          badge: null,
        }
        setVisit(mappedVisit)
        setScreen('confirmation')
      } else {
        showMessage('error', data.error || 'Invalid credential')
      }
    } catch {
      showMessage('error', 'Failed to look up status')
    } finally {
      setLoading(false)
    }
  }

  const startQrScanner = async () => {
    setQrError(null)
    setScreen('qr-scanner')

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      html5QrCodeRef.current = new Html5Qrcode('qr-reader')

      await html5QrCodeRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText: string) => {
          console.log('QR RAW:', decodedText)
          handleQrScanned(decodedText)
        },
        () => {}
      )
    } catch (err) {
      setQrError('Unable to access camera. Please use another method.')
      console.error('QR scanner error:', err)
    }
  }

  const stopQrScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop()
      } catch {
        // ignore
      }
      html5QrCodeRef.current = null
    }
  }

      const handleQrScanned = async (decodedText: string) => {
        stopQrScanner()
        setLoading(true)

        try {
          const parsed = parseQrPayload(decodedText)
          console.log('QR PARSED PAYLOAD:', parsed)

          if (parsed.kind === 'portal') {
            const token = parsed.value
            if (!token) {
              setQrError('Invalid Portal QR Code')
              setLoading(false)
              return
            }

            await logAuditAction('Portal QR Scanned', 'portal', token, JSON.stringify({ qr_token: token }))
            window.location.href = `/portal/${encodeURIComponent(token)}`
            return
          }

          let token = decodedText
          if (parsed.kind === 'visit' || parsed.kind === 'registration') {
            token = parsed.value
          }

          const res = await fetch(`/api/public/status?q=${encodeURIComponent(token)}`)
          const data = await res.json()
          console.log('QR STATUS RESPONSE:', { status: res.status, ok: res.ok, data })

          if (res.ok && data.data) {
            const visitData = data.data
            const mappedVisit: Visit = {
              id: visitData.registration_number,
              registration_number: visitData.registration_number,
              status: visitData.status,
              purpose: '',
              created_at: visitData.visit_date || '',
              check_in_time: visitData.check_in_time,
              visitor: {
                full_name: 'Visitor',
                phone: null,
                email: null,
                visitor_organization: null,
                photo_url: null,
              },
              employee: {
                full_name: 'N/A',
                department: 'N/A',
                office_location: 'N/A',
              },
              badge: null,
            }
            setVisit(mappedVisit)
            setScreen('confirmation')
          } else {
            showMessage('error', data.error || 'QR code not recognized')
            setScreen('welcome')
          }
    } catch {
      showMessage('error', 'Failed to process QR code')
      setScreen('welcome')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckIn = async () => {
    if (!visit) return

    setCheckingIn(true)
    setScreen('processing')

    try {
      const res = await fetch('/api/public/kiosk-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_token: visit.badge?.qr_token }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        await logAuditAction('Kiosk Check-In', 'visit', visit.id, `Visitor checked in via kiosk`)

        if (visit.badge?.badge_number) {
          try {
            await printBadgeWindow(visit.badge.badge_number)
          } catch {
            // badge print failed, but check-in succeeded
          }
        } else {
          try {
            const badge = await createBadge(visit.id, 24)
            await printBadgeWindow(badge.badge_number)
          } catch {
            // badge generation failed, but check-in succeeded
          }
        }

        setScreen('waiting')
      } else {
        showMessage('error', data.error || 'Check-in failed')
        setScreen('denied')
      }
    } catch {
      showMessage('error', 'Check-in failed. Please contact Reception.')
      setScreen('denied')
    } finally {
      setCheckingIn(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'text-blue-700 bg-blue-50 border-blue-200'
      case 'checked_in': return 'text-green-700 bg-green-50 border-green-200'
      case 'pending': return 'text-amber-700 bg-amber-50 border-amber-200'
      case 'rejected':
      case 'cancelled':
        return 'text-red-700 bg-red-50 border-red-200'
      default: return 'text-[#9A9F87] bg-gray-50 border-[rgba(85,107,47,0.35)]'
    }
  }

  const getBadgeStatusColor = (status: string | null | undefined) => {
    switch (status) {
      case 'Active': return 'text-emerald-700 bg-emerald-50 border-emerald-200'
      case 'Expired': return 'text-red-700 bg-red-50 border-red-200'
      case 'Cancelled': return 'text-orange-700 bg-orange-50 border-orange-200'
      default: return 'text-[#9A9F87] bg-gray-50 border-[rgba(85,107,47,0.35)]'
    }
  }

  useEffect(() => {
    return () => {
      stopQrScanner()
    }
  }, [])

  if (!kioskEnabled && screen !== 'settings') {
    return (
      <div className="flex h-screen bg-gray-900 items-center justify-center p-4">
        <div className="text-center text-white">
          <ShieldCheck className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h1 className="text-3xl font-bold mb-2">Kiosk Disabled</h1>
          <p className="text-gray-400">Please contact Reception for assistance.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F08]" onTouchStart={resetInactivityTimer} onClick={resetInactivityTimer}>
      {message && (
        <div className={`fixed top-0 left-0 right-0 z-50 p-4 text-center text-lg font-medium shadow-lg ${
          message.type === 'success' ? 'bg-green-600 text-white' :
          message.type === 'error' ? 'bg-red-600 text-white' :
          'bg-blue-600 text-white'
        }`}>
          {message.text}
        </div>
      )}

      {screen === 'welcome' && (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-[#F5F5DC] mb-4">Nigerian Army Aviation Command</h1>
            <p className="text-2xl text-[#9A9F87] font-medium">Visitor Self Check-In</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
            <button
              onClick={startQrScanner}
              className={`${TOUCH} bg-[#10150D] border-2 border-[rgba(85,107,47,0.35)] hover:border-blue-500 hover:shadow-lg flex flex-col items-center gap-4 py-8`}
            >
              <QrCode className="h-16 w-16 text-blue-600" />
              <span className="text-xl">Scan QR Code</span>
            </button>

            <button
              onClick={() => setScreen('registration')}
              className={`${TOUCH} bg-[#10150D] border-2 border-[rgba(85,107,47,0.35)] hover:border-blue-500 hover:shadow-lg flex flex-col items-center gap-4 py-8`}
            >
              <Keyboard className="h-16 w-16 text-blue-600" />
              <span className="text-xl">Enter Registration Number</span>
            </button>

            <button
              onClick={() => setScreen('search')}
              className={`${TOUCH} bg-[#10150D] border-2 border-[rgba(85,107,47,0.35)] hover:border-blue-500 hover:shadow-lg flex flex-col items-center gap-4 py-8`}
            >
              <Search className="h-16 w-16 text-blue-600" />
              <span className="text-xl">Search by Name</span>
            </button>
          </div>

          <button
            onClick={() => setShowSettings(true)}
            className="mt-12 text-gray-400 hover:text-[#9A9F87] flex items-center gap-2"
          >
            <Settings className="h-5 w-5" />
            <span className="text-sm">Settings</span>
          </button>
        </div>
      )}

      {screen === 'qr-scanner' && (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <h2 className="text-3xl font-bold text-[#F5F5DC] mb-8">Scan Your QR Code</h2>
          <div className="w-full max-w-md">
            <div id="qr-reader" className="rounded-2xl overflow-hidden border-4 border-[rgba(85,107,47,0.35)] shadow-2xl" />
          </div>
          {qrError && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-center">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p>{qrError}</p>
            </div>
          )}
          <button
            onClick={() => { stopQrScanner(); setScreen('welcome') }}
            className={`${TOUCH} mt-8 bg-gray-200 text-[#F5F5DC] hover:bg-gray-300`}
          >
            Back
          </button>
        </div>
      )}

      {screen === 'registration' && (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <h2 className="text-3xl font-bold text-[#F5F5DC] mb-8">Enter Registration Number</h2>
          <div className="w-full max-w-md">
            <input
              type="text"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
              placeholder="e.g., REG-ABC123"
              className="w-full px-6 py-4 text-2xl text-center border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none mb-6"
              autoFocus
            />
            <button
              onClick={lookupByRegistration}
              disabled={loading || !registrationNumber.trim()}
              className={`${TOUCH} w-full bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300`}
            >
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : 'Look Up'}
            </button>
          </div>
          <button
            onClick={() => { setRegistrationNumber(''); setScreen('welcome') }}
            className={`${TOUCH} mt-8 bg-gray-200 text-[#F5F5DC] hover:bg-gray-300`}
          >
            Back
          </button>
        </div>
      )}

      {screen === 'search' && (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <h2 className="text-3xl font-bold text-[#F5F5DC] mb-8">Search for Your Visit</h2>
          <div className="w-full max-w-2xl">
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  searchVisits(e.target.value)
                }}
                placeholder="Search by name, phone, or email..."
                className="w-full pl-14 pr-4 py-4 text-xl border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>

            {loading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            )}

            {!loading && searchResults.length > 0 && (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => { setVisit(result); setScreen('confirmation') }}
                    className="w-full p-4 bg-[#10150D] border-2 border-[rgba(85,107,47,0.35)] rounded-xl hover:border-blue-500 text-left"
                  >
                    <div className="flex items-center gap-4">
                      {result.visitor?.photo_url ? (
                        <img src={result.visitor.photo_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
                      ) : (
                        <div className="h-14 w-14 rounded-xl bg-gray-200 flex items-center justify-center text-xl font-bold text-[#9A9F87]">
                          {result.visitor?.full_name?.charAt(0).toUpperCase() || '?'}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-lg font-semibold text-[#F5F5DC]">{result.visitor?.full_name || 'Unknown'}</p>
                        <p className="text-sm text-[#9A9F87]">{result.visitor?.visitor_organization || 'No company'}</p>
                        <p className="text-xs text-[#9A9F87]">Host: {result.employee?.full_name || 'N/A'} · {result.employee?.office_location || ''}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(result.status)}`}>
                        {result.status.replace('_', ' ')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!loading && searchTerm && searchResults.length === 0 && (
              <div className="text-center py-8 text-[#9A9F87] text-lg">No visits found</div>
            )}
          </div>
          <button
            onClick={() => { setSearchTerm(''); setSearchResults([]); setScreen('welcome') }}
            className={`${TOUCH} mt-8 bg-gray-200 text-[#F5F5DC] hover:bg-gray-300`}
          >
            Back
          </button>
        </div>
      )}

      {screen === 'confirmation' && visit && (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <h2 className="text-3xl font-bold text-[#F5F5DC] mb-8">Confirm Your Identity</h2>

          <div className="w-full max-w-2xl bg-[#10150D] rounded-2xl border-2 border-[rgba(85,107,47,0.35)] shadow-xl overflow-hidden">
            <div className="p-6 md:p-8">
              <div className="flex items-start gap-6 mb-6">
                {visit.visitor?.photo_url ? (
                  <img src={visit.visitor.photo_url} alt="" className="h-24 w-24 rounded-2xl object-cover border-2 border-[rgba(85,107,47,0.35)]" />
                ) : (
                  <div className="h-24 w-24 rounded-2xl bg-gray-200 flex items-center justify-center text-3xl font-bold text-[#9A9F87]">
                    {visit.visitor?.full_name?.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-[#F5F5DC]">{visit.visitor?.full_name || 'Unknown Visitor'}</h3>
                  <p className="text-[#9A9F87] text-lg">{visit.visitor?.visitor_organization || 'No company'}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(visit.status)}`}>
                      {visit.status.replace('_', ' ')}
                    </span>
                    {visit.badge && (
                      <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getBadgeStatusColor(visit.badge.badge_status)}`}>
                        Badge: {visit.badge.badge_status}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-[#9A9F87] uppercase tracking-wide mb-1">Host</p>
                  <p className="text-base font-medium text-[#F5F5DC] flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-gray-400" />
                    {visit.employee?.full_name || 'N/A'}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-[#9A9F87] uppercase tracking-wide mb-1">Department</p>
                  <p className="text-base font-medium text-[#F5F5DC] flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    {visit.employee?.department || 'N/A'}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-[#9A9F87] uppercase tracking-wide mb-1">Office</p>
                  <p className="text-base font-medium text-[#F5F5DC] flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    {visit.employee?.office_location || 'N/A'}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-[#9A9F87] uppercase tracking-wide mb-1">Purpose</p>
                  <p className="text-base font-medium text-[#F5F5DC]">{visit.purpose || 'N/A'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-[#9A9F87] uppercase tracking-wide mb-1">Registration</p>
                  <p className="text-base font-medium text-[#F5F5DC] font-mono">{visit.registration_number}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-[#9A9F87] uppercase tracking-wide mb-1">Badge</p>
                  <p className="text-base font-medium text-[#F5F5DC]">{visit.badge?.badge_number || 'Not issued'}</p>
                </div>
              </div>

              {visit.status === 'checked_in' && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <p className="text-green-800 font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Already checked in at {visit.check_in_time ? new Date(visit.check_in_time).toLocaleTimeString() : '—'}
                  </p>
                </div>
              )}

              {visit.status === 'rejected' || visit.status === 'cancelled' ? (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-red-800 font-medium flex items-center gap-2">
                    <XCircle className="h-5 w-5" />
                    This visit has been {visit.status}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={handleCheckIn}
                    disabled={checkingIn || visit.status === 'checked_in'}
                    className={`${TOUCH} flex-1 bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 flex items-center justify-center gap-2`}
                  >
                    {checkingIn ? <Loader2 className="h-6 w-6 animate-spin" /> : <CheckCircle2 className="h-6 w-6" />}
                    Confirm Identity & Check In
                  </button>
                  <button
                    onClick={() => { setVisit(null); setScreen('welcome') }}
                    className={`${TOUCH} flex-1 bg-gray-200 text-[#F5F5DC] hover:bg-gray-300`}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {screen === 'processing' && (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <Loader2 className="h-16 w-16 animate-spin text-blue-600 mb-6" />
          <h2 className="text-2xl font-bold text-[#F5F5DC]">Processing Check-In...</h2>
          <p className="text-[#9A9F87] mt-2">Please wait</p>
        </div>
      )}

      {screen === 'waiting' && visit && (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <div className="text-center">
            <CheckCircle2 className="h-24 w-24 text-green-600 mx-auto mb-6" />
            <h2 className="text-4xl font-bold text-[#F5F5DC] mb-4">Welcome!</h2>
            <p className="text-xl text-[#9A9F87] mb-2">Please proceed to</p>
            <p className="text-2xl font-semibold text-blue-600 mb-2">{visit.employee?.office_location || 'Reception'}</p>
            <p className="text-lg text-[#9A9F87] mb-1">Host: {visit.employee?.full_name || 'N/A'}</p>
            <p className="text-sm text-[#9A9F87] mt-4">This screen will reset shortly</p>
          </div>
        </div>
      )}

      {screen === 'denied' && (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <div className="text-center">
            <XCircle className="h-24 w-24 text-red-600 mx-auto mb-6" />
            <h2 className="text-4xl font-bold text-red-700 mb-4">ACCESS DENIED</h2>
            <p className="text-xl text-[#9A9F87]">Please contact Reception.</p>
          </div>
          <button
            onClick={() => { setVisit(null); setScreen('welcome') }}
            className={`${TOUCH} mt-12 bg-gray-200 text-[#F5F5DC] hover:bg-gray-300`}
          >
            Back to Welcome
          </button>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-[#10150D] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#F5F5DC]">Kiosk Settings</h3>
              <button onClick={() => setShowSettings(false)} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100">
                <X className="h-6 w-6 text-[#9A9F87]" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-medium text-[#9A9F87]">Enable Kiosk</span>
                <button
                  onClick={() => setKioskEnabled(!kioskEnabled)}
                  className={`${TOUCH} ${kioskEnabled ? 'bg-green-600 text-white' : 'bg-gray-200 text-[#F5F5DC]'}`}
                >
                  {kioskEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#9A9F87] mb-2">Idle Timeout (seconds)</label>
                <input
                  type="number"
                  value={idleTimeout / 1000}
                  onChange={(e) => setIdleTimeout(parseInt(e.target.value) * 1000 || 60000)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className={`${TOUCH} w-full mt-6 bg-blue-600 text-white hover:bg-blue-700`}
            >
              Save & Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}



