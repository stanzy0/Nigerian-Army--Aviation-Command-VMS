import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isDemoMode } from '@/lib/demo'
import { logAuditAction } from '@/lib/server/audit'
import { createHostNotification, createSystemNotification } from '@/lib/server/notification-service'
import { sendEmail } from '@/lib/server/email'
import { checkRateLimit, rateLimitResponse } from '@/lib/server/rate-limit'
import { applyVisitStatusChange } from '@/lib/server/visit-status'

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request)
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetAt)
  }

  try {
    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        data: { visit_id: 'demo-visit', status: 'checked_in', check_in_time: new Date().toISOString(), visitor_name: 'Demo Visitor', host_name: 'Demo Host', office_location: 'Reception' },
      })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const qr_token = typeof body?.qr_token === 'string' ? body.qr_token.trim() : ''

    // Reject missing or malformed credential.
    if (!qr_token || qr_token.length < 16) {
      return NextResponse.json({ success: false, message: 'Invalid or missing badge credential', error: 'invalid_credential' }, { status: 400 })
    }

    // Server-side credential validation: look up badge by qr_token.
    const { data: badge, error: badgeError } = await supabaseAdmin
      .from('visitor_badges')
      .select('id, badge_number, badge_status, expires_at, visit_id, visit:visits(id, status, registration_number, visitor:visitors(full_name, visitor_organization), employee:employees(full_name, user_id, office_location))')
      .eq('qr_token', qr_token)
      .single()

    if (badgeError || !badge) {
      return NextResponse.json({ success: false, message: 'Invalid badge credential', error: 'invalid_credential' }, { status: 401 })
    }

    const visit = Array.isArray(badge.visit) ? badge.visit[0] : badge.visit
    if (!visit) {
      return NextResponse.json({ success: false, message: 'Linked visit not found', error: 'not_found' }, { status: 404 })
    }

    // Verify badge is active and not expired.
    if (badge.badge_status !== 'Active') {
      return NextResponse.json({ success: false, message: 'Badge is not active', error: 'badge_inactive' }, { status: 403 })
    }

    const expiry = badge.expires_at ? new Date(badge.expires_at) : null
    if (!expiry || Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
      return NextResponse.json({ success: false, message: 'Badge has expired or missing expiry', error: 'badge_expired' }, { status: 403 })
    }

    // Verify visit is in approved status before check-in.
    if (visit.status !== 'approved') {
      return NextResponse.json({ success: false, message: 'Visit is not approved for check-in', error: 'invalid_status' }, { status: 409 })
    }

    const visit_id = visit.id
    const visitor = Array.isArray(visit.visitor) ? visit.visitor[0] : visit.visitor
    const employee = Array.isArray(visit.employee) ? visit.employee[0] : visit.employee

    const checkInTime = new Date().toISOString()

    // Atomic status transition with system action (kiosk pathway).
    // systemAction is set server-side only, never from request body.
    const result = await applyVisitStatusChange(visit_id, 'checked_in', {
      approvedBy: null,
      systemAction: true,
    })

    if (result.outcome !== 'success') {
      return NextResponse.json({ success: false, message: result.message, error: result.outcome }, { status: 409 })
    }

    await logAuditAction('Visitor Checked In via Kiosk', 'visit', visit_id, 'Visitor checked in via kiosk badge scan')

    if (employee) {
      await createHostNotification(employee.user_id, 'Visitor Checked In', `${visitor?.full_name || 'Visitor'} has checked in at the kiosk.`, 'info', 'visit', visit_id)
    }

    await createSystemNotification('Visitor Checked In', `${visitor?.full_name || 'Visitor'} checked in via kiosk for ${employee?.full_name || 'host'}`, 'info', 'visit', visit_id)

    if (employee?.email) {
      await sendEmail({
        to: employee.email,
        recipientName: employee.full_name || 'Host',
        subject: `Visitor Has Arrived - ${visit.registration_number}`,
        template: 'visitor_arrival',
        data: {
          visitorName: visitor?.full_name || 'Visitor',
          company: visitor?.visitor_organization || 'N/A',
          purpose: visit.purpose || 'Visit',
          time: new Date().toLocaleTimeString(),
          location: employee.office_location || 'Reception',
          badgeNumber: badge.badge_number || 'N/A',
          orgName: 'Department of Land Warfare',
        },
        relatedType: 'visit',
        relatedId: visit_id,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        visit_id,
        status: 'checked_in',
        check_in_time: checkInTime,
        visitor_name: visitor?.full_name || 'Visitor',
        host_name: employee?.full_name || 'Host',
        office_location: employee?.office_location || 'N/A',
      },
    })
  } catch (err) {
    console.error('Kiosk check-in error:', err instanceof Error ? err.message : 'Unknown')
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
