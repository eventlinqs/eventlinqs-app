'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { syncChartChanges } from './actions'

/**
 * Pull the venue chart's latest edits onto this live event, additively.
 * Sold, reserved and held seats are never touched (server-enforced), so the
 * organiser can fix a room mid-sale with zero risk to sold inventory.
 */
export function SyncChartButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const onSync = () => {
    setNotice(null)
    startTransition(async () => {
      const result = await syncChartChanges(eventId)
      if (result.error) {
        setNotice(result.error)
        return
      }
      setNotice(
        `Chart synced: ${result.added ?? 0} seats added, ${result.updated ?? 0} updated, ${result.removed ?? 0} removed. Sold and held seats were not touched.`,
      )
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onSync}
        disabled={isPending}
        className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-900 transition-colors hover:border-ink-900 disabled:opacity-50"
      >
        {isPending ? 'Syncing…' : 'Sync chart edits'}
      </button>
      {notice && (
        <span aria-live="polite" className="text-xs text-ink-600">{notice}</span>
      )}
    </div>
  )
}
