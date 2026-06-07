'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useDragScroll } from '@/hooks/use-drag-scroll'

/**
 * SnapRail primitives - Rail Control System v3.0 (Mission 3).
 *
 * Control law (derived from live competitor evidence, NOT taste -
 * docs/benchmark/rail-controls/CATALOGUE.md):
 *   - Arrows sit TOP-RIGHT, on the rail headline's horizontal line.
 *     Airbnb + Ticketmaster both anchor rail controls in the header.
 *     Header-anchored = structurally STABLE: they live in normal flow,
 *     so they never float, jump, or vanish on scroll or window resize.
 *   - Buttons are circular, solid, opaque (navy fill / gold-on-hover),
 *     >= 44px. No glassmorphism. Airbnb #F2F2F2, Humanitix #F9F9FA are
 *     both opaque; 44px is Ticketmaster-real and meets the touch floor.
 *   - Disabled at either end = muted fill + muted icon (Airbnb dims the
 *     Previous button to opacity 0.5 + grey border at a rail's start).
 *   - NO progress device. The gold standard (Airbnb) shows arrows alone;
 *     the travelling dot/bar is removed and replaced with nothing.
 *   - Arrows stay reachable on mobile (header-anchored, so zero layout
 *     cost) on top of native swipe. Desktop adds mouse drag-to-scroll.
 *
 *   [eyebrow]                                         [ < ] [ > ]
 *   [TITLE]
 *   [tile][tile][tile][tile][tile][tile] →
 *
 * Components:
 *   - <SnapRail>: full-chrome rail with built-in eyebrow + title +
 *     optional headerLink. Use this everywhere by default.
 *   - <SnapRailScroller>: drag/swipe scroller that the caller composes
 *     its own header around, with an optional `header` slot.
 *   - <RailArrows>: the canonical control pair, exported so rails that
 *     compose their own header (DragRail-based) share the exact control.
 *
 * Cards inside must be 280px wide, flex-shrink-0, snap-start, gap-4.
 */

interface HeaderLink {
  href: string
  label: string
}

interface SnapRailProps {
  eyebrow: string
  title: string
  headingId?: string
  headerLink?: HeaderLink
  railLabel: string
  containerBg?: 'canvas' | 'ink-100'
  children: ReactNode
}

interface SnapRailScrollerProps {
  railLabel: string
  containerBg?: 'canvas' | 'ink-100'
  /**
   * Optional structured header. When provided, the scroller renders
   * a full top row with the headline on the left and arrows + progress
   * top-right. When omitted, the scroller still renders compact
   * controls top-right above the scroll track so the parent's external
   * h2 sits cleanly above them.
   */
  header?: {
    eyebrow?: string
    title: string
    headingId?: string
    headerLink?: HeaderLink
  }
  children: ReactNode
}

/** Measure the card pitch (card width + gap) from the live DOM so paging and
 *  snap-boundary landing track the real layout at any viewport, not a guess. */
