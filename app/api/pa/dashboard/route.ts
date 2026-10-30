import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth'
import { getHostEmployeeIdForPA } from '@/lib/server/pa-helpers'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ success: false, message: 'Unauthorized', error: '' }, { status: 401 })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
  }

  const { data: userRole } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!userRole || (userRole.role !== 'PA_TO_DIRECTOR' && userRole.role !== 'PA_TO_CI')) {
    return NextResponse.json({ success: false, message: 'Access denied', error: '' }, { status: 403 })
  }

  const hostEmployeeId = await getHostEmployeeIdForPA(user.id, userRole.role)
  const isAdmin = userRole.role === 'Admin'

  if (!hostEmployeeId && !isAdmin) {
    return NextResponse.json({
      success: true,
      data: {
        visitsToday: [],
        pendingVisits: [],
        approvedVisits: [],
        checkedInVisits: [],
        checkedOutVisits: [],
        hostEmployee: null,
      },
    })
  }

  const { data: hostEmployee, error: hostError } = isAdmin
    ? { data: null, error: null }
    : await supabaseAdmin
        .from('employees')
        .select('id, full_name, position, department')
        .eq('id', hostEmployeeId!)
        .single()

  if (hostError) {
    return NextResponse.json({ success: false, message: 'Failed to load host employee', error: hostError.message }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') || 'today'
  const customFromParam = searchParams.get('from')
  const customToParam = searchParams.get('to')

  const now = new Date()
  let startDate: Date
  let endDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  if (range === 'custom' && customFromParam && customToParam) {
    startDate = new Date(customFromParam)
    endDate = new Date(customToParam)
    endDate.setHours(23, 59, 59, 999)
  } else {
    switch (range) {
      case '7days':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0)
        break
      case '30days':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0)
        break
      case 'yesterday':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999)
        break
      case 'thisMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
        break
      case 'today':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        break
    }
  }

  const startStr = startDate.toISOString()
  const endStr = endDate.toISOString()

  const baseQuery = supabaseAdmin
    .from('visits')
    .select('*, visitor:visitors(*), employee:employees(*)')
    .or(
      `and(created_at.gte.${startStr},created_at.lte.${endStr}),` +
      `and(check_in_time.gte.${startStr},check_in_time.lte.${endStr}),` +
      `and(check_out_time.gte.${startStr},check_out_time.lte.${endStr}),` +
      `status.eq.pending,` +
      `status.eq.approved`
    )

  const dateQuery = !isAdmin && hostEmployeeId ? baseQuery.eq('employee_id', hostEmployeeId!) : baseQuery

  const [{ data: dateData, error: dateError }] = await Promise.all([
    dateQuery.then((q: unknown) => q),
  ])

  if (dateError) {
    return NextResponse.json({ success: false, message: 'Failed to load visits', error: dateError.message }, { status: 500 })
  }

  const all = dateData || []
  const pendingVisits = all.filter((v: { status: string }) => v.status === 'pending')
  const approvedVisits = all.filter((v: { status: string }) => v.status === 'approved')
  const checkedInVisits = all.filter((v: { status: string }) => v.status === 'checked_in')
  const checkedOutVisits = all.filter((v: { status: string }) => v.status === 'checked_out')

  return NextResponse.json({
    success: true,
    data: {
      visitsToday: all,
      pendingVisits,
      approvedVisits,
      checkedInVisits,
      checkedOutVisits,
      hostEmployee: hostEmployee || null,
      range,
    },
  })
}
