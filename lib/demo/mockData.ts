import { Visitor } from '@/lib/types/visitor'
import { Employee } from '@/lib/types/employee'
import { Visit } from '@/lib/types/visit'

export const DEMO_LABEL = 'DEMO DATA — not persisted'

let visitors: Visitor[] = [
  {
    id: 'demo-visitor-1',
    full_name: 'Demo Visitor (Sample)',
    email: 'demo.visitor@example.com',
    phone: '+1 555 0100',
    visitor_organization: 'Sample Org',
    visitor_address: '1 Demo Street',
    nationality: 'US',
    gender: 'Female',
    vehicle_plate: null,
    vehicle_type: null,
    emergency_contact: null,
    photo_url: null,
    created_at: new Date().toISOString(),
  },
]

const employees: Employee[] = [
  {
    id: 'demo-emp-1',
    full_name: 'Demo Host (Sample)',
    email: 'demo.host@example.com',
    phone: '+1 555 0200',
    department: 'Administration',
    position: 'Host',
    office_location: 'HQ',
    created_at: new Date().toISOString(),
  },
]

let visits: Visit[] = [
  {
    id: 'demo-visit-1',
    visitor_id: 'demo-visitor-1',
    employee_id: 'demo-emp-1',
    purpose: 'Demo meeting',
    status: 'pending',
    check_in_time: null,
    check_out_time: null,
    created_at: new Date().toISOString(),
    visitor: { full_name: 'Demo Visitor (Sample)', visitor_organization: 'Sample Org', photo_url: null, phone: '+1 555 0100', email: 'demo.visitor@example.com' },
    employee: { full_name: 'Demo Host (Sample)', department: 'Administration', office_location: 'HQ' },
    badge: null,
  },
]

export function getVisitors() { return visitors }
export function getEmployees() { return employees }
export function getVisits() { return visits }
export function getDashboardStats() {
  return {
    totalVisitors: visitors.length,
    totalVisits: visits.length,
    checkedIn: visits.filter(v => v.status === 'checked_in').length,
    checkedOut: visits.filter(v => v.status === 'checked_out').length,
    pending: visits.filter(v => v.status === 'pending').length,
  }
}

export function addVisitor(v: Visitor) { visitors = [v, ...visitors]; return v }
export function addVisit(v: Visit) { visits = [v, ...visits]; return v }
export function updateVisitStatus(id: string, status: string) {
  const idx = visits.findIndex(v => v.id === id)
  if (idx === -1) return null
  const now = new Date().toISOString()
  if (status === 'checked_in') visits[idx].check_in_time = now
  if (status === 'checked_out') visits[idx].check_out_time = now
  visits[idx].status = status
  return visits[idx]
}