function measurePitch(el: HTMLElement): number {
  const first = el.firstElementChild as HTMLElement | null
  const second = first?.nextElementSibling as HTMLElement | null
  if (first && second) {
    const pitch = second.offsetLeft - first.offsetLeft
    if (pitch > 0) return pitch
  }
  if (first && first.offsetWidth > 0) return first.offsetWidth + 16
  return 296 // 280px card + 16px gap fallback
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function useScrollState() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  // The rails ship with NO scroll-snap active on first paint. scroll-snap-type
  // mandatory (and even proximity) forces Chrome to re-snap the container every
  // time a lazy card image loads and reflows it, firing browser-induced scroll
  // events that STOP Largest Contentful Paint recording before the hero raster
  // paints - this was the homepage/culture NO_LCP defect (zero LCP entries while
  // event-detail measured fine). Snap is a scroll-interaction affordance, so we
  // arm it only once the user actually grabs the rail (see cancelGlide). Until
  // then snapBaseRef stays 'none' and the hero image anchors LCP normally.
  // Do NOT move scroll-snap back into the static className - it reintroduces the
  // measurement-stopping on-load re-snap. (docs/benchmark/system-pass Unit 3.)
  const snapBaseRef = useRef<'none' | 'x mandatory'>('none')
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(true)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) {
      setCanPrev(false)
      setCanNext(false)
      return
    }
    setCanPrev(el.scrollLeft > 4)
    setCanNext(el.scrollLeft < maxScroll - 4)
  }, [])

  // Stop any in-flight glide and hand the rail back to the user's natural
  // scroll. Called the instant the user grabs the rail (pointer/touch/wheel, and
  // via scrollByCards for the arrow keys) - which is also where we ARM
  // scroll-snap for the first time. Arming it here (never on load) keeps the
  // snap engine from re-snapping during the LCP window; the set is applied
  // synchronously in the engage event so it takes effect for that same gesture.
  const cancelGlide = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const el = scrollRef.current
    if (el) {
      snapBaseRef.current = 'x mandatory'
      el.style.scrollSnapType = snapBaseRef.current
      el.style.scrollBehavior = ''
    }
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync initial scroll state from DOM after layout
    updateScrollState()
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    el.addEventListener('scroll', updateScrollState, { passive: true })
    // Hand the rail straight back to the user the instant they touch it.
    el.addEventListener('pointerdown', cancelGlide, { passive: true })
    el.addEventListener('wheel', cancelGlide, { passive: true })
    el.addEventListener('touchstart', cancelGlide, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', updateScrollState)
      el.removeEventListener('pointerdown', cancelGlide)
      el.removeEventListener('wheel', cancelGlide)
      el.removeEventListener('touchstart', cancelGlide)
      cancelGlide()
    }
  }, [updateScrollState, cancelGlide])

  // Distance-eased programmatic glide: cubic ease-out, ~400-550ms for a page of
  // cards, scaled by distance, always landing on a card snap boundary. Snap is
  // suspended for the duration so the per-frame scrollLeft writes do not fight
  // the snap engine, then restored on the boundary we land on. Touch/trackpad
  // scrolling is never touched - only the arrows and keyboard drive this.
  const scrollByCards = useCallback((direction: 1 | -1) => {
    const el = scrollRef.current
    if (!el) return
    const pitch = measurePitch(el)
    const max = el.scrollWidth - el.clientWidth
    const visible = Math.max(1, Math.floor(el.clientWidth / pitch))
    const rawTarget = el.scrollLeft + direction * visible * pitch
    // Snap the destination to the nearest card boundary, then clamp to the rail.
    const dest = Math.max(0, Math.min(max, Math.round(rawTarget / pitch) * pitch))

    if (prefersReducedMotion()) {
      cancelGlide()
      el.scrollLeft = dest
      return
    }

    const start = el.scrollLeft
    const delta = dest - start
    if (Math.abs(delta) < 1) return

    cancelGlide()
    const cards = Math.abs(delta) / pitch
    const duration = Math.min(550, Math.max(400, cards * 120))
    el.style.scrollSnapType = 'none'
    el.style.scrollBehavior = 'auto'
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
    let startTs: number | null = null
    const step = (ts: number) => {
      if (startTs === null) startTs = ts
      const t = Math.min(1, (ts - startTs) / duration)
      el.scrollLeft = start + delta * easeOutCubic(t)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        el.scrollLeft = dest
        // Restore to the armed base (cancelGlide ran above, so it is now
        // 'x mandatory'); the arrow glide lands on a card snap boundary.
        el.style.scrollSnapType = snapBaseRef.current
        el.style.scrollBehavior = ''
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }, [cancelGlide])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      scrollByCards(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      scrollByCards(-1)
    }
  }, [scrollByCards])

  return { scrollRef, canPrev, canNext, scrollByCards, onKeyDown }
}

// One canonical arrow button. Solid opaque navy circle (>= 44px) with a
// white chevron that turns gold on hover; lifts on hover, presses on active,
// and goes to a clearly-muted fill when disabled at a rail end. No glass, no
// translucency. This is the single source of the rail-control look - every
// rail renders RailArrows, never its own button markup.
const ARROW_BTN =
  'flex h-11 w-11 items-center justify-center rounded-full ' +
  'bg-[var(--color-ink-900)] text-white ' +
  'shadow-[0_2px_8px_rgba(10,22,40,0.18)] ' +
  'transition-[transform,background-color,box-shadow,color] duration-200 ease-out ' +
  'hover:-translate-y-0.5 hover:bg-[var(--color-navy-950)] hover:text-[var(--color-gold-400)] ' +
  'hover:shadow-[0_8px_18px_rgba(10,22,40,0.30)] ' +
  'active:translate-y-0 active:scale-95 active:duration-75 ' +
  'disabled:cursor-not-allowed disabled:bg-[var(--surface-2)] disabled:text-[var(--text-muted)] ' +
  'disabled:shadow-none disabled:translate-y-0 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2'

/**
 * RailArrows - the canonical rail control pair. Top-right, header-anchored,
 * visible at every viewport (reachable on mobile alongside native swipe).
 * Exported so rails that build their own header (e.g. the DragRail-based
 * recommended rail) attach the identical control instead of re-rolling it.
 */
export function RailArrows({
  canPrev,
  canNext,
  onPrev,
  onNext,
  railLabel,
}: {
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  railLabel: string
}) {
  // A rail that fits its viewport (no overflow either way) shows no controls -
  // arrows only appear when there is somewhere to scroll. Matches Airbnb, and
  // keeps short rails (and any rail on a wide screen) free of dead arrows.
  if (!canPrev && !canNext) return null
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label={`Scroll ${railLabel} left`}
        className={ARROW_BTN}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        aria-label={`Scroll ${railLabel} right`}
        className={ARROW_BTN}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}

