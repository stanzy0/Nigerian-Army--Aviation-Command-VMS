import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { getAdminDashboardStats, getSystemHealth } from '@/lib/server/admin'

import { isDemoMode } from '@/lib/demo'
import { getDashboardStats } from '@/lib/demo/mockData'

export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ success: true, data: { stats: getDashboardStats(), health: { status: 'demo' } } })
  }
  const authResult = await requireAdmin()
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
  }

  try {
    const [stats, health] = await Promise.all([
      getAdminDashboardStats(),
      getSystemHealth(),
    ])

    return NextResponse.json({ success: true, data: { stats, health } })
  } catch (err) {
    console.error('Admin dashboard error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: '' }, { status: 500 })
  }
}
