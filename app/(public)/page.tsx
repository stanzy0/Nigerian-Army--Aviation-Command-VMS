'use client'

import { useState, useEffect } from 'react'
import ImageWithFallback from '@/components/ui/ImageWithFallback'
import MilitaryHeader from '@/components/layout/MilitaryHeader'
import Link from 'next/link'
import {
  ShieldCheck,
  UserCheck,
  CheckCircle,
  FileText,
  ScanLine,
  Activity,
  LayoutDashboard,
} from 'lucide-react'

const FEATURES = [
  {
    icon: FileText,
    title: 'Secure Registration',
    desc: 'Register visitors accurately and securely before access is granted.',
  },
  {
    icon: ShieldCheck,
    title: 'Controlled Access',
    desc: 'Support authorised approval and visitor access workflows.',
  },
  {
    icon: ScanLine,
    title: 'Digital Badges & QR Codes',
    desc: 'Generate and validate visitor badges using digital identification.',
  },
  {
    icon: Activity,
    title: 'Real-Time Monitoring',
    desc: 'Provide authorised personnel with up-to-date visitor information.',
  },
]

const STEPS = [
  { number: '01', title: 'Register', desc: 'Visitor information is securely captured.' },
  { number: '02', title: 'Verify', desc: 'Required visitor information is reviewed and validated.' },
  { number: '03', title: 'Approve', desc: 'Authorised personnel review and approve the visit.' },
  { number: '04', title: 'Access', desc: 'Approved visitors receive the appropriate badge or access clearance.' },
]

const GALLERY = [
  { src: '/images/home/gate.jpg', alt: 'Main gate', caption: 'Main Entrance' },
  { src: '/images/home/command.jpg', alt: 'Command building', caption: 'Command Wing' },
  { src: '/images/home/campus.jpg', alt: 'Campus overview', caption: 'Campus Grounds' },
  { src: '/images/home/auditorium.jpg', alt: 'Waiting Room', caption: 'Waiting Room' },
]

