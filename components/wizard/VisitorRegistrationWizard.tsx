'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth-client'
import { Loader2, CheckCircle2, ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Step1VisitorType from '@/components/wizard/Step1VisitorType'
import Step2PersonalInfo from '@/components/wizard/Step2PersonalInfo'
import Step3Identification from '@/components/wizard/Step3Identification'
import Step4VisitInfo from '@/components/wizard/Step4VisitInfo'
import Step5VehicleInfo from '@/components/wizard/Step5VehicleInfo'
import Step6EmergencyContact from '@/components/wizard/Step6EmergencyContact'
import Step7Review from '@/components/wizard/Step7Review'
import type { VisitorFormData } from '@/lib/types/visitor'
import { validateStep1, validateStep2, validateStep3, validateStep4, validateStep5, validateStep6, hasValidationErrors } from '@/lib/validation/visitor'

export type VisitorType = 'Visitor' | 'Contractor' | 'Vendor' | 'Guest Lecturer' | 'VIP' | 'Delivery Personnel'

export default function VisitorRegistrationWizard({ onComplete }: { onComplete?: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [visitorType, setVisitorType] = useState<VisitorType>('Visitor')
  const [formData, setFormData] = useState<VisitorFormData>({
    full_name: '',
    email: '',
    phone: '',
    is_pre_arranged: null as boolean | null,
    visitor_address: '',
    nationality: 'Nigeria',
    gender: '',
    vehicle_plate: '',
    vehicle_type: '',
    emergency_contact: '',
    host_employee_id: '',
    host_department: '',
    office_location: '',
    purpose: '',
    custom_purpose: '',
    has_vehicle: false,
    registration_number: '',
    vehicle_make: '',
    vehicle_model: '',
    vehicle_color: '',
    driver_name: '',
    driver_phone: '',
    parking_slot: '',
    notes: '',
    id_number: '',
    id_verification: false,
    doc_type: 'National ID',
    doc_number: '',
    issuing_country: '',
    expiry_date: '',
    doc_front_image: null,
    doc_back_image: null,
    doc_front_url: '',
    doc_back_url: '',
    doc_notes: '',
    photo_url: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string | null>>({})
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const firstInvalidRef = useRef<HTMLInputElement | null>(null)

  const totalSteps = 7

  const updateField = (field: keyof VisitorFormData, value: string | boolean | number | File | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

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

  const validateCurrentStep = async (): Promise<boolean> => {
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
        photo_url: formData.photo_url,
      })
      if (formData.is_pre_arranged === null || formData.is_pre_arranged === undefined) {
        errors.is_pre_arranged = 'Please select whether this visit is pre-arranged.'
      }
    } else if (step === 3) {
      errors = validateStep3(formData)
    } else if (step === 4) {
      errors = validateStep4({
        host_employee_id: formData.host_employee_id,
        purpose: formData.purpose,
        custom_purpose: formData.custom_purpose,
        visit_date: formData.visit_date,
        arrival_time: formData.arrival_time,
        expected_duration: formData.expected_duration,
      })
    } else if (step === 5) {
      errors = validateStep5({
        has_vehicle: formData.has_vehicle,
        registration_number: formData.registration_number,
        vehicle_type: formData.vehicle_type,
        vehicle_make: formData.vehicle_make,
      })
    } else if (step === 6) {
      errors = validateStep6({
        emergency_contact: formData.emergency_contact,
        emergency_relationship: formData.emergency_relationship,
        emergency_phone: formData.emergency_phone,
      })
    }

    const hasErrors = hasValidationErrors(errors)
    if (hasErrors) {
      setValidationErrors(errors)
      const fields = Object.keys(errors).filter((key) => errors[key])
      setTouched((prev) => {
        const next = new Set(prev)
        fields.forEach((field) => next.add(field))
        return next
      })
      setTimeout(scrollToFirstInvalid, 0)
      return false
    }

    setValidationErrors({})
    return true
  }

  const next = async () => {
    const isValid = await validateCurrentStep()
    if (!isValid) return
    setStep((s) => Math.min(s + 1, totalSteps))
  }

  const back = () => {
    if (step === 1) {
      router.push('/dashboard')
      return
    }
    setStep((s) => Math.max(s - 1, 1))
  }

  const handleSubmit = async () => {
    const allErrors: Record<string, string | null> = {
      ...validateStep1(visitorType),
      ...validateStep2(formData),
      ...validateStep3(formData),
      ...validateStep4({
        host_employee_id: formData.host_employee_id,
        purpose: formData.purpose,
        custom_purpose: formData.custom_purpose,
        visit_date: formData.visit_date,
        arrival_time: formData.arrival_time,
        expected_duration: formData.expected_duration,
      }),
      ...validateStep5({
        has_vehicle: formData.has_vehicle,
        registration_number: formData.registration_number,
        vehicle_type: formData.vehicle_type,
        vehicle_make: formData.vehicle_make,
      }),
      ...validateStep6({
        emergency_contact: formData.emergency_contact,
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
      const user = await getCurrentUser()
      if (!user) {
        setError('You must be logged in to register visitors')
        setSubmitting(false)
        return
      }

      // Validate visitor photograph is present
      if (!formData.photo_url) {
        setError('Visitor photograph is required. Please capture or upload a photo.')
        setSubmitting(false)
        return
      }

      let docFrontUrl = formData.doc_front_url
      let docBackUrl = formData.doc_back_url

      if (formData.doc_front_image) {
        const frontPath = `staff-reg/${Date.now()}-${formData.doc_front_image.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const { error: frontUploadError } = await supabase.storage
          .from('visitor-documents')
          .upload(frontPath, formData.doc_front_image, { contentType: formData.doc_front_image.type })

        if (frontUploadError) {
          setError('Failed to upload front identification document')
          setSubmitting(false)
          return
        }

        const { data: frontPublic } = supabase.storage
          .from('visitor-documents')
          .getPublicUrl(frontPath)

        docFrontUrl = frontPublic.publicUrl
      }

      if (formData.doc_back_image) {
        const backPath = `staff-reg/${Date.now()}-${formData.doc_back_image.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const { error: backUploadError } = await supabase.storage
          .from('visitor-documents')
          .upload(backPath, formData.doc_back_image, { contentType: formData.doc_back_image.type })

        if (backUploadError) {
          setError('Failed to upload back identification document')
          setSubmitting(false)
          return
        }

        const { data: backPublic } = supabase.storage
          .from('visitor-documents')
          .getPublicUrl(backPath)

        docBackUrl = backPublic.publicUrl
      }

      const res = await fetch('/api/public/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone,
          is_pre_arranged: formData.is_pre_arranged ?? false,
          nationality: formData.nationality,
          visitor_address: formData.visitor_address,
          gender: formData.gender,
          photo_url: docFrontUrl || formData.photo_url || null,
          doc_type: formData.doc_type,
          doc_number: formData.doc_number,
          issuing_country: formData.issuing_country || null,
          expiry_date: formData.expiry_date || null,
          doc_front_url: docFrontUrl,
          doc_back_url: docBackUrl || null,
          employee_id: formData.host_employee_id,
          purpose: formData.purpose === 'Other' ? formData.custom_purpose : formData.purpose,
          visit_date: formData.visit_date,
          arrival_time: formData.arrival_time || null,
          expected_duration: formData.expected_duration || 0,
          has_vehicle: !!formData.registration_number,
          registration_number: formData.registration_number || null,
          vehicle_type: formData.vehicle_type || null,
          vehicle_color: formData.vehicle_color || null,
          emergency_name: formData.emergency_contact,
          emergency_relationship: formData.emergency_relationship || null,
          emergency_phone: formData.emergency_phone || null,
          notes: formData.doc_notes || formData.notes || null,
          visitor_type: visitorType,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setError(err.message || 'Failed to submit registration')
        setSubmitting(false)
        return
      }

      const result = await res.json()

      onComplete?.()
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  const isStepInvalid = () => {
    if (step === 1) return hasValidationErrors(validateStep1(visitorType))
    if (step === 2) return hasValidationErrors(validateStep2(formData))
    if (step === 3) return hasValidationErrors(validateStep3(formData))
    if (step === 4) return hasValidationErrors(validateStep4({
      host_employee_id: formData.host_employee_id,
      purpose: formData.purpose,
      custom_purpose: formData.custom_purpose,
      visit_date: formData.visit_date,
      arrival_time: formData.arrival_time,
      expected_duration: formData.expected_duration,
    }))
    if (step === 5) return hasValidationErrors(validateStep5({
      has_vehicle: formData.has_vehicle,
      registration_number: formData.registration_number,
      vehicle_type: formData.vehicle_type,
      vehicle_make: formData.vehicle_make,
    }))
    if (step === 6) return hasValidationErrors(validateStep6({
      emergency_contact: formData.emergency_contact,
      emergency_relationship: formData.emergency_relationship,
      emergency_phone: formData.emergency_phone,
    }))
    return false
  }

  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900">Visitor Registration</h2>
        <p className="mt-1 text-sm text-gray-500">Step {step} of {totalSteps}</p>
        <div className="mt-3 h-2 w-full rounded-full bg-gray-200">
          <div className="h-2 rounded-full bg-blue-600 transition-all" style={{ width: `${(step / totalSteps) * 100}%` }} />
        </div>
      </div>

      <div className="p-6 space-y-6">
        {step === 1 && <Step1VisitorType visitorType={visitorType} onSelect={setVisitorType} error={validationErrors.visitor_type} touched={touched.has('visitor_type')} />}
        {step === 2 && <Step2PersonalInfo {...formData} onChange={updateField} errors={validationErrors} touched={touched} onBlur={markTouched} />}
        {step === 3 && <Step3Identification data={formData} onChange={updateField} errors={validationErrors} touched={touched} onBlur={markTouched} />}
        {step === 4 && <Step4VisitInfo {...formData} onChange={updateField} errors={validationErrors} touched={touched} onBlur={markTouched} />}
        {step === 5 && <Step5VehicleInfo {...formData} onChange={updateField} errors={validationErrors} touched={touched} onBlur={markTouched} />}
        {step === 6 && <Step6EmergencyContact {...formData} onChange={updateField} errors={validationErrors} touched={touched} onBlur={markTouched} />}
        {step === 7 && (
          <Step7Review
            visitorType={visitorType}
            full_name={formData.full_name}
            phone={formData.phone}
            email={formData.email}
            visitor_address={formData.visitor_address}
            nationality={formData.nationality}
            gender={formData.gender}
            has_vehicle={formData.has_vehicle}
            vehicle_make={formData.vehicle_make}
            vehicle_model={formData.vehicle_model}
            vehicle_color={formData.vehicle_color}
            registration_number={formData.registration_number}
            emergency_contact={formData.emergency_contact}
            emergency_relationship={formData.emergency_relationship}
            doc_type={formData.doc_type}
            doc_number={formData.doc_number}
            expiry_date={formData.expiry_date}
            host_employee_id={formData.host_employee_id}
            host_department={formData.host_department}
            office_location={formData.office_location}
            is_pre_arranged={formData.is_pre_arranged}
            purpose={formData.purpose}
            custom_purpose={formData.custom_purpose}
            expected_duration={formData.expected_duration || 0}
            id_verification={formData.id_verification}
            photo_url={formData.photo_url || null}
          />
        )}

        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 p-6">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" />
          {step === 1 ? 'Back to Dashboard' : 'Previous'}
        </button>

        {step < totalSteps ? (
          <button
            type="button"
            onClick={next}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Submitting...' : 'Submit Registration'}
          </button>
        )}
      </div>
    </div>
  )
}
