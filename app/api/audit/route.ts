import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isDemoMode } from '@/lib/demo'

export async function POST(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ success: true })
  }
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        message: 'Authentication required',
        error: 'Unauthorized'
      },
      { status: 401 }
    )
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: '' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { action, entityType, entityId, details } = body

    if (!action || !entityType) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }

    const userEmail = user.email || 'anonymous'

    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        action,
        entity_type: entityType,
        entity_id: entityId,
        performed_by: userEmail,
        details: details || '',
      })

     if (error) {
       return NextResponse.json({ success: false, message: 'Failed to log audit action', error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}
