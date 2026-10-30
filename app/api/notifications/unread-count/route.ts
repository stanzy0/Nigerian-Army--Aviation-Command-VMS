import { NextRequest, NextResponse } from 'next/server'
import { getUnreadCount } from '@/lib/server/notification-service'
import { getCurrentUser } from '@/lib/auth'
import { isDemoMode } from '@/lib/demo'

export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ success: true, unreadCount: 0 })
  }
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const unreadCount = await getUnreadCount(user.id, user.role)
    return NextResponse.json({ success: true, unreadCount })
  } catch (err) {
    console.error('[Notifications Unread Count API] Error:', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
