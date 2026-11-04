import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getIncident, updateIncident } from '@/lib/server/incidents'
import { logAuditAction } from '@/lib/server/audit'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    const allowedRoles = ['Admin', 'Security', 'Operations', 'Receptionist', 'Commandant']
    const userRole = user.role
    if (!userRole || !allowedRoles.includes(userRole)) {
      return NextResponse.json({ success: false, message: 'Insufficient permissions', error: 'Forbidden' }, { status: 403 })
    }

    const incident = await getIncident(id)

    if (!incident) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: incident })
  } catch (err) {
    console.error('Incident fetch error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    const allowedRoles = ['Admin', 'Security', 'Operations']
    const userRole = user.role
    if (!userRole || !allowedRoles.includes(userRole)) {
      return NextResponse.json({ success: false, message: 'Insufficient permissions', error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const incident = await updateIncident(id, body, user.id)

    return NextResponse.json({ success: true, data: incident })
  } catch (err) {
    console.error('Incident update error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'Admin') {
      return NextResponse.json({ success: false, message: 'Insufficient permissions', error: 'Forbidden' }, { status: 403 })
    }

    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const { error } = await supabaseAdmin.from('incidents').delete().eq('id', id)

    if (error) {
      throw new Error(error.message)
    }

    await logAuditAction('Incident Deleted', 'incident', id, `Incident ${id} deleted`)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Incident delete error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
