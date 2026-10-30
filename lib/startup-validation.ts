import { isDemoMode } from '@/lib/demo'

const REQUIRED_STARTUP_VARS = [
  'NEXT_PUBLIC_APP_URL',
] as const

const SUPABASE_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

let validationPassed = false
let validationError: string | null = null

export function validateStartup(): { passed: boolean; error: string | null } {
  if (validationPassed) return { passed: true, error: null }
  if (validationError) return { passed: false, error: validationError }

  const missing: string[] = []
  const varsToCheck = isDemoMode()
    ? REQUIRED_STARTUP_VARS
    : [...REQUIRED_STARTUP_VARS, ...SUPABASE_VARS]
  for (const key of varsToCheck) {
    if (!process.env[key]) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    validationError = `Startup validation failed. Missing required environment variables: ${missing.join(', ')}. Ensure these are set in .env.local or your deployment environment.`
    console.error('[Startup Validation Error]', {
      missing_variables: missing,
      required_variables: REQUIRED_STARTUP_VARS,
      timestamp: new Date().toISOString(),
    })
    return { passed: false, error: validationError }
  }

  if (process.env.NODE_ENV === 'production') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl && (appUrl.includes('localhost') || !appUrl.startsWith('https://'))) {
      validationError = `Invalid NEXT_PUBLIC_APP_URL for production: ${appUrl}. Must be a valid HTTPS URL.`
      console.error('[Startup Validation Error]', { error: validationError, timestamp: new Date().toISOString() })
      return { passed: false, error: validationError }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (supabaseUrl && supabaseUrl.includes('localhost')) {
      validationError = `Invalid NEXT_PUBLIC_SUPABASE_URL for production: ${supabaseUrl}. Must be a valid Supabase project URL.`
      console.error('[Startup Validation Error]', { error: validationError, timestamp: new Date().toISOString() })
      return { passed: false, error: validationError }
    }
  }

   validationPassed = true

   return { passed: true, error: null }
}

export function resetStartupValidation(): void {
  validationPassed = false
  validationError = null
}
