import { NextResponse, NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isDemoMode } from '@/lib/demo'
import { sendEmail } from '@/lib/server/email'
import { buildPortalQrUrl } from '@/lib/utils/portal-url'
import { verifyBadgeQR } from '@/lib/qrcode-verification'
import QRCode from 'qrcode'

export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({
      success: true,
      demo: true,
      message: 'Demo mode: badge data not persisted (synthetic response)',
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    }, { status: 200 })
  }

  const authResult = await requireAdmin()
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    let query = supabaseAdmin
      .from('visitor_badges')
      .select('*, visit:visits(*, visitor:visitors(full_name, visitor_organization, email, photo_url), employee:employees(full_name, department, email))', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('badge_status', status)
    }

    if (search) {
      query = query.or(`badge_number.ilike.%${search}%,qr_token.ilike.%${search}%`)
    }

    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

     const { data, error, count } = await query

     if (error) {
       console.error('[GET /api/badges] error:', error)
       return NextResponse.json({ success: false, message: error.message || 'Failed to fetch badges', error: error.message || 'Internal server error' }, { status: 500 })
     }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { visit_id } = body

    if (!visit_id) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        demo: true,
        message: 'Demo mode: badge created (not persisted)',
        data: {
          id: `demo-badge-${Date.now()}`,
          visit_id,
          badge_number: 'DEMO-BADGE',
          qr_token: 'demo-token',
          badge_status: 'Active',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          issued_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }, { status: 201 })
    }

    const authResult = await requireAdmin()
    if (!authResult.authorized) {
      return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const { data: visit } = await supabaseAdmin
      .from('visits')
      .select('*, visitor:visitors(*), employee:employees(*)')
      .eq('id', visit_id)
      .single()

    if (!visit || !['approved', 'checked_in', 'checked_out'].includes(visit.status)) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }

    const visitor = Array.isArray(visit.visitor) ? visit.visitor[0] : visit.visitor
    const employee = Array.isArray(visit.employee) ? visit.employee[0] : visit.employee

    if (!visit.registration_number) {
      console.error('[Badge Creation Error]', {
        reason: 'Missing registration_number',
        visit_id,
        timestamp: new Date().toISOString(),
      })
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }

    if (!visitor?.id) {
      console.error('[Badge Creation Error]', {
        reason: 'Missing visitor',
        visit_id,
        registration_number: visit.registration_number,
        timestamp: new Date().toISOString(),
      })
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }

    const { data: existingBadge } = await supabaseAdmin
      .from('visitor_badges')
      .select('id')
      .eq('visit_id', visit_id)
      .single()

    if (existingBadge) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }

    const badgeNumberRes = await supabaseAdmin.rpc('generate_visitor_badge_number')

    if (badgeNumberRes.error || !badgeNumberRes.data) {
      return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: '' }, { status: 500 })
    }

    const qrToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    const { data: badge, error } = await supabaseAdmin
      .from('visitor_badges')
      .insert({
        visit_id,
        badge_number: badgeNumberRes.data,
        qr_token: qrToken,
        badge_status: 'Active',
        expires_at: expiresAt.toISOString(),
      })
      .select()
     .single()

     if (error) {
       return NextResponse.json({ success: false, message: 'Failed to create badge', error: 'Internal server error' }, { status: 500 })
    }

    if (!badge.qr_token || !badge.badge_number) {
      console.error('[Badge Creation Error]', {
        reason: 'Badge creation returned missing qr_token or badge_number',
        badge_id: badge.id,
        visit_id,
        registration_number: visit.registration_number,
        timestamp: new Date().toISOString(),
      })
      return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: '' }, { status: 500 })
    }

    const portalUrl = buildPortalQrUrl(badge.qr_token)
    const qrDataUrl = await QRCode.toDataURL(portalUrl, { width: 300, margin: 2 })

    const qrVerification = await verifyBadgeQR(badge.id, badge.qr_token)
    if (!qrVerification.valid) {
      console.error('[Badge Creation Error - QR Verification Failed]', {
        badge_number: badge.badge_number,
        qr_token: badge.qr_token,
        error: qrVerification.error,
        visit_id,
        registration_number: visit.registration_number,
        timestamp: new Date().toISOString(),
      })

      await supabaseAdmin
        .from('visitor_badges')
        .delete()
        .eq('id', badge.id)

      return NextResponse.json(
        { error: `QR verification failed: ${qrVerification.error}` },
        { status: 500 }
       )
       }

     if (visitor?.email) {
      await sendEmail({
        to: visitor.email,
        recipientName: visitor.full_name || 'Visitor',
        subject: `Your Visitor Badge is Ready - ${visit.registration_number}`,
        template: 'badge_ready',
        data: {
          visitorName: visitor.full_name || 'Visitor',
          badgeNumber: badge.badge_number,
          qrCodeUrl: qrDataUrl,
          portalUrl: portalUrl,
          visitDate: visit.visit_date || new Date().toISOString().split('T')[0],
          hostName: employee?.full_name || 'Host',
          location: employee?.office_location || 'Reception',
          purpose: visit.purpose || 'Visit',
          orgName: 'Department of Land Warfare',
        },
        relatedType: 'visit',
        relatedId: visit_id,
      })
    }

    if (employee?.email) {
      await sendEmail({
        to: employee.email,
        recipientName: employee.full_name || 'Host',
        subject: `Visitor Badge Ready - ${visit.registration_number}`,
        template: 'badge_ready',
        data: {
          visitorName: visitor?.full_name || 'Visitor',
          badgeNumber: badge.badge_number,
          visitDate: visit.visit_date || new Date().toISOString().split('T')[0],
          hostName: employee.full_name || 'Host',
          purpose: visit.purpose || 'Visit',
          company: visitor?.visitor_organization || 'N/A',
          orgName: 'Department of Land Warfare',
        },
        relatedType: 'visit',
        relatedId: visit_id,
      })
    }

    return NextResponse.json({ data: badge }, { status: 201 })
  } catch (err) {
    console.error('Badge creation error:', err)

     return NextResponse.json(
       { success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' },
       { status: 500 }
     )
  }
}
