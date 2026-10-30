import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'
import { getSecurityDashboardStats } from '@/lib/server/security'
import { isDemoMode } from '@/lib/demo'

export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ success: true, data: { totalAlerts: 0, openAlerts: 0, criticalAlerts: 0, gateEntriesToday: 0, gateExitsToday: 0, blacklistHits: 0, watchlistHits: 0 } })
  }
  const authResult = await requireRole(['Admin', 'Commandant', 'Director', 'Security', 'Operations', 'Receptionist', 'Host Employee'])
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
  }

  try {
    const stats = await getSecurityDashboardStats()
    return NextResponse.json({ success: true, data: stats })
  } catch (err) {
    console.error('Security stats error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: '' }, { status: 500 })
  }
}
