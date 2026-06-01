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
 * SnapRail primitives - Rail Standard v2.0 (Batch 6.6).
 *
 * Layout contract: arrows + progress sit TOP-RIGHT, on the same
 * horizontal line as the rail headline. Industry standard: every
 * major platform (Ticketmaster, Airbnb, Eventbrite, Netflix, Spotify,
 * Amazon Prime Video) places horizontal-rail controls at top-right.
 *
 *   [eyebrow]                                    [< >] [progress ──]
 *   [TITLE]
 *   [tile][tile][tile][tile][tile][tile] →
 *
 * Components:
 *   - <SnapRail>: full-chrome rail with built-in eyebrow + title +
 *     optional headerLink. Use this everywhere by default.
 *   - <SnapRailScroller>: drag/swipe scroller that the caller
 *     composes its own header around. Now also exposes an optional
 *     `header` slot so callers can hand in eyebrow/title and get the
 *     standard top-right controls without writing the layout
 *     themselves. Used inside parent sections that need custom header
 *     content (tabs, dual headlines, etc).
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

function useScrollState() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(true)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) {
      setProgress(0)
      setCanPrev(false)
      setCanNext(false)
      return
    }
    const pct = Math.max(0, Math.min(1, el.scrollLeft / maxScroll))
    setProgress(pct)
    setCanPrev(el.scrollLeft > 4)
    setCanNext(el.scrollLeft < maxScroll - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync initial scroll state from DOM after layout
    updateScrollState()
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    el.addEventListener('scroll', updateScrollState, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', updateScrollState)
    }
  }, [updateScrollState])

  const scrollByCards = useCallback((direction: 1 | -1) => {
    const el = scrollRef.current
    if (!el) return
    const step = 296 // 280px card + 16px gap
    el.scrollBy({ left: direction * step * 1.5, behavior: 'smooth' })
  }, [])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      scrollByCards(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      scrollByCards(-1)
    }
  }, [scrollByCards])

  return { scrollRef, progress, canPrev, canNext, scrollByCards, onKeyDown }
}

function ArrowButtons({
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
  return (
    <div className="hidden items-center gap-2 md:flex">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label={`Scroll ${railLabel} left`}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--surface-2)] bg-[var(--surface-0)] text-[var(--text-primary)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent-strong)] hover:text-[var(--brand-accent-strong)] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:border-[var(--surface-2)] disabled:hover:text-[var(--text-primary)] disabled:hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        aria-label={`Scroll ${railLabel} right`}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--surface-2)] bg-[var(--surface-0)] text-[var(--text-primary)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent-strong)] hover:text-[var(--brand-accent-strong)] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:border-[var(--surface-2)] disabled:hover:text-[var(--text-primary)] disabled:hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="hidden h-0.5 w-32 rounded-full bg-[var(--surface-2)] md:block lg:w-40" aria-hidden>
      <div
        className="h-full rounded-full bg-[var(--brand-accent-strong)] transition-[width] duration-200 ease-out"
        style={{ width: `${Math.max(8, progress * 100)}%` }}
      />
    </div>
  )
}

/**
 * Compact controls cluster (progress + arrows) for the top-right of a
 * rail header. Hidden on mobile (md:flex) since arrows are not the
 * primary scroll mechanism on touch devices - swipe is. Progress sits
 * to the LEFT of the arrows, fading to track as the rail scrolls.
 */
function HeaderControls({
  progress,
  canPrev,
  canNext,
  onPrev,
  onNext,
  railLabel,
}: {
  progress: number
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  railLabel: string
}) {
  return (
    <div className="hidden items-center gap-3 md:flex">
      <ProgressBar progress={progress} />
      <ArrowButtons
        canPrev={canPrev}
        canNext={canNext}
        onPrev={onPrev}
        onNext={onNext}
        railLabel={railLabel}
      />
    </div>
  )
}

function ScrollTrack({
  scrollRef,
  railLabel,
  onKeyDown,
  fadeFromClass,
  canNext,
  children,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  railLabel: string
  onKeyDown: (e: React.KeyboardEvent) => void
  fadeFromClass: string
  canNext: boolean
  children: ReactNode
}) {
  return (
    <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
      {canNext && (
        <div
          aria-hidden
          className={`pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l ${fadeFromClass} to-transparent sm:w-24`}
        />
      )}
      <div
        ref={scrollRef}
        role="region"
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
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-4 pt-1 scrollbar-none focus-visible:outline-none sm:px-6 lg:px-8"
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
  const { scrollRef, progress, canPrev, canNext, scrollByCards, onKeyDown } = useScrollState()
  useDragScroll(scrollRef)
  const fadeFromClass = containerBg === 'canvas' ? 'from-canvas' : 'from-ink-100'

  const controls = (
    <HeaderControls
      progress={progress}
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
              className="type-h2 font-headline uppercase tracking-tight text-[var(--text-primary)]"
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
  const { scrollRef, progress, canPrev, canNext, scrollByCards, onKeyDown } = useScrollState()
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
              className="type-h2 font-headline uppercase tracking-tight text-[var(--text-primary)]"
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
          <HeaderControls
            progress={progress}
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
          canNext={canNext}
        >
          {children}
        </ScrollTrack>
      </div>
    </div>
  )
}
