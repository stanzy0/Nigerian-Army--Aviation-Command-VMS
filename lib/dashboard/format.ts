// audit_logs.details is a JSONB column. Authentication events store a
// structured object ({ role, message, ... }); legacy rows may be a plain
// string. Convert any shape into a displayable string so it is never passed
// to React as a child (which throws "Objects are not valid as a React child").

export function formatActivityDetails(details: unknown): string {
  if (details == null) return ''
  if (typeof details === 'string') return details
  if (typeof details === 'object') {
    const obj = details as { message?: unknown; role?: unknown }
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.role === 'string') return obj.role
  }
  return ''
}