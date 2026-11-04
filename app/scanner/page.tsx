'use client'

import QrScanner from './QrScanner'

export default function ScannerPage() {
  return (
    <div className="min-h-screen bg-[#0B0F08] relative">
      <div className="absolute inset-0 z-0">
        <img
          src="/images/naac-login.jpg"
          alt="Nigerian Army Aviation Command background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F08]/90 via-[#0B0F08]/70 to-[#0B0F08]/40" />
      </div>
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8">
        <QrScanner />
      </div>
    </div>
  )
}

