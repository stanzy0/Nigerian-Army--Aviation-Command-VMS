'use client'

import VisitorRegistrationWizard from '@/components/wizard/VisitorRegistrationWizard'
import { getCurrentUser } from '@/lib/auth-client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ImageWithFallback from '@/components/ui/ImageWithFallback'
import { ArrowLeft, ShieldAlert } from 'lucide-react'

export default function NewVisitorPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [user, setUser] = useState<import('@/lib/auth-client').UserWithRole | null>(null)
  const [unauthorized, setUnauthorized] = useState(false)

  useEffect(() => {
    let cancelled = false
    const checkAuth = async () => {
      try {
        const user = await getCurrentUser()
        if (!user) {
          if (!cancelled) router.replace('/login')
          return
        }
        if (user.role !== 'Admin' && user.role !== 'Receptionist') {
          if (!cancelled) setUnauthorized(true)
          return
        }
        if (!cancelled) {
          setUser(user)
          setChecking(false)
        }
      } catch {
        if (!cancelled) router.replace('/login')
      }
    }
    checkAuth()
    return () => { cancelled = true }
  }, [router])

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0B0F08] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (unauthorized || !user) {
    return (
      <div className="min-h-screen bg-[#0B0F08] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <ShieldAlert className="h-16 w-16 mx-auto mb-4 text-[#8B3A3A]" />
          <h1 className="text-2xl font-bold text-[#F5F5DC] mb-2">Access Denied</h1>
          <p className="text-[#9A9F87] mb-6">
            You don&apos;t have permission to register visitors. Only Administrators and Receptionists can register visitors.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#C8A646] text-[#0B0F08] font-bold rounded-lg hover:bg-[#B89635] transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F08] relative">
      {/* Full-screen background image */}
      <div className="absolute inset-0 z-0">
        <img
          src="/images/afcsc-login.jpg"
          alt="NA Avn Comd login background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F08]/90 via-[#0B0F08]/70 to-[#0B0F08]/40" />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-4xl">
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#9A9F87] hover:text-[#C8A646] transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>

          <div className="flex items-center justify-between mb-6">
            <ImageWithFallback
              src="/images/afcsc-logo.png"
              alt="NA Avn Comd Logo"
              className="h-16 w-16 object-contain"
            />
            <h1 className="text-xl font-bold text-[#F5F5DC]">Visitor Registration</h1>
            <ImageWithFallback
              src="/images/army logo.png"
              alt="Army Logo"
              className="h-16 w-16 object-contain"
            />
          </div>
          <VisitorRegistrationWizard onComplete={() => router.push('/dashboard')} />
        </div>
      </div>
    </div>
  )
}
