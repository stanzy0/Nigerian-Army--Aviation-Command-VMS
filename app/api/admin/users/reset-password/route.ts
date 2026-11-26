import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateTemporaryPassword } from '@/lib/server/admin'
import { logAuthEvent, getClientInfo } from '@/lib/server/auth-audit'

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128

function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters long`
  }
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain a number'
  return null
}

export async function POST(request: NextRequest) {
  // Server-side authorization: only Admin (verified against public.user_roles).
  const auth = await requireAdmin()
  if (!auth.authorized) {
    return NextResponse.json({ success: false, message: auth.error, error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json().catch(() => null)
    const userId = body?.user_id
    const providedPassword = body?.new_password

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ success: false, message: 'A target user is required', error: '' }, { status: 400 })
    }

    // An Admin cannot reset their own password through this interface.
    if (userId === auth.userId) {
      return NextResponse.json({ success: false, message: 'You cannot reset your own password', error: '' }, { status: 403 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    // Resolve the target user from existing records (never trust browser data).
    const { data: target, error: targetError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, email, full_name')
      .eq('user_id', userId)
      .maybeSingle()

    if (targetError) {
      console.error('[admin/reset-password] target lookup failed:', targetError.message)
      return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
    }

    if (!target) {
      // Do not reveal existence details beyond "not found" to an authorized Admin.
      return NextResponse.json({ success: false, message: 'User not found', error: '' }, { status: 404 })
    }

    // Use the provided password if given, otherwise generate a secure one.
    const generated = !providedPassword
    const password = generated ? generateTemporaryPassword() : providedPassword

    const policyError = validatePasswordStrength(password)
    if (policyError) {
      return NextResponse.json({ success: false, message: policyError, error: '' }, { status: 400 })
    }

    // Update the password and force a change on next login (metadata drives the
    // middleware/login redirect; user_roles mirrors it for reporting).
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
      user_metadata: { must_change_password: true },
    })

    if (updateError) {
      console.error('[admin/reset-password] update failed:', { code: updateError.code, message: updateError.message })
      return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
    }

    const { error: roleUpdateError } = await supabaseAdmin
      .from('user_roles')
      .update({ must_change_password: true })
      .eq('user_id', userId)

    if (roleUpdateError) {
      // Non-fatal: the auth metadata already forces the change. Log server-side.
      console.error('[admin/reset-password] user_roles must_change_password update failed:', roleUpdateError.message)
    }

    // Audit: never include the password. Identify admin + target only.
    const clientInfo = getClientInfo(request)
    await logAuthEvent({
      action: 'password_reset_by_admin',
      entity_type: 'user',
      entity_id: userId,
      performed_by: auth.userEmail || 'admin',
      details: `Admin-initiated password reset for ${target.email}`,
      role: 'Admin',
      metadata: {
        admin_id: auth.userId,
        target_id: userId,
        target_email: target.email,
        admin_initiated: true,
        generated,
      },
      ip_address: clientInfo.ip_address,
      user_agent: clientInfo.user_agent,
    })

    // The temporary password is returned exactly once, only when generated.
    return NextResponse.json({
      success: true,
      message: 'Password reset successfully',
      must_change_password: true,
      temporary_password: generated ? password : undefined,
    })
  } catch (err) {
    console.error('[admin/reset-password] unexpected error:', err instanceof Error ? err.message : 'error')
    return NextResponse.json({ success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' }, { status: 500 })
  }
}