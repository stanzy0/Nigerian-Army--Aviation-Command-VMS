import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const [deptResult, posResult] = await Promise.all([
      supabaseAdmin.from('departments').select('*').order('name'),
      supabaseAdmin.from('positions').select('*').order('title'),
    ])

    const departments = (deptResult.data || [])
      .filter(
        (d: any) => d.name !== 'Department of Land Warfare' && d.name !== 'Finance & Accounts'
      )
      .map((d: any) => ({
        id: d.id,
        name: d.name,
        head_name: d.head_name,
        building: d.building,
        is_active: d.is_active,
        created_at: d.created_at,
        updated_at: d.updated_at,
      }))

    const additionalDepartments = [
      { name: 'Office of the Commander' },
      { name: 'COS' },
      { name: 'MA' },
      { name: 'RSM' },
      { name: 'Training' },
      { name: 'Operations Support' },
      { name: 'Catering' },
      { name: 'Finance' },
    ]

    const existingNames = new Set(departments.map((d: any) => d.name))
    additionalDepartments.forEach((dept, index) => {
      if (!existingNames.has(dept.name)) {
        departments.push({
          id: `additional-dept-${index}`,
          name: dept.name,
          head_name: null,
          building: null,
          is_active: true,
          created_at: null,
          updated_at: null,
        })
      }
    })

    const officeLocations = [
      { id: 'admin-first-floor', name: 'Administration Block', building: 'Administration Block', office_name: 'First Floor', department: 'Administration', display_name: 'Administration Block — First Floor' },
      { id: 'admin-second-floor', name: 'Administration Block', building: 'Administration Block', office_name: 'Second Floor', department: 'Administration', display_name: 'Administration Block — Second Floor' },
    ]

    const positions = (posResult.data || [])
      .map((p: any) => ({
        id: p.id,
        title: p.title,
        department: p.department,
        is_active: p.is_active,
        created_at: p.created_at,
        updated_at: p.updated_at,
      }))

    const additionalPositions = [
      { title: 'Commander', department: null },
    ]

    const existingPositionTitles = new Set(positions.map((p: any) => p.title))
    additionalPositions.forEach((pos, index) => {
      if (!existingPositionTitles.has(pos.title)) {
        positions.push({
          id: `additional-pos-${index}`,
          title: pos.title,
          department: pos.department,
          is_active: true,
          created_at: null,
          updated_at: null,
        })
      }
    })

    return NextResponse.json({
      departments,
      positions,
      office_locations: officeLocations,
    })
  } catch {
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
