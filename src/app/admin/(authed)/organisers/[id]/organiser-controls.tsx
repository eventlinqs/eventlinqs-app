'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { applyOrganiserActionTyped } from '../actions'

type Action = 'approve' | 'reject' | 'suspend' | 'reinstate'

const LABELS: Record<Action, string> = {
  approve: 'Approve', reject: 'Reject', suspend: 'Suspend', reinstate: 'Reinstate',
}
// Destructive actions confirm; approve/reinstate are positive.
const DESTRUCTIVE = new Set<Action>(['reject', 'suspend'])
const PRIMARY = new Set<Action>(['approve', 'reinstate'])

export function OrganiserControls({
  organisationId,
  availableActions,
}: {
  organisationId: string
  availableActions: Action[]
}) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (availableActions.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
        <h3 className="text-sm font-semibold text-white/80">Moderation</h3>
        <p className="mt-2 text-sm text-white/60">No actions are available from the current status.</p>
      </div>
    )
  }

  async function run(action: Action) {
    if (DESTRUCTIVE.has(action) && !window.confirm(`Are you sure you want to ${action} this organiser?`)) return
    setPending(action)
    setError(null)
    const res = await applyOrganiserActionTyped({ organisationId, action, reason: reason.trim() || null })
    setPending(null)
    if (!res.ok) { setError(res.error); return }
    setReason('')
    router.refresh()
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
      <h3 className="text-sm font-semibold text-white/80">Moderation</h3>
      {error ? <p role="alert" className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      <label className="mt-3 block">
        <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/50">Reason (optional)</span>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {availableActions.map(action => (
          <button
            key={action}
            type="button"
            disabled={pending !== null}
            onClick={() => run(action)}
            className={`min-h-[44px] rounded-md px-4 text-xs font-semibold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-50 ${
              PRIMARY.has(action)
                ? 'bg-[var(--brand-accent)] text-[var(--text-primary)]'
                : 'border border-red-500/40 text-red-200 hover:bg-red-500/10'
            }`}
          >
            {pending === action ? 'Working' : LABELS[action]}
          </button>
        ))}
      </div>
    </div>
  )
}
