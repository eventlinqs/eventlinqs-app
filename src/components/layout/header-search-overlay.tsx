'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { trackEvent } from '@/lib/analytics/plausible'

interface Props {
  open: boolean
  onClose: () => void
  /** Explicit trigger ref. Preferred focus-restore target on close. */
  triggerRef?: React.RefObject<HTMLElement | null>
}

const TRIGGER_DOM_ID = 'header-search-trigger'

/**
 * Header search overlay (Batch 9.1, a11y hardened in 9.1.1).
 *
 * Full-screen modal on a solid navy surface (matches the solid State B
 * header chrome; no glassmorphism), centred input, and tabbed suggestion
 * strip. Hand-curated fallback suggestions match the locked taxonomy.
 *
 * Accessibility (Batch 9.1.1 closes the WCAG 2.2 AA gaps from 9.1):
 *   - role="dialog" + aria-modal="true" + accessible name via aria-label
 *   - Focus trap (Tab cycles within the dialog)
 *   - Escape closes; focus returns to the element that had focus when the
 *     overlay opened (WCAG 2.4.3 + 3.2.1)
 *   - Up/Down arrow keys move a roving "active suggestion" between the
 *     suggestion list items (WAI-ARIA combobox AP)
 *   - Home / End jump to first / last suggestion
 *   - Enter activates the active suggestion when one is highlighted; with
 *     no highlight, Enter submits the search query
 *   - aria-activedescendant on the search input mirrors the active suggestion id
 *   - aria-selected on the active suggestion marks the visual highlight
 *   - Body scroll lock while open
 */

type Tab = 'communities' | 'cities' | 'events' | 'organisers'

const TABS: { id: Tab; label: string; route: (q: string) => string }[] = [
  { id: 'communities',   label: 'Communities',   route: q => `/events?q=${encodeURIComponent(q)}&tab=communities` },
  { id: 'cities',     label: 'Cities',     route: q => `/events?q=${encodeURIComponent(q)}&tab=cities` },
  { id: 'events',     label: 'Events',     route: q => `/events?q=${encodeURIComponent(q)}` },
  { id: 'organisers', label: 'Organisers', route: q => `/events?q=${encodeURIComponent(q)}&tab=organisers` },
]

const FALLBACKS: Record<Tab, { label: string; href: string }[]> = {
  communities: [
    { label: 'First Nations',  href: '/community/aboriginal-torres-strait-islander' },
    { label: 'African',        href: '/community/african' },
    { label: 'Indian',         href: '/community/indian' },
    { label: 'Caribbean',      href: '/community/caribbean' },
    { label: 'Latin American', href: '/community/latin-american' },
  ],
  cities: [
    { label: 'Sydney',     href: '/city/sydney' },
    { label: 'Melbourne',  href: '/city/melbourne' },
    { label: 'Brisbane',   href: '/city/brisbane' },
    { label: 'Perth',      href: '/city/perth' },
    { label: 'Adelaide',   href: '/city/adelaide' },
  ],
  events: [
    { label: 'This weekend',         href: '/events?date=weekend' },
    { label: 'Tonight',              href: '/events?date=today' },
    { label: 'Next 7 days',          href: '/events?date=7d' },
    { label: 'Free events',          href: '/events?free=1' },
    { label: 'Trending now',         href: '/events?sort=trending' },
  ],
  organisers: [
    { label: 'Owambe Sydney',                href: '/organisers/owambe-sydney' },
    { label: 'Bollywood Nights Sydney',      href: '/organisers/bollywood-nights-sydney' },
    { label: 'Caribbean Carnival Melbourne', href: '/organisers/caribbean-carnival-melbourne' },
    { label: 'Afrobeats Melbourne',          href: '/organisers/afrobeats-melbourne' },
    { label: 'Gospel Brisbane',              href: '/organisers/gospel-brisbane' },
  ],
}

const SUGGESTION_ID_PREFIX = 'header-search-suggestion-'

