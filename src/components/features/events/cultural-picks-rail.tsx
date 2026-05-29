'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { SnapRailScroller } from '@/components/ui/snap-rail'

/**
 * CulturalPicksRail - tabbed horizontal rails for the Cultural Picks section.
 *
 * The outer section header (eyebrow + title) is owned by the page. This
 * component renders the pill tab strip + the active tab's scroller with
 * its own sub-header (h3 label + "View all X" link).
 *
 * Each tab's cards are pre-rendered server-side and passed in as ReactNodes.
 */

export interface CulturalPicksTab {
  slug: string
  label: string
  href: string
  cards: ReactNode
}

interface Props {
  tabs: CulturalPicksTab[]
}

export function CulturalPicksRail({ tabs }: Props) {
  const [activeSlug, setActiveSlug] = useState(tabs[0]?.slug ?? null)
  if (tabs.length === 0 || activeSlug === null) return null
  const active = tabs.find(t => t.slug === activeSlug) ?? tabs[0]

  return (
    <>
      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Community picks categories"
        className="mt-6 flex gap-2 overflow-x-auto pb-1 scrollbar-none"
      >
        {tabs.map(t => {
          const isActive = t.slug === active.slug
          return (
            <button
              key={t.slug}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveSlug(t.slug)}
              className={[
                'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium border transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2',
                isActive
                  ? 'border-[var(--color-navy-950)] bg-[var(--color-navy-950)] text-white shadow-sm'
                  : 'border-[var(--surface-2)] bg-[var(--surface-0)] text-[var(--text-primary)] hover:-translate-y-0.5 hover:border-[var(--brand-accent-strong)] hover:text-[var(--brand-accent-strong)] hover:shadow-sm',
              ].join(' ')}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div key={active.slug} className="mt-8">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">{active.label}</h3>
          <Link
            href={active.href}
            className="text-xs font-medium text-[var(--brand-accent-strong)] whitespace-nowrap transition-colors hover:text-[var(--text-primary)]"
          >
            View all {active.label} &rsaquo;
          </Link>
        </div>
        <div className="mt-4">
          <SnapRailScroller
            railLabel={`${active.label} events`}
            containerBg="ink-100"
          >
            {active.cards}
          </SnapRailScroller>
        </div>
      </div>
    </>
  )
}
