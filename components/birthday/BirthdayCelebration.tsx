'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Cake, Volume2, VolumeX, Play, Pause } from 'lucide-react'
import { BirthdayCard } from './BirthdayCard'

interface BirthdayEmployee {
  id: string
  full_name: string
  department: string
  photo_url: string | null
}

interface BirthdayCelebrationProps {
  refreshIntervalMs?: number
}

export function BirthdayCelebration({ refreshIntervalMs = 3600000 }: BirthdayCelebrationProps) {
  const [birthdays, setBirthdays] = useState<BirthdayEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const hasBirthdays = birthdays.length > 0

  const fetchBirthdays = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/employees/birthdays', {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('Failed to fetch birthdays')
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) {
        setBirthdays(json.data)
      } else {
        throw new Error(json.message || 'Invalid response')
      }
    } catch (err) {
      console.error('[BirthdayCelebration]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    const handler = () => setPrefersReducedMotion(mediaQuery.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    fetchBirthdays()
  }, [fetchBirthdays])

  useEffect(() => {
    const timer = setInterval(fetchBirthdays, refreshIntervalMs)
    return () => clearInterval(timer)
  }, [fetchBirthdays, refreshIntervalMs])

  // Play the birthday song only while a birthday display is shown. A single
  // audio instance is created per display; switching staff does not recreate it
  // (hasBirthdays stays true), and cleanup stops/unloads it on close/unmount.
  useEffect(() => {
    if (!hasBirthdays) return

    const audio = new Audio('/audio/birthday-song.mp3')
    audio.volume = 0.5
    audio.loop = true
    audio.preload = 'auto'
    audioRef.current = audio
    setIsPlaying(false)
    setIsMuted(false)
    setAutoplayBlocked(false)

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => setIsPlaying(false)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)

    // Attempt autoplay; if the browser blocks it, reveal a manual Play control.
    const attempt = audio.play()
    if (attempt && typeof attempt.catch === 'function') {
      attempt
        .then(() => setAutoplayBlocked(false))
        .catch(() => {
          setIsPlaying(false)
          setAutoplayBlocked(true)
        })
    }

    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audioRef.current = null
    }
  }, [hasBirthdays])

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio
        .play()
        .then(() => setAutoplayBlocked(false))
        .catch(() => setAutoplayBlocked(true))
    } else {
      audio.pause()
    }
  }, [])

  const handleToggleMute = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = !audio.muted
    setIsMuted(audio.muted)
  }, [])

  if (birthdays.length === 0) return null

  const cardCount = birthdays.length

  return (
    <section
      id="birthday-celebration"
      className="py-24 bg-[#0B0F08] relative overflow-hidden"
    >
      {/* Decorative elements - subtle gold gradients */}
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#C8A646] to-transparent" />
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-[#4B5320]/6 rounded-full blur-[140px]" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-[#556B2F]/6 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 left-1/2 w-[700px] h-[700px] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-tr from-[#C8A646]/4 via-transparent to-transparent rounded-full blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        {/* Centrally aligned header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full border border-[#C8A646]/30 bg-[rgba(200,166,70,0.12)] mb-7">
            <Cake className="w-6 h-6 text-[#C8A646]" />
            <span className="text-[12px] font-bold uppercase tracking-[0.25em] text-[#C8A646]">
              BIRTHDAY GREETINGS
            </span>
          </div>

          <h1 className="text-5xl font-bold text-[#F5F5DC] tracking-tight mb-5">
            Best Wishes on Your Birthday!
          </h1>

          <p className="text-lg text-[#9A9F87] uppercase tracking-[0.15em] font-medium mb-4">
            Recognising Our Personnel
          </p>

          <p className="text-base sm:text-lg text-[#C8A646]/90 font-medium">
            Today, we extend our best wishes to our personnel celebrating a birthday{cardCount !== 1 ? 's' : '.'}
          </p>

          {/* Birthday song controls */}
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleTogglePlay}
              aria-label={isPlaying ? 'Pause birthday song' : 'Play birthday song'}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-[#C8A646]/40 bg-[rgba(200,166,70,0.12)] text-[#C8A646] text-sm font-medium hover:bg-[rgba(200,166,70,0.2)] transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'Pause' : autoplayBlocked ? 'Play Birthday Song' : 'Play'}</span>
            </button>
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={isMuted ? 'Unmute birthday song' : 'Mute birthday song'}
              className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-[#C8A646]/40 bg-[rgba(200,166,70,0.12)] text-[#C8A646] hover:bg-[rgba(200,166,70,0.2)] transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Employee birthday cards - horizontally centered, balanced layout */}
        <div
          className="flex flex-wrap justify-center gap-8 md:gap-10 lg:gap-12 items-start pb-10"
          role="list"
          aria-label="Birthday celebrants"
        >
          {birthdays.map((emp, index) => (
            <div
              key={emp.id}
              className={`flex flex-col items-center max-w-[360px] ${!prefersReducedMotion ? `animate-vms-fade-in-up animation-delay-[${index * 0.15}s]` : ''}`}
            >
              <BirthdayCard
                full_name={emp.full_name}
                department={emp.department || '—'}
                photo_url={emp.photo_url}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
