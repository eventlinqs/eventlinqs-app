'use client'

import { useEffect, useState } from 'react'

interface CartTimerProps {
  expiresAt: string
  onExpired: () => void
}

export function CartTimer({ expiresAt, onExpired }: CartTimerProps) {
  // Initialize to 0 (stable server/client value) to avoid hydration mismatch.
  // Actual countdown starts after mount via useEffect.
  const [secondsLeft, setSecondsLeft] = useState<number>(0)

  useEffect(() => {
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
    const initial = Math.max(0, diff)

    if (initial <= 0) {
      onExpired()
      return
    }

    setSecondsLeft(initial)

    const id = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(id)
          onExpired()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const isUrgent = secondsLeft < 120

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
        isUrgent
          ? 'bg-red-50 text-red-700 border border-red-200'
          : 'bg-amber-50 text-amber-800 border border-amber-200'
      }`}
    >
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
