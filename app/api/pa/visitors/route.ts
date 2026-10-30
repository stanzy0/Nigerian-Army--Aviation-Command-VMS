import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth'
import { getHostEmployeeIdForPA } from '@/lib/server/pa-helpers'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ success: false, message: 'Unauthorized', error: '' }, { status: 401 })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
  }

  const { data: userRole } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!userRole || (userRole.role !== 'PA_TO_DIRECTOR' && userRole.role !== 'PA_TO_CI')) {
    return NextResponse.json({ success: false, message: 'Access denied', error: '' }, { status: 403 })
  }

  const hostEmployeeId = await getHostEmployeeIdForPA(user.id, userRole.role)
  if (!hostEmployeeId) {
    return NextResponse.json({ success: true, data: [] })
  }

  const { data: visits, error: visitsError } = await supabaseAdmin
    .from('visits')
    .select('visitor_id')
    .eq('employee_id', hostEmployeeId)

  if (visitsError || !visits || visits.length === 0) {
    return NextResponse.json({ success: true, data: [] })
  }

  const visitorIds = [...new Set(visits.map((v: { visitor_id: string }) => v.visitor_id).filter(Boolean))]

  const { data: visitors, error: visitorsError } = await supabaseAdmin
    .from('visitors')
    .select('*')
    .in('id', visitorIds)
    .order('full_name', { ascending: true })

  if (visitorsError) {
    return NextResponse.json({ success: false, message: visitorsError.message, error: '' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: visitors || [] })
}
