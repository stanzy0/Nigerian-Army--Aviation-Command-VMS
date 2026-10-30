import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { supabase } from '@/lib/supabase'

const MAX_FAILED_ATTEMPTS = 6
const LOCKOUT_DURATION_MS = 30 * 60 * 1000 // 30 minutes

async function logAuditAction(action: string, entityType: string, entityId: string | null, details: string) {
  try {
    await supabase.from('audit_logs').insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      performed_by: 'system',
      details,
    })
  } catch (err) {
    console.error('Failed to log audit action:', err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, action } = await request.json()

    if (!email) {
      return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers()

    if (listError) {
      return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
    }

    const user = users.users.find((u: { email?: string }) => u.email === email)

    if (!user) {
      return NextResponse.json({ locked: false, remainingAttempts: MAX_FAILED_ATTEMPTS })
    }

    const userId = user.id
    const lockoutUntil = user.user_metadata?.lockout_until
    const failedAttempts = user.user_metadata?.failed_login_attempts || 0

    const now = Date.now()

    if (action === 'check') {
      if (lockoutUntil && now < parseInt(lockoutUntil)) {
        return NextResponse.json({ locked: true })
      }
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        const newLockoutUntil = now + LOCKOUT_DURATION_MS
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            lockout_until: newLockoutUntil.toString(),
          },
        })
        await logAuditAction('Account Locked', 'user', userId, `Account locked due to ${failedAttempts} failed attempts`)
        return NextResponse.json({ locked: true })
      }
      return NextResponse.json({ locked: false, remainingAttempts: MAX_FAILED_ATTEMPTS - failedAttempts })
    }

    if (action === 'fail') {
      const newFailedAttempts = failedAttempts + 1

      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            failed_login_attempts: newFailedAttempts,
            lockout_until: (now + LOCKOUT_DURATION_MS).toString(),
          },
        })
        await logAuditAction('Account Locked', 'user', userId, `Account locked due to ${newFailedAttempts} failed attempts`)
        return NextResponse.json({ locked: true })
      }

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { failed_login_attempts: newFailedAttempts },
      })
      return NextResponse.json({ locked: false, remainingAttempts: MAX_FAILED_ATTEMPTS - newFailedAttempts })
    }

    if (action === 'success') {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { failed_login_attempts: 0, lockout_until: null },
      })
      return NextResponse.json({ locked: false })
    }

    if (action === 'unlock') {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { failed_login_attempts: 0, lockout_until: null },
      })
      await logAuditAction('Account Unlocked', 'user', userId, `Account unlocked via admin action`)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, message: '', error: '' }, { status: 400 })
  } catch (err) {
    console.error('Lockout error:', err)
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}