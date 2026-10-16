'use client'

import type { VisitorFormData } from '@/lib/types/visitor'
import SearchableCombobox from '@/components/ui/SearchableCombobox'
import { NATIONALITY_OPTIONS } from '@/lib/data/countries'
import PhotoCapture from '@/components/PhotoCapture'

interface Step2Props {
  full_name?: string
  gender?: string
  phone?: string
  email?: string
  nationality?: string
  visitor_address?: string
  is_pre_arranged?: boolean | null
  photo_url?: string | null
  onChange: (field: keyof VisitorFormData, value: string | boolean | null) => void
  errors?: Record<string, string | null>
  touched?: Set<string>
  onBlur?: (field: string) => void
}

export default function Step2PersonalInfo({ full_name = '', gender = '', phone = '', email = '', nationality = '', visitor_address = '', is_pre_arranged = null, photo_url = '', onChange, errors = {}, touched = new Set(), onBlur }: Step2Props) {
  const inputClasses = (field: string) => {
    const base = 'w-full rounded-lg border px-3 py-2'
    const touchedAndError = touched.has(field) && errors[field]
    return `${base} ${touchedAndError ? 'border-red-500 text-red-600' : 'border-gray-300'}`
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Personal Information</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Visitor Photograph *</label>
        <PhotoCapture
          value={photo_url || null}
          onChange={(dataUrl) => onChange('photo_url', dataUrl || '')}
          error={touched.has('photo_url') && errors.photo_url ? errors.photo_url : undefined}
          required={true}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
          <input
            type="text"
            value={full_name}
            onChange={(e) => onChange('full_name', e.target.value)}
            onBlur={() => onBlur?.('full_name')}
            className={inputClasses('full_name')}
          />
          {touched.has('full_name') && errors.full_name && <p className="text-sm text-red-600 mt-1">{errors.full_name}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
          <select value={gender} onChange={(e) => onChange('gender', e.target.value)} onBlur={() => onBlur?.('gender')} className={inputClasses('gender')}>
            <option value="">Select</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
          {touched.has('gender') && errors.gender && <p className="text-sm text-red-600 mt-1">{errors.gender}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nationality *</label>
          <SearchableCombobox
            options={NATIONALITY_OPTIONS}
            value={nationality}
            onChange={(value) => onChange('nationality', value)}
            placeholder="Select nationality"
            searchPlaceholder="Search nationality..."
            noResultsText="No nationality found"
            required
          />
          {touched.has('nationality') && errors.nationality && <p className="text-sm text-red-600 mt-1">{errors.nationality}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
          <input type="tel" value={phone} onChange={(e) => onChange('phone', e.target.value)} onBlur={() => onBlur?.('phone')} className={inputClasses('phone')} />
          {touched.has('phone') && errors.phone && <p className="text-sm text-red-600 mt-1">{errors.phone}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
          <input type="email" value={email} onChange={(e) => onChange('email', e.target.value)} onBlur={() => onBlur?.('email')} className={inputClasses('email')} />
          {touched.has('email') && errors.email && <p className="text-sm text-red-600 mt-1">{errors.email}</p>}
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Pre-arranged Visit *</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="is_pre_arranged"
                value="true"
                checked={is_pre_arranged === true}
                onChange={() => onChange('is_pre_arranged', true)}
                className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Yes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="is_pre_arranged"
                value="false"
                checked={is_pre_arranged === false}
                onChange={() => onChange('is_pre_arranged', false)}
                className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">No</span>
            </label>
          </div>
          {touched.has('is_pre_arranged') && errors.is_pre_arranged && <p className="text-sm text-red-600 mt-1">{errors.is_pre_arranged}</p>}
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input type="text" value={visitor_address} onChange={(e) => onChange('visitor_address', e.target.value)} onBlur={() => onBlur?.('visitor_address')} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </div>
      </div>
    </div>
  )
}
