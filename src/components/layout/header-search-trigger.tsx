'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'

/**
 * THE OVERLAY IS FETCHED ON INTENT, NOT ON EVERY PAGE LOAD.
 *
 * `HeaderSearchTrigger` renders in the site header, the site header renders in
 * the root layout, and the root layout renders on every route. A static import
 * of the overlay therefore put the whole search surface into the platform-wide
 * client shell: the query state machine, the suggestion list, the keyboard
 * navigation and the analytics calls, on /offline, on /careers, on
 * /unsubscribe/[token] and on every other page where nobody will ever press it.
 *
 * MEASURED, on the build of 17 September 2026, with
 * `node scripts/perf/first-load-budget.mjs`. The floor route /_not-found paid
 * 156.9 KB gzip of first-load JavaScript, of which 130.4 KB is the React and
 * Next.js runtime that no application change can touch. The remaining 26.5 KB
 * is what this platform puts on every route, and 9.3 KB of it is one chunk
 * carrying the header, the footer accordion, the location picker and this
 * overlay.
 *
 * WHY next/dynamic AND NOT A CONDITIONAL RENDER. The overlay already returns
 * null while closed, so a conditional render saves no bytes at all: a static
 * import is resolved by the bundler, not by the branch. Only a dynamic import
 * moves the module into a chunk of its own.
 *
 * WHY IT IS ARMED ON INTENT AND NOT ON MOUNT. Arming on mount would move the
 * bytes out of first-load and then fetch them anyway during the load, which is
 * a sequencing change dressed up as a reduction (close-out C8B.4: byte weight
 * and sequencing are judged together). A visitor who never reaches for search
 * never pays. A visitor who does reach for it shows intent before the click
 * lands: the pointer enters the button, or focus arrives by keyboard, and the
 * chunk is requested then.
 *
 * WHAT INTENT COSTS ON A TOUCH SCREEN, stated rather than glossed.
 * `pointerenter` fires on touch immediately before `pointerdown`, so a tap gets
 * a few milliseconds of head start rather than a real prefetch. `touchstart` is
 * listened for too, and the overlay's own mount is what the user waits on. The
 * trigger button itself is untouched and paints identically in both cases.
 *
 * THE "/" SHORTCUT arms and opens in the same action, so a keyboard user who
 * never hovers anything still reaches the overlay.
 *
 * ONCE ARMED, IT STAYS ARMED. `armed` is never set back to false, so every
 * open after the first is synchronous and the overlay's own close animation
 * and focus restore behave exactly as they did when the import was static.
 */
const HeaderSearchOverlay = dynamic(() =>
  import('./header-search-overlay').then(m => m.HeaderSearchOverlay),
)

interface Props {
  /** Visual variant - the State B compact desktop pill, or the mobile
   *  icon-only trigger that lives in the header always. */
  variant: 'desktop-pill' | 'mobile-icon'
  className?: string
}

/**
 * Both variants render on every page (the desktop pill is hidden until State B,
 * the mobile icon is hidden above the breakpoint), so a single shared id put a
 * DUPLICATE id in the document on every page of the platform, and made the
 * overlay's level-3 focus-restore fallback resolve to whichever came first in
 * the DOM rather than to the one the user actually pressed. One id per variant.
 */
const TRIGGER_DOM_ID_PREFIX = 'header-search-trigger'
const triggerDomId = (variant: Props['variant']) =>
  `${TRIGGER_DOM_ID_PREFIX}-${variant === 'desktop-pill' ? 'desktop' : 'mobile'}`

/**
 * HeaderSearchTrigger - opens the global search overlay (Batch 9.1).
 *
 * Two visual variants:
 *
 *   - 'desktop-pill': 360px wide compact pill with placeholder
 *      "What are you in the mood for?". Visible only when the header
 *      is in State B (controlled by the parent header).
 *   - 'mobile-icon': icon-only 44x44 button. Always visible on mobile
 *      since the mobile header doesn't expose State A inline search.
 *
 * Also wires the global "/" keyboard shortcut: pressing "/" anywhere
 * on the page (except inside an input, textarea, or contenteditable)
 * opens the overlay.
 */
export function HeaderSearchTrigger({ variant, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  /**
   * Request the overlay chunk. Safe to call repeatedly: React bails out of a
   * state update that does not change the value, and the module registry
   * resolves an already-loaded import from its cache.
   */
  const arm = useCallback(() => setArmed(true), [])

  const openOverlay = useCallback(() => {
    setArmed(true)
    setOpen(true)
  }, [])

  useEffect(() => {
    function isEditable(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (el.isContentEditable) return true
      return false
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target)) {
        e.preventDefault()
        setArmed(true)
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** The intent handlers, one object so the two variants cannot drift apart. */
  const intentProps = {
    onPointerEnter: arm,
    onTouchStart: arm,
    onFocus: arm,
  }

  const overlay = armed ? (
    <HeaderSearchOverlay open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} />
  ) : null

  if (variant === 'desktop-pill') {
    return (
      <>
        <button
          ref={triggerRef}
          id={triggerDomId(variant)}
          type="button"
          onClick={openOverlay}
          {...intentProps}
          className={[
            // w-full up to a 360px cap, not a fixed 360 (close-out UX6). A fixed width
            // cannot shrink, and at xl the row has 316px to spare, not 360, so a
            // fixed pill would push the whole header 44px past the right edge at
            // exactly 1280. The cap keeps it identical at 1440 and wider.
            'group inline-flex h-11 w-full max-w-[360px] min-w-0 items-center gap-3 rounded-full border border-white/15 bg-white/10 px-5 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/15',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]',
            className,
          ].join(' ')}
          aria-label="Open search"
        >
          <Search className="h-4 w-4 text-white/65 group-hover:text-white" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">What are you in the mood for?</span>
          {/* font-display: the kbd element inherits the mono stack from the
              preflight, which put a third family on the page for one glyph.
              text-xs and rounded-lg keep it on the type scale and radius set. */}
          <kbd className="hidden h-6 items-center rounded-lg border border-white/20 px-1.5 font-display text-xs font-medium text-white/60 lg:inline-flex">
            /
          </kbd>
        </button>
        {overlay}
      </>
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerDomId(variant)}
        type="button"
        onClick={openOverlay}
        {...intentProps}
        aria-label="Open search"
        className={[
          'flex h-11 w-11 items-center justify-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2',
          className,
        ].join(' ')}
      >
        <Search className="h-5 w-5" aria-hidden />
      </button>
      {overlay}
    </>
  )
}
