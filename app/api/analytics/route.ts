import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getAnalyticsStats, getVisitorTrends, getHostAnalytics, getSecurityAnalytics, getDocumentAnalytics, getBadgeAnalytics, getPropertyAnalytics, getVisitorTypes, getVisitorSources, getRepeatVisitors } from '@/lib/server/analytics'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const dateRange = searchParams.get('dateRange') || 'today'
    const department = searchParams.get('department') || ''
    const visitorType = searchParams.get('visitorType') || ''
    const hostId = searchParams.get('hostId') || ''
    const officeLocation = searchParams.get('officeLocation') || ''

    const [stats, visitorTrends, hostAnalytics, securityAnalytics, documentAnalytics, badgeAnalytics, propertyAnalytics, visitorTypes, visitorSources, repeatVisitors] = await Promise.all([
      getAnalyticsStats(dateRange, department, visitorType, hostId, officeLocation),
      getVisitorTrends(dateRange),
      getHostAnalytics(dateRange),
      getSecurityAnalytics(dateRange),
      getDocumentAnalytics(dateRange),
      getBadgeAnalytics(dateRange),
      getPropertyAnalytics(dateRange),
      getVisitorTypes(dateRange),
      getVisitorSources(dateRange),
      getRepeatVisitors(dateRange),
    ])

    supabase.from('audit_logs').insert({
      action: 'Analytics Viewed',
      entity_type: 'analytics',
      entity_id: null,
      performed_by: user.email,
      details: `User viewed analytics dashboard with filters: dateRange=${dateRange}, department=${department || 'all'}, visitorType=${visitorType || 'all'}`,
    }).then(() => {})

    return NextResponse.json({
      success: true,
      data: {
        stats,
        visitorTrends,
        hostAnalytics,
        securityAnalytics,
        documentAnalytics,
        badgeAnalytics,
        propertyAnalytics,
        visitorTypes,
        visitorSources,
        repeatVisitors,
      },
    })
  } catch (err) {
    console.error('Analytics fetch error:', err)
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
    const { exportType, dateRange, department, visitorType } = body

    supabase.from('audit_logs').insert({
      action: 'Analytics Exported',
      entity_type: 'analytics',
      entity_id: null,
      performed_by: user.email,
      details: `User exported analytics as ${exportType || 'unknown'} with filters: dateRange=${dateRange || 'today'}, department=${department || 'all'}, visitorType=${visitorType || 'all'}`,
    }).then(() => {})

    return NextResponse.json({ success: true, message: 'Export logged' })
  } catch (err) {
    console.error('Analytics export log error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
