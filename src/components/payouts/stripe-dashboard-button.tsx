'use client'

import { useState, useTransition } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { reportClientError } from '@/lib/observability/client-error-report'

interface StripeDashboardButtonProps {
  enabled: boolean
  /**
   * WHICH business's Stripe dashboard to open.
   *
   * THE LEAK THIS CLOSES. This posted with no organisation named, so the route fell
   * back to the caller's FIRST business. An owner of several Stripe accounts looking
   * at business B pressed "Open Stripe Dashboard" and was minted a login link into
   * business A's Stripe account. A login link is not a read: it is an authenticated
   * session into the wrong company's money.
   */
  organisationId: string
}

export function StripeDashboardButton({ enabled, organisationId }: StripeDashboardButtonProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function open() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/payouts/stripe-dashboard-link?org=${encodeURIComponent(organisationId)}`,
          { method: 'POST', credentials: 'same-origin' },
        )
        const json = (await res.json()) as { ok: boolean; url?: string; error?: string }
        if (!json.ok || !json.url) {
          setError('Could not open Stripe Dashboard. Please try again.')
          return
        }
        window.open(json.url, '_blank', 'noopener,noreferrer')
      } catch (error) {
        reportClientError(error, { where: 'components/payouts/stripe-dashboard-button:40' })
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
        <p className="text-xs text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
