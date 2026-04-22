'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { SnapRailScroller } from '@/components/ui/snap-rail'

/**
 * CulturalPicksRail — tabbed horizontal rails for the Cultural Picks section.
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
        aria-label="Cultural picks categories"
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
                'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2',
                isActive
                  ? 'bg-gold-500 border-gold-500 text-ink-900'
                  : 'bg-white border-ink-200 text-ink-700 hover:border-gold-400 hover:text-gold-600',
              ].join(' ')}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Active tab rail */}
      <div key={active.slug} className="mt-8">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-xl font-bold text-ink-900">{active.label}</h3>
          <Link
            href={active.href}
            className="text-xs font-medium text-gold-700 whitespace-nowrap transition-colors hover:text-gold-600"
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
