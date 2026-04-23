'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { joinQueue, getQueuePosition, leaveQueue } from '@/app/actions/queue'

interface QueueRoomProps {
  eventId: string
  eventSlug: string
  eventTitle: string
  coverImageUrl: string | null
  queueOpenAt: string | null
  saleStartAt: string | null
  admissionRate: number
  admissionWindowMinutes: number
}

type Phase =
  | 'pre-queue'   // queue_open_at is in the future
  | 'joining'     // calling joinQueue RPC
  | 'waiting'     // in queue, polling position
  | 'admitted'    // got admission token, about to redirect
  | 'expired'     // admission window expired without buying
  | 'error'       // unrecoverable error

function useCountdown(targetIso: string | null) {
  const [remaining, setRemaining] = useState<number>(() =>
    targetIso ? Math.max(0, new Date(targetIso).getTime() - Date.now()) : 0
  )

  useEffect(() => {
    if (!targetIso) return
    const tick = () => {
      const ms = Math.max(0, new Date(targetIso).getTime() - Date.now())
      setRemaining(ms)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetIso])

  return remaining
}

function formatDuration(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function estimateWait(position: number, admissionRate: number): string {
  if (position <= admissionRate) return 'soon'
  const minutes = Math.ceil((position - admissionRate) / admissionRate)
  return `~${minutes} min`
}

const SESSION_KEY = 'el_queue_session'

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

function getStoredQueueId(eventId: string): string | null {
  try {
    return sessionStorage.getItem(`el_queue_id_${eventId}`)
  } catch {
    return null
  }
}

function storeQueueId(eventId: string, queueId: string) {
  try {
    sessionStorage.setItem(`el_queue_id_${eventId}`, queueId)
  } catch {}
}

function clearQueueId(eventId: string) {
  try {
    sessionStorage.removeItem(`el_queue_id_${eventId}`)
  } catch {}
}

export function QueueRoom({
  eventId,
  eventSlug,
  eventTitle,
  coverImageUrl,
  queueOpenAt,
  saleStartAt,
  admissionRate,
  admissionWindowMinutes,
}: QueueRoomProps) {
  const router = useRouter()
  const queueOpenCountdown = useCountdown(queueOpenAt)
  const saleCountdown = useCountdown(saleStartAt)

  const [phase, setPhase] = useState<Phase>(() => {
    if (queueOpenAt && new Date(queueOpenAt).getTime() > Date.now()) return 'pre-queue'
    return 'joining'
  })
  const [position, setPosition] = useState<number | null>(null)
  const [queueId, setQueueId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Screen Wake Lock (DICE pattern — prevents phone screen lock during wait)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let released = false
    navigator.wakeLock.request('screen').then((lock) => {
      if (released) { lock.release(); return }
      wakeLockRef.current = lock
    }).catch(() => {})
    return () => {
      released = true
      wakeLockRef.current?.release().catch(() => {})
    }
  }, [])

  // Re-acquire wake lock when tab becomes visible again
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        navigator.wakeLock?.request('screen').then((lock) => {
          wakeLockRef.current = lock
        }).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Join queue
  const join = useCallback(async () => {
    setPhase('joining')
    const sessionId = getOrCreateSessionId()

    // Restore from sessionStorage if user refreshed the page
    const storedId = getStoredQueueId(eventId)
    if (storedId) {
      const pos = await getQueuePosition({ queueId: storedId, eventId })
      if (pos.found && (pos.status === 'waiting' || pos.status === 'admitted')) {
        setQueueId(storedId)
        setPosition(pos.position)
        if (pos.status === 'admitted' && pos.admissionToken) {
          handleAdmission(storedId, pos.admissionToken)
          return
        }
        setPhase('waiting')
        return
      }
      clearQueueId(eventId)
    }

    const result = await joinQueue({ eventId, sessionId })
    if (!result.success) {
      if (result.alreadyJoined) {
        setPhase('waiting')
        return
      }
      setErrorMsg(result.error)
      setPhase('error')
      return
    }
    storeQueueId(eventId, result.queueId)
    setQueueId(result.queueId)
    setPosition(result.position)
    setPhase('waiting')
  }, [eventId])

  function handleAdmission(id: string, token: string) {
    clearQueueId(eventId)
    setPhase('admitted')
    router.push(`/events/${eventSlug}?queue_token=${encodeURIComponent(token)}`)
  }

  // Transition from pre-queue to joining when countdown hits zero
  useEffect(() => {
    if (phase === 'pre-queue' && queueOpenCountdown === 0) {
      join()
    }
  }, [phase, queueOpenCountdown, join])

  // Auto-join on mount if queue is already open
  useEffect(() => {
    if (phase === 'joining') {
      join()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once

  // 5-second polling when waiting
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (phase !== 'waiting' || !queueId) return

    const poll = async () => {
      const result = await getQueuePosition({ queueId, eventId })
      if (!result.found) return

      setPosition(result.position)

      if (result.status === 'admitted' && result.admissionToken) {
        if (pollRef.current) clearInterval(pollRef.current)
        handleAdmission(queueId, result.admissionToken)
        return
      }

      if (result.status === 'expired' || result.status === 'abandoned') {
        if (pollRef.current) clearInterval(pollRef.current)
        clearQueueId(eventId)
        setPhase('expired')
      }
    }

    poll() // immediate first poll
    pollRef.current = setInterval(poll, 5000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [phase, queueId, eventId])

  const handleLeave = async () => {
    if (queueId) await leaveQueue({ queueId })
    clearQueueId(eventId)
    router.push(`/events/${eventSlug}`)
  }

  const handleRejoin = () => {
    join()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#1A1A2E] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <span className="text-lg font-bold tracking-tight text-[#4A90D9]">EVENTLINQS</span>
        <span className="text-white/40">·</span>
        <span className="text-sm text-white/60 truncate">{eventTitle}</span>
      </header>

      {/* Cover strip */}
      {coverImageUrl && (
        <div className="relative h-24 sm:h-32 w-full overflow-hidden">
          <Image
            src={coverImageUrl}
            alt={eventTitle}
            fill
            sizes="100vw"
            className="object-cover opacity-30"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#1A1A2E]" />
        </div>
      )}

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-md mx-auto w-full">

        {/* PRE-QUEUE: countdown to queue opening */}
        {phase === 'pre-queue' && (
          <div className="text-center space-y-6 w-full">
            <div className="space-y-2">
              <p className="text-sm font-medium text-[#4A90D9] uppercase tracking-widest">Queue opens in</p>
              <p
                className="text-5xl sm:text-6xl font-mono font-bold tabular-nums"
                aria-live="polite"
                aria-label={`Queue opens in ${formatDuration(queueOpenCountdown)}`}
              >
                {formatDuration(queueOpenCountdown)}
              </p>
            </div>
            <p className="text-sm text-white/50">
              Stay on this page. You&apos;ll be placed in the queue automatically when it opens.
            </p>
            <WaitingAnimation />
          </div>
        )}

        {/* JOINING */}
        {phase === 'joining' && (
          <div className="text-center space-y-4">
            <SpinnerIcon />
            <p className="text-white/70">Securing your place in line&hellip;</p>
          </div>
        )}

        {/* WAITING */}
        {phase === 'waiting' && (
          <div className="text-center space-y-8 w-full">
            <div className="space-y-3">
              <p className="text-sm font-medium text-[#4A90D9] uppercase tracking-widest">Your position</p>
              <p
                className="text-7xl sm:text-8xl font-bold tabular-nums"
                aria-live="polite"
                aria-label={`Position ${position ?? ':'} in queue`}
              >
                {position !== null ? `#${position.toLocaleString()}` : ':'}
              </p>
              {position !== null && (
                <p className="text-sm text-white/50">
                  Estimated wait:{' '}
                  <span className="text-white font-medium">
                    {estimateWait(position, admissionRate)}
                  </span>
                </p>
              )}
            </div>

            {saleStartAt && saleCountdown > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 space-y-1">
                <p className="text-xs text-white/50 uppercase tracking-wider">Sales start in</p>
                <p className="text-2xl font-mono font-semibold tabular-nums">
                  {formatDuration(saleCountdown)}
                </p>
              </div>
            )}

            <WaitingAnimation />

            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 space-y-2 text-left">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">How it works</p>
              <ul className="space-y-1 text-sm text-white/70">
                <li>• We admit ~{admissionRate} people per minute in order</li>
                <li>• When it&apos;s your turn, you&apos;ll have {admissionWindowMinutes} minutes to complete your purchase</li>
                <li>• Keep this page open. Closing it may lose your place.</li>
              </ul>
            </div>

            <button
              onClick={handleLeave}
              className="text-sm text-white/40 hover:text-white/70 transition-colors min-h-[44px] px-4"
              aria-label="Leave queue and return to event page"
            >
              Leave queue
            </button>
          </div>
        )}

        {/* ADMITTED: brief flash before redirect */}
        {phase === 'admitted' && (
          <div className="text-center space-y-4">
            <div className="text-6xl" role="img" aria-label="Checkmark">✓</div>
            <p className="text-xl font-semibold text-[#10B981]">You&apos;re in</p>
            <p className="text-white/60 text-sm">
              Taking you to checkout&hellip; You have {admissionWindowMinutes} minutes.
            </p>
            <SpinnerIcon />
          </div>
        )}

        {/* EXPIRED: admission window lapsed */}
        {phase === 'expired' && (
          <div className="text-center space-y-6 w-full">
            <div className="space-y-3">
              <div className="text-5xl" role="img" aria-label="Clock">⏰</div>
              <h2 className="text-xl font-semibold">Your spot expired</h2>
              <p className="text-white/60 text-sm">
                Your {admissionWindowMinutes}-minute checkout window closed. Rejoin the queue to try again.
              </p>
            </div>
            <button
              onClick={handleRejoin}
              className="w-full rounded-xl bg-[#4A90D9] text-white font-semibold py-4 text-base
                         hover:bg-[#3a7bc8] transition-colors min-h-[44px]"
            >
              Rejoin queue
            </button>
            <button
              onClick={() => router.push(`/events/${eventSlug}`)}
              className="text-sm text-white/40 hover:text-white/70 transition-colors min-h-[44px] px-4"
            >
              Back to event
            </button>
          </div>
        )}

        {/* ERROR */}
        {phase === 'error' && (
          <div className="text-center space-y-6 w-full">
            <div className="space-y-3">
              <div className="text-5xl" role="img" aria-label="Warning">⚠️</div>
              <h2 className="text-xl font-semibold">Something went wrong</h2>
              <p className="text-white/60 text-sm">{errorMsg ?? 'Could not join queue.'}</p>
            </div>
            <button
              onClick={handleRejoin}
              className="w-full rounded-xl bg-[#4A90D9] text-white font-semibold py-4 text-base
                         hover:bg-[#3a7bc8] transition-colors min-h-[44px]"
            >
              Try again
            </button>
          </div>
        )}
      </main>

      {/* Subtle footer */}
      <footer className="text-center py-4 text-xs text-white/20">
        Fair, first-come first-served queue. Powered by EventLinqs.
      </footer>
    </div>
  )
}

function SpinnerIcon() {
  return (
    <div
      className="mx-auto w-8 h-8 rounded-full border-2 border-white/20 border-t-[#4A90D9]
                 motion-safe:animate-spin"
      role="status"
      aria-label="Loading"
    />
  )
}

function WaitingAnimation() {
  return (
    <div className="flex items-center justify-center gap-2 py-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-[#4A90D9] motion-safe:animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}
