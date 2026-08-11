'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { refreshStripeStatus } from '@/app/(dashboard)/dashboard/payouts/actions'
import type { OutstandingRequirement } from '@/lib/stripe/reconcile-connect'

interface Props {
  organisationId: string
  /** Rendered before any press, from the row, so the surface is never blank. */
  initialOutstanding?: OutstandingRequirement[]
}

/**
 * The way out of a stranded state, in the browser.
 *
 * The founder could not publish a paid event because the platform held
 * payout_status 'restricted' while Stripe reported the account fully enabled. No
 * screen offered a way to correct it and it took SQL against production. This
 * button is that way out: it re-reads the connected account from Stripe and writes
 * the truth.
 *
 * It is deliberately always available, not only when something looks wrong. An
 * organiser who has just finished Stripe onboarding and is impatient, and an
 * organiser who is stranded by a missed webhook, both press the same control, and
 * neither has to know which situation they are in.
 */
export function RefreshStripeStatus({ organisationId, initialOutstanding = [] }: Props) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<'good' | 'work' | 'bad'>('good')
  const [outstanding, setOutstanding] = useState<OutstandingRequirement[]>(initialOutstanding)
  const router = useRouter()

  function onPress() {
    setMessage(null)
    startTransition(async () => {
      const res = await refreshStripeStatus(organisationId)
      if (!res.ok) {
        setTone('bad')
        setMessage(res.error)
        return
      }
      setTone(res.canSell ? 'good' : 'work')
      setMessage(res.message)
      setOutstanding(res.outstanding)
      // Pull the server components down again so the status cards agree with what
      // this control just wrote, rather than showing the previous state beside a
      // success message.
      router.refresh()
    })
  }

  const toneClass =
    tone === 'good'
      ? 'border-success/40 bg-success/10 text-ink-900'
      : tone === 'work'
        ? 'border-gold-500/40 bg-gold-100 text-ink-900'
        : 'border-error/40 bg-error/10 text-ink-900'

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-base font-bold text-ink-900">Stripe status</h3>
          <p className="mt-1 text-sm text-ink-600">
            If your Stripe account is ready but EventLinqs has not caught up, refresh it here.
          </p>
        </div>
        {/* method="post" per CLAUDE.md Law 8's sibling rule on pre-hydration submits
            is not needed: this is a button, not a form, so there is no native
            submit to leak anything into a URL. */}
        <button
          type="button"
          onClick={onPress}
          disabled={pending}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} aria-hidden="true" />
          {pending ? 'Checking Stripe...' : 'Refresh Stripe status'}
        </button>
      </div>

      {message ? (
        <p role="status" className={`mt-4 rounded-xl border px-4 py-3 text-sm ${toneClass}`}>
          {message}
        </p>
      ) : null}

      {outstanding.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
            What Stripe still needs
          </p>
          <ul className="mt-2 space-y-2">
            {outstanding.slice(0, 6).map((o) => (
              <li key={o.requirement} className="text-sm text-ink-700">
                <span className="font-medium text-ink-900">{o.requirement}</span>
                {o.bucket === 'past_due' ? (
                  <span className="ml-2 rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-semibold text-ink-900">
                    overdue
                  </span>
                ) : null}
                {o.reason ? <span className="mt-0.5 block text-ink-600">{o.reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
