import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth-helpers'
import { generateTemporaryPassword, normalizeEmail } from '@/lib/server/admin'

async function logAuditAction(action: string, entityType: string, entityId: string | null, details: string) {
  try {
    const { supabase } = await import('@/lib/supabase')
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

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin()
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
  }

  try {
    const body = await request.json()
    const { email, full_name, role, must_change_password, assigned_host_id, assigned_director_id } = body

    if (!email || !role) {
      return NextResponse.json({ success: false, message: 'Email and role are required', error: '' }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: 'Server configuration error', error: 'Service role key not configured' }, { status: 500 })
    }

    // Normalize email exactly as Auth will store/look it up (trim + lowercase).
    // Supabase lowercases on storage but does NOT trim, so an untrimmed email
    // here becomes unmatchable at login ("Invalid login credentials").
    const normalizedEmail = normalizeEmail(email)

    const tempPassword = generateTemporaryPassword()

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { must_change_password: must_change_password ?? true },
    })

    if (authError) {
      console.error('[USER CREATE] Supabase Auth user creation failed:', {
        code: authError.code,
        message: authError.message,
        details: (authError as any).details,
        hint: (authError as any).hint,
      })
      if (authError.message.includes('already exists')) {
        return NextResponse.json({ success: false, message: 'An account with this email already exists', error: '' }, { status: 400 })
      }
      return NextResponse.json({ success: false, message: 'Auth account creation failed', error: authError.message }, { status: 500 })
    }

    if (!authUser?.user?.id) {
      console.error('[USER CREATE] Supabase Auth user creation returned no user ID')
      return NextResponse.json({ success: false, message: 'Auth account creation returned no user', error: 'Internal server error' }, { status: 500 })
    }

    const userId = authUser.user.id

    // Verify the Auth record exists and the stored email matches.
    const { data: verifiedUser, error: verifyError } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (verifyError || !verifiedUser?.user) {
      console.error('[USER CREATE] getUserById verification failed:', verifyError?.message)
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json({ success: false, message: 'Auth account creation could not be verified', error: verifyError?.message || '' }, { status: 500 })
    }
    if (verifiedUser.user.email && verifiedUser.user.email !== normalizedEmail) {
      console.error('[USER CREATE] Email mismatch after creation', { stored: verifiedUser.user.email, expected: normalizedEmail })
    }

    try {
      await logAuditAction('Authentication Account Created', 'user', userId, `Created auth account for ${email}`)
    } catch (err) {
      console.error('Failed to log auth account creation audit:', err)
    }

    const { data: userRole, error: dbError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        email: normalizedEmail,
        full_name,
        role,
        must_change_password: must_change_password ?? true,
      })
      .select()
      .single()

    if (dbError) {
      console.error('[USER CREATE] user_roles insert failed:', {
        code: dbError.code,
        message: dbError.message,
        details: dbError.details,
        hint: dbError.hint,
      })
      await supabaseAdmin.from('user_roles').delete().eq('user_id', userId)
      await supabaseAdmin.auth.admin.deleteUser(userId)
      try {
        await logAuditAction('User Creation Failed', 'user', userId, `Role assignment failed for ${normalizedEmail}: ${dbError.message}`)
      } catch (err) {
        console.error('Failed to log failed user creation audit:', err)
      }
      return NextResponse.json({ success: false, message: 'user_roles insert failed', error: dbError.message }, { status: 500 })
    }

    const { data: existingEmployee } = await supabaseAdmin
      .from('employees')
      .select('id, user_id')
      .eq('email', normalizedEmail)
      .is('user_id', null)
      .maybeSingle()

    if (existingEmployee) {
      const { error: updateError } = await supabaseAdmin
        .from('employees')
        .update({ user_id: userId })
        .eq('id', existingEmployee.id)

      if (updateError) {
        console.error('[USER CREATE] employee.user_id update failed:', {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
        })
      }
    }

    if (role === 'PA_TO_CI' && assigned_host_id) {
      const { error: assignmentError } = await supabaseAdmin
        .from('user_host_assignments')
        .insert({
          user_id: userId,
          employee_id: assigned_host_id,
        })

      if (assignmentError) {
        console.error('[USER CREATE] PA_TO_CI host assignment failed:', {
          code: assignmentError.code,
          message: assignmentError.message,
          details: assignmentError.details,
          hint: assignmentError.hint,
        })
        await supabaseAdmin.from('user_roles').delete().eq('user_id', userId)
        await supabaseAdmin.auth.admin.deleteUser(userId)
        await logAuditAction('Host Assignment Failed', 'user', userId, `Failed to assign host for ${normalizedEmail}: ${assignmentError.message}`)
        return NextResponse.json({ success: false, message: 'Failed to assign CI', error: assignmentError.message }, { status: 500 })
      } else {
        await logAuditAction('Host Assignment Created', 'user', userId, `Assigned ${assigned_host_id} as CI for ${normalizedEmail}`)
      }
    }

    if (role === 'PA_TO_DIRECTOR' && assigned_director_id) {
      const { error: assignmentError } = await supabaseAdmin
        .from('user_host_assignments')
        .insert({
          user_id: userId,
          employee_id: assigned_director_id,
        })

      if (assignmentError) {
        console.error('[USER CREATE] PA_TO_DIRECTOR host assignment failed:', {
          code: assignmentError.code,
          message: assignmentError.message,
          details: assignmentError.details,
          hint: assignmentError.hint,
        })
        await supabaseAdmin.from('user_roles').delete().eq('user_id', userId)
        await supabaseAdmin.auth.admin.deleteUser(userId)
        await logAuditAction('Host Assignment Failed', 'user', userId, `Failed to assign director for ${normalizedEmail}: ${assignmentError.message}`)
        return NextResponse.json({ success: false, message: 'Failed to assign Director', error: assignmentError.message }, { status: 500 })
      } else {
        await logAuditAction('Host Assignment Created', 'user', userId, `Assigned ${assigned_director_id} as Director for ${normalizedEmail}`)
      }
    }

    if (role === 'PA_TO_COMMANDER' && assigned_director_id) {
      const { error: assignmentError } = await supabaseAdmin
        .from('user_host_assignments')
        .insert({
          user_id: userId,
          employee_id: assigned_director_id,
        })

      if (assignmentError) {
        console.error('[USER CREATE] PA_TO_COMMANDER host assignment failed:', {
          code: assignmentError.code,
          message: assignmentError.message,
          details: assignmentError.details,
          hint: assignmentError.hint,
        })
        await supabaseAdmin.from('user_roles').delete().eq('user_id', userId)
        await supabaseAdmin.auth.admin.deleteUser(userId)
        await logAuditAction('Host Assignment Failed', 'user', userId, `Failed to assign commander for ${normalizedEmail}: ${assignmentError.message}`)
        return NextResponse.json({ success: false, message: 'Failed to assign Commander', error: assignmentError.message }, { status: 500 })
      } else {
        await logAuditAction('Host Assignment Created', 'user', userId, `Assigned ${assigned_director_id} as Commander for ${normalizedEmail}`)
      }
    }

    try {
      await logAuditAction('User Created', 'user', userId, `Created user ${normalizedEmail} with ${role} role`)
    } catch (err) {
      console.error('Failed to log user creation audit:', err)
    }

    return NextResponse.json({
      success: true,
      user: userRole,
      temporary_password: tempPassword,
      diagnostics: {
        auth_user_id: userId,
        normalized_email: normalizedEmail,
        auth_created: true,
        role_created: true,
        host_assigned: role === 'PA_TO_CI' ? !!assigned_host_id : (role === 'PA_TO_DIRECTOR' || role === 'PA_TO_COMMANDER') ? !!assigned_director_id : false,
      },
    })
  } catch (err) {
    console.error('[USER CREATE] Unhandled error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return NextResponse.json({ success: false, message: errorMessage, error: errorMessage }, { status: 500 })
  }
}