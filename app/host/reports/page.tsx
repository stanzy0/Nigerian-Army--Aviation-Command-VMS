'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth-client'
import { Loader2, Download, FileText, Users, Clock, TrendingUp } from 'lucide-react'

interface HostReport {
  monthlyVisitors: number
  frequentVisitors: Array<{ visitor_name: string; visit_count: number }>
  pendingVisitors: number
  visitorHistory: Array<{
    id: string
    visitor_name: string
    purpose: string
    status: string
    check_in_time: string | null
    check_out_time: string | null
    created_at: string
  }>
}

export default function HostReportsPage() {
  const [userRole, setUserRole] = useState<string>('')
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [report, setReport] = useState<HostReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<'today' | '7days' | '30days'>('30days')
  const [exporting, setExporting] = useState(false)

  const fetchReport = async () => {
    if (!employeeId) return
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }

      const res = await fetch(`/api/host/reports?range=${range}`, {
        headers,
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Failed to fetch report')
      }

      setReport(result.data)
    } catch (err) {
      console.error('Error fetching report:', err)
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
      setTimeout(() => fetchReport(), 0)
    }
  }, [employeeId, range])

  const handleExport = async (format: 'pdf' | 'excel') => {
    setExporting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }

      const res = await fetch(`/api/host/reports?range=${range}&export=${format}`, {
        headers,
      })

      if (!res.ok) {
        throw new Error('Export failed')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `host-report-${range}.${format === 'pdf' ? 'pdf' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export error:', err)
      alert('Failed to export report')
    } finally {
      setExporting(false)
    }
  }

  if (!employeeId && userRole !== 'Admin') {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-[#9A9F87]">No employee record found for your account.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F08]">
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="mb-6">
          <a href="/host" className="text-sm text-blue-600 hover:underline">
            ← Back to Host Portal
          </a>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F5DC]">Reports</h1>
            <p className="text-sm text-[#9A9F87]">Visitor statistics and history</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as 'today' | '7days' | '30days')}
              className="rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="today">Today</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
            </select>
            <button
              onClick={() => handleExport('pdf')}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              PDF
            </button>
            <button
              onClick={() => handleExport('excel')}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Excel
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : report ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[#9A9F87]">Total Visitors</p>
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <p className="mt-2 text-3xl font-bold text-[#F5F5DC]">{report.monthlyVisitors}</p>
              </div>
              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[#9A9F87]">Pending Approvals</p>
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <p className="mt-2 text-3xl font-bold text-[#F5F5DC]">{report.pendingVisitors}</p>
              </div>
              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[#9A9F87]">Frequent Visitors</p>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <p className="mt-2 text-3xl font-bold text-[#F5F5DC]">{report.frequentVisitors.length}</p>
              </div>
              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[#9A9F87]">History Records</p>
                  <FileText className="h-4 w-4 text-purple-600" />
                </div>
                <p className="mt-2 text-3xl font-bold text-[#F5F5DC]">{report.visitorHistory.length}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
                <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
                  <h3 className="text-lg font-semibold text-[#F5F5DC]">Frequent Visitors</h3>
                </div>
                <div className="p-4">
                  {report.frequentVisitors.length === 0 ? (
                    <p className="text-sm text-[#9A9F87]">No frequent visitors in this period</p>
                  ) : (
                    <div className="space-y-3">
                      {report.frequentVisitors.map((fv, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <span className="text-sm font-medium text-[#F5F5DC]">{fv.visitor_name}</span>
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                            {fv.visit_count} visits
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
                <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
                  <h3 className="text-lg font-semibold text-[#F5F5DC]">Visitor History</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                        <th className="px-4 py-3 font-semibold text-[#9A9F87]">Visitor</th>
                        <th className="px-4 py-3 font-semibold text-[#9A9F87]">Purpose</th>
                        <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                        <th className="px-4 py-3 font-semibold text-[#9A9F87]">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                      {report.visitorHistory.map((visit) => (
                        <tr key={visit.id} className="hover:bg-[#4B5320]/10 transition-colors">
                          <td className="px-4 py-3 font-medium text-[#F5F5DC]">{visit.visitor_name}</td>
                          <td className="px-4 py-3 text-[#9A9F87]">{visit.purpose}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              visit.status === 'checked_in' ? 'bg-green-50 text-green-700' :
                              visit.status === 'checked_out' ? 'bg-gray-50 text-[#9A9F87]' :
                              'bg-blue-50 text-blue-700'
                            }`}>
                              {visit.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#9A9F87]">
                             {visit.created_at ? new Date(visit.created_at).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {report.visitorHistory.length === 0 && (
                  <div className="p-8 text-center">
                    <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-[#9A9F87]">No visitor history</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="p-12 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-[#9A9F87]">No report data available</p>
          </div>
        )}
      </div>
    </div>
  )
}


