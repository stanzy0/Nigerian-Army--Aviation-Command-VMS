'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { isDemoMode } from '@/lib/demo'
import { logAuditAction } from '@/lib/client/audit'
import ImageWithFallback from '@/components/ui/ImageWithFallback'
import Link from 'next/link'
import { ShieldCheck, ArrowLeft, Eye, EyeOff, AlertCircle } from 'lucide-react'

const MAX_FAILED_ATTEMPTS = 6

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [rememberDevice, setRememberDevice] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLockOn, setCapsLockOn] = useState(false)
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({ email: false, password: false })
  const [branding, setBranding] = useState<{
    logo_url: string | null
    department_logo_url: string | null
    login_background_url: string | null
    primary_color: string
    secondary_color: string
    accent_color: string
    college_name: string
  } | null>(null)

  useEffect(() => {
    const checkRememberedDevice = async () => {
      if (isDemoMode()) return
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
          cache: 'no-store',
        })
        if (res.ok) {
          const { data } = await res.json()
          if (data?.data?.id) {
            window.location.href = '/dashboard'
          }
        }
      } catch {
        // Network/auth unavailable — allow login page to render normally
      }
    }
    checkRememberedDevice()
  }, [])

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const res = await fetch('/api/branding')
        if (res.ok) {
          const { data } = await res.json()
          const root = document.documentElement
          root.style.setProperty('--branding-primary', data.primary_color || '#4B5320')
          root.style.setProperty('--branding-secondary', data.secondary_color || '#556B2F')
          root.style.setProperty('--branding-accent', data.accent_color || '#C8A646')
          setBranding({
            logo_url: data.logo_url,
            department_logo_url: data.department_logo_url,
            login_background_url: data.login_background_url,
            primary_color: data.primary_color || '#4B5320',
            secondary_color: data.secondary_color || '#556B2F',
            accent_color: data.accent_color || '#C8A646',
             college_name: data.college_name || 'Nigerian Army Aviation Command',
          })
        }
      } catch {
        // use defaults
      }
    }
    fetchBranding()
  }, [])

  const validateEmail = useCallback((value: string) => {
    if (!value.trim()) return 'Email address is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address.'
    return null
  }, [])

  const validatePassword = useCallback((value: string) => {
    if (!value) return 'Password is required.'
    return null
  }, [])

  const emailError = touched.email ? validateEmail(email) : null
  const passwordError = touched.password ? validatePassword(password) : null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    setError(null)

    const currentEmailError = validateEmail(email)
    const currentPasswordError = validatePassword(password)
    if (currentEmailError || currentPasswordError) {
      setError(currentEmailError || currentPasswordError)
      return
    }

    setLoading(true)

    if (isDemoMode()) {
      setLoading(false)
      window.location.href = '/dashboard'
      return
    }

    try {
      // Clear any stale cross-tab logout flag from a previous session before
      // starting a fresh login attempt, so it cannot interfere with the new
      // authenticated session once the dashboard loads.
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem('naac_vms_logout_requested')
        } catch {
          // localStorage unavailable; ignore gracefully
        }
      }

      const formData = new FormData()
      formData.set('email', email)
      formData.set('password', password)
      formData.set('remember', rememberDevice ? 'on' : 'off')

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      // Read the response body exactly once.
      let result: { redirectUrl?: string; error?: string } = {}
      try {
        result = await res.json()
      } catch {
        result = {}
      }

      // On success the SSR server client has already written the session
      // cookie to the response, so it is available on the very next request.
      // Use client-side navigation (replace + refresh) rather than a cold
      // full-page reload, which avoids racing the freshly written cookie.
      if (res.ok && result.redirectUrl) {
        console.info('[handleLogin] login successful, redirecting to:', result.redirectUrl)
        router.replace(result.redirectUrl)
        return
      }

      setError(result.error || 'Login failed. Please try again.')
      setLoading(false)
    } catch (err: unknown) {
      // Re-throw NEXT_REDIRECT so Next.js can handle the redirect properly
      if (err && typeof err === 'object' && 'digest' in err && err.digest === 'NEXT_REDIRECT') {
        throw err
      }
      console.error('[handleLogin] Unexpected error:', err)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  const handlePasswordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'))
    }
  }

  const primaryColor = branding?.primary_color || '#4B5320'
  const secondaryColor = branding?.secondary_color || '#556B2F'
  const accentColor = branding?.accent_color || '#C8A646'
  const loginBg = branding?.login_background_url || '/images/naac-login.jpg'
  const collegeName = branding?.college_name || 'Nigerian Army Aviation Command'

  return (
    <div
      className="relative min-h-screen w-full overflow-x-hidden bg-[#0B0F08] bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B0F08]/85 via-[#0B0F08]/55 to-[#0B0F08]/25" />

      <Link
        href="/"
        aria-label="Back to Home"
        className="absolute top-4 left-4 sm:top-6 sm:left-6 z-50 inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-[rgba(85,107,47,0.5)] bg-[#10150D]/80 text-[#9A9F87] text-sm font-medium backdrop-blur-sm transition-all duration-200 hover:bg-[#4B5320]/10 hover:border-[#C8A646]/40 hover:text-[#F5F5DC] focus:outline-none focus:ring-2 focus:ring-[#C8A646]/60"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Home
      </Link>

      <div className="relative z-10 min-h-screen w-full flex items-center justify-center px-4 py-10">
        <div className="w-[90%] max-w-[420px] rounded-2xl border border-[rgba(85,107,47,0.45)] bg-[#10150D]/85 backdrop-blur-md shadow-2xl p-5 sm:p-6">
          <div className="flex flex-col items-center text-center">
            <ImageWithFallback
              src="/images/army logo.png"
              alt="Nigerian Army Aviation Command Logo"
              className="h-14 w-14 object-contain"
            />
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F5DC]">NA AVN VMS</h1>
            <p className="mt-1 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-[#9A9F87]">
              Nigerian Army Aviation Command
            </p>

            <div className="my-4 h-px w-24 bg-gradient-to-r from-transparent via-[#C8A646]/70 to-transparent" />

            <h2 className="text-lg sm:text-xl font-bold text-[#F5F5DC]">
              Secure Access. Efficient Visitor Management.
            </h2>
            <p className="mt-2 text-sm text-[#9A9F87] max-w-sm">
              A secure platform for managing and monitoring visitors at Nigerian Army Aviation Command.
            </p>
          </div>

          <div className="mt-5">
            <h3 className="text-base font-semibold text-[#F5F5DC]">Welcome Back</h3>
            <p className="mt-1 text-sm text-[#9A9F87]">Sign in to access your account.</p>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#8B3A3A]/40 bg-[#8B3A3A]/10 p-4" role="alert">
              <AlertCircle className="h-5 w-5 text-[#f87171] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[#F5F5DC]">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-4 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#9A9F87] mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(prev => ({ ...prev, email: true }))}
                required
                autoComplete="email"
                aria-label="Email address"
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'email-error' : undefined}
                placeholder="Enter your email"
                className="w-full h-12 rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] px-4 text-[#F5F5DC] placeholder:text-[#6B705A] transition-all duration-200 hover:border-[#C8A646]/40 focus:outline-none focus:ring-2 text-base"
                style={{
                  '--tw-ring-color': `${secondaryColor}33`,
                  borderColor: emailError ? '#8B3A3A' : undefined,
                } as React.CSSProperties}
              />
              {emailError && (
                <p id="email-error" className="mt-2 text-xs text-[#f87171]">{emailError}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#9A9F87] mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched(prev => ({ ...prev, password: true }))}
                  onKeyDown={handlePasswordKeyDown}
                  required
                  autoComplete="current-password"
                  aria-label="Password"
                  aria-invalid={!!passwordError}
                  aria-describedby={passwordError ? 'password-error' : undefined}
                  placeholder="Enter your password"
                  className="w-full h-12 rounded-xl border border-[rgba(85,107,47,0.35)] bg-[#10150D] px-4 pr-12 text-[#F5F5DC] placeholder:text-[#6B705A] transition-all duration-200 hover:border-[#C8A646]/40 focus:outline-none focus:ring-2 text-base"
                  style={{
                    '--tw-ring-color': `${secondaryColor}33`,
                    borderColor: passwordError ? '#8B3A3A' : undefined,
                  } as React.CSSProperties}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A9F87] hover:text-[#F5F5DC] transition-colors duration-200"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {passwordError && (
                <p id="password-error" className="mt-2 text-xs text-[#f87171]">{passwordError}</p>
              )}
              {capsLockOn && !passwordError && (
                <p className="mt-2 text-xs text-[#C8A646]">Caps Lock is on</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                id="rememberDevice"
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="h-4 w-4 rounded border-[rgba(85,107,47,0.35)] focus:ring-2 transition-colors duration-200 bg-[#10150D]"
                style={{ color: primaryColor, accentColor: primaryColor }}
                aria-label="Remember this device"
              />
              <label htmlFor="rememberDevice" className="text-sm text-[#9A9F87] cursor-pointer">
                Remember Me
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-label="Sign in"
              className="w-full h-12 rounded-xl px-4 text-sm font-bold text-[#0B0F08] transition-all duration-200 hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#C8A646]/60"
              style={{
                background: `linear-gradient(to bottom, ${secondaryColor}, ${primaryColor})`,
                boxShadow: `0 10px 25px ${primaryColor}33`,
              }}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="-ml-1 h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing In...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-5 flex items-start justify-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#C8A646] flex-shrink-0 mt-0.5" />
            <span className="text-[10px] leading-relaxed text-[#9A9F87]">
              Authorized personnel only. All access is monitored and recorded.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

