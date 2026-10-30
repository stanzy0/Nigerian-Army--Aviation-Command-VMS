import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isDemoMode } from '@/lib/demo'
import { checkRateLimit, rateLimitResponse } from '@/lib/server/rate-limit'

function isValidUuid(v: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(v)
}

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit(request)
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetAt)
  }

  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()

    if (!q) {
      return NextResponse.json({ success: false, message: 'Invalid or missing credential', error: 'invalid_credential' }, { status: 400 })
    }

    if (isDemoMode()) {
      return NextResponse.json({ success: false, message: 'Invalid or missing credential', error: 'invalid_credential' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'service_configuration_error' }, { status: 500 })
    }

    // Only accept badge QR token as the authentication credential for public status lookup
    // Reject obviously insecure lookups (visit IDs, visitor IDs, badge numbers used alone)
    if (isValidUuid(q)) {
      return NextResponse.json({ success: false, message: 'Invalid or missing credential', error: 'invalid_credential' }, { status: 401 })
    }

    // QR tokens from visitor_badges are typically non-UUID strings; also reject if it looks like registration number pattern used insecurely
    // But we need to be specific - only allow lookup by qr_token from visitor_badges

    // Look up badge by qr_token only
    const { data: badge, error: badgeError } = await supabaseAdmin
      .from('visitor_badges')
      .select('id, badge_number, badge_status, expires_at, visit_id, qr_token')
      .eq('qr_token', q)
      .maybeSingle()

    if (badgeError || !badge) {
      return NextResponse.json({ success: false, message: 'Invalid or missing credential', error: 'invalid_credential' }, { status: 401 })
    }

    // Check badge status
    if (badge.badge_status && badge.badge_status !== 'Active') {
      return NextResponse.json({ success: false, message: 'Invalid or missing credential', error: 'invalid_credential' }, { status: 401 })
    }

    // Check expiration - require expiry timestamp and valid date
    const expiry = badge.expires_at ? new Date(badge.expires_at) : null
    if (!expiry || Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
      return NextResponse.json({ success: false, message: 'Invalid or missing credential', error: 'invalid_credential' }, { status: 401 })
    }

    if (!badge.visit_id) {
      return NextResponse.json({ success: false, message: 'Invalid or missing credential', error: 'invalid_credential' }, { status: 401 })
    }

    // Fetch visit details
    const { data: visit, error: visitError } = await supabaseAdmin
      .from('visits')
      .select(`
        registration_number,
        status,
        created_at,
        check_in_time,
        check_out_time
      `)
      .eq('id', badge.visit_id)
      .maybeSingle()

    if (visitError || !visit) {
      return NextResponse.json({ success: false, message: 'Invalid or missing credential', error: 'invalid_credential' }, { status: 401 })
    }

    // Return only minimum necessary information for the visitor's own status check
    return NextResponse.json({
      data: {
        registration_number: visit.registration_number,
        status: visit.status,
        visit_date: visit.created_at ? new Date(visit.created_at).toISOString().split('T')[0] : null,
        check_in_time: visit.check_in_time,
        check_out_time: visit.check_out_time,
      },
    })
  } catch {
    console.error('Public status check error')
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'internal_server_error' }, { status: 500 })
  }
}
