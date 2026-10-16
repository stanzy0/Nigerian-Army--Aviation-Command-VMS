import { COUNTRIES } from '@/lib/data/countries'

export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email is required.'
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!re.test(email)) return 'Invalid email format.'
  return null
}

export function validatePhone(phone: string): string | null {
  if (!phone.trim()) return 'Phone number is required.'
  const re = /^\+?[\d\s()-]{7,20}$/
  if (!re.test(phone)) return 'Invalid phone number format.'
  return null
}

export function validateRequired(value: string | number | boolean | undefined | null, fieldName: string): string | null {
  if (typeof value === 'boolean') return value ? null : `${fieldName} is required.`
  if (typeof value === 'number') return value > 0 ? null : `${fieldName} is required.`
  return value?.trim() ? null : `${fieldName} is required.`
}

export function hasValidationErrors(errors: Record<string, string | null>): boolean {
  return Object.values(errors).some(Boolean)
}

export function validateStep1(visitorType: string): Record<string, string | null> {
  const error = validateRequired(visitorType, 'Visitor Type')
  return error ? { visitor_type: error } : {}
}

export function validateStep2(data: {
  full_name?: string
  email?: string
  phone?: string
  nationality?: string
  gender?: string
  photo_url?: string | null
}): Record<string, string | null> {
  const errors: Record<string, string | null> = {}

  const fullNameErr = validateRequired(data.full_name, 'Full Name')
  if (fullNameErr) errors.full_name = fullNameErr

  const emailErr = validateEmail(data.email || '')
  if (emailErr) errors.email = emailErr

  const phoneErr = validatePhone(data.phone || '')
  if (phoneErr) errors.phone = phoneErr

  const nationality = data.nationality?.trim()
  if (!nationality) {
    errors.nationality = 'Nationality is required.'
  } else if (!COUNTRIES.some(c => c.name === nationality)) {
    errors.nationality = 'Please select a valid nationality from the list.'
  }

  const genderErr = validateRequired(data.gender, 'Gender')
  if (genderErr) errors.gender = genderErr

  const photoErr = validateRequired(data.photo_url, 'Visitor Photograph')
  if (photoErr) errors.photo_url = photoErr

  return errors
}

const ID_TYPES_REQUIRING_EXPIRY = new Set(['Passport', 'National ID', 'Driver License'])

export function validateStep3(data: {
  id_verification?: boolean
  doc_type?: string
  doc_number?: string
  issuing_country?: string
  expiry_date?: string
  doc_front_url?: string | null
  doc_back_url?: string | null
}): Record<string, string | null> {
  if (data.id_verification) {
    return {}
  }

  const errors: Record<string, string | null> = {}

  const docTypeErr = validateRequired(data.doc_type, 'ID Type')
  if (docTypeErr) errors.doc_type = docTypeErr

  const docNumberErr = validateRequired(data.doc_number, 'ID Number')
  if (docNumberErr) errors.doc_number = docNumberErr

  const issuingCountryErr = validateRequired(data.issuing_country, 'Issuing Country')
  if (issuingCountryErr) errors.issuing_country = issuingCountryErr

  if (data.doc_type && ID_TYPES_REQUIRING_EXPIRY.has(data.doc_type)) {
    const expiryDateErr = validateRequired(data.expiry_date, 'Expiry Date')
    if (expiryDateErr) errors.expiry_date = expiryDateErr
  }

  return errors
}

export function validateStep4(data: {
  host_employee_id?: string
  purpose?: string
  custom_purpose?: string
  visit_date?: string
  arrival_time?: string
  expected_duration?: number
}): Record<string, string | null> {
  const errors: Record<string, string | null> = {}

  const hostErr = validateRequired(data.host_employee_id, 'Host Employee')
  if (hostErr) errors.host_employee_id = hostErr

  const purposeErr = validateRequired(data.purpose, 'Purpose of Visit')
  if (purposeErr) errors.purpose = purposeErr

  if (data.purpose === 'Other') {
    const customErr = validateRequired(data.custom_purpose, 'Custom Purpose')
    if (customErr) errors.custom_purpose = customErr
  }

  const dateErr = validateRequired(data.visit_date, 'Visit Date')
  if (dateErr) errors.visit_date = dateErr

  const timeErr = validateRequired(data.arrival_time, 'Visit Time')
  if (timeErr) errors.arrival_time = timeErr

  const durationErr = validateRequired(data.expected_duration, 'Expected Duration')
  if (durationErr) errors.expected_duration = durationErr

  return errors
}

export function validateStep5(data: {
  has_vehicle?: boolean
  registration_number?: string
  vehicle_type?: string
  vehicle_color?: string
  vehicle_make?: string
}): Record<string, string | null> {
  const errors: Record<string, string | null> = {}

  if (data.has_vehicle) {
    const plateErr = validateRequired(data.registration_number, 'Vehicle Plate Number')
    if (plateErr) errors.registration_number = plateErr

    const typeErr = validateRequired(data.vehicle_type, 'Vehicle Type')
    if (typeErr) errors.vehicle_type = typeErr

    const colorErr = validateRequired(data.vehicle_color, 'Vehicle Colour')
    if (colorErr) errors.vehicle_color = colorErr

    const makeErr = validateRequired(data.vehicle_make, 'Vehicle Make')
    if (makeErr) errors.vehicle_make = makeErr
  }

  return errors
}

export function validateStep6(data: {
  emergency_contact?: string
  emergency_relationship?: string
  emergency_phone?: string
}): Record<string, string | null> {
  const errors: Record<string, string | null> = {}

  const nameErr = validateRequired(data.emergency_contact, 'Emergency Contact Name')
  if (nameErr) errors.emergency_contact = nameErr

  const relationshipErr = validateRequired(data.emergency_relationship, 'Relationship')
  if (relationshipErr) errors.emergency_relationship = relationshipErr

  const phoneErr = validatePhone(data.emergency_phone || '')
  if (phoneErr) errors.emergency_phone = phoneErr

  return errors
}
