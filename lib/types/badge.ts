export interface VisitorBadge {
  id: string
  visit_id: string
  badge_number: string
  qr_token: string
  badge_status: 'Pending' | 'Active' | 'Returned' | 'Expired' | 'Cancelled' | 'Lost' | 'Checked Out' | 'Damaged' | 'Revoked'
  issued_at: string
  expires_at: string
  printed_at: string | null
  printed_by: string | null
  reprint_count: number
  created_at: string
  updated_at: string
  visit: {
    id: string
    visitor: {
      full_name: string
      visitor_organization: string
      photo_url?: string | null
    } | null
    employee: {
      full_name: string
      department: string
    } | null
    purpose: string
    check_in_time: string | null
    check_out_time: string | null
  } | null
}

export interface BadgeFormData {
  visit_id: string
  badge_number?: string
  qr_token?: string
  badge_status?: string
  expires_at?: string
}
