'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, PERMISSIONS, UserRole } from '@/lib/auth-client'
import { logAuditAction } from '@/lib/client/audit'
import ImageWithFallback from '@/components/ui/ImageWithFallback'
import { Search, Users, UserCheck, Building2, Loader2, AlertTriangle, CheckCircle2, XCircle, Heart, UserX, Play, Square } from 'lucide-react'

interface Visit {
  id: string
  purpose: string
  status: string
  check_in_time: string | null
  visitor: { full_name: string; visitor_organization: string | null; photo_url: string | null } | null
  employee: { full_name: string; department: string; office_location: string } | null
}

interface Summary {
  visitorsOnSite: number
  hosts: number
  departments: number
  buildings: number
}

interface RollCallEntry {
  id: string
  session_id: string
  visit_id: string
  visitor_id: string
  status: string
  marked_by: string | null
  marked_at: string | null
  visit: Visit
}

interface EmergencySession {
  id: string
  is_active: boolean
  started_by: string
  started_at: string
  ended_at: string | null
}

export default function EmergencyPage() {
  const [userRole, setUserRole] = useState<UserRole>('Receptionist')
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [summary, setSummary] = useState<Summary>({
    visitorsOnSite: 0,
    hosts: 0,
    departments: 0,
    buildings: 0,
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('')

  // Phase 2: Roll Call
  const [emergencyMode, setEmergencyMode] = useState(false)
  const [session, setSession] = useState<EmergencySession | null>(null)
  const [rollCallEntries, setRollCallEntries] = useState<RollCallEntry[]>([])
  const [rollCallSummary, setRollCallSummary] = useState({ total: 0, accountedFor: 0, evacuated: 0, injured: 0, missing: 0 })
  const [startingEmergency, setStartingEmergency] = useState(false)
  const [endingEmergency, setEndingEmergency] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

   const realtimeChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)
   const rollCallChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)

   const computeRollCallSummary = (entries: RollCallEntry[]) => {
     setRollCallSummary({
       total: entries.length,
       accountedFor: entries.filter(e => e.status === 'accounted_for').length,
       evacuated: entries.filter(e => e.status === 'evacuated').length,
       injured: entries.filter(e => e.status === 'injured').length,
       missing: entries.filter(e => e.status === 'missing').length,
     })
   }

   const fetchRollCallEntries = async (sessionId: string) => {
     const { data } = await supabase
       .from('roll_call_entries')
       .select(`
         *,
         visit:visits(
           *,
           visitor:visitors(full_name, visitor_organization, photo_url),
           employee:employees(full_name, department, office_location)
         )
       `)
       .eq('session_id', sessionId)
       .order('created_at', { ascending: true })

     if (data) {
       const entries = data as RollCallEntry[]
       setRollCallEntries(entries)
       computeRollCallSummary(entries)
     }
   }

   const checkActiveSession = async () => {
    const { data } = await supabase
      .from('emergency_sessions')
      .select('*')
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      setSession(data as EmergencySession)
      setEmergencyMode(true)
      fetchRollCallEntries((data as EmergencySession).id)
    }
  }

  const fetchCheckedIn = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('visits')
      .select(`
        *,
        visitor:visitors(full_name, visitor_organization, photo_url),
        employee:employees(full_name, department, office_location)
      `)
      .eq('status', 'checked_in')
      .order('check_in_time', { ascending: true })

    if (error) {
      console.error('Error fetching checked-in visits:', error)
    } else {
      setVisits(data || [])
      computeSummary(data || [])
    }
    setLoading(false)
  }

  const computeSummary = (checkedIn: Visit[]) => {
    const hosts = new Set(checkedIn.map(v => v.employee?.full_name).filter(Boolean))
    const departments = new Set(checkedIn.map(v => v.employee?.department).filter(Boolean))
    const buildings = new Set(checkedIn.map(v => v.employee?.office_location).filter(Boolean))

    setSummary({
      visitorsOnSite: checkedIn.length,
      hosts: hosts.size,
      departments: departments.size,
      buildings: buildings.size,
    })
  }

  // Phase 1 Realtime
  const setupRealtime = () => {
    if (realtimeChannel.current) {
      supabase.removeChannel(realtimeChannel.current)
    }

    realtimeChannel.current = supabase
      .channel('emergency-occupancy')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visits' },
        (payload) => {
          const newVisit = payload.new as Visit | null
          const oldVisit = payload.old as Visit | null

          if (payload.eventType === 'INSERT' && newVisit?.status === 'checked_in') {
            setVisits(prev => {
              const exists = prev.some(v => v.id === newVisit.id)
              return exists ? prev : [...prev, newVisit]
            })
          } else if (payload.eventType === 'UPDATE' && newVisit) {
            if (newVisit.status === 'checked_in') {
              setVisits(prev => prev.some(v => v.id === newVisit.id) ? prev.map(v => v.id === newVisit.id ? newVisit : v) : [...prev, newVisit])
            } else {
              setVisits(prev => prev.filter(v => v.id !== newVisit.id))
            }
          } else if (payload.eventType === 'DELETE' && oldVisit) {
            setVisits(prev => prev.filter(v => v.id !== oldVisit.id))
          }

          setTimeout(() => {
            supabase
              .from('visits')
              .select(`
                *,
                visitor:visitors(full_name, visitor_organization, photo_url),
                employee:employees(full_name, department, office_location)
              `)
              .eq('status', 'checked_in')
              .then(({ data }) => {
                if (data) computeSummary(data)
              })
          }, 100)
        }
      )
      .subscribe()
  }

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      if (!PERMISSIONS[user.role]?.includes('emergency')) {
        window.location.href = '/unauthorized'
        return
      }
      setUserRole(user.role)
      setAuthChecking(false)
      fetchCheckedIn()
      checkActiveSession()
      setupRealtime()
    }
    checkAuth()

    return () => {
      if (realtimeChannel.current) {
        supabase.removeChannel(realtimeChannel.current)
      }
      if (rollCallChannel.current) {
        supabase.removeChannel(rollCallChannel.current)
      }
    }
  }, [])

  // Phase 2: Start Emergency
  const startEmergency = async () => {
    if (userRole !== 'Admin') return
    setStartingEmergency(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: sessionData, error: sessionError } = await supabase
        .from('emergency_sessions')
        .insert({
          is_active: true,
          started_by: user.id,
        })
        .select()
        .single()

      if (sessionError || !sessionData) {
        console.error('Failed to create emergency session:', sessionError)
        setStartingEmergency(false)
        return
      }

      const newSession = sessionData as EmergencySession
      const { data: checkedIn } = await supabase
        .from('visits')
        .select('id, visitor_id, employee_id')
        .eq('status', 'checked_in')

      if (checkedIn && checkedIn.length > 0) {
        const entries = checkedIn.map((v: any) => ({
          session_id: newSession.id,
          visit_id: v.id,
          visitor_id: v.visitor_id,
          status: 'missing',
        }))

        await supabase.from('roll_call_entries').insert(entries)
      }

      setSession(newSession)
      setEmergencyMode(true)
      await fetchRollCallEntries(newSession.id)
      await logAuditAction('Emergency Started', 'emergency', newSession.id, `Emergency session started. ${checkedIn?.length || 0} visitors on site.`)
    } catch (err) {
      console.error('Error starting emergency:', err)
    }

    setStartingEmergency(false)
  }

   // Phase 2: Update Roll Call Status
  const updateRollCallStatus = async (entryId: string, newStatus: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('roll_call_entries')
      .update({
        status: newStatus,
        marked_by: user.id,
        marked_at: new Date().toISOString(),
      })
      .eq('id', entryId)

    if (error) {
      console.error('Error updating roll call status:', error)
    } else {
      setRollCallEntries(prev => prev.map(e => e.id === entryId ? { ...e, status: newStatus, marked_by: user.id, marked_at: new Date().toISOString() } : e))
      const statusLabel = newStatus.replace(/_/g, ' ')
      await logAuditAction(`Visitor Marked ${statusLabel}`, 'roll_call', entryId, `Visitor marked as ${newStatus}`)
    }
  }

  // Phase 2: End Emergency
  const endEmergency = async () => {
    if (userRole !== 'Admin' || !session) return
    setEndingEmergency(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('emergency_sessions')
        .update({
          is_active: false,
          ended_at: new Date().toISOString(),
          ended_by: user.id,
        })
        .eq('id', session.id)

      if (error) {
        console.error('Error ending emergency:', error)
      } else {
        await logAuditAction('Emergency Ended', 'emergency', session.id, 'Emergency session ended and archived')
        setSession(null)
        setEmergencyMode(false)
        setRollCallEntries([])
        setRollCallSummary({ total: 0, accountedFor: 0, evacuated: 0, injured: 0, missing: 0 })
      }
    } catch (err) {
      console.error('Error ending emergency:', err)
    }

    setEndingEmergency(false)
    setShowEndConfirm(false)
  }

  // Phase 2: Roll Call Realtime
  useEffect(() => {
    if (!emergencyMode || !session) {
      if (rollCallChannel.current) {
        supabase.removeChannel(rollCallChannel.current)
        rollCallChannel.current = null
      }
      return
    }

    if (rollCallChannel.current) {
      supabase.removeChannel(rollCallChannel.current)
    }

    rollCallChannel.current = supabase
      .channel('roll-call-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'roll_call_entries', filter: `session_id=eq.${session.id}` },
        (payload) => {
          const newEntry = payload.new as RollCallEntry | null
          const oldEntry = payload.old as RollCallEntry | null

          if (payload.eventType === 'INSERT' && newEntry) {
            setRollCallEntries(prev => {
              const exists = prev.some(e => e.id === newEntry.id)
              return exists ? prev : [...prev, newEntry]
            })
          } else if (payload.eventType === 'UPDATE' && newEntry) {
            setRollCallEntries(prev => prev.map(e => e.id === newEntry.id ? newEntry : e))
          } else if (payload.eventType === 'DELETE' && oldEntry) {
            setRollCallEntries(prev => prev.filter(e => e.id !== oldEntry.id))
          }

          setTimeout(() => {
            supabase
              .from('roll_call_entries')
              .select(`
                *,
                visit:visits(
                  *,
                  visitor:visitors(full_name, visitor_organization, photo_url),
                  employee:employees(full_name, department, office_location)
                )
              `)
              .eq('session_id', session.id)
              .then(({ data }) => {
                if (data) {
                  const entries = data as RollCallEntry[]
                  setRollCallEntries(entries)
                  computeRollCallSummary(entries)
                }
              })
          }, 100)
        }
      )
      .subscribe()

    return () => {
      if (rollCallChannel.current) {
        supabase.removeChannel(rollCallChannel.current)
        rollCallChannel.current = null
      }
    }
  }, [emergencyMode, session?.id])

   
  const getTimeOnSite = (checkInTime: string | null) => {
    if (!checkInTime) return '—'
    const diff = now - new Date(checkInTime).getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${minutes}m`
  }

  const filteredVisits = visits.filter(v => {
    const matchesSearch =
      (v.visitor?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.visitor?.visitor_organization || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.employee?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.purpose || '').toLowerCase().includes(searchTerm.toLowerCase())

    const matchesDepartment = !departmentFilter || v.employee?.department === departmentFilter
    const matchesBuilding = !buildingFilter || v.employee?.office_location === buildingFilter

    return matchesSearch && matchesDepartment && matchesBuilding
  })

  const departments = Array.from(new Set(visits.map(v => v.employee?.department).filter(Boolean) as string[]))
  const buildings = Array.from(new Set(visits.map(v => v.employee?.office_location).filter(Boolean) as string[]))

  if (authChecking) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const statusOptions = [
    { value: 'missing', label: 'Missing', icon: UserX, color: 'bg-red-50 text-red-700' },
    { value: 'accounted_for', label: 'Accounted For', icon: CheckCircle2, color: 'bg-green-50 text-green-700' },
    { value: 'evacuated', label: 'Evacuated', icon: XCircle, color: 'bg-blue-50 text-blue-700' },
    { value: 'injured', label: 'Injured', icon: Heart, color: 'bg-amber-50 text-amber-700' },
  ]

  return (
    <div className="min-h-screen bg-[#0B0F08]">
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="mb-6">
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
            ← Back to Dashboard
          </a>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <ImageWithFallback
              src="/images/afcsc-logo.png"
              alt="Nigerian Army Aviation Command Logo"
              className="h-8 w-8 object-contain"
            />
            <AlertTriangle className="h-8 w-8 text-red-600" />
            <ImageWithFallback
              src="/images/army logo.png"
              alt="Army Logo"
              className="h-8 w-8 object-contain"
            />
            <h1 className="text-2xl font-bold text-[#F5F5DC]">
              {emergencyMode ? 'Emergency Roll Call — Active' : 'Emergency Occupancy Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {emergencyMode && (
              <span className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700 animate-pulse">
                ACTIVE EMERGENCY
              </span>
            )}
            <div className="text-sm text-[#9A9F87]">
              {emergencyMode ? 'Roll call in progress' : 'Live updates via Supabase Realtime'}
            </div>
          </div>
        </div>

        {/* Phase 2: Start / End Emergency Controls */}
        {!emergencyMode && userRole === 'Admin' && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-[#F5F5DC]">Initiate Emergency Roll Call</h3>
                <p className="text-sm text-[#9A9F87] mt-1">
                  This will capture a snapshot of all visitors currently on site and freeze the list for roll call tracking.
                </p>
              </div>
              <button
                onClick={startEmergency}
                disabled={startingEmergency}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {startingEmergency ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start Emergency
              </button>
            </div>
          </div>
        )}

        {emergencyMode && userRole === 'Admin' && (
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-[#F5F5DC]">Control Emergency</h3>
                <p className="text-sm text-[#9A9F87] mt-1">
                  Session started: {session ? new Date(session.started_at).toLocaleString() : '—'}
                </p>
              </div>
              <button
                onClick={() => setShowEndConfirm(true)}
                disabled={endingEmergency}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-6 py-3 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50 transition-colors"
              >
                <Square className="h-4 w-4" />
                End Emergency
              </button>
            </div>
          </div>
        )}

        {/* End Emergency Confirmation Dialog */}
        {showEndConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-[#10150D] shadow-xl p-6">
              <h3 className="text-lg font-semibold text-[#F5F5DC] mb-2">End Emergency?</h3>
              <p className="text-sm text-[#9A9F87] mb-6">
                This will close the current emergency and archive the roll call.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-[#9A9F87] hover:bg-[#4B5320]/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={endEmergency}
                  disabled={endingEmergency}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {endingEmergency && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm End Emergency
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase 2: Roll Call Summary */}
        {emergencyMode && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[#9A9F87]">Total Visitors</p>
                <Users className="h-5 w-5 text-[#9A9F87]" />
              </div>
              <p className="mt-2 text-3xl font-bold text-[#F5F5DC]">{rollCallSummary.total}</p>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-green-700">Accounted For</p>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <p className="mt-2 text-3xl font-bold text-green-900">{rollCallSummary.accountedFor}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-blue-700">Evacuated</p>
                <XCircle className="h-5 w-5 text-blue-600" />
              </div>
              <p className="mt-2 text-3xl font-bold text-blue-900">{rollCallSummary.evacuated}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-amber-700">Injured</p>
                <Heart className="h-5 w-5 text-amber-600" />
              </div>
              <p className="mt-2 text-3xl font-bold text-amber-900">{rollCallSummary.injured}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-red-700">Missing</p>
                <UserX className="h-5 w-5 text-red-600" />
              </div>
              <p className="mt-2 text-3xl font-bold text-red-900">{rollCallSummary.missing}</p>
            </div>
          </div>
        )}

        {/* Phase 1: Occupancy Summary Cards */}
        {!emergencyMode && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[#9A9F87]">Visitors On Site</p>
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <p className="mt-2 text-3xl font-bold text-[#F5F5DC]">{loading ? '...' : summary.visitorsOnSite}</p>
            </div>
            <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[#9A9F87]">Hosts Present</p>
                <UserCheck className="h-5 w-5 text-green-600" />
              </div>
              <p className="mt-2 text-3xl font-bold text-[#F5F5DC]">{loading ? '...' : summary.hosts}</p>
            </div>
            <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[#9A9F87]">Departments</p>
                <Building2 className="h-5 w-5 text-purple-600" />
              </div>
              <p className="mt-2 text-3xl font-bold text-[#F5F5DC]">{loading ? '...' : summary.departments}</p>
            </div>
            <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[#9A9F87]">Buildings</p>
                <Building2 className="h-5 w-5 text-amber-600" />
              </div>
              <p className="mt-2 text-3xl font-bold text-[#F5F5DC]">{loading ? '...' : summary.buildings}</p>
            </div>
          </div>
        )}

        {/* Phase 1: Normal Occupancy Table */}
        {!emergencyMode && (
          <div className="rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] shadow-sm">
            <div className="p-4 border-b border-[rgba(85,107,47,0.35)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-lg font-semibold text-[#F5F5DC]">Current Occupancy</h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search visitors..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg bg-[#10150D] text-black placeholder:text-[#9A9F87] focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
                  />
                </div>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Departments</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <select
                  value={buildingFilter}
                  onChange={(e) => setBuildingFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Buildings</option>
                  {buildings.map(building => (
                    <option key={building} value={building}>{building}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Visitor</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Organization</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Host</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Department</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Office Location</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Purpose</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Check In Time</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Time On Site</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                    {filteredVisits.map((visit) => (
                      <tr key={visit.id} className="hover:bg-[#4B5320]/10 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {visit.visitor?.photo_url ? (
                              <img
                                src={visit.visitor.photo_url}
                                alt={visit.visitor.full_name}
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                                <span className="text-xs text-[#9A9F87]">
                                  {(visit.visitor?.full_name || '').charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                            <span className="font-medium text-[#F5F5DC]">{visit.visitor?.full_name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#9A9F87]">{visit.visitor?.visitor_organization || '—'}</td>
                        <td className="px-4 py-3 text-[#9A9F87]">{visit.employee?.full_name || '—'}</td>
                        <td className="px-4 py-3 text-[#9A9F87]">{visit.employee?.department || '—'}</td>
                        <td className="px-4 py-3 text-[#9A9F87]">{visit.employee?.office_location || '—'}</td>
                        <td className="px-4 py-3 text-[#9A9F87]">{visit.purpose || '—'}</td>
                        <td className="px-4 py-3 text-[#9A9F87] whitespace-nowrap">
                          {visit.check_in_time ? new Date(visit.check_in_time).toLocaleTimeString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-[#9A9F87] font-mono">
                          {getTimeOnSite(visit.check_in_time)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                            On Site
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {!loading && filteredVisits.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-[#9A9F87]">No visitors currently on site</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Phase 2: Roll Call Table */}
        {emergencyMode && (
          <div className="rounded-xl border border-red-200 bg-[#10150D] shadow-sm">
            <div className="p-4 border-b border-[rgba(85,107,47,0.35)]">
              <h2 className="text-lg font-semibold text-[#F5F5DC]">Roll Call — Snapshot</h2>
              <p className="text-xs text-[#9A9F87] mt-1">
                This list is frozen. Visitors who check out will remain visible until the emergency ends.
              </p>
            </div>
            <div className="overflow-x-auto">
              {rollCallEntries.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(85,107,47,0.35)] bg-gray-50">
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Visitor</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Organization</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Host</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Department</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Office Location</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Purpose</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Check In Time</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Time On Site</th>
                      <th className="px-4 py-3 font-semibold text-[#9A9F87]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(85,107,47,0.25)]">
                    {rollCallEntries.map((entry) => {
                      const v = entry.visit
                      const currentStatus = statusOptions.find(s => s.value === entry.status) || statusOptions[0]
                      const StatusIcon = currentStatus.icon

                      return (
                        <tr key={entry.id} className="hover:bg-[#4B5320]/10 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {v.visitor?.photo_url ? (
                                <img
                                  src={v.visitor.photo_url}
                                  alt={v.visitor.full_name}
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                                  <span className="text-xs text-[#9A9F87]">
                                    {(v.visitor?.full_name || '').charAt(0).toUpperCase()}
                                  </span>
                                </div>
                              )}
                              <span className="font-medium text-[#F5F5DC]">{v.visitor?.full_name || '—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#9A9F87]">{v.visitor?.visitor_organization || '—'}</td>
                          <td className="px-4 py-3 text-[#9A9F87]">{v.employee?.full_name || '—'}</td>
                          <td className="px-4 py-3 text-[#9A9F87]">{v.employee?.department || '—'}</td>
                          <td className="px-4 py-3 text-[#9A9F87]">{v.employee?.office_location || '—'}</td>
                          <td className="px-4 py-3 text-[#9A9F87]">{v.purpose || '—'}</td>
                          <td className="px-4 py-3 text-[#9A9F87] whitespace-nowrap">
                            {v.check_in_time ? new Date(v.check_in_time).toLocaleTimeString() : '—'}
                          </td>
                          <td className="px-4 py-3 text-[#9A9F87] font-mono">
                            {getTimeOnSite(v.check_in_time)}
                          </td>
                          <td className="px-4 py-3">
                            {userRole === 'Admin' || userRole === 'Security' ? (
                              <select
                                value={entry.status}
                                onChange={(e) => updateRollCallStatus(entry.id, e.target.value)}
                                className={`rounded-lg border px-2 py-1 text-xs font-medium ${currentStatus.color} border-current focus:outline-none focus:ring-2 focus:ring-blue-500`}
                              >
                                {statusOptions.map(opt => (
                                  <option key={opt.value} value={opt.value} className="bg-[#10150D] text-[#F5F5DC]">
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${currentStatus.color}`}>
                                <StatusIcon className="h-3 w-3" />
                                {currentStatus.label}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


