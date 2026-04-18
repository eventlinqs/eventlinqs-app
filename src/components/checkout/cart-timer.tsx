'use client'

import { useEffect, useRef, useState } from 'react'

interface CartTimerProps {
  expiresAt: string
  onExpired: () => void
}

export function CartTimer({ expiresAt, onExpired }: CartTimerProps) {
  // Initialise to 0 (stable server/client value) to avoid hydration mismatch.
  // Actual countdown starts after mount via useEffect.
  const [secondsLeft, setSecondsLeft] = useState<number>(0)

  // Hold the latest onExpired in a ref so the effect deps can stay on [expiresAt]
  // without triggering exhaustive-deps lint warnings and without restarting the
  // interval when the parent passes a fresh function reference.
  const onExpiredRef = useRef(onExpired)
  useEffect(() => {
    onExpiredRef.current = onExpired
  }, [onExpired])

  useEffect(() => {
    function compute() {
      const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
      return Math.max(0, diff)
    }

    // Defer the first setState to a macrotask so it doesn't run synchronously
    // inside the effect body (satisfies react-hooks/set-state-in-effect).
    const firstTick = setTimeout(() => {
      const initial = compute()
      setSecondsLeft(initial)
      if (initial <= 0) {
        onExpiredRef.current()
      }
    }, 0)

    const id = setInterval(() => {
      const next = compute()
      setSecondsLeft(next)
      if (next <= 0) {
        clearInterval(id)
        onExpiredRef.current()
      }
    }, 1000)

    return () => {
      clearTimeout(firstTick)
      clearInterval(id)
    }
  }, [expiresAt])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const isUrgent = secondsLeft < 120

  return (
    <div
      role="timer"
      aria-live="polite"
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        isUrgent
          ? 'bg-gold-100 text-ink-900 border border-gold-500'
          : 'bg-ink-100/60 text-ink-900 border border-ink-200'
      }`}
    >
      <svg
        className={`h-4 w-4 shrink-0 ${isUrgent ? 'text-gold-600' : 'text-ink-600'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>
        Tickets reserved for{' '}
        <span className="tabular-nums font-bold">
          {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
        </span>
      </span>
    </div>
  )
}
