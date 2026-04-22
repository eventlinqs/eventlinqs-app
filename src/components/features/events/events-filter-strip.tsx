'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

type Category = { id: string; name: string; slug: string }

type FilterParams = {
  category?: string
  city?: string
  date?: string
  free?: string
  paid?: string
  distance?: string
  q?: string
  page?: string
}

function buildFilterUrl(
  params: FilterParams,
  overrides: Record<string, string | undefined>,
): string {
  const merged: Record<string, string | undefined> = { ...params, ...overrides }
  const qs = Object.entries(merged)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&')
  return `/events${qs ? `?${qs}` : ''}`
}

const DATE_CHIPS: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'weekend', label: 'Weekend' },
  { key: 'month', label: 'This month' },
]

const DATE_OPTIONS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: 'Any time' },
  ...DATE_CHIPS,
]

const CheckIcon = () => (
  <svg
    className="h-4 w-4 mr-2 flex-none text-gold-500"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
)

export function EventsFilterStrip({
  categories,
  params,
  resultsCount,
}: {
  categories: Category[]
  params: FilterParams
  resultsCount?: number
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    // Return focus to the button that opened the drawer (WCAG 2.2 — focus management)
    triggerRef.current?.focus()
  }, [])

  const openDrawer = useCallback(() => {
    setDrawerOpen(true)
  }, [])

  // Move focus to the close button when drawer opens (WCAG 2.2 — focus management)
  useEffect(() => {
    if (!drawerOpen) return
    // Small delay allows the transform transition to start before focus moves
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [drawerOpen])

  // Escape key dismisses the drawer (WCAG 2.2 AA — keyboard dismissal)
  useEffect(() => {
    if (!drawerOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeDrawer()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen, closeDrawer])

  // Prevent background scroll while drawer is open (matches TM/EB/DICE behaviour)
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  return (
    <>
      {/* ── Horizontal chip strip ── visible below lg breakpoint only ── */}
      <div className="lg:hidden mb-4">
        <div
          role="toolbar"
          aria-label="Quick filters"
          className="flex items-center gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {/* Advanced filters trigger — shows active count badge */}
          {(() => {
            const activeCount = [params.date, params.category, params.free === '1' ? '1' : undefined, params.paid === '1' ? '1' : undefined, params.distance].filter(Boolean).length
            return (
              <button
                ref={triggerRef}
                type="button"
                onClick={openDrawer}
                aria-expanded={drawerOpen}
                aria-haspopup="dialog"
                className={`flex-none inline-flex items-center gap-1.5 h-11 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
                  activeCount > 0
                    ? 'border border-gold-500 bg-gold-100 text-gold-700'
                    : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-100'
                }`}
              >
                <svg
                  className="h-4 w-4 flex-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 9h10M10 14h4" />
                </svg>
                Filters
                {activeCount > 0 && (
                  <span className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold-500 text-[10px] font-bold text-ink-900">
                    {activeCount}
                  </span>
                )}
              </button>
            )
          })()}

          {/* Date quick chips */}
          {DATE_CHIPS.map(chip => (
            <Link
              key={chip.key}
              href={buildFilterUrl(params, {
                date: params.date === chip.key ? undefined : chip.key,
                page: '1',
              })}
              aria-current={params.date === chip.key ? 'true' : undefined}
              className={`flex-none inline-flex items-center h-11 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
                params.date === chip.key
                  ? 'bg-gold-500 text-ink-900'
                  : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-100'
              }`}
            >
              {chip.label}
            </Link>
          ))}

          {/* Free chip */}
          <Link
            href={buildFilterUrl(params, {
              free: params.free === '1' ? undefined : '1',
              page: '1',
            })}
            aria-current={params.free === '1' ? 'true' : undefined}
            className={`flex-none inline-flex items-center h-11 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
              params.free === '1'
                ? 'bg-gold-500 text-ink-900'
                : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-100'
            }`}
          >
            Free
          </Link>

          {/* Category chips — pass slug (§A.1) */}
          {categories.map(cat => (
            <Link
              key={cat.id}
              href={buildFilterUrl(params, {
                category: params.category === cat.slug ? undefined : cat.slug,
                page: '1',
              })}
              aria-current={params.category === cat.slug ? 'true' : undefined}
              className={`flex-none inline-flex items-center h-11 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${
                params.category === cat.slug
                  ? 'bg-gold-500 text-ink-900'
                  : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-100'
              }`}
            >
              {cat.name}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Backdrop ── */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300 ${
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeDrawer}
      />

      {/* ── Bottom-sheet drawer ──
          aria-hidden when closed: removes it from accessibility tree while visually off-screen.
          This prevents screen readers from navigating to a visually hidden dialog. ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        aria-hidden={!drawerOpen}
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto lg:hidden transform transition-transform duration-300 ease-out ${
          drawerOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Drag handle — decorative */}
        <div className="flex justify-center pt-3 pb-1" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-ink-200" />
        </div>

        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100">
          <h2 className="text-base font-semibold text-ink-900">Filters</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeDrawer}
            aria-label="Close filters"
            className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-ink-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <svg
              className="h-5 w-5 text-ink-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drawer content */}
        <div
          className="px-5 pt-4 space-y-6"
          style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
        >
          {/* When */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">When</p>
            <div className="space-y-0.5">
              {DATE_OPTIONS.map(opt => {
                const isActive = (params.date ?? undefined) === opt.key
                return (
                  <Link
                    key={opt.label}
                    href={buildFilterUrl(params, { date: opt.key, page: '1' })}
                    onClick={closeDrawer}
                    className={`flex items-center h-11 rounded-lg px-3 text-sm transition-colors ${
                      isActive
                        ? 'bg-gold-100 font-semibold text-gold-700'
                        : 'text-ink-600 hover:bg-ink-100'
                    }`}
                  >
                    {isActive && <CheckIcon />}
                    {opt.label}
                  </Link>
                )
              })}
            </div>
          </section>

          {/* Category — slug-based (§A.1) */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Category</p>
            <div className="space-y-0.5">
              {[{ id: '', name: 'All categories', slug: '' }, ...categories].map(cat => {
                const isActive = cat.slug === '' ? !params.category : params.category === cat.slug
                return (
                  <Link
                    key={cat.id || 'all'}
                    href={buildFilterUrl(params, {
                      category: cat.slug || undefined,
                      page: '1',
                    })}
                    onClick={closeDrawer}
                    className={`flex items-center h-11 rounded-lg px-3 text-sm transition-colors ${
                      isActive
                        ? 'bg-gold-100 font-semibold text-gold-700'
                        : 'text-ink-600 hover:bg-ink-100'
                    }`}
                  >
                    {isActive && <CheckIcon />}
                    {cat.name}
                  </Link>
                )
              })}
            </div>
          </section>

          {/* Price — tri-state */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Price</p>
            <div className="space-y-0.5">
              {[
                { key: 'all', label: 'All prices', active: !params.free && !params.paid, overrides: { free: undefined, paid: undefined } },
                { key: 'free', label: 'Free only',  active: params.free === '1',          overrides: { free: '1', paid: undefined } },
                { key: 'paid', label: 'Paid only',  active: params.paid === '1',          overrides: { free: undefined, paid: '1' } },
              ].map(opt => (
                <Link
                  key={opt.key}
                  href={buildFilterUrl(params, { ...opt.overrides, page: '1' })}
                  onClick={closeDrawer}
                  className={`flex items-center h-11 rounded-lg px-3 text-sm transition-colors ${
                    opt.active
                      ? 'bg-gold-100 font-semibold text-gold-700'
                      : 'text-ink-600 hover:bg-ink-100'
                  }`}
                >
                  {opt.active && <CheckIcon />}
                  {opt.label}
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* Sticky "Show X results" button — spec §6.5 */}
        <div
          className="sticky bottom-0 bg-white border-t border-ink-100 px-5 py-4"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={closeDrawer}
            className="w-full rounded-lg bg-gold-500 py-3 text-sm font-semibold text-ink-900 hover:bg-gold-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
          >
            {resultsCount !== undefined
              ? `Show ${resultsCount.toLocaleString()} result${resultsCount !== 1 ? 's' : ''}`
              : 'Show results'}
          </button>
        </div>
      </div>
    </>
  )
}
