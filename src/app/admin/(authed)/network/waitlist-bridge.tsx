'use client'

import { useState, useTransition } from 'react'
import { inviteWaitlistEntry } from './actions'

type Row = { id: string; name: string; email: string; city: string }

/**
 * THE INVITE THAT SUCCEEDED USED TO LEAVE NOTHING BEHIND.
 *
 * Found on 20 September 2026 by driving this screen rather than by reading it.
 * The drive pressed Invite, the invitation was minted and emailed, and the
 * assertion that the screen SAID so came back with an empty string.
 *
 * The cause is the success path working correctly. `inviteWaitlistEntry` ends
 * with `revalidatePath('/admin/network')`, the server re-reads the list, and
 * the person is no longer on it because this list is by definition the
 * organisers who have NOT yet been invited. React then unmounts the row,
 * taking the "Invited" label with it before it can be read. So the component
 * carried a success state the product could never reach, and the founder's only
 * feedback that an email had gone to somebody he is personally recruiting was a
 * row disappearing, which is also what a failed read of the list looks like.
 *
 * The confirmation therefore lives OUTSIDE the list, where a revalidation
 * cannot remove it, and it is a live region so it is announced rather than only
 * seen. The list keeps its one meaning: not yet invited.
 */
export function WaitlistBridge({ rows, spotsRemaining }: { rows: Row[]; spotsRemaining: number }) {
  const [done, setDone] = useState<Record<string, 'sent' | string>>({})
  const [sent, setSent] = useState<Row[]>([])
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const invite = (row: Row) => {
    setPendingId(row.id)
    startTransition(async () => {
      const result = await inviteWaitlistEntry(row.id)
      setDone(d => ({ ...d, [row.id]: result.ok ? 'sent' : (result.error ?? 'Failed') }))
      if (result.ok) setSent(s => (s.some(r => r.id === row.id) ? s : [...s, row]))
      setPendingId(null)
    })
  }

  return (
    <div className="space-y-3">
      {sent.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-300"
        >
          <p className="font-semibold text-emerald-200">
            {sent.length === 1 ? 'Founding invitation sent' : `${sent.length} founding invitations sent`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {sent.map(r => (
              <li key={r.id}>
                {r.name} · {r.email} · {r.city}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-emerald-300/70">
            They leave the list below because it shows only organisers who have not been invited yet.
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-[#131A2A] px-4 py-6 text-sm text-white/60">
          No un-invited organiser sign-ups in the open cities right now.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/15 bg-[#131A2A]">
          <ul className="divide-y divide-white/5">
            {rows.map(r => {
              const state = done[r.id]
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{r.name}</p>
                    <p className="truncate text-xs text-white/50">{r.email} · {r.city}</p>
                  </div>
                  {state === 'sent' ? (
                    <span className="text-sm font-semibold text-emerald-400">Invited</span>
                  ) : (
                    <div className="flex items-center gap-3">
                      {state && state !== 'sent' && <span className="text-xs text-red-400">{state}</span>}
                      <button
                        type="button"
                        onClick={() => invite(r)}
                        disabled={isPending || spotsRemaining <= 0}
                        className="inline-flex min-h-[40px] items-center rounded-full bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#0A1628] transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {pendingId === r.id ? 'Sending...' : 'Invite'}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
