'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from '@/lib/supabase'
import { logAuditAction } from '@/lib/client/audit'
import {
  Search,
  Loader2,
  Printer,
  Eye,
  RefreshCw,
  QrCode,
} from 'lucide-react'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import { getBadges, getBadgeById, reprintBadge, cancelBadge } from '@/lib/client/badges'
import { printBadgeWindow } from '@/lib/badge/badge-print'
import { buildBadgePdfFilename, getBadgeWatermark } from '@/lib/badge/badge-utils'
import { BADGE_PDF } from '@/lib/badge/badge-constants'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import BadgeLayout from '@/components/BadgeLayout'
import VisitorBadge from '@/components/VisitorBadge'
import type { VisitorBadge as VisitorBadgeType } from '@/lib/badge/badge-types'

interface Visit {
  id: string
  purpose: string
  status: string
  check_in_time: string | null
  check_out_time: string | null
  created_at: string
  visitor: { full_name: string; visitor_organization: string; photo_url?: string | null } | null
  employee: { full_name: string; department: string } | null
  badge?: VisitorBadgeType | null
}

const searchInputClasses = "pl-9 pr-4 py-2 border border-gray-300 rounded-lg bg-[#10150D] text-black placeholder:text-[#9A9F87] focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
const selectClasses = "rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"