function ScrollTrack({
  scrollRef,
  railLabel,
  onKeyDown,
  fadeFromClass,
  canPrev,
  canNext,
  children,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  railLabel: string
  onKeyDown: (e: React.KeyboardEvent) => void
  fadeFromClass: string
  canPrev: boolean
  canNext: boolean
  children: ReactNode
}) {
  return (
    <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
      {canPrev && (
        <div
          aria-hidden
          className={`pointer-events-none absolute left-0 top-0 z-10 h-full w-16 bg-gradient-to-r ${fadeFromClass} to-transparent sm:w-24`}
        />
      )}
      {canNext && (
        <div
          aria-hidden
          className={`pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l ${fadeFromClass} to-transparent sm:w-24`}
        />
      )}
      {/* No static snap-x/snap-mandatory on the scroller: scroll-snap is armed
          on first user engagement (useScrollState/cancelGlide) so the load-time
          re-snap never stops LCP. Cards keep their snap-start; it activates with
          snap. */}
      <div
        ref={scrollRef}
        role="group"
        aria-label={railLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onClickCapture={(e) => {
          const el = e.currentTarget as HTMLElement
          if (el.getAttribute('data-dragged') === 'true') {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        className="flex gap-3 overflow-x-auto scroll-smooth px-4 pb-4 pt-1 scrollbar-none focus-visible:outline-none sm:px-6 lg:px-8"
      >
        {children}
      </div>
    </div>
  )
}

export function SnapRailScroller({
  railLabel,
  containerBg = 'canvas',
  header,
  children,
}: SnapRailScrollerProps) {
  const { scrollRef, canPrev, canNext, scrollByCards, onKeyDown } = useScrollState()
  useDragScroll(scrollRef)
  const fadeFromClass = containerBg === 'canvas' ? 'from-canvas' : 'from-ink-100'

  const controls = (
    <RailArrows
      canPrev={canPrev}
      canNext={canNext}
      onPrev={() => scrollByCards(-1)}
      onNext={() => scrollByCards(1)}
      railLabel={railLabel}
    />
  )

  return (
    <div>
      {header ? (
        <div className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
          <div className="min-w-0">
            {header.eyebrow ? (
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                {header.eyebrow}
              </p>
            ) : null}
            <h2
              id={header.headingId}
              className="type-rail-heading font-headline uppercase tracking-tight text-[var(--text-primary)]"
            >
              {header.title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {header.headerLink ? (
              <Link
                href={header.headerLink.href}
                className="hidden whitespace-nowrap text-sm font-medium text-[var(--brand-accent-strong)] transition-colors hover:text-[var(--text-primary)] sm:block"
              >
                {header.headerLink.label} &rsaquo;
              </Link>
            ) : null}
            {controls}
          </div>
        </div>
      ) : (
        <div className="mb-2 flex justify-end">{controls}</div>
      )}

      <ScrollTrack
        scrollRef={scrollRef}
        railLabel={railLabel}
        onKeyDown={onKeyDown}
        fadeFromClass={fadeFromClass}
        canPrev={canPrev}
        canNext={canNext}
      >
        {children}
      </ScrollTrack>
    </div>
  )
}

export function SnapRail({
  eyebrow,
  title,
  headingId,
  headerLink,
  railLabel,
  containerBg = 'canvas',
  children,
}: SnapRailProps) {
  const { scrollRef, canPrev, canNext, scrollByCards, onKeyDown } = useScrollState()
  useDragScroll(scrollRef)
  const fadeFromClass = containerBg === 'canvas' ? 'from-canvas' : 'from-ink-100'

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-1 h-8 w-0.5 shrink-0 bg-[var(--brand-accent-strong)]" aria-hidden />
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-[var(--brand-accent-strong)]">
              {eyebrow}
            </p>
            <h2
              id={headingId}
              className="type-rail-heading font-headline uppercase tracking-tight text-[var(--text-primary)]"
            >
              {title}
            </h2>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {headerLink && (
            <Link
              href={headerLink.href}
              className="hidden whitespace-nowrap text-sm font-medium text-[var(--brand-accent-strong)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2 sm:inline"
            >
              {headerLink.label} &rsaquo;
            </Link>
          )}
          <RailArrows
            canPrev={canPrev}
            canNext={canNext}
            onPrev={() => scrollByCards(-1)}
            onNext={() => scrollByCards(1)}
            railLabel={railLabel}
          />
        </div>
      </div>

      <div className="mt-5">
        <ScrollTrack
          scrollRef={scrollRef}
          railLabel={railLabel}
          onKeyDown={onKeyDown}
          fadeFromClass={fadeFromClass}
          canPrev={canPrev}
          canNext={canNext}
        >
          {children}
        </ScrollTrack>
      </div>
    </div>
  )
}
