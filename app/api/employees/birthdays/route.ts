import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, message: 'Server configuration error', error: 'Internal server error' },
        { status: 500 }
      )
    }

    const { searchParams } = new URL(request.url)
    const limitRaw = searchParams.get('limit')
    const limit = limitRaw ? Math.min(parseInt(limitRaw, 10), 50) : 20

    // Get employees who have consented to public birthday display and have a DOB on file
    const { data, error } = await supabaseAdmin
      .from('employees')
      .select('id, full_name, department, photo_url, date_of_birth')
      .eq('birthday_public', true)
      .order('full_name', { ascending: true })
      .limit(limit)

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message, error: 'Internal server error' },
        { status: 400 }
      )
    }

    // Compute today's date in Africa/Lagos timezone
    const lagosToday = new Date()
    const lagosOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'Africa/Lagos',
      month: '2-digit',
      day: '2-digit',
    }
    const [lagosMonth, lagosDay] = lagosToday.toLocaleDateString('en-CA', lagosOptions).split('-')

    // Filter employees whose birthday (month/day) matches today in Lagos timezone
    // This handles Feb 29 correctly: only matches on actual Feb 29
    const birthdays = (data || []).filter((emp: any) => {
      if (!emp.date_of_birth) return false
      const dob = new Date(emp.date_of_birth + 'T00:00:00Z')
      const dobMonth = String(dob.getUTCMonth() + 1).padStart(2, '0')
      const dobDay = String(dob.getUTCDate()).padStart(2, '0')
      return dobMonth === lagosMonth && dobDay === lagosDay
    })

    // Return only safe display fields — never expose date_of_birth, email, phone, etc.
    const safeData = birthdays.map((emp: any) => ({
      id: emp.id,
      full_name: emp.full_name,
      department: emp.department || '',
      photo_url: emp.photo_url || null,
    }))

    return NextResponse.json({
      success: true,
      data: safeData,
      count: safeData.length,
    })
  } catch {
    return NextResponse.json(
      { success: false, message: 'Something went wrong. Please try again.', error: 'Internal server error' },
      { status: 500 }
    )
  }
}
