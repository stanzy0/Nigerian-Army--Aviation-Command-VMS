import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode } from '@/lib/demo'
import { getVisitors, addVisitor } from '@/lib/demo/mockData'
import type { Visitor } from '@/lib/types/visitor'

export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    let data = getVisitors()
    if (search) {
      const s = search.toLowerCase()
      data = data.filter(v =>
        v.full_name.toLowerCase().includes(s) ||
        (v.email || '').toLowerCase().includes(s) ||
        (v.visitor_organization || '').toLowerCase().includes(s)
      )
    }
    return NextResponse.json({ data })
  }
  return NextResponse.json({ data: [] })
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) {
    const body = await request.json()
    const v: Visitor = {
      id: `demo-visitor-${Date.now()}`,
      full_name: body.full_name || 'Demo Visitor',
      email: body.email || '',
      phone: body.phone || '',
      visitor_organization: body.visitor_organization || null,
      visitor_address: body.visitor_address || null,
      nationality: body.nationality || null,
      gender: body.gender || null,
      vehicle_plate: body.vehicle_plate || null,
      vehicle_type: body.vehicle_type || null,
      emergency_contact: body.emergency_contact || null,
      photo_url: body.photo_url || null,
      created_at: new Date().toISOString(),
    }
    addVisitor(v)
    return NextResponse.json({ data: v }, { status: 201 })
  }
  return NextResponse.json({ success: false, message: 'Not available in demo mode' }, { status: 501 })
}
