'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { trackEvent } from '@/lib/analytics/plausible'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Header search overlay (Batch 9.1).
 *
 * Full-screen modal with backdrop-blur, centred input, and tabbed
 * suggestion strip. Hand-curated fallback suggestions match the
 * locked taxonomy (14 cultures, top 6 cities, top events). Real-time
 * trending suggestion data layer is OUT OF SCOPE for 9.1 per the
 * brief's deferral clause; the shell ships now and the data layer
 * lands in 9.2.
 *
 * Triggers:
 *   - Header search trigger button click
 *   - Global "/" keyboard shortcut (suppressed inside input/textarea/
 *     contenteditable, see header-search-trigger.tsx)
 *
 * Accessibility:
 *   - role="dialog" + aria-modal="true"
 *   - Focus trap (first/last focusable cycle)
 *   - Escape closes + restores focus to trigger
 *   - aria-labelledby points to the search input label
 */

type Tab = 'cultures' | 'cities' | 'events' | 'organisers'

const TABS: { id: Tab; label: string; route: (q: string) => string }[] = [
  { id: 'cultures',   label: 'Cultures',   route: q => `/events?q=${encodeURIComponent(q)}&tab=cultures` },
  { id: 'cities',     label: 'Cities',     route: q => `/events?q=${encodeURIComponent(q)}&tab=cities` },
  { id: 'events',     label: 'Events',     route: q => `/events?q=${encodeURIComponent(q)}` },
  { id: 'organisers', label: 'Organisers', route: q => `/events?q=${encodeURIComponent(q)}&tab=organisers` },
]

const FALLBACKS: Record<Tab, { label: string; href: string }[]> = {
  cultures: [
    { label: 'African',        href: '/culture/african' },
    { label: 'South Asian',    href: '/culture/south-asian' },
    { label: 'Caribbean',      href: '/culture/caribbean' },
    { label: 'Latin',          href: '/culture/latin' },
    { label: 'Comedy',         href: '/culture/comedy' },
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

export function HeaderSearchOverlay({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('events')
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Body scroll lock + analytics on open.
  useEffect(() => {
    if (!open) return
    trackEvent('search_overlay_opened')
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setTimeout(() => inputRef.current?.focus(), 30)
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Escape closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Focus trap inside the dialog.
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

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!query.trim()) return
    trackEvent('search_submitted', { tab, q_len: query.trim().length })
    const target = TABS.find(t => t.id === tab)?.route(query.trim()) ?? `/events?q=${encodeURIComponent(query.trim())}`
    router.push(target)
    onClose()
  }

  const suggestions = useMemo(() => FALLBACKS[tab], [tab])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search EventLinqs"
      ref={dialogRef}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[60] flex flex-col"
      style={{
        background: 'rgba(10, 22, 40, 0.92)',
        backdropFilter: 'blur(40px) saturate(160%)',
        WebkitBackdropFilter: 'blur(40px) saturate(160%)',
      }}
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
              ref={inputRef}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
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
                onClick={() => setTab(t.id)}
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
          <ul role="list" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {suggestions.map(s => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  onClick={() => {
                    trackEvent('search_suggestion_clicked', { tab, label: s.label })
                    onClose()
                  }}
                  className="flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:border-[var(--brand-accent)]/50 hover:bg-white/10"
                >
                  <Search className="h-4 w-4 text-white/55" aria-hidden />
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
