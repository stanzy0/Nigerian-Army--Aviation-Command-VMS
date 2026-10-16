'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, type UserRole } from '@/lib/auth-client'
import type { VisitorFormData } from '@/lib/types/visitor'
import SearchableCombobox from '@/components/ui/SearchableCombobox'

interface Employee {
  id: string
  full_name: string
  department: string | null
  position: string | null
  office_location: string | null
  phone: string | null
  email: string | null
}

const PURPOSE_OPTIONS = [
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

interface Step4Props {
  host_employee_id?: string
  purpose?: string
  custom_purpose?: string
  expected_duration?: number
  visit_date?: string
  arrival_time?: string
  onChange: (field: keyof VisitorFormData, value: string | number) => void
  errors?: Record<string, string | null>
  touched?: Set<string>
  onBlur?: (field: string) => void
}

export default function Step4VisitInfo({ host_employee_id = '', purpose = '', custom_purpose = '', expected_duration = 0, visit_date = '', arrival_time = '', onChange, errors = {}, touched = new Set(), onBlur }: Step4Props) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [userRole, setUserRole] = useState<UserRole | null>(null)

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

    const fetchUserRole = async () => {
      const user = await getCurrentUser()
      if (user) setUserRole(user.role)
    }
    fetchUserRole()

  const selectedEmployee = employees.find((e) => e.id === host_employee_id)

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Visit Information</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Host Employee *</label>
          <SearchableCombobox
            options={employees.map((emp) => ({
              value: emp.id,
              label: emp.full_name,
              description: `${emp.department || ''}${emp.position ? ` · ${emp.position}` : ''}`,
            }))}
            value={host_employee_id}
            onChange={(val) => {
              onChange('host_employee_id', val)
              const emp = employees.find((e) => e.id === val)
              if (emp) {
                onChange('host_department', emp.department || '')
                onChange('office_location', emp.office_location || '')
              }
            }}
            placeholder="Search by name, department, or position..."
            searchPlaceholder="Search employees..."
            noResultsText="No employees found"
            loading={loadingEmployees}
            required
          />
          {touched.has('host_employee_id') && errors.host_employee_id && <p className="text-sm text-red-600 mt-1">{errors.host_employee_id}</p>}
        </div>
            {selectedEmployee && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <input type="text" value={selectedEmployee.department || ''} readOnly className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Office Location</label>
                  {selectedEmployee.office_location ? (
                    <input type="text" value={selectedEmployee.office_location} readOnly className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600" />
                  ) : (
                    <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-sm text-amber-700">⚠️ No assigned office location.</p>
                      <p className="text-xs text-amber-600 mt-1">Please contact Reception.</p>
                    </div>
                  )}
                </div>
                {userRole === 'Admin' && (
                  <>
                    {selectedEmployee.position && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                        <input type="text" value={selectedEmployee.position} readOnly className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600" />
                      </div>
                    )}
                    {selectedEmployee.phone && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input type="text" value={selectedEmployee.phone} readOnly className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600" />
                      </div>
                    )}
                    {selectedEmployee.email && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="text" value={selectedEmployee.email} readOnly className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600" />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Purpose *</label>
          <SearchableCombobox
            options={PURPOSE_OPTIONS}
            value={purpose}
            onChange={(val) => {
              onChange('purpose', val)
              if (val !== 'Other') {
                onChange('custom_purpose', '')
              }
            }}
            placeholder="Select purpose..."
            searchPlaceholder="Search purpose..."
            noResultsText="No matching purpose"
            required
          />
          {touched.has('purpose') && errors.purpose && <p className="text-sm text-red-600 mt-1">{errors.purpose}</p>}
          {purpose === 'Other' && (
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Specify Purpose *</label>
              <input
                type="text"
                value={custom_purpose}
                onChange={(e) => onChange('custom_purpose', e.target.value)}
                onBlur={() => onBlur?.('custom_purpose')}
                placeholder="Please specify the purpose"
                required
                className={`${touched.has('custom_purpose') && errors.custom_purpose ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`}
              />
              {touched.has('custom_purpose') && errors.custom_purpose && <p className="text-sm text-red-600 mt-1">{errors.custom_purpose}</p>}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Visit Date *</label>
          <input type="date" value={visit_date} onChange={(e) => onChange('visit_date', e.target.value)} onBlur={() => onBlur?.('visit_date')} className={`${touched.has('visit_date') && errors.visit_date ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`} />
          {touched.has('visit_date') && errors.visit_date && <p className="text-sm text-red-600 mt-1">{errors.visit_date}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Arrival Time *</label>
          <input type="time" value={arrival_time} onChange={(e) => onChange('arrival_time', e.target.value)} onBlur={() => onBlur?.('arrival_time')} className={`${touched.has('arrival_time') && errors.arrival_time ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`} />
          {touched.has('arrival_time') && errors.arrival_time && <p className="text-sm text-red-600 mt-1">{errors.arrival_time}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Expected Duration (minutes) *</label>
          <input type="number" value={expected_duration || ''} onChange={(e) => onChange('expected_duration', Number(e.target.value))} onBlur={() => onBlur?.('expected_duration')} className={`${touched.has('expected_duration') && errors.expected_duration ? 'border-red-500 text-red-600' : 'border-gray-300'} w-full rounded-lg border px-3 py-2`} />
          {touched.has('expected_duration') && errors.expected_duration && <p className="text-sm text-red-600 mt-1">{errors.expected_duration}</p>}
        </div>
      </div>
    </div>
  )
}