'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { DirectoryDay } from '@/lib/events/whats-on-directory'

/**
 * WHAT'S ON: every night as one row under its day (Lawal's order of 1 November 2026, 11:01; the 'layers' sample,
 * C:\dev\EVIDENCE\CARD-DESIGNS-31OCT\layers.js). Each row is ONE link to its night (Law 5: the whole row is the touch
 * target). The chips filter in place: All, Free, then the categories the list holds. On a phone a row stacks the
 * category and city above the title, the price at the right; from md the five columns of the sample.
 */
export function WhatsOnDirectory({
  days,
  chips,
}: {
  days: readonly DirectoryDay[]
  chips: readonly { key: string; label: string }[]
}) {
  const [on, setOn] = useState('all')
  const shown = days
    .map((d) => ({
      ...d,
      rows: d.rows.filter((r) => on === 'all' || (on === 'free' ? r.free : r.categorySlug === on)),
    }))
    .filter((d) => d.rows.length > 0)

  return (
    <div>
      {chips.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter the list">
          {[{ key: 'all', label: 'All' }, ...chips].map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={on === c.key}
              onClick={() => setOn(c.key)}
              className={`min-h-11 rounded-full border px-4 font-display text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2 ${
                on === c.key
                  ? 'border-[var(--color-ink-900)] bg-[var(--color-ink-900)] text-white'
                  : 'border-[var(--color-ink-200)] bg-white text-[var(--text-primary)] hover:border-[var(--color-ink-400)]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-white">
        {shown.map((d, i) => (
          <section key={d.key} aria-label={d.label}>
            <h3
              className={`flex items-baseline gap-2.5 bg-[var(--color-canvas)] px-4 pb-2 pt-3.5 md:px-5 md:pb-2.5 md:pt-4 ${
                i > 0 ? 'border-t border-[var(--surface-2)]' : ''
              }`}
            >
              <span className="font-headline text-base font-extrabold text-[var(--text-primary)]">{d.label}</span>
              {d.tag ? (
                <span className="rounded-md bg-[var(--color-gold-100)] px-2 py-1 font-display text-xs font-extrabold uppercase leading-none tracking-wider text-[var(--brand-accent-strong)]">
                  {d.tag}
                </span>
              ) : null}
            </h3>
            <ul>
              {d.rows.map((r) => (
                <li key={r.id} className="border-t border-[var(--color-ink-100)]">
                  <Link
                    href={r.href}
                    className="group grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-canvas)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-gold-400)] md:grid-cols-[150px_minmax(0,1fr)_150px_130px_18px] md:gap-[18px] md:px-5 md:py-3.5"
                  >
                    <span className="hidden font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] md:block">
                      {r.category ?? ''}
                    </span>
                    <span className="min-w-0">
                      <span className="mb-1 block font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] md:hidden">
                        {[r.category, r.city].filter(Boolean).join(' \u00b7 ')}
                      </span>
                      <span className="block font-headline text-base font-bold leading-snug text-[var(--text-primary)] line-clamp-2 underline-offset-4 decoration-[var(--brand-accent)] decoration-2 group-hover:underline md:truncate">
                        {r.title}
                      </span>
                      {r.venue ? (
                        <span className="mt-0.5 block truncate font-display text-sm font-medium text-[var(--text-secondary)]">
                          {r.venue}
                        </span>
                      ) : null}
                    </span>
                    <span className="hidden truncate font-display text-sm font-semibold text-[var(--text-secondary)] md:block">
                      {r.city ?? ''}
                    </span>
                    <span className="text-right">
                      <span className="block whitespace-nowrap font-display text-sm font-extrabold text-[var(--text-primary)]">
                        {r.price}
                      </span>
                      <span className="mt-0.5 block whitespace-nowrap font-display text-xs font-semibold text-[var(--text-muted)]">
                        {r.time}
                      </span>
                    </span>
                    <span aria-hidden="true" className="hidden text-right font-display text-lg text-[var(--color-ink-400)] md:block">
                      &rsaquo;
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
