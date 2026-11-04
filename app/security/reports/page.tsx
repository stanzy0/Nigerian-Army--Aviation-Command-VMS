'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth-client'
import { Loader2, Download, FileText } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function SecurityReportsPage() {
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [reports, setReports] = useState({
    approvals: 0,
    denials: 0,
    gateTraffic: 0,
    vehicleTraffic: 0,
    vehicleEntries: 0,
    vehicleExits: 0,
  })

  const fetchReports = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/security/reports')
      const json = await res.json()
      if (json.success) {
        setReports(json.data)
      }
    } catch (err) {
      console.error('Failed to fetch security reports:', err)
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
      if (!PERMISSIONS[user.role]?.includes('scanner')) {
        window.location.href = '/unauthorized'
        return
      }
      setAuthChecking(false)
      fetchReports()
    }
    checkAuth()
  }, [])

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text('Security Operations Report', 14, 22)
    doc.setFontSize(11)
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 32)

    autoTable(doc, {
      startY: 40,
      head: [['Metric', 'Value']],
      body: [
        ['Approvals', reports.approvals.toString()],
        ['Denials', reports.denials.toString()],
        ['Gate Traffic', reports.gateTraffic.toString()],
        ['Vehicle Traffic', reports.vehicleTraffic.toString()],
        ['Vehicle Entries', reports.vehicleEntries.toString()],
        ['Vehicle Exits', reports.vehicleExits.toString()],
      ],
    })

    doc.save(`security-report-${new Date().toISOString().split('T')[0]}.pdf`)
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F5DC]">Security Reports</h1>
            <p className="text-sm text-[#9A9F87]">Gate traffic, approvals, denials, and vehicle reports</p>
          </div>
          <button onClick={exportPDF} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 min-h-[52px]">
            <Download className="h-4 w-4" />
            Export PDF
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
            <p className="text-sm text-[#9A9F87]">Approvals</p>
            <p className="text-2xl font-bold text-green-600">{reports.approvals}</p>
          </div>
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
            <p className="text-sm text-[#9A9F87]">Denials</p>
            <p className="text-2xl font-bold text-red-600">{reports.denials}</p>
          </div>
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
            <p className="text-sm text-[#9A9F87]">Gate Traffic</p>
            <p className="text-2xl font-bold text-[#F5F5DC]">{reports.gateTraffic}</p>
          </div>
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
            <p className="text-sm text-[#9A9F87]">Vehicle Traffic</p>
            <p className="text-2xl font-bold text-[#F5F5DC]">{reports.vehicleTraffic}</p>
          </div>
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
            <p className="text-sm text-[#9A9F87]">Vehicle Entries</p>
            <p className="text-2xl font-bold text-blue-600">{reports.vehicleEntries}</p>
          </div>
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
            <p className="text-sm text-[#9A9F87]">Vehicle Exits</p>
            <p className="text-2xl font-bold text-[#F5F5DC]">{reports.vehicleExits}</p>
          </div>
        </div>
      </div>
    </div>
  )
}


