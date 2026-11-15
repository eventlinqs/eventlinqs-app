import type { ReactNode } from 'react'

/**
 * THE ADMIN'S SHARED PARTS (Lawal, 15 November 2026, 20:52, item 2: "every page a clear header, the numbers that matter as
 * cards, tables with status chips, one primary action per screen"). Researched on the leaders' own screens
 * (C:/dev/EVIDENCE/EL-15NOV/admin/leaders/leaders-admin.md): Humanitix's host console puts one filled primary button top
 * right ("New event") and a coloured chip on every row (Published, Draft); its analytics lead with a strip of labelled
 * numbers; Shopify's admin home leads with the day's tasks and its numbers; Stripe's home shows what needs attention
 * first. Server components only; the pressed state and the toast are in pending-button.tsx and admin-toast.tsx.
 */

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">{eyebrow}</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/65">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

export type ChipTone = 'ok' | 'waits' | 'off' | 'fault' | 'info'

const CHIP: Record<ChipTone, string> = {
  ok: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30',
  waits: 'bg-[var(--brand-accent)]/15 text-[var(--brand-accent)] ring-[var(--brand-accent)]/30',
  off: 'bg-white/[0.06] text-white/65 ring-white/15',
  fault: 'bg-rose-500/15 text-rose-300 ring-rose-400/30',
  info: 'bg-sky-400/15 text-sky-200 ring-sky-300/30',
}
const DOT: Record<ChipTone, string> = {
  ok: 'bg-emerald-400',
  waits: 'bg-[var(--brand-accent)]',
  off: 'bg-white/40',
  fault: 'bg-rose-400',
  info: 'bg-sky-300',
}

export function StatusChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span data-chip={tone} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${CHIP[tone]}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  )
}

/** A number that matters, with its label, what it is measured against, and how far along it is. */
export function StatCard({ label, value, sub, progress }: { label: string; value: ReactNode; sub?: ReactNode; progress?: number | null }) {
  const pct = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : null
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
      <p className="text-xs font-medium text-white/55">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold tracking-tight text-white">{value}</p>
      {pct !== null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={`${label}: ${Math.round(pct * 100)}% of target`}>
          <div className="h-full rounded-full bg-[var(--brand-accent)]" style={{ width: `${Math.max(2, pct * 100)}%` }} />
        </div>
      ) : null}
      {sub ? <p className="mt-2 text-xs text-white/55">{sub}</p> : null}
    </div>
  )
}

/** A panel with a heading, an optional count and an optional link, holding a section of a page. */
export function Panel({ title, count, aside, children }: { title: string; count?: number; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-[#131A2A]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <h2 className="font-display text-base font-semibold text-white">
          {title}
          {typeof count === 'number' ? <span className="ml-2 rounded-full bg-white/[0.08] px-2 py-0.5 text-xs font-semibold text-white/70">{count}</span> : null}
        </h2>
        {aside}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

/** The last change made to a switch, in words: who, what and when, read from the admin audit log. */
export function AuditLine({ line }: { line: string | null }) {
  return <p className="mt-3 text-xs text-white/50">{line ?? 'No change recorded yet.'}</p>
}

export const PRIMARY =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0F1A] disabled:cursor-not-allowed disabled:opacity-60'
export const SECONDARY =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] disabled:cursor-not-allowed disabled:opacity-60'
