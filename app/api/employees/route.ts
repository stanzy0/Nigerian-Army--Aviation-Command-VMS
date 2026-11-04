import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, PERMISSIONS } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isDemoMode } from '@/lib/demo'
import { getEmployees } from '@/lib/demo/mockData'
import type { Employee, EmployeeFormData } from '@/lib/types/employee'

export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    let data = getEmployees()
    if (search) {
      const s = search.toLowerCase()
      data = data.filter(e => e.full_name.toLowerCase().includes(s) || e.email.toLowerCase().includes(s) || e.department.toLowerCase().includes(s))
    }
    return NextResponse.json({ data })
  }
  try {
    const user = await getCurrentUser()
    if (!user || !user.role || !PERMISSIONS[user.role]?.includes('employees')) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')

    let query = supabaseAdmin
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false })

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,department.ilike.%${search}%`)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ success: false, message: error.message, error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data: (data || []) as Employee[] })
  } catch {
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || !user.role || !PERMISSIONS[user.role]?.includes('employees')) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const body = (await request.json()) as EmployeeFormData & {
      department_id?: string | null
      position_id?: string | null
      office_location_id?: string | null
    }

    const insertData: any = {
      full_name: body.full_name,
      email: body.email,
      phone: body.phone || null,
      department: body.department || null,
      position: body.position || null,
      office_location: body.office_location || null,
    }

    if (body.department_id) {
      const { data: dept } = await supabaseAdmin
        .from('departments')
        .select('name')
        .eq('id', body.department_id)
        .single()
      if (dept) insertData.department = dept.name
    }

    if (body.position_id) {
      const { data: pos } = await supabaseAdmin
        .from('positions')
        .select('title')
        .eq('id', body.position_id)
        .single()
      if (pos) insertData.position = pos.title
    }

    if (body.office_location_id) {
      const { data: loc } = await supabaseAdmin
        .from('office_locations')
        .select('display_name, name')
        .eq('id', body.office_location_id)
        .single()
      if (loc) insertData.office_location = loc.display_name || loc.name
    }

    const { data, error } = await supabaseAdmin
      .from('employees')
      .insert(insertData)
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json({ success: false, message: error?.message || 'Failed to create employee', error: error?.message || 'Internal server error' }, { status: 400 })
    }

    return NextResponse.json({ data: data as Employee }, { status: 201 })
  } catch {
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
