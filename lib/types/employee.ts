export interface Department {
  id: string
  name: string
  created_at?: string
}

export interface Position {
  id: string
  title: string
  created_at?: string
}

export interface OfficeLocation {
  id: string
  name: string
  building: string | null
  department: string | null
  office_name?: string | null
  display_name?: string | null
  created_at?: string
}

export interface Employee {
  id: string
  full_name: string
  email: string
  phone: string
  department: string
  position: string
  office_location: string
  user_id?: string | null
  created_at: string
  date_of_birth?: string | null
  birthday_public?: boolean
  photo_url?: string | null
}

export interface EmployeeFormData {
  full_name: string
  email: string
  phone: string
  department: string
  position: string
  office_location: string
  date_of_birth?: string | null
  birthday_public?: boolean
  photo_url?: string | null
  department_id?: string | null
  position_id?: string | null
  office_location_id?: string | null
}
