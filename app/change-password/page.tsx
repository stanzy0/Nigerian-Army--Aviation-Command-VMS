'use client'

import { useState, useEffect } from 'react'
import { Loader2, Lock, CheckCircle2 } from 'lucide-react'

const PASSWORD_MIN_LENGTH = 8

function isValidPassword(password: string): { valid: boolean; error?: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` }
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' }
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' }
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' }
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' }
  }
  return { valid: true }
}

export default function ChangePasswordPage() {
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const checkFirstLogin = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
          cache: 'no-store',
        })

        if (res.status === 401) {
          window.location.href = '/login'
          return
        }

        if (!res.ok) {
          setError('Unable to verify your account. Please try again.')
          return
        }

        const { data } = await res.json()

        if (!data || !data.id) {
          setError('Unable to verify your account. Please try again.')
          return
        }

        // Authoritative flag comes from user_roles via /api/auth/me.
        if (!data.must_change_password) {
          window.location.href = '/dashboard'
          return
        }

        setEmail(data.email || '')
      } catch {
        setError('Unable to verify your account. Please try again.')
      }
    }
    checkFirstLogin()
  }, [])

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from your current password')
      setLoading(false)
      return
    }

    const passwordValidation = isValidPassword(newPassword)
    if (!passwordValidation.valid) {
      setError(passwordValidation.error || 'Invalid password')
      setLoading(false)
      return
    }

    setError(null)

    try {
      // The entire change (verify current password, change password, clear both
      // flags, audit) happens server-side in one authenticated flow. The client
      // never mutates the password or the must_change_password flags directly.
      const completeRes = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })

      let completeResult: { redirectUrl?: string; error?: string } = {}
      try {
        completeResult = await completeRes.json()
      } catch {
        completeResult = {}
      }

      if (!completeRes.ok || !completeResult.redirectUrl) {
        setError(completeResult.error || 'Unable to change password. Please try again.')
        return
      }

      setSuccess(true)
      setTimeout(() => {
        window.location.href = completeResult.redirectUrl as string
      }, 2000)
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F08] p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <h1 className="mt-4 text-3xl font-bold text-[#F5F5DC]">Password Changed</h1>
            <p className="mt-2 text-[#9A9F87]">Redirecting to your dashboard...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F08] p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <Lock className="h-6 w-6 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-[#F5F5DC]">Change Password</h1>
          <p className="mt-2 text-[#9A9F87]">
            Your account is using a temporary password. You must create a new password before continuing.
          </p>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-6">
          {error && (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#9A9F87]">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              readOnly
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-[#9A9F87]"
            />
          </div>

          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-[#9A9F87]">
              Current Password
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="Enter your current password"
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-[#9A9F87]">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="Enter new password"
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-[#9A9F87]">
              Must be at least {PASSWORD_MIN_LENGTH} characters with uppercase, lowercase, number, and special character.
            </p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#9A9F87]">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Confirm new password"
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-[#10150D] px-3 py-2 text-black placeholder:text-[#9A9F87] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