export default function BadgesPage() {
  const [badges, setBadges] = useState<VisitorBadgeType[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const status = params.get('status')
      if (status && ['Active', 'Expired', 'Checked Out', 'Cancelled'].includes(status)) {
        return status
      }
    }
    return 'all'
  })
  const [selectedBadge, setSelectedBadge] = useState<VisitorBadgeType | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }, [])

  // Debounce search term (~400ms)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 400)
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchTerm])

  const fetchBadges = useCallback(async () => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const currentRequestId = ++requestIdRef.current

    setLoading(true)
    try {
      const { getBadges } = await import('@/lib/client/badges')
      const data = await getBadges(debouncedSearchTerm, statusFilter, controller.signal)
      if (currentRequestId !== requestIdRef.current) return
      setBadges(data || [])
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (currentRequestId !== requestIdRef.current) return
      showNotification('error', error instanceof Error ? error.message : 'Failed to fetch badges')
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [debouncedSearchTerm, statusFilter, showNotification])

  const fetchVisits = async () => {
    try {
      const res = await fetch('/api/visits')
      if (res.ok) {
        const result = await res.json()
        const visitsData = result.data || []
        setVisits(visitsData.map((v: any) => ({ ...v, badge: null })))
      }
    } catch (error) {
      // ignore
    }
  }

  const setupRealtime = () => {
    if (realtimeChannel.current) {
      supabase.removeChannel(realtimeChannel.current)
    }

    realtimeChannel.current = supabase
      .channel('badges-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_badges' }, () => {
        fetchBadges()
        fetchVisits()
      })
      .subscribe()
  }

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await getCurrentUser()
        if (!user) {
          window.location.href = '/login'
          return
        }
        if (!user.role) {
          window.location.href = '/unauthorized'
          return
        }
        if (!PERMISSIONS[user.role]?.includes('badges')) {
          window.location.href = '/unauthorized'
          return
        }
        setAuthChecking(false)
        fetchVisits()
        setupRealtime()
      } catch (err) {
        console.error('[Auth check failed]', err)
        window.location.href = '/login'
        return
      }
    }
    checkAuth()

    return () => {
      if (realtimeChannel.current) {
        supabase.removeChannel(realtimeChannel.current)
      }
      abortControllerRef.current?.abort()
    }
  }, [])

  // Fetch badges when debounced search term or status filter changes, but only after auth
  useEffect(() => {
    if (!authChecking) {
      fetchBadges()
    }
  }, [fetchBadges, authChecking])

  const handleGenerateBadge = async (visitId: string) => {
    try {
      const { createBadge } = await import('@/lib/client/badges')
      const badge = await createBadge(visitId, 24)
      const visitorName = visits.find(v => v.id === visitId)?.visitor?.full_name || 'Visitor'
      await logAuditAction('Badge Generated', 'badge', badge.id, `Badge ${badge.badge_number} generated for ${visitorName}`)
      showNotification('success', `Badge ${badge.badge_number} generated successfully`)
      fetchBadges()
      fetchVisits()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate badge'
      if (message.includes('Badge already exists for this visit')) {
        showNotification('error', 'This visit already has a badge.')
      } else {
        showNotification('error', message)
      }
    }
  }

  const handleReprint = async (badgeId: string) => {
    try {
      await reprintBadge(badgeId)
      await printBadgeWindow(badgeId)
      const badge = badges.find(b => b.id === badgeId)
      await logAuditAction('Badge Reprinted', 'badge', badgeId, `Badge ${badge?.badge_number} reprinted`)
      showNotification('success', 'Badge reprinted successfully')
      fetchBadges()
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to reprint badge')
    }
  }

  const handleCancel = async (badgeId: string) => {
    try {
      await cancelBadge(badgeId)
      const badge = badges.find(b => b.id === badgeId)
      await logAuditAction('Badge Cancelled', 'badge', badgeId, `Badge ${badge?.badge_number} cancelled`)
      showNotification('success', 'Badge cancelled successfully')
      fetchBadges()
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to cancel badge')
    }
  }

  const handleDownloadPDF = async (badge: VisitorBadgeType) => {
    try {
      const watermark = badge.badge_status === 'Expired' ? 'EXPIRED' : badge.badge_status === 'Cancelled' ? 'CANCELLED' : undefined

      const container = document.createElement('div')
      container.style.cssText = 'position:fixed;left:-9999px;top:0;background:#ffffff;padding:24px;z-index:-1;'
      document.body.appendChild(container)

      const rootEl = document.createElement('div')
      container.appendChild(rootEl)

      const root = createRoot(rootEl)
      root.render(<BadgeLayout badge={badge} watermark={watermark} />)

      await new Promise<void>(resolve => {
        const raf = requestAnimationFrame(() => {
          setTimeout(resolve, 150)
        })
      })

      const canvas = await html2canvas(rootEl, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      })

      root.unmount()
      document.body.removeChild(container)

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pageWidth - 20
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight)
      pdf.save(`Visitor_Badge_${badge.badge_number}.pdf`)
      showNotification('success', 'Badge PDF downloaded')
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to download PDF')
    }
  }

  const handlePrint = async (badgeId: string) => {
    try {
      await printBadgeWindow(badgeId)
      const badge = badges.find(b => b.id === badgeId)
      await logAuditAction('Badge Printed', 'badge', badgeId, `Badge ${badge?.badge_number} printed`)
      showNotification('success', 'Badge printed successfully')
      fetchBadges()
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Failed to print badge')
    }
  }

  if (authChecking) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
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

      <div className="relative z-10 max-w-7xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        <div className="mb-4 sm:mb-6">
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">← Back to Dashboard</a>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-[#F5F5DC]">Badge Management</h1>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search badge number, visitor, host, QR token..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={searchInputClasses}
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={selectClasses}
              >
                <option value="all">All Status</option>
                <option value="Active">Active</option>
                <option value="Expired">Expired</option>
                <option value="Checked Out">Checked Out</option>
                <option value="Cancelled">Cancelled</option>
              </select>
              <button
                onClick={fetchBadges}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10 min-h-[44px]"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {notification && (
          <div className={`rounded-lg p-4 text-sm ${notification.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {notification.message}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-4">
            <p className="text-sm text-[#9A9F87]">Active Badges</p>
            <p className="text-2xl font-bold text-green-600">{badges.filter(b => b.badge_status === 'Active').length}</p>
          </div>
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-4">
            <p className="text-sm text-[#9A9F87]">Expired Badges</p>
            <p className="text-2xl font-bold text-red-600">{badges.filter(b => b.badge_status === 'Expired').length}</p>
          </div>
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-4">
            <p className="text-sm text-[#9A9F87]">Checked Out</p>
            <p className="text-2xl font-bold text-[#9A9F87]">{badges.filter(b => b.badge_status === 'Checked Out').length}</p>
          </div>
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-4">
            <p className="text-sm text-[#9A9F87]">Reprints</p>
            <p className="text-2xl font-bold text-blue-600">{badges.reduce((sum, b) => sum + (b.reprint_count || 0), 0)}</p>
          </div>
        </div>

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
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Badge #</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Visitor</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Host</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Issued</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87]">Expires</th>
                    <th className="px-4 py-3 font-semibold text-[#9A9F87] w-32">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                  {badges.map((badge) => (
                    <tr key={badge.id} className="hover:bg-[#4B5320]/10 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-medium text-[#F5F5DC]">{badge.badge_number}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {badge.visit?.visitor?.photo_url ? (
                            <img
                              src={badge.visit.visitor.photo_url}
                              alt={badge.visit.visitor.full_name || ''}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                              <span className="text-xs text-[#9A9F87]">
                                {(badge.visit?.visitor?.full_name || 'V').charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-[#F5F5DC] text-xs">
                              {badge.visit?.visitor?.full_name || '—'}
                            </p>
                            <p className="text-xs text-[#9A9F87]">
                              {badge.visit?.visitor?.visitor_organization || '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#9A9F87] text-xs">
                        {badge.visit?.employee?.full_name || '—'}
                        {badge.visit?.employee?.department && <span className="block text-gray-400">{badge.visit.employee.department}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          badge.badge_status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' :
                          badge.badge_status === 'Expired' ? 'bg-red-50 text-red-700 border-red-200' :
                          badge.badge_status === 'Checked Out' ? 'bg-gray-50 text-[#9A9F87] border-[rgba(85,107,47,0.35)]' :
                          'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {badge.badge_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#9A9F87] text-xs whitespace-nowrap">
                        {badge.issued_at ? new Date(badge.issued_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-[#9A9F87] text-xs whitespace-nowrap">
                        {badge.expires_at ? new Date(badge.expires_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setSelectedBadge(badge)}
                            disabled={!badge.visit}
                            className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 px-3 py-1.5 text-xs font-medium hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </button>
                          <button
                            onClick={() => handlePrint(badge.id)}
                            disabled={!badge.visit}
                            className="inline-flex items-center gap-1.5 rounded-full bg-green-50 text-green-700 px-3 py-1.5 text-xs font-medium hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Print
                          </button>
                          {badge.badge_status !== 'Cancelled' && badge.badge_status !== 'Expired' && (
                            <button
                              onClick={() => handleReprint(badge.id)}
                              disabled={badge.reprint_count >= 5}
                              className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 px-3 py-1.5 text-xs font-medium hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              Reprint
                            </button>
                          )}
                          {badge.badge_status === 'Active' && (
                            <button
                              onClick={() => handleCancel(badge.id)}
                              className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 px-3 py-1.5 text-xs font-medium hover:bg-red-100"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!loading && badges.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-[#9A9F87]">No badges found</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm p-6">
          <h3 className="text-lg font-semibold text-[#F5F5DC] mb-4">Generate Badge for Visit</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Visitor</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Host</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                  <th className="px-4 py-3 font-semibold text-[#9A9F87] w-40">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                {visits.map((visit) => (
                  <tr key={visit.id} className="hover:bg-[#4B5320]/10 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {visit.visitor?.photo_url ? (
                          <img
                            src={visit.visitor.photo_url}
                            alt={visit.visitor.full_name || ''}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="text-xs text-[#9A9F87]">
                              {(visit.visitor?.full_name || 'V').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-[#F5F5DC] text-xs">{visit.visitor?.full_name || '—'}</p>
                          <p className="text-xs text-[#9A9F87]">{visit.visitor?.visitor_organization || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#9A9F87] text-xs">{visit.employee?.full_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        visit.status === 'approved' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        visit.status === 'checked_in' ? 'bg-green-50 text-green-700 border-green-200' :
                        visit.status === 'checked_out' ? 'bg-gray-50 text-[#9A9F87] border-[rgba(85,107,47,0.35)]' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                         {(visit.status || 'unknown').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {visit.badge ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setSelectedBadge(visit.badge!)}
                            disabled={!visit.badge}
                            className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 px-3 py-1.5 text-xs font-medium hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </button>
                          <button
                            onClick={() => handlePrint(visit.badge!.id)}
                            disabled={!visit.badge}
                            className="inline-flex items-center gap-1.5 rounded-full bg-green-50 text-green-700 px-3 py-1.5 text-xs font-medium hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Print
                          </button>
                          <button
                            onClick={() => handleReprint(visit.badge!.id)}
                            disabled={(visit.badge!.reprint_count || 0) >= 5}
                            className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 px-3 py-1.5 text-xs font-medium hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Reprint
                          </button>
                          <button
                            onClick={() => handleCancel(visit.badge!.id)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 px-3 py-1.5 text-xs font-medium hover:bg-red-100"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : ['approved', 'checked_in', 'checked_out'].includes(visit.status) ? (
                        <button
                          onClick={() => handleGenerateBadge(visit.id)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all duration-200"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          Generate Badge
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedBadge && (
          <VisitorBadge
            badge={{
              ...selectedBadge,
              visit: selectedBadge.visit as Visit,
            }}
            onClose={() => setSelectedBadge(null)}
            onPrint={() => handlePrint(selectedBadge.id)}
            onDownload={() => handleDownloadPDF(selectedBadge)}
            onReprint={() => handleReprint(selectedBadge.id)}
          />
        )}
      </div>
    </div>
  )
}



