'use client'

import { useState, useTransition } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'

interface StripeDashboardButtonProps {
  enabled: boolean
}

export function StripeDashboardButton({ enabled }: StripeDashboardButtonProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function open() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/payouts/stripe-dashboard-link', {
          method: 'POST',
          credentials: 'same-origin',
        })
        const json = (await res.json()) as { ok: boolean; url?: string; error?: string }
        if (!json.ok || !json.url) {
          setError('Could not open Stripe Dashboard. Please try again.')
          return
        }
        window.open(json.url, '_blank', 'noopener,noreferrer')
      } catch {
        setError('Network error. Please try again.')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={open}
        disabled={!enabled || isPending}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        )}
        Open Stripe Dashboard
      </button>
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
