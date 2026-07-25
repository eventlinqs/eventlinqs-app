'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, X } from 'lucide-react'
import { previewChartSync, syncChartChanges } from './actions'
import type { ChartDiff, DiffSeatRef } from '@/lib/seating/diff'

/**
 * Post-publish chart editing, made safe and legible: the button first
 * fetches a read-only diff of exactly what the additive sync will do, the
 * organiser reads it (protected seats lead, because safety is the story),
 * and only an explicit confirm commits. Sold, reserved and held seats are
 * never touched: that guarantee is server-enforced by the RPC and stated
 * on the sheet in the same words.
 */

function refLabel(ref: DiffSeatRef): string {
  return `${ref.section ? `${ref.section} ` : ''}${ref.row}-${ref.number}`
}

function SampleList({ refs, max = 6 }: { refs: DiffSeatRef[]; max?: number }) {
  if (refs.length === 0) return null
  const shown = refs.slice(0, max)
  return (
    <span className="text-ink-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {shown.map(refLabel).join(', ')}
      {refs.length > max ? ` and ${refs.length - max} more` : ''}
    </span>
  )
}

export function SyncChartButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [notice, setNotice] = useState<string | null>(null)
  const [diff, setDiff] = useState<ChartDiff | null>(null)
  const [isPending, startTransition] = useTransition()

  const onPreview = () => {
    setNotice(null)
    startTransition(async () => {
      const result = await previewChartSync(eventId)
      if (result.error || !result.diff) {
        setNotice(result.error ?? 'Could not read the chart.')
        return
      }
      setDiff(result.diff)
    })
  }

  const onConfirm = () => {
    startTransition(async () => {
      const result = await syncChartChanges(eventId)
      setDiff(null)
      if (result.error) {
        setNotice(result.error)
        return
      }
      setNotice(
        `Applied: ${result.added ?? 0} added, ${result.updated ?? 0} follow the chart, ${result.removed ?? 0} removed. Sold and held seats were not touched.`,
      )
      router.refresh()
    })
  }

  const protectedCount = diff ? diff.protectedSeats.length + diff.protectedMissing.length : 0
  const nothingChanges =
    diff && diff.added.length === 0 && diff.moved.length === 0 && diff.removed.length === 0

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onPreview}
        disabled={isPending}
        className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-900 transition-colors hover:border-ink-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1"
      >
        {isPending && !diff ? 'Reading the chart…' : 'Review chart edits'}
      </button>
      {notice && (
        <span aria-live="polite" className="text-xs text-ink-600">{notice}</span>
      )}

      {diff && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Review chart changes before they apply"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-4 sm:items-center"
        >
          <div className="w-full max-w-lg rounded-2xl border border-ink-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
                  Chart changes, before they apply
                </p>
                <h3 className="mt-1 font-display text-lg font-bold text-ink-900">
                  Sold and held seats are never touched
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close without applying"
                onClick={() => setDiff(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="mt-4 space-y-2.5 text-sm">
              {/* Protection leads: safety is the story. */}
              <div className="flex items-start gap-2.5 rounded-xl bg-[#EDF0F4] px-3.5 py-2.5">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-900" aria-hidden />
                <p className="text-xs leading-relaxed text-ink-900">
                  <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {protectedCount} sold, reserved or held {protectedCount === 1 ? 'seat is' : 'seats are'} protected.
                  </span>{' '}
                  {diff.protectedMissing.length > 0 && (
                    <>
                      {diff.protectedMissing.length} of them {diff.protectedMissing.length === 1 ? 'is' : 'are'} no
                      longer on the chart and will be KEPT for their ticket holders:{' '}
                      <SampleList refs={diff.protectedMissing} />.
                    </>
                  )}
                </p>
              </div>

              <p className="text-xs text-ink-900">
                <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {diff.added.length} added.
                </span>{' '}
                <SampleList refs={diff.added} />
              </p>
              <p className="text-xs text-ink-900">
                <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {diff.moved.length} follow the chart
                </span>{' '}
                <span className="text-ink-400">(position, type or tier)</span>
                {diff.moved.length > 0 && (
                  <>
                    : <SampleList refs={diff.moved} />
                  </>
                )}
              </p>
              <p className="text-xs text-ink-900">
                <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {diff.removed.length} removed
                </span>{' '}
                <span className="text-ink-400">(never sold, gone from the chart)</span>
                {diff.removed.length > 0 && (
                  <>
                    : <SampleList refs={diff.removed} />
                  </>
                )}
              </p>
              {nothingChanges && (
                <p className="text-xs text-ink-600">
                  The live room already matches the chart; there is nothing to apply.
                </p>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDiff(null)}
                className="rounded-full border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-900 transition-colors hover:border-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-1"
              >
                Keep as is
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isPending || !!nothingChanges}
                className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 shadow-sm transition-colors hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1"
              >
                {isPending ? 'Applying…' : 'Apply to the live room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
