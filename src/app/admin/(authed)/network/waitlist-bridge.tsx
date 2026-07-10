'use client'

import { useState, useTransition } from 'react'
import { inviteWaitlistEntry } from './actions'

type Row = { id: string; name: string; email: string; city: string }

export function WaitlistBridge({ rows, spotsRemaining }: { rows: Row[]; spotsRemaining: number }) {
  const [done, setDone] = useState<Record<string, 'sent' | string>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const invite = (id: string) => {
    setPendingId(id)
    startTransition(async () => {
      const result = await inviteWaitlistEntry(id)
      setDone(d => ({ ...d, [id]: result.ok ? 'sent' : (result.error ?? 'Failed') }))
      setPendingId(null)
    })
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/15 bg-[#131A2A] px-4 py-6 text-sm text-white/60">
        No un-invited organiser sign-ups in the open cities right now.
      </div>
    )
  }

  return (
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
                    onClick={() => invite(r.id)}
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
  )
}