export function HeaderSearchOverlay({ open, onClose, triggerRef }: Props) {
  const [tab, setTab] = useState<Tab>('events')
  const [query, setQuery] = useState('')
  /** Index into the current tab's suggestion list. -1 = no highlight (input only). */
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  /** Element to restore focus to on close. Resolved at open time via the
   *  3-level fallback chain (Batch 9.2.1):
   *    1. explicit triggerRef from props (preferred)
   *    2. document.activeElement at open time
   *    3. document.getElementById('header-search-trigger') as last resort */
  const focusRestoreTarget = useRef<HTMLElement | null>(null)
  /** Suggestion link refs for programmatic activation on Enter. */
  const suggestionRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const router = useRouter()

  const suggestions = useMemo(() => FALLBACKS[tab], [tab])

  // Body scroll lock + analytics + focus capture on open. Focus restore on close.
  useEffect(() => {
    if (!open) return
    // 3-level fallback chain for focus-restore target.
    if (triggerRef?.current) {
      // Level 1: explicit ref from the trigger component.
      focusRestoreTarget.current = triggerRef.current
    } else if (document.activeElement instanceof HTMLElement) {
      // Level 2: whatever had focus at open time (covers '/' shortcut
      // from a non-trigger surface).
      focusRestoreTarget.current = document.activeElement
    } else {
      // Level 3: ID-based fallback to the search button. Used when the
      // overlay is opened programmatically and document.activeElement is
      // body or null.
      focusRestoreTarget.current = document.getElementById(TRIGGER_DOM_ID)
    }
    trackEvent('search_overlay_opened')
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setTimeout(() => inputRef.current?.focus(), 30)
    return () => {
      document.body.style.overflow = prev
      // Defer focus restore until after the dialog has unmounted so React
      // does not race the focus call against the dialog DOM teardown.
      const target = focusRestoreTarget.current
      if (target && typeof target.focus === 'function') {
        // requestAnimationFrame defers across the next paint, ensuring
        // the dialog DOM teardown completes before the trigger receives
        // focus.
        requestAnimationFrame(() => target.focus())
      }
      focusRestoreTarget.current = null
    }
  }, [open, triggerRef])

  // Escape closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Focus trap (Tab/Shift+Tab cycles within the dialog).
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(el => el.offsetParent !== null)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // Roving keyboard navigation on the input. ArrowUp/Down move the active
  // suggestion; Home/End jump; Enter on highlighted activates the link;
  // Enter without a highlight submits the query.
  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const len = suggestions.length
    if (len === 0) return

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        setActiveIndex(i => (i + 1) % len)
        return
      }
      case 'ArrowUp': {
        e.preventDefault()
        setActiveIndex(i => (i <= 0 ? len - 1 : i - 1))
        return
      }
      case 'Home': {
        e.preventDefault()
        setActiveIndex(0)
        return
      }
      case 'End': {
        e.preventDefault()
        setActiveIndex(len - 1)
        return
      }
      case 'Enter': {
        if (activeIndex >= 0 && activeIndex < len) {
          e.preventDefault()
          const link = suggestionRefs.current[activeIndex]
          if (link) {
            link.click()
          }
        }
        // No active suggestion: let the form's onSubmit handler run.
        return
      }
      case 'Escape': {
        // Handled by global listener; no-op here.
        return
      }
      default:
        return
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!query.trim()) return
    trackEvent('search_submitted', { tab, q_len: query.trim().length })
    const target = TABS.find(t => t.id === tab)?.route(query.trim()) ?? `/events?q=${encodeURIComponent(query.trim())}`
    router.push(target)
    onClose()
  }

  if (!open) return null

  const activeId =
    activeIndex >= 0 && activeIndex < suggestions.length
      ? `${SUGGESTION_ID_PREFIX}${activeIndex}`
      : undefined

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search EventLinqs"
      ref={dialogRef}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--color-ink-900)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-8 sm:py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
          Search EventLinqs
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="rounded-full p-2 text-white/85 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-10 sm:px-8 sm:py-14">
        <form onSubmit={handleSubmit}>
          <label htmlFor="header-search-input" className="sr-only">
            Search
          </label>
          <div className="flex items-center gap-3 rounded-full bg-white/10 px-5 py-3 ring-1 ring-white/15 focus-within:ring-2 focus-within:ring-[var(--brand-accent)]">
            <Search className="h-6 w-6 text-white/70" aria-hidden />
            <input
              id="header-search-input"
              name="search"
              ref={inputRef}
              type="search"
              role="combobox"
              aria-controls="header-search-suggestions"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="What are you in the mood for?"
              className="h-12 w-full bg-transparent text-lg font-medium text-white placeholder:text-white/55 focus:outline-none sm:h-14 sm:text-2xl"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </form>

        <div role="tablist" aria-label="Search categories" className="mt-8 flex gap-2 overflow-x-auto scrollbar-none">
          {TABS.map(t => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTab(t.id)
                  setActiveIndex(-1)
                }}
                className={[
                  'inline-flex h-10 shrink-0 items-center rounded-full px-5 text-sm font-semibold transition',
                  active
                    ? 'bg-[var(--brand-accent)] text-[var(--color-navy-950)]'
                    : 'bg-white/10 text-white/85 hover:bg-white/15',
                ].join(' ')}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="mt-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
            Suggestions
          </p>
          <ul
            id="header-search-suggestions"
            role="listbox"
            aria-label={`${TABS.find(t => t.id === tab)?.label ?? 'Search'} suggestions`}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {suggestions.map((s, idx) => {
              const isActive = idx === activeIndex
              return (
                <li key={s.href} role="presentation">
                  <Link
                    id={`${SUGGESTION_ID_PREFIX}${idx}`}
                    role="option"
                    aria-selected={isActive}
                    tabIndex={-1}
                    ref={el => { suggestionRefs.current[idx] = el }}
                    href={s.href}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => {
                      trackEvent('search_suggestion_clicked', { tab, label: s.label })
                      onClose()
                    }}
                    className={[
                      'flex h-12 items-center gap-3 rounded-xl border px-4 text-sm font-semibold text-white transition',
                      isActive
                        ? 'border-[var(--brand-accent)] bg-white/10'
                        : 'border-white/10 bg-white/5 hover:border-[var(--brand-accent)]/50 hover:bg-white/10',
                    ].join(' ')}
                  >
                    <Search className={isActive ? 'h-4 w-4 text-[var(--brand-accent)]' : 'h-4 w-4 text-white/55'} aria-hidden />
                    {s.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
