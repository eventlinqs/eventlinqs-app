import type { ReactNode } from 'react'

interface AdminStatTileProps {
  label: string
  value: string | number | ReactNode
  hint?: string
  status?: 'ok' | 'warn' | 'pending'
}

const STATUS_DOT: Record<NonNullable<AdminStatTileProps['status']>, string> = {
  ok:      'bg-emerald-400',
  warn:    'bg-amber-400',
  pending: 'bg-white/30',
}

/**
 * Glanceable numeric tile for the admin dashboard.
 *
 * Big number on top, label beneath, optional hint line, optional status
 * dot for the "system health" row. No charts in A1; charts arrive in A4.
 */
export function AdminStatTile({ label, value, hint, status }: AdminStatTileProps) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">{label}</p>
        {status ? (
          <span aria-hidden className={`mt-1.5 h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
        ) : null}
      </div>
      <p className="mt-3 font-display text-3xl font-bold text-white">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-xs text-white/50">{hint}</p>
      ) : null}
    </div>
  )
}
