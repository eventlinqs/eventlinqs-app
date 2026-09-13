'use client'

import { useState, useTransition } from 'react'
import { setFoundingWaiver } from './actions'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

/**
 * FOUNDING TERMS, BY HAND. Close-out FO1: the owner can grant, revoke and
 * extend a Founding Organiser window, and the change reaches checkout on the
 * next order without a deploy.
 *
 * Every row is a real organisation read from the database. The three controls
 * do exactly what their labels say and nothing else: Grant opens six months
 * from today, Extend adds three months from wherever the window currently
 * stands (or from today if it has lapsed), Revoke clears it. The fifty cap is
 * enforced by the database, and the override is a separate, deliberate tick
 * rather than something a mis-click can do.
 */
export type FoundingTermsRow = {
  id: string
  name: string
  slug: string | null
  isFounding: boolean
  feeFreeUntil: string | null
  active: boolean
  referralsConfirmed: number
}

function formatUntil(value: string | null): string {
  if (!value) return 'None'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'None'
  // The platform zone, never the reader's. A date formatted in the browser's
  // own zone renders differently on the server and in the client and produces a
  // hydration mismatch, which is what tests/unit/dashboard/no-clock-during-render
  // exists to stop.
  return d.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: PLATFORM_TIME_ZONE,
  })
}

export function FoundingTerms({
  rows,
  cap,
  holders,
  initialMonths,
  referralMonths,
}: {
  rows: FoundingTermsRow[]
  cap: number
  holders: number
  initialMonths: number
  referralMonths: number
}) {
  const [state, setState] = useState<Record<string, { until: string | null; message: string | null; failed: boolean }>>({})
  const [overrideCap, setOverrideCap] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const run = (id: string, action: 'grant' | 'extend' | 'revoke') => {
    setBusyId(id)
    startTransition(async () => {
      const result = await setFoundingWaiver({
        organisationId: id,
        action,
        months: action === 'extend' ? referralMonths : undefined,
        overrideCap,
      })
      setState(s => ({
        ...s,
        [id]: result.ok
          ? {
              until: result.feeFreeUntil ?? null,
              message: action === 'revoke' ? 'Window cleared' : `Fee free until ${formatUntil(result.feeFreeUntil ?? null)}`,
              failed: false,
            }
          : { until: null, message: result.error ?? 'That did not work', failed: true },
      }))
      setBusyId(null)
    })
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/60">
          {holders} of {cap} founding windows are open. Grant opens {initialMonths} months from today; extend adds{' '}
          {referralMonths} months to wherever the window stands.
        </p>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={overrideCap}
            onChange={e => setOverrideCap(e.target.checked)}
            className="h-4 w-4 rounded border-white/30 bg-transparent"
          />
          Override the {cap} cap on the next grant
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-[#131A2A] px-4 py-6 text-sm text-white/60">
          No organisations to show yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/15 bg-[#131A2A]">
          <ul className="divide-y divide-white/5">
            {rows.map(r => {
              const outcome = state[r.id]
              const until = outcome && !outcome.failed ? outcome.until : r.feeFreeUntil
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{r.name}</p>
                    <p className="truncate text-xs text-white/50">
                      {r.isFounding ? 'Founding Organiser' : 'Standard organiser'} · fee free until {formatUntil(until)} ·{' '}
                      {r.referralsConfirmed} referral{r.referralsConfirmed === 1 ? '' : 's'} counted
                    </p>
                    {outcome?.message ? (
                      <p className={`mt-1 text-xs ${outcome.failed ? 'text-red-400' : 'text-emerald-400'}`}>
                        {outcome.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => run(r.id, 'grant')}
                      disabled={isPending}
                      className="inline-flex min-h-[40px] items-center rounded-full bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#0A1628] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {busyId === r.id ? 'Working' : 'Grant'}
                    </button>
                    <button
                      type="button"
                      onClick={() => run(r.id, 'extend')}
                      disabled={isPending}
                      className="inline-flex min-h-[40px] items-center rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      Extend
                    </button>
                    <button
                      type="button"
                      onClick={() => run(r.id, 'revoke')}
                      disabled={isPending}
                      className="inline-flex min-h-[40px] items-center rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white/80 transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
