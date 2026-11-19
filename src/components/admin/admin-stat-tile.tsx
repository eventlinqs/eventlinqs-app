import type { ReactNode } from 'react'

interface AdminStatTileProps {
  label: string
  value: string | number | ReactNode
  hint?: string
  status?: 'ok' | 'warn' | 'pending' | 'down'
}

const STATUS_DOT: Record<NonNullable<AdminStatTileProps['status']>, string> = {
  ok:      'bg-emerald-400',
  warn:    'bg-amber-400',
  pending: 'bg-[var(--admin-line-strong)]',
  down:    'bg-rose-500',
}

/**
 * Glanceable numeric tile for the admin dashboard.
 *
 * Big number on top, label beneath, optional hint line, optional status
 * dot for the "system health" row. No charts in A1; charts arrive in A4.
 */
export function AdminStatTile({ label, value, hint, status }: AdminStatTileProps) {
  return (
    <div className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">{label}</p>
        {status ? (
          <span aria-hidden className={`mt-1.5 h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
        ) : null}
      </div>
      <p className="mt-3 font-display text-3xl font-bold text-[var(--admin-ink)]">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-xs text-[var(--admin-muted)]">{hint}</p>
      ) : null}
    </div>
  )
}
