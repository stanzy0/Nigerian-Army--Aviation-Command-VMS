import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { supabase } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth-helpers'

async function logAuditAction(action: string, entityType: string, entityId: string | null, details: string) {
  try {
    await supabase.from('audit_logs').insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      performed_by: 'admin',
      details,
    })
  } catch (err) {
    console.error('Failed to log audit action:', err)
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAdmin()
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status as never })
  }

  try {
    const { userId, action } = await request.json()

    if (!userId || !action) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }

    let updateData: { ban_duration?: string; must_change_password?: boolean } = {}

    if (action === 'disable') {
      updateData = { ban_duration: '876000h' }
    } else if (action === 'enable') {
      updateData = { ban_duration: 'none' }
    } else if (action === 'force-password-reset') {
      updateData = { must_change_password: true }
    } else {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    if (action === 'force-password-reset') {
      const { error: roleFlagError } = await supabaseAdmin
        .from('user_roles')
        .update({ must_change_password: true })
        .eq('user_id', userId)

      if (roleFlagError) {
        // DB flag is authoritative; fail loudly if it cannot be set.
        return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
      }

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { must_change_password: true },
      })

      if (authError) {
        return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
      }

      const { data: user } = await supabase
        .from('user_roles')
        .select('email')
        .eq('user_id', userId)
        .single()

      try {
        await logAuditAction('Forced Password Reset Enabled', 'user', userId, `Password reset forced for ${user?.email}`)
      } catch (err) {
        console.error('Failed to log forced password reset audit:', err)
      }

      return NextResponse.json({ success: true })
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, updateData)

    if (error) {
      return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
    }

    const { data: user } = await supabase
      .from('user_roles')
      .select('email')
      .eq('user_id', userId)
      .single()

    await logAuditAction(action === 'disable' ? 'User Disabled' : 'User Enabled', 'user', userId, `${action === 'disable' ? 'Disabled' : 'Enabled'} user ${user?.email}`)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('User status update error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}