import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'
import { isDemoMode } from '@/lib/demo'
import { getHostVisitors, approveVisitor, rejectVisitor } from '@/lib/server/host'

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['Host Employee', 'Admin'])
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
  }

  try {
    const employeeId = request.headers.get('x-employee-id') || 'default'
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const search = searchParams.get('search') || undefined

    const visitors = await getHostVisitors(employeeId, { status, search })
    return NextResponse.json({ success: true, data: visitors })
  } catch (err) {
    console.error('Host visitors error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: '' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['Host Employee', 'Admin'])
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
  }

  try {
    const body = await request.json()
    const { visitId, action, reason } = body

    if (isDemoMode()) {
      return NextResponse.json({ success: true, data: { id: visitId, status: action === 'approve' ? 'approved' : 'rejected' } })
    }

    const employeeId = request.headers.get('x-employee-id') || 'default'

    if (action === 'approve') {
      const updated = await approveVisitor(visitId, employeeId)
      return NextResponse.json({ success: true, data: updated })
    }

    if (action === 'reject') {
      if (!reason) {
        return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
      }
      const updated = await rejectVisitor(visitId, employeeId, reason)
      return NextResponse.json({ success: true, data: updated })
    }

    return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
  } catch (err) {
    console.error('Host visitor action error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
