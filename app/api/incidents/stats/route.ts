import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getIncidentStats } from '@/lib/server/incidents'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    const allowedRoles = ['Admin', 'Security', 'Operations', 'Commandant']
    const userRole = user.role
    if (!userRole || !allowedRoles.includes(userRole)) {
      return NextResponse.json({ success: false, message: 'Insufficient permissions', error: 'Forbidden' }, { status: 403 })
    }

    const stats = await getIncidentStats()

    return NextResponse.json({ success: true, data: stats })
  } catch (err) {
    console.error('Incident stats error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
