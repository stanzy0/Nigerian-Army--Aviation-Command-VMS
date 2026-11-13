export interface Visitor {
  id: string
  full_name: string
  email: string
  phone: string
  visitor_organization: string | null
  visitor_address: string | null
  nationality: string | null
  gender: string | null
  vehicle_plate: string | null
  vehicle_type: string | null
  emergency_contact: string | null
  photo_url: string | null
  created_at: string
  doc_type?: string | null
  doc_number?: string | null
  issuing_country?: string | null
  expiry_date?: string | null
  doc_front_url?: string | null
  doc_back_url?: string | null
}

export interface Visit {
  id: string
  purpose: string
  status: 'pending' | 'approved' | 'rejected' | 'checked_in' | 'checked_out'
  check_in_time: string | null
  check_out_time: string | null
  created_at: string
  qr_code: string | null
  employee: { full_name: string; department: string | null } | null
}

export interface VisitorFormData {
  full_name: string
  email: string
  phone: string
  is_pre_arranged: boolean | null
  visitor_address: string
  nationality: string
  gender: string
  vehicle_plate: string
  vehicle_type: string
  emergency_contact: string
  emergency_relationship?: string
  emergency_phone?: string
  photo_url?: string | null
  host_employee_id?: string
  host_department?: string | null
  office_location?: string | null
  purpose?: string
  custom_purpose?: string
  expected_duration?: number
  visit_date?: string
  arrival_time?: string
  has_vehicle?: boolean
  registration_number?: string
  vehicle_make?: string
  vehicle_model?: string
  vehicle_color?: string
  driver_name?: string
  driver_phone?: string
  parking_slot?: string
  notes?: string
  id_number?: string
  id_verification?: boolean
  doc_type?: string
  doc_number?: string
  issuing_country?: string
  expiry_date?: string
  doc_front_image?: File | null
  doc_back_image?: File | null
  doc_front_url?: string
  doc_back_url?: string
  doc_notes?: string
}
