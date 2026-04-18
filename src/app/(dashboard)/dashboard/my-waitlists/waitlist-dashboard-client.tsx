'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getMyWaitlists, leaveWaitlist } from '@/app/actions/waitlist'
import type { MyWaitlistRow } from '@/app/actions/waitlist'

interface Props {
  initialWaitlists: MyWaitlistRow[]
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  waiting:  { label: 'Waiting',   className: 'bg-gold-100 text-gold-600' },
  notified: { label: 'Your turn', className: 'bg-amber-100 text-amber-800 animate-pulse' },
  converted:{ label: 'Converted', className: 'bg-green-100 text-green-700' },
  expired:  { label: 'Expired',   className: 'bg-ink-100 text-ink-400' },
  removed:  { label: 'Removed',   className: 'bg-ink-100 text-ink-400' },
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function WaitlistDashboardClient({ initialWaitlists }: Props) {
  const router = useRouter()
  const [waitlists, setWaitlists] = useState<MyWaitlistRow[]>(initialWaitlists)
  const [leavingId, setLeavingId] = useState<string | null>(null)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Poll positions every 30 seconds for 'waiting' entries
  useEffect(() => {
    const hasActiveWaiting = waitlists.some(w => w.status === 'waiting')
    if (!hasActiveWaiting) return

    const interval = setInterval(async () => {
      // Refresh the full list — server action re-fetches from DB
      // This is simpler than polling individual positions and catches status changes
      router.refresh()
    }, 30_000)

    return () => clearInterval(interval)
  }, [waitlists, router])

  // Sync with server-refreshed props — when router.refresh() fires, Next.js
  // re-runs the server component and passes new initialWaitlists via props
  useEffect(() => {
    setWaitlists(initialWaitlists)
  }, [initialWaitlists])

  async function handleLeave(waitlistId: string) {
    setLeavingId(waitlistId)
    setLeaveError(null)

    startTransition(async () => {
      const result = await leaveWaitlist(waitlistId)
      setLeavingId(null)

      if (!result.success) {
        setLeaveError(result.error ?? 'Failed to leave waitlist')
        return
      }

      // Optimistically remove from local state
      setWaitlists(prev => prev.filter(w => w.id !== waitlistId))
      router.refresh()
    })
  }

  return (
    <div className="space-y-4" aria-label="My waitlist entries">
      {leaveError && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {leaveError}
        </div>
      )}

      {waitlists.map((entry) => {
        const statusConfig = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.waiting
        const isWaiting = entry.status === 'waiting'
        const isLeaving = leavingId === entry.id

        return (
          <div
            key={entry.id}
            className="rounded-xl border border-ink-200 bg-white p-5"
            aria-label={`Waitlist entry for ${entry.event_title}`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                {/* Status badge */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusConfig.className}`}>
                    {statusConfig.label}
                  </span>
                  {isWaiting && (
                    <span
                      className="text-sm font-bold text-ink-900 tabular-nums"
                      aria-live="polite"
                      aria-atomic="true"
                      aria-label={`Position ${entry.position} in line`}
                    >
                      #{entry.position} in line
                    </span>
                  )}
                </div>

                {/* Event name */}
                {entry.event_slug ? (
                  <Link
                    href={`/events/${entry.event_slug}`}
                    className="text-base font-semibold text-ink-900 hover:text-gold-500 transition-colors"
                  >
                    {entry.event_title}
                  </Link>
                ) : (
                  <p className="text-base font-semibold text-ink-900">{entry.event_title}</p>
                )}

                {/* Tier + date */}
                <p className="mt-0.5 text-sm text-ink-400">
                  {entry.tier_name && <span className="font-medium text-ink-600">{entry.tier_name} · </span>}
                  {entry.event_start_date ? formatDate(entry.event_start_date) : ''}
                </p>

                {/* Quantity */}
                <p className="mt-1 text-xs text-ink-400">
                  {entry.quantity_requested} ticket{entry.quantity_requested > 1 ? 's' : ''} requested
                  {' · '}Joined {formatDate(entry.created_at)}
                </p>

                {/* Notified warning */}
                {entry.status === 'notified' && (
                  <div
                    className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800"
                    role="status"
                    aria-live="assertive"
                  >
                    A spot opened. Check your email for the checkout link. It expires in 15 minutes.
                  </div>
                )}
              </div>

              {/* Leave button */}
              {isWaiting && (
                <button
                  type="button"
                  onClick={() => handleLeave(entry.id)}
                  disabled={isLeaving || isPending}
                  aria-label={`Leave waitlist for ${entry.event_title}`}
                  className="shrink-0 rounded-lg border border-ink-200 px-3 py-2 text-xs font-medium text-ink-600 hover:bg-ink-100 hover:text-red-600 hover:border-red-200 disabled:opacity-40 transition-colors min-h-[44px]"
                >
                  {isLeaving ? 'Leaving…' : 'Leave Waitlist'}
                </button>
              )}
            </div>
          </div>
        )
      })}

      <p className="pt-2 text-center text-xs text-ink-400">
        Positions update automatically every 30 seconds.
      </p>
    </div>
  )
}
