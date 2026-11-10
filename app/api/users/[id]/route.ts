import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth-helpers'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin()
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, message: authResult.error, error: authResult.error }, { status: authResult.status })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { role } = body

    if (!id) {
      return NextResponse.json({ success: false, message: 'User ID is required', error: '' }, { status: 400 })
    }

    if (!role) {
      return NextResponse.json({ success: false, message: 'Role is required', error: '' }, { status: 400 })
    }

    const validRoles = ['Admin', 'Commandant', 'Director', 'Receptionist', 'Security', 'Host Employee', 'PA_TO_CI', 'PA_TO_DIRECTOR']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ success: false, message: 'Invalid role', error: '' }, { status: 400 })
    }

    // Verify the user exists
    const { data: existingUser, error: fetchError } = await supabaseAdmin
      .from('user_roles')
      .select('id, user_id, email, role')
      .eq('user_id', id)
      .single()

    if (fetchError || !existingUser) {
      return NextResponse.json({ success: false, message: 'User not found', error: '' }, { status: 404 })
    }

    // Update only the badge_status... no wait, role
    const { error: updateError } = await supabaseAdmin
      .from('user_roles')
      .update({ role })
      .eq('user_id', id)

    if (updateError) {
      console.error('[UPDATE USER ROLE] error:', updateError.message)
      return NextResponse.json({ success: false, message: 'Failed to update user role', error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'User role updated successfully',
      user: {
        id: existingUser.user_id,
        role,
      },
    })
  } catch (err) {
    console.error('[UPDATE USER ROLE] Unhandled error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return NextResponse.json({ success: false, message: errorMessage, error: errorMessage }, { status: 500 })
  }
}
