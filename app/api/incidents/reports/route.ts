import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getIncidentReport } from '@/lib/server/incidents'

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

    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')

    const report = await getIncidentReport(start && end ? { start, end } : undefined)

    return NextResponse.json({ success: true, data: report })
  } catch (err) {
    console.error('Incident report error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
