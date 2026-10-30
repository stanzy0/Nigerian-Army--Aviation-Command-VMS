import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth'
import { isDemoMode } from '@/lib/demo'
import { applyVisitStatusChange, InvalidTransitionError, type VisitStatus } from '@/lib/server/visit-status'
import { getHostEmployeeIdForPA } from '@/lib/server/pa-helpers'

const ALLOWED_ROLES = ['Admin', 'Receptionist', 'Security', 'PA_TO_DIRECTOR', 'PA_TO_CI']
const VALID_STATUSES: VisitStatus[] = ['pending', 'approved', 'rejected', 'checked_in', 'checked_out']

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ success: false, message: 'Unauthorized', error: '' }, { status: 401 })
  }

  if (isDemoMode()) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id') || ''
    const body = await request.json().catch(() => ({}))
    const newStatus = (body?.status || 'approved') as VisitStatus
    return NextResponse.json({ success: true, data: { visit_id: id, status: newStatus, message: 'Demo mode: status change simulated' } })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, message: 'Service role key not configured', error: '' }, { status: 500 })
  }

  const { data: userRole, error: roleError } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (roleError || !userRole || !ALLOWED_ROLES.includes(userRole.role)) {
    return NextResponse.json({ success: false, message: 'Access denied', error: '' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ success: false, message: 'Visit ID required', error: '' }, { status: 400 })
    }

    const body = await request.json()
    const { status } = body
    const newStatus = (status || 'approved') as VisitStatus

    if (!VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json({ success: false, message: 'Invalid status', error: 'invalid_status' }, { status: 400 })
    }

    if (userRole.role === 'PA_TO_DIRECTOR' || userRole.role === 'PA_TO_CI') {
      const { data: visit, error: visitError } = await supabaseAdmin
        .from('visits')
        .select('employee_id')
        .eq('id', id)
        .single()

      if (visitError || !visit) {
        return NextResponse.json({ success: false, message: 'Visit not found', error: '' }, { status: 404 })
      }

      const hostEmployeeId = await getHostEmployeeIdForPA(user.id, userRole.role)
      if (!hostEmployeeId || visit.employee_id !== hostEmployeeId) {
        return NextResponse.json(
          { success: false, message: 'You are not authorized to manage this visitor.', error: 'forbidden' },
          { status: 403 }
        )
      }
    }

    const result = await applyVisitStatusChange(id, newStatus, {
      auditAction: 'Visit Status Changed',
      auditDetails: `Visit ${newStatus}`,
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
        // No separate enqueue needed here.
        return NextResponse.json({ success: true, data: result })
      default:
        return NextResponse.json({ success: false, message: 'Unexpected outcome', error: 'internal' }, { status: 500 })
    }
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return NextResponse.json({ success: false, message: err.message, error: 'invalid_transition' }, { status: 409 })
    }
    console.error('Visit status update error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