export default function PublicLandingPage() {
  const [branding, setBranding] = useState<{
    college_name: string
    logo_url: string | null
    department_logo_url: string | null
    primary_color: string
    secondary_color: string
    accent_color: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/branding')
      .then(res => res.ok ? res.json() : { data: null })
      .then(json => {
        if (cancelled || !json?.data) return
        setBranding({
          college_name: json.data.college_name || 'Nigerian Army Aviation Command',
          logo_url: json.data.logo_url,
          department_logo_url: json.data.department_logo_url,
          primary_color: json.data.primary_color || '#4B5320',
          secondary_color: json.data.secondary_color || '#556B2F',
          accent_color: json.data.accent_color || '#C8A646',
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const primaryColor = branding?.primary_color || '#4B5320'
  const secondaryColor = branding?.secondary_color || '#556B2F'
  const accentColor = branding?.accent_color || '#C8A646'
  const institutionLogo = '/images/army logo.png'
  const collegeName = branding?.college_name || 'Nigerian Army Aviation Command'
  const year = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-[#0B0F08] text-[#F5F5DC]">
      <MilitaryHeader />

      <main>
        <section id="home" className="relative overflow-hidden bg-[#0B0F08]">
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#C8A646]/40 to-transparent" />
            <div className="absolute top-20 left-10 w-72 h-72 bg-[#4B5320]/10 rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#556B2F]/10 rounded-full blur-3xl" />
          </div>

          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 md:py-12 lg:py-24 relative">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              <div className="order-2 lg:order-1 animate-vms-fade-in-up">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-[rgba(200,166,70,0.25)] bg-[rgba(200,166,70,0.05)] mb-6">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#C8A646]" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#C8A646]">
                    Nigerian Army Aviation Command
                  </span>
                </div>

                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[#F5F5DC] leading-[1.1]">
                  Visitor Management<br />System
                </h1>

                <p className="mt-3 text-xs sm:text-sm font-semibold uppercase tracking-widest text-[#9A9F87]">
                  Nigerian Army Aviation Command Visitor Management System
                </p>

                <p className="mt-4 text-lg sm:text-xl font-semibold text-[#C8A646] tracking-wide">
                  Secure. Efficient. Accountable.
                </p>

                <p className="mt-4 text-sm sm:text-base text-[#9A9F87] leading-relaxed max-w-xl">
                  An integrated visitor management platform designed to support secure, efficient and accountable visitor registration and access control.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-start gap-4">
                  <Link
                    href="/visitors/new"
                    className="inline-flex items-center gap-2 rounded border border-[#C8A646] bg-[#C8A646] px-8 py-3.5 text-sm font-bold text-[#0B0F08] hover:bg-[#B89635] transition-colors min-h-[48px]"
                  >
                    <UserCheck className="h-4 w-4" />
                    Register Visitor
                  </Link>
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 rounded border border-[#C8A646] bg-transparent px-8 py-3.5 text-sm font-bold text-[#C8A646] hover:bg-[#C8A646]/10 transition-colors min-h-[48px]"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Link>
                </div>
              </div>

              <div className="order-1 lg:order-2 animate-vms-fade-in-right">
                <div className="lg:hidden relative rounded-lg overflow-hidden border border-[rgba(85,107,47,0.3)]">
                  <img
                    src="/images/home/hero.jpg"
                    alt="Campus hero view"
                    className="w-full h-48 sm:h-64 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F08]/50 via-[#0B0F08]/10 to-transparent" />
                </div>

                <div className="hidden lg:block relative rounded-lg overflow-hidden border border-[rgba(85,107,47,0.3)] shadow-2xl">
                  <img
                    src="/images/home/hero.jpg"
                    alt="Campus hero view"
                    className="w-full h-[400px] xl:h-[500px] object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F08]/50 via-[#0B0F08]/10 to-transparent" />

                  <div className="absolute bottom-4 right-4 xl:bottom-6 xl:right-6 w-56 bg-[#0B0F08]/75 backdrop-blur-md border border-[rgba(200,166,70,0.25)] p-4 rounded">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-[#C8A646]" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#C8A646]">VMS</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-1 rounded-full bg-[#4B5320]" />
                        <span className="text-xs font-semibold text-[#F5F5DC]">Secure Access</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-1 rounded-full bg-[#4B5320]" />
                        <span className="text-xs font-semibold text-[#F5F5DC]">Controlled Entry</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-1 rounded-full bg-[#4B5320]" />
                        <span className="text-xs font-semibold text-[#F5F5DC]">Institutional Accountability</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0" aria-hidden="true">
            <svg viewBox="0 0 1440 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
              <path d="M0 40L60 35C120 30 240 20 360 18C480 16 600 22 720 24C840 26 960 24 1080 22C1200 20 1320 18 1380 17L1440 16V40H0Z" fill="#141A10" />
            </svg>
          </div>
        </section>

        <section id="features" className="py-16 bg-[#141A10]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5DC] tracking-tight">About the Visitor Management System</h2>
              <p className="mt-4 text-sm sm:text-base text-[#9A9F87] leading-relaxed">
                The Visitor Management System (VMS) is an integrated platform designed for the Nigerian Army Aviation Command Visitor Management System. It provides secure visitor registration, host verification, access control, and real-time monitoring to maintain institutional security and accountability.
              </p>
            </div>
          </div>
        </section>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-[rgba(85,107,47,0.3)] to-transparent" aria-hidden="true" />

        <section className="py-16 bg-[#141A10]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5DC] tracking-tight">Campus Gallery</h2>
                <p className="mt-2 text-sm text-[#9A9F87] max-w-2xl mx-auto">
                  A glimpse of Nigerian Army Aviation Command facilities.
                </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {GALLERY.map(item => (
                <div
                  key={item.src}
                  className="group relative overflow-hidden border border-[rgba(85,107,47,0.25)] bg-[#0B0F08]"
                >
                  <div className="aspect-[4/3]">
                    <img
                      src={item.src}
                      alt={item.alt}
                      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F08]/70 via-[#0B0F08]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="absolute inset-x-0 bottom-0 p-4 translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                    <div className="h-px w-8 bg-[#C8A646]/60 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <p className="text-xs font-semibold text-[#F5F5DC]">{item.caption}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-[rgba(85,107,47,0.3)] to-transparent" aria-hidden="true" />

        <section className="py-16 bg-[#10150D]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5DC] tracking-tight">Modern Visitor Management</h2>
              <p className="mt-2 text-sm text-[#9A9F87] max-w-2xl mx-auto">
                A comprehensive platform supporting secure and efficient visitor processing.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {FEATURES.map((feature, i) => (
                <div
                  key={i}
                  className="border border-[rgba(85,107,47,0.25)] bg-[#0B0F08] p-5 hover:border-[rgba(200,166,70,0.35)] transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-[#4B5320]/10 text-[#C8A646]">
                      <feature.icon className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm font-semibold text-[#F5F5DC]">{feature.title}</h3>
                  </div>
                  <p className="text-xs text-[#9A9F87] leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-[rgba(85,107,47,0.3)] to-transparent" aria-hidden="true" />

        <section id="how-it-works" className="py-16 bg-[#141A10]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5DC] tracking-tight">How It Works</h2>
              <p className="mt-2 text-sm text-[#9A9F87]">A simple and secure visitor processing workflow.</p>
            </div>

            <div className="hidden md:block">
              <div className="relative">
                <div className="absolute top-5 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[rgba(85,107,47,0.5)] to-transparent" />
                <div className="grid grid-cols-4 gap-8">
                  {STEPS.map((step, i) => (
                    <div key={i} className="relative text-center">
                      <div className="mx-auto w-10 h-10 rounded-full border-2 border-[#C8A646] bg-[#0B0F08] flex items-center justify-center mb-4 relative z-10">
                        <span className="text-sm font-bold text-[#C8A646]">{step.number}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-[#F5F5DC]">{step.title}</h3>
                      <p className="mt-2 text-xs text-[#9A9F87] leading-relaxed">{step.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="md:hidden space-y-6">
              {STEPS.map((step, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full border-2 border-[#C8A646] bg-[#0B0F08] flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-[#C8A646]">{step.number}</span>
                    </div>
                    {i < STEPS.length - 1 && <div className="w-px flex-1 bg-[rgba(85,107,47,0.5)] mt-2" />}
                  </div>
                  <div className="pb-6">
                    <h3 className="text-sm font-semibold text-[#F5F5DC]">{step.title}</h3>
                    <p className="mt-1 text-xs text-[#9A9F87] leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-[rgba(85,107,47,0.3)] to-transparent" aria-hidden="true" />

        <section id="security" className="relative py-16 overflow-hidden">
          <div className="absolute inset-0" aria-hidden="true">
            <img
              src="/images/home/command.jpg"
              alt=""
              className="w-full h-full object-cover opacity-10"
            />
            <div className="absolute inset-0 bg-[#0B0F08]/90" />
          </div>

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-[rgba(200,166,70,0.3)] bg-[rgba(200,166,70,0.05)] mb-6">
                <ShieldCheck className="h-4 w-4 text-[#C8A646]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#C8A646]">
                  Security Through Accountability
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5DC] tracking-tight">
                Maintaining Institutional Security
              </h2>
              <p className="mt-4 text-sm sm:text-base text-[#9A9F87] leading-relaxed">
                The VMS helps maintain accurate visitor records, controlled approval workflows and reliable access information. Every visit is verified, approved and recorded for institutional accountability and security.
              </p>

              <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Secure Registration', Icon: CheckCircle },
                  { label: 'Digital Badge Management', Icon: CheckCircle },
                  { label: 'Real-Time Monitoring', Icon: CheckCircle },
                  { label: 'Role-Based Access', Icon: CheckCircle },
                ].map(item => (
                  <div key={item.label} className="text-center p-4 rounded border border-[rgba(85,107,47,0.25)] bg-[#0B0F08]/60">
                    <item.Icon className="h-5 w-5 text-[#C8A646] mx-auto mb-2" />
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9A9F87]">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-[rgba(85,107,47,0.3)] to-transparent" aria-hidden="true" />

        <section id="contact" className="py-16 bg-[#141A10] relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C8A646]/40 to-transparent" />
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5DC] tracking-tight">Ready to Register Your Visit?</h2>
              <p className="mt-3 text-sm sm:text-base text-[#9A9F87]">
                Complete the visitor registration process quickly and securely.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/visitors/new"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#C8A646] bg-[#C8A646] px-8 py-3.5 text-sm font-bold text-[#0B0F08] hover:bg-[#B89635] transition-colors min-h-[48px]"
                >
                  <UserCheck className="h-4 w-4" />
                  Register Visitor
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#0B0F08] border-t border-[rgba(85,107,47,0.2)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col items-center text-center gap-6">
            <div className="flex items-center gap-4">
              <ImageWithFallback
                src={institutionLogo}
                alt="Nigerian Army Aviation Command Logo"
                className="h-10 w-10 sm:h-12 sm:w-12 object-contain"
              />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-bold text-[#F5F5DC] uppercase tracking-wider">Nigerian Army Aviation Command Visitor Management</p>
              <p className="text-xs text-[#9A9F87]">Nigerian Army Aviation Command Visitor Management System</p>
              <p className="text-xs text-[#9A9F87]">Nigerian Army Aviation Command</p>
            </div>

            <div className="flex items-center gap-6">
              <Link href="#home" className="text-xs text-[#9A9F87] hover:text-[#C8A646] transition-colors">
                Home
              </Link>
              <Link href="#features" className="text-xs text-[#9A9F87] hover:text-[#C8A646] transition-colors">
                Features
              </Link>
              <Link href="#how-it-works" className="text-xs text-[#9A9F87] hover:text-[#C8A646] transition-colors">
                How It Works
              </Link>
              <Link href="#security" className="text-xs text-[#9A9F87] hover:text-[#C8A646] transition-colors">
                Security
              </Link>
              <Link href="/visitors/new" className="text-xs text-[#9A9F87] hover:text-[#C8A646] transition-colors">
                Register Visitor
              </Link>
            </div>

            <div className="pt-6 border-t border-[rgba(85,107,47,0.2)] w-full">
              <p className="text-[10px] text-[#9A9F87]">&copy; {year} Nigerian Army Aviation Command. All Rights Reserved.</p>
              <p className="text-[10px] font-semibold text-[#C8A646] uppercase tracking-wider mt-1">Authorized Access Only</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
