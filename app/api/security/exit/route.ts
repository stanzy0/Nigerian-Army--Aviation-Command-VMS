import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isDemoMode } from '@/lib/demo'
import { createGateActivity, createSecurityDecision } from '@/lib/server/security'
import { logAuditAction } from '@/lib/server/audit'
import { getCurrentUser } from '@/lib/auth'
import { sendEmail } from '@/lib/server/email'
import { applyVisitStatusChange, type VisitStatus } from '@/lib/server/visit-status'

function calculateDuration(checkInTime: string): string {
  const checkIn = new Date(checkInTime)
  const now = new Date()
  const diffMs = now.getTime() - checkIn.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  return `${diffHours}h ${diffMinutes}m`
}

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['Security', 'Admin', 'Receptionist'])
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
  }

  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const visitId = searchParams.get('visit_id')

    if (visitId) {
      const { data: visit, error: visitError } = await supabaseAdmin
        .from('visits')
        .select('*, visitor:visitors(*), employee:employees(*), badge:visitor_badges(*)')
        .eq('id', visitId)
        .single()

      if (visitError || !visit) {
        return NextResponse.json({ success: false, message: '', error: '' }, { status: 404 })
      }

      const { data: properties } = await supabaseAdmin
        .from('property_items')
        .select('*')
        .eq('visit_id', visitId)

      const { data: alerts } = await supabaseAdmin
        .from('security_alerts')
        .select('*')
        .or(`related_id.eq.${visitId},related_id.eq.${visit.visitor_id}`)

      return NextResponse.json({
        success: true,
        data: {
          visit,
          properties: properties || [],
          alerts: alerts || [],
        },
      })
    }

    const { data: visits, error } = await supabaseAdmin
      .from('visits')
      .select('id, visitor:visitors(full_name), employee:employees(full_name), badge:visitor_badges(badge_number), check_in_time')
      .eq('status', 'checked_in')
      .order('check_in_time', { ascending: true })

    if (error) {
      return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: visits || [] })
  } catch (err) {
    console.error('Exit control fetch error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['Security', 'Admin'])
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
  }

  try {
    if (isDemoMode()) {
      return NextResponse.json({ success: true, data: { id: 'demo-activity', message: 'Demo mode: exit simulated' } }, { status: 201 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const body = await request.json()
    const {
      visitor_id,
      visit_id,
      badge_id,
      verification_method,
      decision,
      denial_reason,
      badge_return_status,
      property_updates,
      overstay_minutes,
      overstay_reason,
      host_release_required,
      host_approved,
      metadata,
    } = body

    if (!visitor_id) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }

    const user = await getCurrentUser()
    const decidedBy = user?.email || 'security'

    const activity = await createGateActivity({
      visitor_id,
      visit_id: visit_id || null,
      badge_id: badge_id || null,
      activity_type: 'exit_attempt',
      direction: 'out',
      gate: 'Main Gate',
      verified_by: decidedBy,
      verification_method: verification_method || 'badge',
      decision: decision || 'approved',
      denial_reason: denial_reason || null,
      metadata: {
        badge_return_status,
        overstay_minutes,
        property_updates,
        host_release_required,
        host_approved,
        ...metadata,
      },
    })

    if (decision && decision !== 'approved') {
      await createSecurityDecision({
        visitor_id,
        visit_id: visit_id || null,
        decision: decision as any,
        reason: denial_reason || null,
        decided_by: decidedBy,
      })
    }

    if (decision === 'approved' && visit_id) {
      if (badge_return_status && badge_id) {
        const badgeStatus = badge_return_status === 'returned' ? 'Checked Out' : badge_return_status === 'lost' ? 'Lost' : 'Damaged'
        await supabaseAdmin.from('visitor_badges').update({ badge_status: badgeStatus }).eq('id', badge_id)
      }

      if (property_updates && Array.isArray(property_updates)) {
        for (const update of property_updates) {
          await supabaseAdmin
            .from('property_items')
            .update({ status: update.status, released_at: update.status === 'returned' ? new Date().toISOString() : null })
            .eq('id', update.id)
        }
      }

      if (overstay_minutes > 0) {
        await supabaseAdmin.from('incident_reports').insert({
          visit_id,
          visitor_id,
          incident_type: 'overstay',
          description: `Visitor overstayed by ${overstay_minutes} minutes. ${overstay_reason || 'No reason provided'}`,
          reported_by: decidedBy,
        })
      }

      if (visit_id) {
        const { data: visit } = await supabaseAdmin
          .from('visits')
          .select('*, visitor:visitors(*), employee:employees(*)')
          .eq('id', visit_id)
          .single()

        if (visit) {
          const currentVisit = Array.isArray(visit.visitor) ? visit.visitor[0] : visit.visitor
          const employee = Array.isArray(visit.employee) ? visit.employee[0] : visit.employee

          // Use the atomic status-change function for checked_out transition.
          const result = await applyVisitStatusChange(visit_id, 'checked_out', {
            approvedBy: user?.id ?? null,
          })

          if (result.outcome === 'success') {
            if (employee?.email) {
              await sendEmail({
                to: employee.email,
                recipientName: employee.full_name || 'Host',
                subject: `Visitor Has Left - ${currentVisit?.registration_number || visit_id}`,
                template: 'visitor_checked_out',
                data: {
                  visitorName: currentVisit?.full_name || 'Visitor',
                  checkInTime: visit.check_in_time ? new Date(visit.check_in_time).toLocaleString() : 'N/A',
                  checkOutTime: new Date().toLocaleString(),
                  duration: visit.check_in_time ? calculateDuration(visit.check_in_time) : 'N/A',
                  purpose: visit.purpose || 'Visit',
                  hostName: employee.full_name || 'Host',
                  orgName: 'Department of Land Warfare',
                },
                relatedType: 'visit',
                relatedId: visit_id,
              })
            }
          }
        }
      }
    }

    await logAuditAction(decision === 'approved' ? 'Exit Approved' : 'Exit Denied', 'visit', visit_id || visitor_id, `Visitor ${visitor_id} exit ${decision} by security`)

    return NextResponse.json({ success: true, data: activity }, { status: 201 })
  } catch (err) {
    console.error('Exit processing error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
