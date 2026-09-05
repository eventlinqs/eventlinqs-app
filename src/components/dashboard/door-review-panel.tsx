'use client'

import { useState } from 'react'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Button } from '@/components/ui/Button'
import type { DoorReviewRow } from '@/lib/reporting/door-review-types'
import { describeReviewRow } from '@/lib/reporting/door-review-copy'
import { resolveScanReview } from '@/app/(dashboard)/dashboard/events/[id]/attendees/actions'

/**
 * WHAT THE ORGANISER SEES about a ticket that was admitted twice while the
 * doors were offline (Scope v5 3.12: "the second is flagged for manual
 * review"). Each row says which door let the second person in, when, and
 * which door had already admitted the ticket, so the organiser can settle it
 * and mark it resolved. A flag that nobody can see or clear would be a no-op
 * control, which the Definition of Done forbids.
 */
export function DoorReviewPanel({ eventId, rows, timeZone }: { eventId: string; rows: DoorReviewRow[]; timeZone: string | null }) {
  const [open, setOpen] = useState<DoorReviewRow[]>(rows)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  async function resolve(row: DoorReviewRow) {
    setBusy(row.scanId)
    setFailure(null)
    const answer = await resolveScanReview(eventId, row.scanId, notes[row.scanId] ?? '')
    setBusy(null)
    if (!answer.ok) {
      setFailure(answer.error)
      return
    }
    setOpen((prev) => prev.filter((r) => r.scanId !== row.scanId))
  }

  return (
    <section aria-labelledby="door-review-heading" data-testid="door-review" className="mb-6 rounded-xl border border-ink-200 bg-white p-5">
      <SectionHeader eyebrow="Door review" title="Scans that need a look" size="sm" id="door-review-heading" />
      {open.length === 0 ? (
        <p data-testid="door-review-empty" className="mt-3 text-sm text-ink-700">
          No door scans need a look. A scan lands here only when a door admitted a ticket offline that another door had
          already admitted, or that had been refunded, by the time it synced.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-ink-100">
          {open.map((row) => (
            <li key={row.scanId} data-testid="door-review-row" className="py-4 first:pt-0 last:pb-0">
              <p className="text-sm font-semibold tabular-nums text-ink-900">
                {row.ticketCode ?? 'Unknown ticket'}
                {row.holderName ? `, ${row.holderName}` : ''}
              </p>
              <p className="mt-1 text-sm text-ink-700">{describeReviewRow(row, timeZone)}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label htmlFor={`review-note-${row.scanId}`} className="block text-xs font-medium text-ink-700">
                    What happened (optional)
                  </label>
                  <input
                    id={`review-note-${row.scanId}`}
                    type="text"
                    value={notes[row.scanId] ?? ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [row.scanId]: e.target.value }))}
                    maxLength={500}
                    placeholder="Same guest came back through the second door"
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-base focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                  />
                </div>
                <Button variant="secondary" className="min-h-11" onClick={() => void resolve(row)} disabled={busy === row.scanId}>
                  {busy === row.scanId ? 'Saving' : 'Mark resolved'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {failure && (
        <p role="alert" className="mt-3 rounded-lg bg-error/10 px-3 py-2 text-sm text-ink-900">
          {failure}
        </p>
      )}
    </section>
  )
}
