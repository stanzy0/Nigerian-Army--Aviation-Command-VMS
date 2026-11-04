'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS, UserRole } from '@/lib/auth-client'
import { getAuthHeaders } from '@/lib/client/api'
import { logAuditAction } from '@/lib/client/audit'
import {
  X,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCw,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Eye,
  FileText,
} from 'lucide-react'
import type { DocumentVerification } from '@/lib/types/document-verification'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  Pending: { label: 'Pending', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  Verified: { label: 'Verified', color: 'bg-green-50 text-green-700 border-green-200' },
  Rejected: { label: 'Rejected', color: 'bg-red-50 text-red-700 border-red-200' },
  'Replacement Requested': { label: 'Replacement Requested', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  Reuploaded: { label: 'Reuploaded', color: 'bg-blue-50 text-blue-700 border-blue-200' },
}

export default function DocumentDetailPage() {
  const params = useParams()
  const documentId = params.id as string
  const [doc, setDoc] = useState<DocumentVerification | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<UserRole>('Receptionist')
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const canApprove = userRole === 'Admin' || userRole === 'Receptionist'
  const canReject = userRole === 'Admin' || userRole === 'Receptionist'
  const canRequestReplacement = userRole === 'Admin' || userRole === 'Receptionist'

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
  }

  const fetchDocument = async () => {
    try {
      setTimeout(() => setLoading(true), 0)
      const res = await fetch(`/api/documents/${documentId}`, {
        headers: await getAuthHeaders(),
      })
      const json = await res.json()
      if (res.ok) {
        setDoc(json)
      } else {
        setError(json.error || 'Document not found')
      }
    } catch {
      setError('Failed to load document')
    } finally {
      setTimeout(() => setLoading(false), 0)
    }
  }

  useEffect(() => {
    setTimeout(() => {
      checkAuth()
      fetchDocument()
    }, 0)
  }, [documentId])

  const handleApprove = async () => {
    if (!doc) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'approve' }),
      })
      const json = await res.json()
      if (res.ok) {
        showNotification('success', 'Document approved successfully')
        await logAuditAction('Document Approved', 'visitor_document', doc.id, `Document ${doc.document_type} approved`)
        fetchDocument()
      } else {
        showNotification('error', json.error || 'Failed to approve document')
      }
    } catch {
      showNotification('error', 'Failed to approve document')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async (reason: string) => {
    if (!doc) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'reject', reason }),
      })
      const json = await res.json()
      if (res.ok) {
        showNotification('success', 'Document rejected')
        await logAuditAction('Document Rejected', 'visitor_document', doc.id, `Document ${doc.document_type} rejected`)
        fetchDocument()
      } else {
        showNotification('error', json.error || 'Failed to reject document')
      }
    } catch {
      showNotification('error', 'Failed to reject document')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRequestReplacement = async (reason: string) => {
    if (!doc) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'replacement', reason }),
      })
      const json = await res.json()
      if (res.ok) {
        showNotification('success', 'Replacement requested')
        await logAuditAction('Replacement Requested', 'visitor_document', doc.id, `Replacement requested for document ${doc.document_type}`)
        fetchDocument()
      } else {
        showNotification('error', json.error || 'Failed to request replacement')
      }
    } catch {
      showNotification('error', 'Failed to request replacement')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!doc) return
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'download' }),
      })
      const json = await res.json()
      if (res.ok && json.url) {
        const a = document.createElement('a')
        a.href = json.url
        a.download = json.file_name || 'document'
        a.click()
        showNotification('success', 'Download started')
      } else {
        showNotification('error', json.error || 'Failed to download document')
      }
    } catch {
      showNotification('error', 'Failed to download document')
    }
  }

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium">Error</p>
          <p className="text-sm text-gray-500 mt-1">{error || 'Document not found'}</p>
          <Link href="/documents" className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Back to Documents
          </Link>
        </div>
      </div>
    )
  }

  const statusConfig = STATUS_CONFIG[doc.status] || STATUS_CONFIG.Pending

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="mb-6">
          <Link href="/documents" className="text-sm text-blue-600 hover:underline">
            ← Back to Documents
          </Link>
        </div>

        {notification && (
          <div
            className={`rounded-lg p-4 text-sm ${
              notification.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {notification.message}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Visitor Information</h2>
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Name</span>
                  <p className="text-sm font-semibold text-gray-900">{doc.visitor?.full_name || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Email</span>
                  <p className="text-sm text-gray-700">{doc.visitor?.email || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Organization</span>
                  <p className="text-sm text-gray-700">{doc.visitor?.visitor_organization || '—'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Visit Information</h2>
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Visit ID</span>
                  <p className="text-sm text-gray-700">{doc.visit_id || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                  <p className="text-sm text-gray-700 capitalize">{doc.visit?.status?.replace('_', ' ') || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Host</span>
                  <p className="text-sm text-gray-700">{doc.visit?.employee?.full_name || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Department</span>
                  <p className="text-sm text-gray-700">{doc.visit?.employee?.department || '—'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Document Details</h2>
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Document Type</span>
                  <p className="text-sm text-gray-700">{doc.document_type}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusConfig.color}`}>
                    {doc.status}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Uploaded</span>
                  <p className="text-sm text-gray-700">{doc.created_at ? new Date(doc.created_at).toLocaleString() : '—'}</p>
                </div>
                {doc.approved_at && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase">Verified At</span>
                    <p className="text-sm text-gray-700">{doc.approved_at ? new Date(doc.approved_at).toLocaleString() : '—'}</p>
                  </div>
                )}
              </div>
            </div>

            {doc.status === 'Pending' && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
                <div className="flex flex-wrap gap-2">
                  {canApprove && (
                    <button
                      onClick={handleApprove}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {actionLoading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <CheckCircle className="h-4 w-4" />}
                      Approve
                    </button>
                  )}
                  {canReject && (
                    <RejectButton onReject={handleReject} doc={doc} />
                  )}
                  {canRequestReplacement && (
                    <ReplacementButton onRequestReplacement={handleRequestReplacement} doc={doc} />
                  )}
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Front Image</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                    className="p-1 rounded-md hover:bg-gray-100"
                    title="Zoom Out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <span className="text-sm text-gray-600">{Math.round(zoom * 100)}%</span>
                  <button
                    onClick={() => setZoom(z => Math.min(3, z + 0.25))}
                    className="p-1 rounded-md hover:bg-gray-100"
                    title="Zoom In"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setRotation(r => r + 90)}
                    className="p-1 rounded-md hover:bg-gray-100"
                    title="Rotate"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => window.open(doc.document_url || '', '_blank')}
                    className="p-1 rounded-md hover:bg-gray-100"
                    title="Open in New Tab"
                    disabled={!doc.document_url}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      const a = document.createElement('a')
                      a.href = doc.document_url || ''
                      a.download = doc.document_type
                      a.click()
                    }}
                    className="p-1 rounded-md hover:bg-gray-100"
                    title="Download"
                    disabled={!doc.document_url}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 overflow-auto">
                {doc.document_url ? (
                  <img
                    src={doc.document_url}
                    alt={doc.document_type}
                    className="max-w-full max-h-[500px] object-contain rounded-lg transition-transform"
                    style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                    <FileText className="h-12 w-12 mb-3 text-gray-300" />
                    <p>Front image not available</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Back Image</h2>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 overflow-auto">
                {doc.back_image_url ? (
                  <img
                    src={doc.back_image_url}
                    alt={doc.document_type}
                    className="max-w-full max-h-[500px] object-contain rounded-lg"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                    <FileText className="h-12 w-12 mb-3 text-gray-300" />
                    <p>Back image not available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RejectButton({ onReject, doc }: { onReject: (id: string, reason: string) => void; doc: DocumentVerification }) {
  const [reason, setReason] = useState('')
  const [showForm, setShowForm] = useState(false)

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
      >
        <XCircle className="h-4 w-4" />
        Reject
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Rejection reason..."
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <button
        onClick={() => {
          if (reason.trim()) {
            onReject(doc.id, reason)
            setShowForm(false)
            setReason('')
          }
        }}
        disabled={!reason.trim()}
        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        Confirm
      </button>
      <button
        onClick={() => setShowForm(false)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Cancel
      </button>
    </div>
  )
}

function ReplacementButton({ onRequestReplacement, doc }: { onRequestReplacement: (id: string, reason: string) => void; doc: DocumentVerification }) {
  const [reason, setReason] = useState('')
  const [showForm, setShowForm] = useState(false)

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
      >
        <AlertTriangle className="h-4 w-4" />
        Request Replacement
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Replacement reason..."
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <button
        onClick={() => {
          if (reason.trim()) {
            onRequestReplacement(doc.id, reason)
            setShowForm(false)
            setReason('')
          }
        }}
        disabled={!reason.trim()}
        className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
      >
        Confirm
      </button>
      <button
        onClick={() => setShowForm(false)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Cancel
      </button>
    </div>
  )
}
