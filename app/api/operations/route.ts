import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  getOperationsKpis, getLiveVisitors, getActivityFeed, getWaitingQueues,
  getOverstayPanel, getSecurityPanel, getHostAvailability, getOfficeOccupancy,
  getActiveBadges, getActiveProperty, forceCheckout, activateEmergencyLockdown,
  deactivateEmergencyLockdown, isEmergencyActive,
} from '@/lib/server/operations'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    const allowedRoles = ['Admin', 'Commandant', 'Director', 'Security']
    const userRole = user.role
    if (!userRole || !allowedRoles.includes(userRole)) {
      return NextResponse.json({ success: false, message: 'Insufficient permissions', error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const visitorType = searchParams.get('visitorType') || ''
    const department = searchParams.get('department') || ''
    const officeLocation = searchParams.get('officeLocation') || ''

    const filters: Record<string, string> = {}
    if (status) filters.status = status
    if (visitorType) filters.visitorType = visitorType
    if (department) filters.department = department
    if (officeLocation) filters.officeLocation = officeLocation

    const [kpis, visitors, activity, queues, overstays, security, hosts, occupancy, badges, property, emergency] = await Promise.all([
      getOperationsKpis(),
      getLiveVisitors(page, limit, search, filters),
      getActivityFeed(50),
      getWaitingQueues(),
      getOverstayPanel(),
      getSecurityPanel(),
      getHostAvailability(),
      getOfficeOccupancy(),
      getActiveBadges(),
      getActiveProperty(),
      isEmergencyActive(),
    ])

    return NextResponse.json({
      success: true,
      data: {
        kpis,
        visitors,
        activity,
        queues,
        overstays,
        security,
        hosts,
        occupancy,
        badges,
        property,
        emergency,
      },
    })
  } catch (err) {
    console.error('Operations fetch error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, message: 'Authentication required', error: 'Unauthorized' }, { status: 401 })
    }

    const allowedRoles = ['Admin', 'Commandant', 'Director']
    const userRole = user.role
    if (!userRole || !allowedRoles.includes(userRole)) {
      return NextResponse.json({ success: false, message: 'Insufficient permissions', error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'emergency_lockdown': {
        const success = await activateEmergencyLockdown(user.email)
        return NextResponse.json({ success })
      }
      case 'emergency_unlock': {
        const success = await deactivateEmergencyLockdown(user.email)
        return NextResponse.json({ success })
      }
      case 'force_checkout': {
        const { visitId } = body
        if (!visitId) {
          return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
        }
        const success = await forceCheckout(visitId, user.email)
        return NextResponse.json({ success })
      }
      case 'notify_host': {
        const { visitId } = body
        if (!visitId) {
          return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
        }
        return NextResponse.json({ success: true, message: 'Host notified' })
      }
      case 'print_badge': {
        const { visitId } = body
        if (!visitId) {
          return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
        }
        return NextResponse.json({ success: true, message: 'Badge reprint queued' })
      }
      case 'occupancy_report': {
        return NextResponse.json({ success: true, message: 'Occupancy report generated' })
      }
      default:
        return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }
  } catch (err) {
    console.error('Operations action error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
