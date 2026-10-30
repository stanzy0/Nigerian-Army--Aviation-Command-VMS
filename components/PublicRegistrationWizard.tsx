'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Loader2, CheckCircle2, ChevronRight, ChevronLeft, Upload, Camera, AlertCircle } from 'lucide-react'
import PhotoCapture from '@/components/PhotoCapture'
import SearchableCombobox from '@/components/ui/SearchableCombobox'
import { validateStep1, validateStep2, validateStep3, validateStep4, validateStep5, validateStep6, hasValidationErrors } from '@/lib/validation/visitor'

export type RegistrationVariant = 'default' | 'director'

export type VisitorType = 'Visitor' | 'Contractor' | 'Vendor' | 'Guest Lecturer' | 'VIP' | 'Family Visitor' | 'Other'

interface Employee {
  id: string
  full_name: string
  department: string | null
  position: string | null
  office_location: string | null
  phone: string | null
  email: string | null
}

interface OfficeLocation {
  id: string
  name: string
  building: string | null
  department: string | null
}

const VISITOR_TYPES: VisitorType[] = ['Visitor', 'Contractor', 'Vendor', 'Guest Lecturer', 'VIP', 'Family Visitor', 'Other']

const VISITOR_TYPE_INFO: Record<VisitorType, { description: string; helperText: string }> = {
  'Visitor': { description: 'Standard visitor for general meetings', helperText: 'Regular access' },
  'Contractor': { description: 'External contractor for specific work', helperText: 'Temporary access' },
  'Vendor': { description: 'Supplier or vendor for business purposes', helperText: 'Business access' },
  'Guest Lecturer': { description: 'Guest speaker or lecturer', helperText: 'Event access' },
  'VIP': { description: 'Very Important Person, priority access', helperText: 'Priority access' },
  'Family Visitor': { description: 'Family member visiting personnel', helperText: 'Escorted access' },
  'Other': { description: 'Other type of visitor', helperText: 'Special access' },
}

const PURPOSE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Official Visit', label: 'Official Visit' },
  { value: 'Meeting', label: 'Meeting' },
  { value: 'Lecture / Seminar', label: 'Lecture / Seminar' },
  { value: 'Training', label: 'Training' },
  { value: 'Examination', label: 'Examination' },
  { value: 'Administrative Matter', label: 'Administrative Matter' },
  { value: 'Document Submission', label: 'Document Submission' },
  { value: 'Interview', label: 'Interview' },
  { value: 'Maintenance / Repair', label: 'Maintenance / Repair' },
  { value: 'Contractor Visit', label: 'Contractor Visit' },
  { value: 'Delivery', label: 'Delivery' },
  { value: 'Medical Visit', label: 'Medical Visit' },
  { value: 'VIP Visit', label: 'VIP Visit' },
  { value: 'Family Visit', label: 'Family Visit' },
  { value: 'Vendor / Supplier', label: 'Vendor / Supplier' },
  { value: 'Inspection', label: 'Inspection' },
  { value: 'Research', label: 'Research' },
  { value: 'Event', label: 'Event' },
  { value: 'Other', label: 'Other' },
]

const VEHICLE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Sedan', label: 'Sedan' },
  { value: 'Saloon', label: 'Saloon' },
  { value: 'Hatchback', label: 'Hatchback' },
  { value: 'SUV', label: 'SUV' },
  { value: 'Pickup Truck', label: 'Pickup Truck' },
  { value: 'Van', label: 'Van' },
  { value: 'Minibus', label: 'Minibus' },
  { value: 'Bus', label: 'Bus' },
  { value: 'Motorcycle', label: 'Motorcycle' },
  { value: 'Tricycle (Keke)', label: 'Tricycle (Keke)' },
  { value: 'Truck', label: 'Truck' },
  { value: 'Lorry', label: 'Lorry' },
  { value: 'Trailer', label: 'Trailer' },
  { value: 'Staff Vehicle', label: 'Staff Vehicle' },
  { value: 'Military Vehicle', label: 'Military Vehicle' },
  { value: 'Government Vehicle', label: 'Government Vehicle' },
  { value: 'Official Convoy Vehicle', label: 'Official Convoy Vehicle' },
  { value: 'Ambulance', label: 'Ambulance' },
  { value: 'Fire Service Vehicle', label: 'Fire Service Vehicle' },
  { value: 'Taxi', label: 'Taxi' },
  { value: 'Ride-Hailing Vehicle (Uber/Bolt)', label: 'Ride-Hailing Vehicle (Uber/Bolt)' },
  { value: 'Other', label: 'Other' },
]

const VEHICLE_COLOR_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'White', label: 'White' },
  { value: 'Black', label: 'Black' },
  { value: 'Silver', label: 'Silver' },
  { value: 'Gray', label: 'Gray' },
  { value: 'Blue', label: 'Blue' },
  { value: 'Navy Blue', label: 'Navy Blue' },
  { value: 'Red', label: 'Red' },
  { value: 'Maroon', label: 'Maroon' },
  { value: 'Green', label: 'Green' },
  { value: 'Dark Green', label: 'Dark Green' },
  { value: 'Yellow', label: 'Yellow' },
  { value: 'Gold', label: 'Gold' },
  { value: 'Brown', label: 'Brown' },
  { value: 'Beige', label: 'Beige' },
  { value: 'Orange', label: 'Orange' },
  { value: 'Purple', label: 'Purple' },
  { value: 'Pink', label: 'Pink' },
  { value: 'Cream', label: 'Cream' },
  { value: 'Ivory', label: 'Ivory' },
  { value: 'Burgundy', label: 'Burgundy' },
  { value: 'Sky Blue', label: 'Sky Blue' },
  { value: 'Dark Blue', label: 'Dark Blue' },
  { value: 'Champagne', label: 'Champagne' },
  { value: 'Multi-colour', label: 'Multi-colour' },
  { value: 'Other', label: 'Other' },
]

