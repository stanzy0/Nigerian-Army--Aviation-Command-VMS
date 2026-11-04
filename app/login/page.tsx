'use client'

import { useState, useEffect, useCallback } from 'react'
import { isDemoMode } from '@/lib/demo'
import { createClient } from '@/lib/supabase/client'
import { logAuditAction } from '@/lib/client/audit'
import ImageWithFallback from '@/components/ui/ImageWithFallback'
import Link from 'next/link'
import { ShieldCheck, ArrowLeft, Eye, EyeOff, AlertCircle } from 'lucide-react'

const MAX_FAILED_ATTEMPTS = 6

export default function LoginPage() {
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
        const user = await createClient().auth.getUser()
        if (user.data.user) {
          window.location.href = '/dashboard'
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
      const supabase = createClient()
      const normalizedEmail = email.trim().toLowerCase()
      const loginPassword = password.trim()
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: loginPassword,
      })

      if (authError || !data.user) {
        setFailedAttempts(prev => prev + 1)
        if (failedAttempts + 1 >= MAX_FAILED_ATTEMPTS) {
          setError('Account locked due to too many failed attempts.')
        } else {
          setError('Invalid email or password. Please check your credentials and try again.')
        }
        await logAuditAction('Failed Login', 'auth', null, `Failed login attempt for ${email}`)
        setLoading(false)
        return
      }

      if (rememberDevice) {
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        document.cookie = `remember_device=true; expires=${expiresAt.toUTCString()}; path=/; SameSite=Lax`
      }

      await logAuditAction('Login', 'auth', data.user.id, `User ${email} logged in`)

      if (data.user.user_metadata?.must_change_password) {
        window.location.href = '/change-password'
        return
      }

      const roleRes = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      const roleData = roleRes.ok ? await roleRes.json() : { success: false }
      if (!roleRes.ok) {
        setError('Unable to verify your session. Please try again.')
        setLoading(false)
        return
      }
      if (!roleData.success) {
        setError('Unable to verify your account. Please contact support.')
        setLoading(false)
        return
      }
      const role = roleData.data?.role
      if (roleData.data?.missingRole) {
        setError('Your account does not have an assigned role. Please contact an administrator.')
        setLoading(false)
        return
      }
      if (role === 'PA_TO_CI') {
        window.location.href = '/pa-ci'
      } else if (role === 'PA_TO_DIRECTOR') {
        window.location.href = '/pa-director'
      } else if (role === 'Security') {
        window.location.href = '/security'
      } else if (role === 'Host Employee') {
        window.location.href = '/host'
      } else {
        window.location.href = '/dashboard'
      }
    } catch {
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
  const loginBg = branding?.login_background_url || '/images/afcsc-login.jpg'
  const collegeName = branding?.college_name || 'Nigerian Army Aviation Command'

  return (
    <div className="flex flex-col lg:flex-row h-screen w-screen overflow-hidden bg-[#0B0F08]">
      <div className="relative w-full lg:w-1/2 h-[35vh] sm:h-[40vh] lg:h-full flex-shrink-0">
        <div
          className="absolute inset-0 z-10"
          style={{
            background: 'linear-gradient(180deg, rgba(11,15,8,0.30) 0%, rgba(11,15,8,0.60) 50%, rgba(11,15,8,0.92) 100%)',
          }}
        />
        <img
          src={loginBg}
          alt={collegeName}
          className="absolute inset-0 object-cover"
        />
        <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
          <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C8A646]/50 to-transparent animate-vms-scan-line" />
        </div>

        <div className="absolute inset-0 z-30 flex items-end">
          <div className="w-full p-6 sm:p-8 lg:p-10">
            <div className="flex items-center gap-3 mb-4">
              <ImageWithFallback
                src="/images/army logo.png"
                alt="Nigerian Army Aviation Command Logo"
                className="h-9 w-9 sm:h-10 sm:w-10 object-contain"
              />
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight">
Nigerian Army Aviation Command Visitor Management
            </h1>
            <p className="text-xs sm:text-sm text-white/80 mt-1 max-w-md">
              Secure Visitor Registration &amp; Access Management
            </p>
            <p className="text-[10px] sm:text-xs text-white/60 mt-1">
              Nigerian Army Aviation Command
            </p>
          </div>
        </div>
      </div>

      <div className="relative w-full lg:w-1/2 flex-1 lg:h-full flex flex-col justify-center px-6 sm:px-8 lg:px-10 xl:px-12 overflow-y-auto bg-[#0B0F08]">
        <Link
          href="/"
          aria-label="Back to Home"
          className="absolute top-4 left-4 sm:top-6 sm:left-6 z-50 inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-[rgba(85,107,47,0.5)] bg-[#10150D] text-[#9A9F87] text-sm font-medium transition-all duration-200 hover:bg-[#4B5320]/10 hover:border-[#C8A646]/40 hover:text-[#F5F5DC] focus:outline-none focus:ring-2 focus:ring-[#C8A646]/60"
        >
          <ArrowLeft className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-[-2px]" />
          Back to Home
        </Link>

        <div className="mx-auto w-full max-w-[420px]">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 mb-4">
              <img
                src="/images/visit.png"
                alt="Visitor Management illustration"
                className="w-full h-full object-contain"
              />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#F5F5DC]">Sign in to continue</h2>
            <p className="text-sm text-[#9A9F87] mt-1">Access the Nigerian Army Aviation Command Visitor Management System</p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#8B3A3A]/40 bg-[#8B3A3A]/10 p-4" role="alert">
              <AlertCircle className="h-5 w-5 text-[#f87171] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[#F5F5DC]">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
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

            <div className="flex items-center justify-between">
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
              <Link
                href="/forgot-password"
                className="text-sm transition-colors duration-200 hover:underline"
                style={{ color: accentColor }}
                aria-label="Forgot password"
              >
                Forgot Password?
              </Link>
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

          <div className="my-5 flex items-center">
            <div className="flex-1 border-t border-[rgba(85,107,47,0.35)]" />
            <span className="px-4 text-xs text-[#9A9F87]">Or</span>
            <div className="flex-1 border-t border-[rgba(85,107,47,0.35)]" />
          </div>

          <div className="text-center text-sm text-[#9A9F87]">
            <p>Need help?</p>
            <a
              href="mailto:it-support@afcsc.edu.ng"
              className="hover:underline transition-colors duration-200"
              style={{ color: accentColor }}
              aria-label="Contact system administrator"
            >
              Contact the System Administrator
            </a>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#C8A646]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9A9F87]">
              Secure Access Only
            </span>
            <span className="relative flex h-2 w-2">
              <span className="animate-vms-subtle-pulse absolute inline-flex h-full w-full rounded-full bg-[#4B5320] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#6B8E23]" />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

