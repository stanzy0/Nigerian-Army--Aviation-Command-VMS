'use client'

import Image from 'next/image'
import { Cake, User, Building2 } from 'lucide-react'

interface BirthdayCardProps {
  full_name: string
  department: string
  photo_url: string | null
}

export function BirthdayCard({ full_name, department, photo_url }: BirthdayCardProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 rounded-[2rem] border border-[rgba(200,166,70,0.45)] bg-gradient-to-br from-[#4B5320]/30 to-[#0B0F08]/92 shadow-2xl shadow-[#C8A646]/20 relative overflow-hidden">
      {/* Decorative top accent line */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#C8A646] to-transparent" />

      {/* Photo - main visual focus, larger circular */}
      <div className="relative mb-7">
        {photo_url ? (
          <Image
            src={photo_url}
            alt={`${full_name} profile photo`}
            width={180}
            height={180}
            className="w-44 h-44 rounded-full object-cover border-8 border-[#C8A646]/25 shadow-2xl shadow-black/60"
            priority
            unoptimized
          />
        ) : (
          <div className="w-44 h-44 rounded-full bg-[#0B0F08] border-8 border-[#C8A646]/25 flex items-center justify-center shadow-2xl shadow-black/60">
            <User className="w-22 h-22 text-[#C8A646]/45" />
          </div>
        )}
      </div>

      {/* HAPPY BIRTHDAY label */}
      <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full border border-[#C8A646]/35 bg-[rgba(200,166,70,0.15)] mb-7">
        <Cake className="w-6 h-6 text-[#C8A646]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#C8A646]">HAPPY BIRTHDAY</span>
      </div>

      {/* Name - prominently displayed */}
      <h2 className="text-3xl font-bold text-[#F5F5DC] leading-tight mb-2">{full_name}</h2>

      {/* Department */}
      <div className="flex items-center gap-2.5 text-base text-[#9A9F87] uppercase tracking-[0.1em] font-medium">
        <Building2 className="w-5 h-5 text-[#9A9F87]" />
        <span>{department}</span>
      </div>
    </div>
  )
}