const RELATIONSHIP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Father', label: 'Father' },
  { value: 'Mother', label: 'Mother' },
  { value: 'Brother', label: 'Brother' },
  { value: 'Sister', label: 'Sister' },
  { value: 'Husband', label: 'Husband' },
  { value: 'Wife', label: 'Wife' },
  { value: 'Son', label: 'Son' },
  { value: 'Daughter', label: 'Daughter' },
  { value: 'Uncle', label: 'Uncle' },
  { value: 'Aunt', label: 'Aunt' },
  { value: 'Cousin', label: 'Cousin' },
  { value: 'Grandfather', label: 'Grandfather' },
  { value: 'Grandmother', label: 'Grandmother' },
  { value: 'Nephew', label: 'Nephew' },
  { value: 'Niece', label: 'Niece' },
  { value: 'Guardian', label: 'Guardian' },
  { value: 'Friend', label: 'Friend' },
  { value: 'Colleague', label: 'Colleague' },
  { value: 'Supervisor', label: 'Supervisor' },
  { value: 'Military Commander', label: 'Military Commander' },
  { value: 'Next of Kin', label: 'Next of Kin' },
  { value: 'Other', label: 'Other' },
]

const REQUIRED_DOCUMENT_TYPES = ['National ID', 'Passport', 'Driver License']

const NATIONALITIES = [
  'Afghan',
  'Albanian',
  'Algerian',
  'American',
  'Andorran',
  'Angolan',
  'Antiguan',
  'Argentine',
  'Armenian',
  'Australian',
  'Austrian',
  'Azerbaijani',
  'Bahamian',
  'Bahraini',
  'Bangladeshi',
  'Barbadian',
  'Belarusian',
  'Belgian',
  'Belizean',
  'Beninese',
  'Bhutanese',
  'Bolivian',
  'Bosnian',
  'Botswanan',
  'Brazilian',
  'British',
  'Bruneian',
  'Bulgarian',
  'Burkinabe',
  'Burmese',
  'Burundian',
  'Cambodian',
  'Cameroonian',
  'Canadian',
  'Cape Verdean',
  'Central African',
  'Chadian',
  'Chilean',
  'Chinese',
  'Colombian',
  'Comoran',
  'Congolese',
  'Costa Rican',
  'Croatian',
  'Cuban',
  'Cypriot',
  'Czech',
  'Danish',
  'Djiboutian',
  'Dominican',
  'Dutch',
  'Ecuadorean',
  'Egyptian',
  'Emirati',
  'Equatorial Guinean',
  'Eritrean',
  'Estonian',
  'Ethiopian',
  'Fijian',
  'Filipino',
  'Finnish',
  'French',
  'Gabonese',
  'Gambian',
  'Georgian',
  'German',
  'Ghanaian',
  'Greek',
  'Grenadian',
  'Guatemalan',
  'Guinean',
  'Guyanese',
  'Haitian',
  'Honduran',
  'Hungarian',
  'Icelandic',
  'Indian',
  'Indonesian',
  'Iranian',
  'Iraqi',
  'Irish',
  'Israeli',
  'Italian',
  'Ivorian',
  'Jamaican',
  'Japanese',
  'Jordanian',
  'Kazakh',
  'Kenyan',
  'Kiribati',
  'Kuwaiti',
  'Kyrgyz',
  'Laotian',
  'Latvian',
  'Lebanese',
  'Liberian',
  'Libyan',
  'Lithuanian',
  'Luxembourg',
  'Macedonian',
  'Malagasy',
  'Malawian',
  'Malaysian',
  'Maldivian',
  'Malian',
  'Maltese',
  'Marshallese',
  'Mauritanian',
  'Mauritian',
  'Mexican',
  'Micronesian',
  'Moldovan',
  'Monacan',
  'Mongolian',
  'Montenegrin',
  'Moroccan',
  'Mozambican',
  'Namibian',
  'Nauruan',
  'Nepalese',
  'New Zealander',
  'Nicaraguan',
  'Nigerien',
  'Nigerian',
  'North Korean',
  'Norwegian',
  'Omani',
  'Pakistani',
  'Palauan',
  'Palestinian',
  'Panamanian',
  'Papua New Guinean',
  'Paraguayan',
  'Peruvian',
  'Polish',
  'Portuguese',
  'Qatari',
  'Romanian',
  'Russian',
  'Rwandan',
  'Saint Lucian',
  'Salvadoran',
  'Samoan',
  'San Marinese',
  'Sao Tomean',
  'Saudi',
  'Senegalese',
  'Serbian',
  'Seychellois',
  'Sierra Leonean',
  'Singaporean',
  'Slovak',
  'Slovenian',
  'Solomon Islander',
  'Somali',
  'South African',
  'South Korean',
  'South Sudanese',
  'Spanish',
  'Sri Lankan',
  'Sudanese',
  'Surinamese',
  'Swazi',
  'Swedish',
  'Swiss',
  'Syrian',
  'Taiwanese',
  'Tajik',
  'Tanzanian',
  'Thai',
  'Timorese',
  'Togolese',
  'Tongan',
  'Trinidadian',
  'Tunisian',
  'Turkish',
  'Turkmen',
  'Tuvaluan',
  'Ugandan',
  'Ukrainian',
  'Uruguayan',
  'Uzbek',
  'Vanuatuan',
  'Vatican',
  'Venezuelan',
  'Vietnamese',
  'Yemeni',
  'Zambian',
  'Zimbabwean',
]

interface PublicRegistrationWizardProps {
  variant?: RegistrationVariant
}

