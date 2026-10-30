import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth'
import { isDemoMode } from '@/lib/demo'
import { getAssignedHostEmployeeForPA } from '@/lib/server/pa-helpers'
import { applyVisitStatusChange, type VisitStatus } from '@/lib/server/visit-status'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ success: false, message: 'Unauthorized', error: '' }, { status: 401 })
  }

  if (isDemoMode()) {
    return NextResponse.json({ success: true, data: { visit_id: id, status: 'rejected', message: 'Demo mode: rejection simulated' } })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
  }

  const { data: userRole } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!userRole || (userRole.role !== 'PA_TO_DIRECTOR' && userRole.role !== 'PA_TO_CI' && userRole.role !== 'Admin')) {
    return NextResponse.json({ success: false, message: 'Access denied', error: '' }, { status: 403 })
  }

  const isAdmin = userRole.role === 'Admin'
  const { role, hostEmployeeId } = isAdmin
    ? { role: 'Admin', hostEmployeeId: null }
    : await getAssignedHostEmployeeForPA(user.id)

  if (!isAdmin && (!role || !hostEmployeeId)) {
    return NextResponse.json({ success: false, message: 'Access denied', error: '' }, { status: 403 })
  }

  const { data: visit, error: visitError } = await supabaseAdmin
    .from('visits')
    .select('employee_id, visitor:visitors(full_name)')
    .eq('id', id)
    .single()

  if (visitError || !visit) {
    return NextResponse.json({ success: false, message: 'Visit not found', error: '' }, { status: 404 })
  }

  if (!isAdmin && visit.employee_id !== hostEmployeeId) {
    return NextResponse.json(
      { success: false, message: 'You are not authorized to manage this visitor.', error: 'forbidden' },
      { status: 403 }
    )
  }

  const visitorFullName = (() => {
    const v = visit.visitor as unknown as Array<{ full_name?: string }> | { full_name?: string } | null
    return Array.isArray(v) ? v[0]?.full_name : v?.full_name
  })()

  let rejectionReason: string | null = null
  try {
    const body = await request.json()
    if (body && typeof body.reason === 'string' && body.reason.trim()) {
      rejectionReason = body.reason.trim().slice(0, 1000)
    }
  } catch {
    // No body / invalid JSON — rejection without a reason is allowed.
  }

  const result = await applyVisitStatusChange(id, 'rejected', {
    rejectionReason,
    auditAction: 'Visitor Rejected',
    auditDetails: `PA (${role}) rejected ${visitorFullName || 'visitor'}'s visit${rejectionReason ? `: ${rejectionReason}` : ''}`,
    approvedBy: user.id,
  })

  switch (result.outcome) {
    case 'not_found':
      return NextResponse.json({ success: false, message: 'Visit not found', error: 'not_found' }, { status: 404 })
    case 'authorization':
      return NextResponse.json({ success: false, message: result.message, error: 'forbidden' }, { status: 403 })
    case 'invalid_transition':
      return NextResponse.json({ success: false, message: result.message, error: 'invalid_transition' }, { status: 409 })
    case 'success':
      // Outbox events are now enqueued transactionally by the atomic DB function.
      return NextResponse.json({ success: true, data: result })
    default:
      return NextResponse.json({ success: false, message: 'Unexpected outcome', error: 'internal' }, { status: 500 })
  }
}
