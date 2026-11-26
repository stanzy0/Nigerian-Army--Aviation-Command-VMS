import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isDemoMode } from '@/lib/demo'

export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ data: [] })
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has permission to view audit logs
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Service role not configured' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const search = searchParams.get('search')
    const eventType = searchParams.get('eventType')
    const userRole = searchParams.get('userRole')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const userId = searchParams.get('userId')

    // Check if user has permission to view audit logs.
    // Admin: full access. Receptionist: own login/logout activity timeline only.
    if (user.role !== 'Admin' && user.role !== 'Receptionist') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const isReceptionist = user.role === 'Receptionist'

    // A Receptionist may never request another user's records. Reject rather
    // than silently ignoring so the caller cannot probe for other users.
    if (isReceptionist && userId && userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const AUTH_EVENT_TYPES = [
      'login_success',
      'logout',
      'login_failed',
      'login_failed_invalid_credentials',
      'login_failed_account_locked',
    ]

    let query = supabaseAdmin
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    // Receptionists may only see their own authentication (login/logout) events.
    // The self-scope is forced server-side and cannot be widened by query params.
    if (isReceptionist) {
      query = query.in('action', AUTH_EVENT_TYPES).eq('entity_id', user.id)
    }

    // Apply filters
    if (searchParams.get('search')) {
      const search = searchParams.get('search')!
      query = query.or(`action.ilike.%${search}%,entity_type.ilike.%${search}%,performed_by.ilike.%${search}%,details.ilike.%${search}%`)
    }

    if (eventType) {
      // Receptionists cannot request non-auth event types
      if (isReceptionist && !AUTH_EVENT_TYPES.includes(eventType)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      query = query.eq('action', eventType)
    }

    if (userRole) {
      query = query.eq('details->>role', userRole)
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }

    if (dateTo) {
      const endOfDay = new Date(dateTo)
      endOfDay.setHours(23, 59, 59, 999)
      query = query.lte('created_at', endOfDay.toISOString())
    }

    // Admin may filter by any user; Receptionist is already scoped to self above.
    if (userId && !isReceptionist) {
      query = query.eq('entity_id', userId)
    }

    // Apply pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      }
    })
  } catch (err) {
    console.error('[api/audit] Unexpected error:', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}