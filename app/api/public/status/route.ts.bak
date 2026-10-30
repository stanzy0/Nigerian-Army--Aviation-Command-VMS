import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()

    if (!q) {
      return NextResponse.json({ success: false, message: 'Missing query parameter', error: 'Missing query parameter' }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    let data: any = null
    let lastError: any = null

    const { data: regData, error: regError } = await supabaseAdmin
      .from('visits')
      .select(`
        registration_number,
        status,
        created_at,
        check_in_time,
        check_out_time,
        visitor_id,
        employee_id,
        visitor:visitors(full_name),
        employee:employees(full_name, department, office_location),
        badge:visitor_badges(badge_number, qr_token)
      `)
      .ilike('registration_number', `%${q}%`)
      .maybeSingle()

    console.log('[public/status] reg lookup', { q, regData, regError })

    if (regData) {
      data = regData
    } else {
      lastError = regError
    }

    const { data: badgeData, error: badgeError } = await supabaseAdmin
      .from('visitor_badges')
      .select('visit_id')
      .eq('qr_token', q)
      .maybeSingle()

    console.log('[public/status] badge lookup', { q, badgeData, badgeError })

    if (badgeData?.visit_id && !data) {
      const { data: qrData, error: qrError } = await supabaseAdmin
        .from('visits')
        .select(`
          registration_number,
          status,
          created_at,
          check_in_time,
          check_out_time,
          visitor_id,
          employee_id,
          visitor:visitors(full_name),
          employee:employees(full_name, department, office_location),
          badge:visitor_badges(badge_number, qr_token)
        `)
        .eq('id', badgeData.visit_id)
        .maybeSingle()

      console.log('[public/status] qr visit lookup', { q, badgeData, qrData, qrError })
      if (qrData) {
        data = qrData
      } else {
        lastError = qrError
      }
    }

    if (!data) {
      const { data: visitData, error: visitError } = await supabaseAdmin
        .from('visits')
        .select(`
          registration_number,
          status,
          created_at,
          check_in_time,
          check_out_time,
          visitor_id,
          employee_id,
          visitor:visitors(full_name),
          employee:employees(full_name, department, office_location),
          badge:visitor_badges(badge_number, qr_token)
        `)
        .eq('id', q)
        .maybeSingle()

      console.log('[public/status] visit id lookup', { q, visitData, visitError })
      if (visitData) {
        data = visitData
      } else {
        lastError = visitError
      }
    }

    if (!data) {
      const { data: visitByVisitor, error: visitorError } = await supabaseAdmin
        .from('visits')
        .select(`
          registration_number,
          status,
          created_at,
          check_in_time,
          check_out_time,
          visitor_id,
          employee_id,
          visitor:visitors(full_name),
          employee:employees(full_name, department, office_location),
          badge:visitor_badges(badge_number, qr_token)
        `)
        .eq('visitor_id', q)
        .limit(1)

      console.log('[public/status] visitor id lookup', { q, visitByVisitor, visitorError })

      if (visitByVisitor && visitByVisitor.length > 0) {
        data = visitByVisitor[0]
      } else {
        lastError = visitorError
      }
    }

    if (!data) {
      const { data: badgeByNumber, error: badgeNumberError } = await supabaseAdmin
        .from('visitor_badges')
        .select('visit_id, badge_number, qr_token')
        .ilike('badge_number', `%${q}%`)
        .maybeSingle()

      console.log('[public/status] badge number lookup', { q, badgeByNumber, badgeNumberError })

      if (badgeByNumber?.visit_id) {
        const { data: visitByBadge, error: visitByBadgeError } = await supabaseAdmin
          .from('visits')
          .select(`
            registration_number,
            status,
            created_at,
            check_in_time,
            check_out_time,
            visitor_id,
            employee_id,
            visitor:visitors(full_name),
            employee:employees(full_name, department, office_location),
            badge:visitor_badges(badge_number, qr_token)
          `)
          .eq('id', badgeByNumber.visit_id)
          .maybeSingle()

        console.log('[public/status] visit by badge number lookup', { q, visitByBadge, visitByBadgeError })
        if (visitByBadge) {
          data = visitByBadge
        } else {
          lastError = visitByBadgeError
        }
      } else {
        lastError = badgeNumberError
      }
    }

    console.log('[public/status] final result', { q, data, lastError })

    if (!data) {
      console.error('[public/status] lookup error', { q, error: lastError, data })
      return NextResponse.json(
        {
          success: false,
          message: lastError?.message || 'Registration not found',
          error: lastError?.message || 'Registration not found',
          details: lastError
        },
        { status: 404 }
      )
    }

    const visit = data as any
    const visitor = Array.isArray(visit.visitor) ? visit.visitor[0] : visit.visitor
    const employee = Array.isArray(visit.employee) ? visit.employee[0] : visit.employee
    const badge = Array.isArray(visit.badge) ? visit.badge[0] : visit.badge

    return NextResponse.json({
      data: {
        registration_number: visit.registration_number,
        status: visit.status,
        visitor_name: visitor?.full_name || 'Unknown',
        visit_date: visit.created_at ? new Date(visit.created_at).toISOString().split('T')[0] : 'N/A',
        host_name: employee?.full_name || 'N/A',
        department: employee?.department || 'N/A',
        office_location: employee?.office_location || 'N/A',
        badge_number: badge?.badge_number,
        qr_token: badge?.qr_token,
        check_in_time: visit.check_in_time,
        check_out_time: visit.check_out_time,
      },
    })
  } catch (err) {
    console.error('Public status check error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
