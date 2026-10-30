import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode } from '@/lib/demo'
import { getVisits, addVisit, updateVisitStatus } from '@/lib/demo/mockData'
import type { Visit } from '@/lib/types/visit'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    let data = getVisits()
    if (status) data = data.filter(v => v.status === status)
    return NextResponse.json({ data })
  }

  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ data: [] })
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ data: [] })
    }

    const { data, error } = await supabaseAdmin
      .from('visits')
      .select(`
        *,
        visitor:visitors(
          full_name,
          visitor_organization,
          photo_url,
          doc_type,
          doc_number,
          doc_front_url,
          doc_back_url
        ),
        employee:employees(full_name, department, office_location)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch visits error:', error)
      return NextResponse.json({ data: [] })
    }
    return NextResponse.json({ data: data || [] })
  } catch (err) {
    console.error('Fetch visits error:', err)
    return NextResponse.json({ data: [] })
  }
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) {
    const body = await request.json()
    const v: Visit = {
      id: `demo-visit-${Date.now()}`,
      visitor_id: body.visitor_id,
      employee_id: body.employee_id,
      purpose: body.purpose || 'Demo visit',
      status: 'pending',
      check_in_time: null,
      check_out_time: null,
      created_at: new Date().toISOString(),
      visitor: null,
      employee: null,
      badge: null,
    }
    addVisit(v)
    return NextResponse.json({ data: v }, { status: 201 })
  }
  return NextResponse.json({ success: false, message: 'Not available in demo mode' }, { status: 501 })
}

export async function PATCH(request: NextRequest) {
  if (isDemoMode()) {
    const body = await request.json()
    const { id, status } = body
    const updated = updateVisitStatus(id, status)
    if (!updated) return NextResponse.json({ success: false, message: 'Visit not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: updated })
  }
  return NextResponse.json({ success: false, message: 'Not available in demo mode' }, { status: 501 })
}