export default function PublicRegistrationWizard({ variant = 'default' }: PublicRegistrationWizardProps) {
  const isDirector = variant === 'director'
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [registrationNumber, setRegistrationNumber] = useState<string | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [docUploadError, setDocUploadError] = useState<string | null>(null)
   const [visitorType, setVisitorType] = useState<VisitorType>('Visitor')
   const [employees, setEmployees] = useState<Employee[]>([])
   const [loadingEmployees, setLoadingEmployees] = useState(true)
   const [availabilityStatus, setAvailabilityStatus] = useState<string | null>(null)
   const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null)
   const [availabilityAlternatives, setAvailabilityAlternatives] = useState<Array<{ time: string; availableAt: string }>>([])
   const [checkingAvailability, setCheckingAvailability] = useState(false)
   const [nextAvailableAt, setNextAvailableAt] = useState<string | null>(null)
  const [manualPurpose, setManualPurpose] = useState('')
  const [customPurpose, setCustomPurpose] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string | null>>({})
  const [touched, setTouched] = useState<Set<string>>(new Set())

  const markTouched = (field: string) => {
    setTouched((prev) => {
      const next = new Set(prev)
      next.add(field)
      return next
    })
  }

  const scrollToFirstInvalid = () => {
    const firstInvalid = document.querySelector('.border-red-500, .text-red-600')
    if (firstInvalid instanceof HTMLElement) {
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' })
      firstInvalid.focus()
    }
  }

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    is_pre_arranged: null as boolean | null,
    nationality: 'Nigeria',
    visitor_address: '',
    gender: '',
    photo_url: null as string | null,
    doc_type: 'National ID',
    doc_number: '',
    issuing_country: '',
    expiry_date: '',
    doc_front_url: null as string | null,
    doc_back_url: null as string | null,
    employee_id: '',
    purpose: '',
    visit_date: '',
    arrival_time: '',
    expected_duration: 60,
    office_location: '',
    has_vehicle: false,
    registration_number: '',
    vehicle_type: '',
    vehicle_make: '',
    vehicle_color: '',
    emergency_name: '',
    emergency_relationship: '',
    emergency_phone: '',
    notes: '',
    accept_terms: false,
  })

  useEffect(() => {
    supabase
      .from('employees')
      .select('id, full_name, department, position, office_location, phone, email')
      .order('full_name')
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load employees:', error)
          setEmployees([])
        } else {
          setEmployees(data ?? [])
        }
        setLoadingEmployees(false)
      })
  }, [])

  const checkAvailability = async () => {
    if (!formData.employee_id || !formData.visit_date || !formData.arrival_time) {
      setAvailabilityStatus(null)
      setAvailabilityMessage(null)
      setAvailabilityAlternatives([])
      setNextAvailableAt(null)
      return
    }

    setCheckingAvailability(true)
    try {
      const params = new URLSearchParams({
        employee_id: formData.employee_id,
        date: formData.visit_date,
        time: formData.arrival_time,
        duration: String(formData.expected_duration || 60),
      })

       const res = await fetch(`/api/public/host-availability?${params}`)
       const data = await res.json()
      setAvailabilityStatus(data.status || null)
      setAvailabilityMessage(data.message || null)
      setAvailabilityAlternatives(data.alternatives || [])
      setNextAvailableAt(data.nextAvailableAt || null)
    } catch {
      setAvailabilityStatus('Unavailable')
      setAvailabilityMessage('Failed to check availability.')
      setAvailabilityAlternatives([])
      setNextAvailableAt(null)
    } finally {
      setCheckingAvailability(false)
    }
  }

   useEffect(() => {
    if (!formData.employee_id) return

    const channel = supabase
      .channel('host-availability-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'employees',
          filter: `id=eq.${formData.employee_id}`,
        },
        () => {
          checkAvailability()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [formData.employee_id, formData.visit_date])

  const totalSteps = 7

  const updateField = (field: string, value: string | boolean | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const next = async () => {
    setError(null)
    let errors: Record<string, string | null> = {}

    if (step === 1) {
      errors = validateStep1(visitorType)
    } else if (step === 2) {
      errors = validateStep2({
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        nationality: formData.nationality,
        gender: formData.gender,
      })
      if (!formData.photo_url) {
        errors.photo_url = 'Visitor photograph is required.'
      }
      if (formData.is_pre_arranged === null || formData.is_pre_arranged === undefined) {
        errors.is_pre_arranged = 'Please select whether this visit is pre-arranged.'
      }
    } else if (step === 3) {
      errors = validateStep3({
        doc_type: formData.doc_type,
        doc_number: formData.doc_number,
        issuing_country: formData.issuing_country,
        expiry_date: formData.expiry_date,
        doc_front_url: formData.doc_front_url,
        doc_back_url: formData.doc_back_url,
      })
    } else if (step === 4) {
      const purposeValue = isDirector ? manualPurpose : (formData.purpose === 'Other' ? customPurpose : formData.purpose)
      errors = validateStep4({
        host_employee_id: formData.employee_id,
        purpose: purposeValue,
        custom_purpose: customPurpose,
        visit_date: formData.visit_date,
        arrival_time: formData.arrival_time,
        expected_duration: formData.expected_duration,
      })

      const selectedEmployee = employees.find((e) => e.id === formData.employee_id)
      if (!selectedEmployee?.department) {
        errors.employee_id = 'The selected employee has no department assigned. Please contact Reception.'
      }
      if (!selectedEmployee?.office_location) {
        errors.office_location = 'The selected employee has no assigned office location. Please contact Reception.'
      }
      if (availabilityStatus && availabilityStatus !== 'Available') {
        errors.availability = availabilityMessage || 'Host is not available for the selected time.'
      }
    } else if (step === 5) {
      errors = validateStep5({
        has_vehicle: formData.has_vehicle,
        registration_number: formData.registration_number,
        vehicle_type: formData.vehicle_type,
        vehicle_make: formData.vehicle_make,
      })
    } else if (step === 6) {
      errors = validateStep6({
        emergency_contact: formData.emergency_name,
        emergency_relationship: formData.emergency_relationship,
        emergency_phone: formData.emergency_phone,
      })
    }

    const hasErrors = Object.values(errors).some((err) => err !== null && err !== undefined)
    if (hasErrors) {
      setValidationErrors(errors)
      setTouched((prev) => {
        const next = new Set(prev)
        Object.keys(errors).forEach((field) => next.add(field))
        return next
      })
      setError('Please complete all required fields before continuing.')
      setTimeout(scrollToFirstInvalid, 0)
      return
    }

    setValidationErrors({})
    setStep((s) => Math.min(s + 1, totalSteps))
  }
  const back = () => setStep((s) => Math.max(s - 1, 1))

   const handleDocUpload = async (file: File, side: 'front' | 'back') => {
      setDocUploadError(null)

      if (file.size > 5 * 1024 * 1024) {
        setDocUploadError('File is too large. Please upload an image or PDF under 5 MB.')
        return
      }

      const storagePath = `public-reg/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

     const { data: uploadData, error: uploadError } = await supabase.storage
       .from('visitor-documents')
       .upload(storagePath, file, {
         contentType: file.type,
         upsert: false,
        })

     if (uploadError) {
       console.error('[handleDocUpload] Upload failed:', uploadError)
       const message = uploadError.message || 'Upload failed'
       setDocUploadError(message.includes('maximum allowed size') ? 'File exceeds the maximum upload size. Please use a smaller file.' : message)
       return
     }

    const {
       data: { publicUrl },
     } = supabase.storage
       .from('visitor-documents')
       .getPublicUrl(storagePath)

     if (side === 'front') {
      updateField('doc_front_url', publicUrl)
      updateField('front_image_url', publicUrl)
    } else {
       updateField('doc_back_url', publicUrl)
       updateField('back_image_url', publicUrl)
     }
   }

  const handleSubmit = async () => {
    const allErrors: Record<string, string | null> = {
      ...validateStep1(visitorType),
      ...validateStep2({
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        nationality: formData.nationality,
        gender: formData.gender,
      }),
      ...(!formData.photo_url ? { photo_url: 'Visitor photograph is required.' } : {}),
      ...(formData.is_pre_arranged === null || formData.is_pre_arranged === undefined ? { is_pre_arranged: 'Please select whether this visit is pre-arranged.' } : {}),
      ...validateStep3({
        doc_type: formData.doc_type,
        doc_number: formData.doc_number,
        issuing_country: formData.issuing_country,
        expiry_date: formData.expiry_date,
        doc_front_url: formData.doc_front_url,
        doc_back_url: formData.doc_back_url,
      }),
      ...validateStep4({
        host_employee_id: formData.employee_id,
        purpose: isDirector ? manualPurpose : (formData.purpose === 'Other' ? customPurpose : formData.purpose),
        custom_purpose: customPurpose,
        visit_date: formData.visit_date,
        arrival_time: formData.arrival_time,
        expected_duration: formData.expected_duration,
      }),
      ...validateStep5({
        has_vehicle: formData.has_vehicle,
        registration_number: formData.registration_number,
        vehicle_type: formData.vehicle_type,
        vehicle_color: formData.vehicle_color,
        vehicle_make: formData.vehicle_make,
      }),
      ...validateStep6({
        emergency_contact: formData.emergency_name,
        emergency_relationship: formData.emergency_relationship,
        emergency_phone: formData.emergency_phone,
      }),
    }

    const hasErrors = hasValidationErrors(allErrors)
    if (hasErrors) {
      setValidationErrors(allErrors)
      setTouched((prev) => {
        const next = new Set(prev)
        Object.keys(allErrors).forEach((field) => next.add(field))
        return next
      })
      setError('Please complete all required fields before submitting.')
      setTimeout(scrollToFirstInvalid, 0)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const visitDate = new Date(formData.visit_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (visitDate < today) {
        setError('Visit date cannot be in the past')
        setSubmitting(false)
        return
      }

       const registerResponse = await fetch('/api/public/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: formData.full_name,
            phone: formData.phone,
            email: formData.email,
            is_pre_arranged: formData.is_pre_arranged,
            visitor_address: formData.visitor_address,
            nationality: formData.nationality,
            gender: formData.gender,
            photo_url: formData.photo_url,
            emergency_phone: formData.emergency_phone,
            registration_number: formData.registration_number,
            vehicle_type: formData.vehicle_type,
            employee_id: formData.employee_id,
            purpose: isDirector ? manualPurpose : (formData.purpose === 'Other' ? customPurpose : formData.purpose),
            visit_date: formData.visit_date,
            arrival_time: formData.arrival_time,
            expected_duration: formData.expected_duration,
            has_vehicle: formData.has_vehicle,
            visitor_type: visitorType,
            notes: formData.notes,
            doc_type: formData.doc_type,
            doc_number: formData.doc_number,
            issuing_country: formData.issuing_country,
            expiry_date: formData.expiry_date,
            doc_front_url: formData.doc_front_url,
            doc_back_url: formData.doc_back_url || null,
          }),
        })

       if (!registerResponse.ok) {
         const errData = await registerResponse.json()
         setError(errData.error || 'Registration failed')
         setSubmitting(false)
         return
       }

        const registerData = await registerResponse.json()
        const regNumber = registerData.data.registrationNumber
        const visitId = registerData.data.visitId
        const badgeId = registerData.data.badgeId || null
        const badgeNumber = registerData.data.badgeNumber || null

        const QRCode = (await import('qrcode')).default
        const qrPayload = JSON.stringify({ registrationNumber: regNumber, visitId, type: 'public-visitor' })
        const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 300, margin: 2 })

        setRegistrationNumber(regNumber)
        setQrCodeUrl(qrDataUrl)
        setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

const isStepInvalid = () => {
     if (step === 1) return hasValidationErrors(validateStep1(visitorType))
       if (step === 2) {
        const errors = validateStep2({
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone,
          nationality: formData.nationality,
          gender: formData.gender,
        })
        if (!formData.photo_url) errors.photo_url = 'Visitor photograph is required.'
        if (formData.is_pre_arranged === null || formData.is_pre_arranged === undefined) {
          errors.is_pre_arranged = 'Please select whether this visit is pre-arranged.'
        }
        return hasValidationErrors(errors)
      }
      if (step === 3) {
       const errors = validateStep3({
         doc_type: formData.doc_type,
         doc_number: formData.doc_number,
         issuing_country: formData.issuing_country,
         expiry_date: formData.expiry_date,
         doc_front_url: formData.doc_front_url,
         doc_back_url: formData.doc_back_url,
       })
       if (docUploadError) errors.doc_front_url = docUploadError
       return hasValidationErrors(errors)
     }
     if (step === 4) return hasValidationErrors(validateStep4({
       host_employee_id: formData.employee_id,
       purpose: isDirector ? manualPurpose : (formData.purpose === 'Other' ? customPurpose : formData.purpose),
       custom_purpose: customPurpose,
       visit_date: formData.visit_date,
       arrival_time: formData.arrival_time,
       expected_duration: formData.expected_duration,
     }))
      if (step === 5) return hasValidationErrors(validateStep5({
        has_vehicle: formData.has_vehicle,
        registration_number: formData.registration_number,
        vehicle_type: formData.vehicle_type,
        vehicle_color: formData.vehicle_color,
        vehicle_make: formData.vehicle_make,
      }))
     if (step === 6) return hasValidationErrors(validateStep6({
      emergency_contact: formData.emergency_name,
      emergency_relationship: formData.emergency_relationship,
      emergency_phone: formData.emergency_phone,
    }))
    return false
  }

  if (submitted && registrationNumber) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="mx-auto max-w-5xl px-4 lg:px-6">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 md:p-8 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-[#0B3D91]/10 flex items-center justify-center mb-6">
              <CheckCircle2 className="h-8 w-8 text-[#0B3D91]" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Registration Submitted Successfully</h2>
            <p className="text-gray-600 mb-6">Your registration has been submitted and is pending approval.</p>

            <div className="rounded-xl border border-gray-200 p-6 mb-6">
              <p className="text-sm text-gray-500 mb-1">Registration Number</p>
              <p className="text-2xl font-mono font-bold text-[#0B3D91] mb-4">{registrationNumber}</p>

              {qrCodeUrl && (
                <div className="flex flex-col items-center">
                  <div className="rounded-xl border-2 border-[#0B3D91] p-3 bg-white">
                    <img src={qrCodeUrl} alt="QR Code" className="h-48 w-48" />
                  </div>
                  <p className="text-sm text-gray-500 mt-2">Present this QR code at the gate</p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[#0B3D91]/20 bg-[#0B3D91]/5 p-4 mb-6">
              <p className="text-sm text-[#0B3D91]">
                <strong>Status:</strong> Pending Approval
              </p>
              <p className="text-sm text-[#0B3D91]/80 mt-1">
                You will receive an email confirmation once your registration is approved.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/register/status" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B3D91] px-6 py-3 text-sm font-medium text-white hover:bg-[#4DA6FF] transition-colors min-h-[52px]">
                Check Status
              </Link>
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 min-h-[52px] transition-colors">
                New Registration
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const formTitle = isDirector ? 'DIRECTOR' : 'Visitor Registration'
  const formSubtitle = isDirector
    ? 'DEPARTMENT OF LAND WARFARE\nVISITORS FORM'
    : 'NA Avn Comd · Kaduna, Nigeria'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={isDirector ? 'bg-[#0B0F08] text-white' : 'bg-[#0B3D91] text-white'}>
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">{formTitle}</h1>
              {isDirector ? (
                <div className="text-xs sm:text-sm text-[#9A9F87] mt-0.5 whitespace-pre-line">{formSubtitle}</div>
              ) : (
                <p className="text-xs sm:text-sm text-white/70 mt-0.5">{formSubtitle}</p>
              )}
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm font-medium text-white/90">Step {step} of {totalSteps}</p>
              <div className="mt-1.5 h-1.5 w-40 sm:w-48 rounded-full bg-white/20">
                <div className={`h-1.5 rounded-full transition-all duration-500 ${isDirector ? 'bg-[#C8A951]' : 'bg-[#4DA6FF]'}`} style={{ width: `${(step / totalSteps) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 md:p-8">
              {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Visitor Type</h2>
                <p className="text-sm text-gray-500 mt-1">Select the type of visitor</p>
              </div>
              {validationErrors.visitor_type && <p className="text-sm text-red-600">{validationErrors.visitor_type}</p>}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {VISITOR_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setVisitorType(type)}
                    className={`rounded-xl border-2 p-4 text-center transition-all min-h-[52px] ${
                      visitorType === type ? 'border-[#0B3D91] bg-[#0B3D91]/5' : 'border-gray-200 bg-white hover:border-[#4DA6FF]'
                    } ${touched.has('visitorType') && validationErrors.visitor_type ? 'border-red-500' : ''}`}
                  >
                    <p className="text-sm font-semibold text-gray-900">{type}</p>
                    <p className="text-xs text-gray-600 mt-1">{VISITOR_TYPE_INFO[type].description}</p>
                    <p className="text-xs text-gray-500 mt-1">{VISITOR_TYPE_INFO[type].helperText}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Personal Information</h2>
                <p className="text-sm text-gray-500 mt-1">Provide your personal details</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => updateField('full_name', e.target.value)}
                    onBlur={() => markTouched('full_name')}
                    className={`${touched.has('full_name') && validationErrors.full_name ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`}
                  />
                  {touched.has('full_name') && validationErrors.full_name && <p className="text-sm text-red-600 mt-1">{validationErrors.full_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    onBlur={() => markTouched('phone')}
                    className={`${touched.has('phone') && validationErrors.phone ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`}
                  />
                  {touched.has('phone') && validationErrors.phone && <p className="text-sm text-red-600 mt-1">{validationErrors.phone}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    onBlur={() => markTouched('email')}
                    className={`${touched.has('email') && validationErrors.email ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`}
                  />
                  {touched.has('email') && validationErrors.email && <p className="text-sm text-red-600 mt-1">{validationErrors.email}</p>}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Pre-arranged Visit *</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="is_pre_arranged"
                        value="true"
                        checked={formData.is_pre_arranged === true}
                        onChange={() => {
                          updateField('is_pre_arranged', true as unknown as string)
                          markTouched('is_pre_arranged')
                        }}
                        className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Yes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="is_pre_arranged"
                        value="false"
                        checked={formData.is_pre_arranged === false}
                        onChange={() => {
                          updateField('is_pre_arranged', false as unknown as string)
                          markTouched('is_pre_arranged')
                        }}
                        className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">No</span>
                    </label>
                  </div>
                  {touched.has('is_pre_arranged') && validationErrors.is_pre_arranged && <p className="text-sm text-red-600 mt-1">{validationErrors.is_pre_arranged}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nationality *</label>
                  <select
                    value={formData.nationality}
                    onChange={(e) => updateField('nationality', e.target.value)}
                    onBlur={() => markTouched('nationality')}
                    className={`${touched.has('nationality') && validationErrors.nationality ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`}
                  >
                    <option value="">Select nationality</option>
                    {NATIONALITIES.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  {touched.has('nationality') && validationErrors.nationality && <p className="text-sm text-red-600 mt-1">{validationErrors.nationality}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => updateField('gender', e.target.value)}
                    onBlur={() => markTouched('gender')}
                    className={`${touched.has('gender') && validationErrors.gender ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`}
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  {touched.has('gender') && validationErrors.gender && <p className="text-sm text-red-600 mt-1">{validationErrors.gender}</p>}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Residential Address</label>
                  <textarea
                    value={formData.visitor_address}
                    onChange={(e) => updateField('visitor_address', e.target.value)}
                    onBlur={() => markTouched('visitor_address')}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Photograph *</label>
                  <PhotoCapture
                    value={formData.photo_url}
                    onChange={(dataUrl) => {
                      updateField('photo_url', dataUrl)
                      setError(null)
                    }}
                    error={touched.has('photo_url') && validationErrors.photo_url ? validationErrors.photo_url : undefined}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Identification</h2>
                <p className="text-sm text-gray-500 mt-1">Upload your identification documents</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID Type *</label>
                  <select
                    value={formData.doc_type}
                    onChange={(e) => updateField('doc_type', e.target.value)}
                    onBlur={() => markTouched('doc_type')}
                    className={`${touched.has('doc_type') && validationErrors.doc_type ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`}
                  >
                    {REQUIRED_DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {touched.has('doc_type') && validationErrors.doc_type && <p className="text-sm text-red-600 mt-1">{validationErrors.doc_type}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID Number *</label>
                  <input
                    type="text"
                    value={formData.doc_number}
                    onChange={(e) => updateField('doc_number', e.target.value)}
                    onBlur={() => markTouched('doc_number')}
                    className={`${touched.has('doc_number') && validationErrors.doc_number ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`}
                  />
                  {touched.has('doc_number') && validationErrors.doc_number && <p className="text-sm text-red-600 mt-1">{validationErrors.doc_number}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issuing Country *</label>
                  <select
                    value={formData.issuing_country}
                    onChange={(e) => updateField('issuing_country', e.target.value)}
                    onBlur={() => markTouched('issuing_country')}
                    className={`${touched.has('issuing_country') && validationErrors.issuing_country ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`}
                  >
                    <option value="">Select country</option>
                    {NATIONALITIES.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  {touched.has('issuing_country') && validationErrors.issuing_country && <p className="text-sm text-red-600 mt-1">{validationErrors.issuing_country}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    value={formData.expiry_date}
                    onChange={(e) => updateField('expiry_date', e.target.value)}
                    onBlur={() => markTouched('expiry_date')}
                    className={`${touched.has('expiry_date') && validationErrors.expiry_date ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`}
                  />
                  {touched.has('expiry_date') && validationErrors.expiry_date && <p className="text-sm text-red-600 mt-1">{validationErrors.expiry_date}</p>}
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500 mb-2">Upload scanned documents.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <label
                      htmlFor="doc-front-upload"
                      className={`rounded-lg border-2 border-dashed p-4 text-center text-sm cursor-pointer transition-colors ${
                        touched.has('doc_front_url') && validationErrors.doc_front_url ? 'border-red-500 text-red-600' : 'border-gray-300 text-gray-500 hover:border-blue-400'
                      }`}
                    >
                      <input
                        id="doc-front-upload"
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                        onChange={(e) => e.target.files?.[0] && handleDocUpload(e.target.files[0], 'front')}
                        className="hidden"
                      />
                      {formData.doc_front_url ? (
                        <img src={formData.doc_front_url} alt="Front" className="mx-auto h-32 object-cover rounded" />
                      ) : (
                        <div className="space-y-2">
                          <Upload className="h-8 w-8 mx-auto" />
                          <p className="text-xs">Click to upload Front</p>
                        </div>
                      )}
                    </label>
                    <label
                      htmlFor="doc-back-upload"
                      className={`rounded-lg border-2 border-dashed p-4 text-center text-sm cursor-pointer transition-colors ${(formData.doc_type === 'National ID' || formData.doc_type === 'Driver License') && touched.has('doc_back_url') && validationErrors.doc_back_url ? 'border-red-500 text-red-600' : 'border-gray-300 text-gray-500 hover:border-blue-400'}`}
                    >
                      <input
                        id="doc-back-upload"
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                        onChange={(e) => e.target.files?.[0] && handleDocUpload(e.target.files[0], 'back')}
                        className="hidden"
                      />
                      {formData.doc_back_url ? (
                        <img src={formData.doc_back_url} alt="Back" className="mx-auto h-32 object-cover rounded" />
                      ) : (
                        <div className="space-y-2">
                          <Upload className="h-8 w-8 mx-auto" />
                          <p className="text-xs">Click to upload Back</p>
                        </div>
                      )}
                    </label>
                  </div>
                  {touched.has('doc_front_url') && validationErrors.doc_front_url && <p className="text-sm text-red-600 mt-1">{validationErrors.doc_front_url}</p>}
                  {(formData.doc_type === 'National ID' || formData.doc_type === 'Driver License') && touched.has('doc_back_url') && validationErrors.doc_back_url && <p className="text-sm text-red-600 mt-1">{validationErrors.doc_back_url}</p>}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Visit Details</h2>
                <p className="text-sm text-gray-500 mt-1">Provide information about your visit</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Host Employee *</label>
                  <SearchableCombobox
                    options={employees.map((emp) => ({
                      value: emp.id,
                      label: emp.full_name,
                      description: `${emp.department || ''}${emp.position ? ` · ${emp.position}` : ''}`,
                    }))}
                    value={formData.employee_id}
                     onChange={(val) => {
                       const emp = employees.find((e) => e.id === val)
                       updateField('employee_id', val)
                       updateField('office_location', emp?.office_location || '')
                     }}
                    placeholder="Search by name, department, or position..."
                    searchPlaceholder="Search employees..."
                    noResultsText="No employees found"
                    loading={loadingEmployees}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={employees.find((e) => e.id === formData.employee_id)?.department || ''}
                    readOnly
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Office Location</label>
                  {formData.employee_id && !employees.find((e) => e.id === formData.employee_id)?.office_location ? (
                    <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-sm text-amber-700">⚠️ This employee has no assigned office location.</p>
                      <p className="text-xs text-amber-600 mt-1">Please contact Reception.</p>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={employees.find((e) => e.id === formData.employee_id)?.office_location || ''}
                      readOnly
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600"
                    />
                  )}
                </div>
                {formData.employee_id && (() => {
                  const selectedEmployee = employees.find((e) => e.id === formData.employee_id)
                  if (!selectedEmployee) return null
                  return (
                    <div className="md:col-span-2">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <h3 className="text-sm font-medium text-gray-900 mb-3">Host Information</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-gray-500">Name</p>
                            <p className="text-sm font-medium text-gray-900">{selectedEmployee.full_name}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Department</p>
                            <p className="text-sm font-medium text-gray-900">{selectedEmployee.department || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Office</p>
                            <p className="text-sm font-medium text-gray-900">{selectedEmployee.office_location || '—'}</p>
                          </div>
                          {selectedEmployee.position && (
                            <div>
                              <p className="text-xs text-gray-500">Position</p>
                              <p className="text-sm font-medium text-gray-900">{selectedEmployee.position}</p>
                            </div>
                          )}
                          {selectedEmployee.phone && (
                            <div>
                              <p className="text-xs text-gray-500">Phone</p>
                              <p className="text-sm font-medium text-gray-900">{selectedEmployee.phone}</p>
                            </div>
                          )}
                          {selectedEmployee.email && (
                            <div>
                              <p className="text-xs text-gray-500">Email</p>
                              <p className="text-sm font-medium text-gray-900">{selectedEmployee.email}</p>
                            </div>
                          )}
                           <div>
                             <p className="text-xs text-gray-500">Availability</p>
                             <p className="text-sm font-medium text-gray-900">Available</p>
                           </div>
                          <div>
                            <p className="text-xs text-gray-500">Next Available Time</p>
                            <p className="text-sm font-medium text-gray-900">{nextAvailableAt || '—'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
                {formData.employee_id && formData.visit_date && formData.arrival_time && (
                  <div className="md:col-span-2">
                    {checkingAvailability ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                        Checking availability...
                      </div>
                    ) : availabilityStatus === 'Available' ? (
                      <div className="rounded-lg border border-[#0B3D91]/20 bg-[#0B3D91]/5 px-4 py-3">
                        <p className="text-sm font-medium text-[#0B3D91]">Host Available</p>
                        <p className="text-xs text-[#0B3D91]/80 mt-1">{availabilityMessage}</p>
                      </div>
                    ) : availabilityStatus === 'Busy' ? (
                      <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                        <p className="text-sm font-medium text-orange-800">Host Busy</p>
                        <p className="text-xs text-orange-700 mt-1">{availabilityMessage}</p>
                        {nextAvailableAt && (
                          <p className="text-xs text-orange-700 mt-1">Available again at: {nextAvailableAt}</p>
                        )}
                        {availabilityAlternatives.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-orange-800">Choose another time:</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {availabilityAlternatives.map((alt) => (
                                <button
                                  key={alt.time}
                                  type="button"
                                  onClick={() => updateField('arrival_time', alt.time)}
                                  className="inline-flex items-center rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100"
                                >
                                  {alt.time}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : availabilityStatus === 'In Meeting' ? (
                      <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
                        <p className="text-sm font-medium text-yellow-800">Host In Meeting</p>
                        <p className="text-xs text-yellow-700 mt-1">{availabilityMessage}</p>
                        {availabilityAlternatives.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-yellow-800">Choose another time:</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {availabilityAlternatives.map((alt) => (
                                <button
                                  key={alt.time}
                                  type="button"
                                  onClick={() => updateField('arrival_time', alt.time)}
                                  className="inline-flex items-center rounded-lg border border-yellow-300 bg-white px-3 py-1.5 text-xs font-medium text-yellow-700 hover:bg-yellow-100"
                                >
                                  {alt.time}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : availabilityStatus === 'On Leave' || availabilityStatus === 'Training' || availabilityStatus === 'Restricted' || availabilityStatus === 'Unavailable' || availabilityStatus === 'Off Duty' ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                        <p className="text-sm font-medium text-red-800">
                          {availabilityStatus === 'On Leave' ? 'Host On Leave' : availabilityStatus === 'Restricted' ? 'Restricted' : 'Host Off Duty'}
                        </p>
                        <p className="text-xs text-red-700 mt-1">{availabilityMessage}</p>
                      </div>
                    ) : null}
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purpose *</label>
                  {isDirector ? (
                    <input
                      type="text"
                      value={manualPurpose}
                      onChange={(e) => {
                        setManualPurpose(e.target.value)
                        updateField('purpose', e.target.value)
                      }}
                      onBlur={() => markTouched('purpose')}
                      placeholder="Enter purpose of visit..."
                      required
                      className={`${touched.has('purpose') && validationErrors.purpose ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`}
                    />
                  ) : (
                    <SearchableCombobox
                      options={PURPOSE_OPTIONS}
                      value={formData.purpose}
                      onChange={(val) => {
                        updateField('purpose', val)
                      }}
                      placeholder="Select purpose..."
                      searchPlaceholder="Search purpose..."
                      noResultsText="No matching purpose"
                      required
                    />
                  )}
                  {touched.has('purpose') && validationErrors.purpose && <p className="text-sm text-red-600 mt-1">{validationErrors.purpose}</p>}
                  {!isDirector && formData.purpose === 'Other' && (
                    <div className="mt-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Specify Purpose *</label>
                      <input
                        type="text"
                        value={customPurpose}
                        onChange={(e) => setCustomPurpose(e.target.value)}
                        placeholder="Please specify the purpose"
                        required
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Visit Date *</label>
                  <input type="date" value={formData.visit_date} onChange={(e) => updateField('visit_date', e.target.value)} min={new Date().toISOString().split('T')[0]} required className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Arrival Time *</label>
                  <input type="time" value={formData.arrival_time} onChange={(e) => updateField('arrival_time', e.target.value)} required className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expected Duration (minutes)</label>
                  <input type="number" value={formData.expected_duration} onChange={(e) => updateField('expected_duration', parseInt(e.target.value) || 60)} min="15" step="15" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Vehicle Information</h2>
                <p className="text-sm text-gray-500 mt-1">Optional vehicle details for gate access</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="has_vehicle" checked={formData.has_vehicle} onChange={(e) => updateField('has_vehicle', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <label htmlFor="has_vehicle" className="text-sm font-medium text-gray-700">I will be bringing a vehicle</label>
                </div>
                {formData.has_vehicle && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
                      <input type="text" value={formData.registration_number} onChange={(e) => updateField('registration_number', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Type *</label>
                      <SearchableCombobox
                        options={VEHICLE_TYPE_OPTIONS}
                        value={formData.vehicle_type}
                        onChange={(val) => updateField('vehicle_type', val)}
                        placeholder="Select vehicle type..."
                        searchPlaceholder="Search vehicle type..."
                        noResultsText="No matching vehicle type"
                        required
                      />
                      {touched.has('vehicle_type') && validationErrors.vehicle_type && <p className="text-sm text-red-600 mt-1">{validationErrors.vehicle_type}</p>}
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Colour *</label>
                      <SearchableCombobox
                        options={VEHICLE_COLOR_OPTIONS}
                        value={formData.vehicle_color}
                        onChange={(val) => updateField('vehicle_color', val)}
                        placeholder="Select vehicle colour..."
                        searchPlaceholder="Search colour..."
                        noResultsText="No matching colour"
                        required
                      />
                      {touched.has('vehicle_color') && validationErrors.vehicle_color && <p className="text-sm text-red-600 mt-1">{validationErrors.vehicle_color}</p>}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Emergency Contact</h2>
                <p className="text-sm text-gray-500 mt-1">Provide emergency contact information</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input type="text" value={formData.emergency_name} onChange={(e) => updateField('emergency_name', e.target.value)} required className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Relationship *</label>
                  <SearchableCombobox
                    options={RELATIONSHIP_OPTIONS}
                    value={formData.emergency_relationship}
                    onChange={(val) => updateField('emergency_relationship', val)}
                    placeholder="Select relationship..."
                    searchPlaceholder="Search relationship..."
                    noResultsText="No matching relationship"
                    required
                  />
                  {touched.has('emergency_relationship') && validationErrors.emergency_relationship && <p className="text-sm text-red-600 mt-1">{validationErrors.emergency_relationship}</p>}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                  <input type="tel" value={formData.emergency_phone} onChange={(e) => updateField('emergency_phone', e.target.value)} required className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                </div>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Review & Submit</h2>
                <p className="text-sm text-gray-500 mt-1">Verify your information before submitting</p>
              </div>
              <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                <ReviewRow label="Visitor Type" value={visitorType} />
                <ReviewRow label="Full Name" value={formData.full_name} />
                <ReviewRow label="Phone" value={formData.phone} />
                <ReviewRow label="Email" value={formData.email} />
                <ReviewRow label="Pre-arranged Visit" value={formData.is_pre_arranged === true ? 'Yes' : formData.is_pre_arranged === false ? 'No' : '—'} />
                <ReviewRow label="Nationality" value={formData.nationality} />
                <ReviewRow label="ID Type" value={formData.doc_type} />
                <ReviewRow label="ID Number" value={formData.doc_number} />
                <ReviewRow label="Host" value={employees.find((e) => e.id === formData.employee_id)?.full_name || formData.employee_id} />
                 <ReviewRow label="Purpose" value={isDirector ? manualPurpose : formData.purpose} />
                <ReviewRow label="Visit Date" value={formData.visit_date} />
                <ReviewRow label="Arrival Time" value={formData.arrival_time} />
                <ReviewRow label="Vehicle" value={formData.has_vehicle ? `${formData.registration_number} (${formData.vehicle_type})` : 'No'} />
                <ReviewRow label="Emergency Contact" value={`${formData.emergency_name} (${formData.emergency_relationship}) - ${formData.emergency_phone}`} />
              </div>
              <div className="flex items-start gap-2">
                <input type="checkbox" id="accept_terms" checked={formData.accept_terms} onChange={(e) => updateField('accept_terms', e.target.checked)} className="h-4 w-4 mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <label htmlFor="accept_terms" className="text-sm text-gray-600">
                  I confirm that the information provided is accurate and I agree to abide by the visitor guidelines of the NA Avn Comd.
                </label>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={back}
              disabled={step === 1}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 min-h-[52px] transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            {step < totalSteps ? (
              <button
                onClick={next}
                disabled={isStepInvalid()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0B3D91] px-6 py-3 text-sm font-medium text-white hover:bg-[#4DA6FF] disabled:opacity-50 min-h-[52px] transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting || submitted || !formData.accept_terms}
                className="inline-flex items-center gap-2 rounded-lg bg-[#C62828] px-6 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 min-h-[52px] transition-colors"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit Registration
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string | boolean | number | null }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{String(value || '—')}</span>
    </div>
  )
}


