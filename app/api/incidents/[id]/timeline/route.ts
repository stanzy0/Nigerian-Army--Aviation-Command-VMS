import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getIncidentTimeline, addIncidentTimelineEntry } from '@/lib/server/incidents'
import { logAuditAction } from '@/lib/server/audit'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    const allowedRoles = ['Admin', 'Security', 'Operations', 'Receptionist', 'Commandant']
    const userRole = user.role
    if (!userRole || !allowedRoles.includes(userRole)) {
      return NextResponse.json({ success: false, message: 'Insufficient permissions', error: 'Forbidden' }, { status: 403 })
    }

    const timeline = await getIncidentTimeline(id)

    return NextResponse.json({ success: true, data: timeline })
  } catch (err) {
    console.error('Incident timeline fetch error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
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
    const { action, description, metadata } = body

    if (!action || !description) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }

    const entry = await addIncidentTimelineEntry(id, action, description, user.id, metadata || {})

    await logAuditAction('Incident Timeline Entry Added', 'incident_timeline', entry.id, `Timeline entry added for incident ${id}: ${action}`)

    return NextResponse.json({ success: true, data: entry }, { status: 201 })
  } catch (err) {
    console.error('Incident timeline entry error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    const allowedRoles = ['Admin', 'Security', 'Operations']
    const userRole = user.role
    if (!userRole || !allowedRoles.includes(userRole)) {
      return NextResponse.json({ success: false, message: 'Insufficient permissions', error: 'Forbidden' }, { status: 403 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { entry_id, action, description, metadata } = body

    if (!entry_id) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (action) updates.action = action
    if (description !== undefined) updates.description = description
    if (metadata !== undefined) updates.metadata = metadata

    const { data: entry, error } = await supabaseAdmin
      .from('incident_timeline')
      .update(updates)
      .eq('id', entry_id)
      .eq('incident_id', id)
      .select('*')
      .single()

    if (error || !entry) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 404 })
    }

    await logAuditAction('Incident Timeline Entry Updated', 'incident_timeline', entry_id, `Timeline entry ${entry_id} updated for incident ${id}`)

    return NextResponse.json({ success: true, data: entry })
  } catch (err) {
    console.error('Incident timeline update error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'Admin') {
      return NextResponse.json({ success: false, message: 'Insufficient permissions', error: 'Forbidden' }, { status: 403 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { entry_id } = body

    if (!entry_id) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('incident_timeline')
      .delete()
      .eq('id', entry_id)
      .eq('incident_id', id)

    if (error) {
      throw new Error(error.message)
    }

    await logAuditAction('Incident Timeline Entry Deleted', 'incident_timeline', entry_id, `Timeline entry ${entry_id} deleted from incident ${id}`)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Incident timeline delete error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
