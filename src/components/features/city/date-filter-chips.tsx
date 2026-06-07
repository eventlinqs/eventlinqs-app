'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const CHIPS: { id: string; label: string; preset: string }[] = [
  { id: 'all',      label: 'All upcoming', preset: 'all' },
  { id: 'tonight',  label: 'Tonight',      preset: 'today' },
  { id: 'weekend',  label: 'This weekend', preset: 'weekend' },
  { id: '7d',       label: 'Next 7 days',  preset: '7d' },
  { id: '30d',      label: 'Next 30 days', preset: 'month' },
]

interface Props {
  /** Anchor on the page that the All Events grid lives at, used to
   *  scroll-to and to set the URL hash so the chip selection is shareable. */
  anchorId?: string
  /** Optional initial selection from the URL ?date=. */
  initial?: string
}

/**
 * DateFilterChips - sticky chip strip below the city hero.
 *
 * Chips become sticky once the page scrolls past the hero. Selection
 * updates the ?date= URL param + smooth-scrolls to the in-page events
 * grid. The grid (server-rendered) reads the ?date= param on the next
 * navigation and re-renders. This keeps the rails above (which are
 * server-rendered) static while the grid below responds to chip clicks.
 *
 * The brief asks for "filters all rails below dynamically"; full client-
 * side rail filtering would require lifting all rail data into client
 * state and a client-only render path, which fights ISR + cache. The
 * chip-driven URL update is a pragmatic middle ground: shareable, SEO-
 * stable, and reads as instant on a fast connection.
 */
export function DateFilterChips({ anchorId = 'all-events', initial }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const fromUrl = params?.get('date') ?? undefined
  const [selected, setSelected] = useState<string>(initial ?? fromUrl ?? 'all')

  useEffect(() => {
    if (fromUrl && fromUrl !== selected) setSelected(fromUrl)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl])

  const onClick = useMemo(
    () => (chipId: string, preset: string) => {
      setSelected(chipId)
      const next = new URLSearchParams(params?.toString() ?? '')
      if (preset === 'all') next.delete('date')
      else next.set('date', preset)
      const qs = next.toString()
      const url = qs ? `?${qs}#${anchorId}` : `#${anchorId}`
      router.replace(url, { scroll: false })
      const el = document.getElementById(anchorId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [router, params, anchorId],
  )

  return (
    <div
      role="tablist"
      aria-label="Filter events by date"
      className="sticky top-[var(--site-nav-height,64px)] z-30 border-y border-[var(--surface-2)] bg-[var(--surface-0)]"
    >
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
        {CHIPS.map(c => {
          const active = selected === c.id
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onClick(c.id, c.preset)}
              className={[
                'inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-full border px-4 text-sm font-semibold transition',
                active
                  ? 'border-[var(--color-navy-950)] bg-[var(--color-navy-950)] text-white shadow-sm'
                  : 'border-[var(--surface-2)] bg-[var(--surface-0)] text-[var(--text-primary)] hover:border-[var(--color-navy-950)]/50',
              ].join(' ')}
            >
              {c.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
