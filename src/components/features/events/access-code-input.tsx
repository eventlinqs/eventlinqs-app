'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { validateAccessCode } from '@/app/actions/access-codes'

interface Props {
  eventId: string
  onUnlocked?: (tierIds: string[]) => void
}

export function AccessCodeInput({ eventId, onUnlocked }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    startTransition(async () => {
      const result = await validateAccessCode(code, eventId)
      if (result.success) {
        setSuccess(true)
        setCode('')
        onUnlocked?.(result.unlockedTierIds)
        // Refresh the page so server re-renders with the newly unlocked tiers
        router.refresh()
      } else {
        setError(result.error ?? 'Invalid code')
      }
    })
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-ink-200 p-4">
      <p className="text-xs font-medium text-ink-600 mb-2">Have an access code?</p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="Enter code"
          disabled={isPending}
          className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm uppercase tracking-widest focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isPending || !code.trim()}
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800 disabled:opacity-50 transition-colors"
        >
          {isPending ? '\u2026' : 'Apply'}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-coral-600">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-600">Access granted! New tiers are now visible.</p>}
    </div>
  )
}
