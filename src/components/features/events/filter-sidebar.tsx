'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

/**
 * FilterSidebar — desktop-only collapsible filter panel (§6.4).
 *
 * Groups:
 *   WHEN        — expanded by default (date quick-picks)
 *   CATEGORY    — expanded, top 5 visible + "Show N more" toggle
 *   PRICE       — collapsed (free toggle)
 *   CULTURE/LANGUAGE — collapsed + top 6 culture tags (our moat vs TM/DICE)
 *
 * Hidden below lg breakpoint — mobile gets EventsFilterStrip + bottom drawer.
 */

type Category = { id: string; name: string; slug: string }

type FilterParams = {
  category?: string
  city?: string
  date?: string
  free?: string
  culture?: string
  q?: string
  page?: string
}

function buildUrl(
  params: FilterParams,
  overrides: Record<string, string | undefined>,
): string {
  const merged = { ...params, ...overrides }
  const qs = Object.entries(merged)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&')
  return `/events${qs ? `?${qs}` : ''}`
}

const DATE_OPTIONS = [
  { key: undefined,  label: 'Any time' },
  { key: 'today',    label: 'Today' },
  { key: 'week',     label: 'This week' },
  { key: 'weekend',  label: 'Weekend' },
  { key: 'month',    label: 'This month' },
]

const CULTURE_TAGS = [
  { key: 'afrobeats', label: 'Afrobeats' },
  { key: 'amapiano',  label: 'Amapiano' },
  { key: 'highlife',  label: 'Highlife' },
  { key: 'gospel',    label: 'Gospel' },
  { key: 'comedy',    label: 'Comedy' },
  { key: 'owambe',    label: 'Owambe' },
]

const CATEGORIES_VISIBLE = 5

function SidebarGroup({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-ink-100 pb-4 last:border-0 last:pb-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-ink-400">
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`flex h-9 items-center rounded-lg px-3 text-sm transition-colors ${
        active
          ? 'bg-gold-100 font-semibold text-gold-600'
          : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
      }`}
    >
      {active && (
        <span className="mr-2 h-1.5 w-1.5 rounded-full bg-gold-500 shrink-0" aria-hidden="true" />
      )}
      {children}
    </Link>
  )
}

export function FilterSidebar({
  categories,
  params,
}: {
  categories: Category[]
  params: FilterParams
}) {
  const [showAllCategories, setShowAllCategories] = useState(false)

  const visibleCategories = showAllCategories
    ? categories
    : categories.slice(0, CATEGORIES_VISIBLE)

  const hiddenCount = categories.length - CATEGORIES_VISIBLE

  return (
    <aside
      className="hidden lg:block lg:w-64 xl:w-72 shrink-0"
      aria-label="Event filters"
    >
      <div className="sticky top-24 rounded-xl border border-ink-100 bg-white p-5 space-y-0">

        {/* WHEN */}
        <SidebarGroup title="When" defaultOpen={true}>
          <div className="space-y-0.5">
            {DATE_OPTIONS.map(opt => (
              <FilterLink
                key={opt.label}
                href={buildUrl(params, { date: opt.key, page: '1' })}
                active={(params.date ?? undefined) === opt.key}
              >
                {opt.label}
              </FilterLink>
            ))}
          </div>
        </SidebarGroup>

        {/* CATEGORY */}
        <SidebarGroup title="Category" defaultOpen={true}>
          <div className="space-y-0.5">
            <FilterLink
              href={buildUrl(params, { category: undefined, page: '1' })}
              active={!params.category}
            >
              All categories
            </FilterLink>
            {visibleCategories.map(c => (
              <FilterLink
                key={c.id}
                href={buildUrl(params, { category: c.id, page: '1' })}
                active={params.category === c.id}
              >
                {c.name}
              </FilterLink>
            ))}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllCategories(s => !s)}
                className="mt-1 w-full text-left px-3 text-xs font-medium text-gold-500 hover:text-gold-600 transition-colors"
              >
                {showAllCategories ? 'Show less' : `Show ${hiddenCount} more`}
              </button>
            )}
          </div>
        </SidebarGroup>

        {/* PRICE */}
        <SidebarGroup title="Price" defaultOpen={false}>
          <FilterLink
            href={buildUrl(params, { free: params.free === '1' ? undefined : '1', page: '1' })}
            active={params.free === '1'}
          >
            Free events only
          </FilterLink>
        </SidebarGroup>

        {/* CULTURE / LANGUAGE — our moat */}
        <SidebarGroup title="Culture / Language" defaultOpen={false}>
          <div className="space-y-0.5">
            <FilterLink
              href={buildUrl(params, { culture: undefined, page: '1' })}
              active={!params.culture}
            >
              All genres
            </FilterLink>
            {CULTURE_TAGS.map(tag => (
              <FilterLink
                key={tag.key}
                href={buildUrl(params, { culture: tag.key, page: '1' })}
                active={params.culture === tag.key}
              >
                {tag.label}
              </FilterLink>
            ))}
          </div>
        </SidebarGroup>

      </div>
    </aside>
  )
}
