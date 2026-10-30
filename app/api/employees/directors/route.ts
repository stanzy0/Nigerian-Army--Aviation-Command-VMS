import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ success: false, message: 'Unauthorized', error: '' }, { status: 401 })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('q')

  const { data: userRole } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const allowedRoles = ['Admin', 'Commandant', 'Director']
  if (!userRole || !allowedRoles.includes(userRole.role)) {
    return NextResponse.json({ success: false, message: 'Access denied', error: '' }, { status: 403 })
  }

  // Get user_ids of users with Director role
  const { data: directorUsers } = await supabaseAdmin
    .from('user_roles')
    .select('user_id')
    .eq('role', 'Director')

  const directorUserIds = (directorUsers || []).map((u: { user_id: string }) => u.user_id)

  // Build query for Director employees
  let query = supabaseAdmin
    .from('employees')
    .select('id, full_name, position, department')
    .order('full_name', { ascending: true })

  if (directorUserIds.length > 0) {
    // Get employees linked to Director users OR with Director-like position
    const { data: employees, error } = await supabaseAdmin
      .from('employees')
      .select('id, full_name, position, department')
      .in('user_id', directorUserIds)
      .or('position.ilike.%Director%')
      .order('full_name', { ascending: true })

    if (error) {
      return NextResponse.json({ success: false, message: error.message, error: error.message }, { status: 400 })
    }

    const filtered = search
      ? (employees || []).filter((e: { full_name?: string; position?: string; department?: string }) =>
          (e.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
          (e.position || '').toLowerCase().includes(search.toLowerCase()) ||
          (e.department || '').toLowerCase().includes(search.toLowerCase())
        )
      : (employees || [])

    return NextResponse.json({ success: true, data: filtered })
  } else {
    // No Director users, just query by position
    query = query.ilike('position', '%Director%')

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,position.ilike.%${search}%,department.ilike.%${search}%`)
    }

    const { data: employees, error } = await query

    if (error) {
      return NextResponse.json({ success: false, message: error.message, error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: employees || [] })
  }
}
