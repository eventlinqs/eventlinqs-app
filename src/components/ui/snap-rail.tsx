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
 * SnapRail primitives for horizontal scroll-snap strips.
 *
 * Structure:
 *   - <SnapRail>: full-chrome variant with section eyebrow + title + link + arrows + progress + scroller
 *   - <SnapRailScroller>: bare scroll container used where the outer section already owns the header
 *     (e.g. Cultural Picks tabs). Still renders compact arrow controls + progress.
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
  /** When true, the arrows+progress row sits above the scroller (compact layout). */
  controlsOnTop?: boolean
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
        className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 transition-colors hover:border-gold-400 hover:text-gold-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-200 disabled:hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
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
        className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 transition-colors hover:border-gold-400 hover:text-gold-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-200 disabled:hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
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
    <div className="h-0.5 w-full max-w-[240px] rounded-full bg-gold-500/15" aria-hidden>
      <div
        className="h-full rounded-full bg-gold-500 transition-[width] duration-200 ease-out"
        style={{ width: `${Math.max(8, progress * 100)}%` }}
      />
    </div>
  )
}

export function SnapRailScroller({
  railLabel,
  containerBg = 'canvas',
  controlsOnTop = false,
  children,
}: SnapRailScrollerProps) {
  const { scrollRef, progress, canPrev, canNext, scrollByCards, onKeyDown } = useScrollState()
  useDragScroll(scrollRef)
  const fadeFromClass = containerBg === 'canvas' ? 'from-canvas' : 'from-ink-100'

  const controlsRow = (
    <div className="flex items-center justify-between gap-4">
      <ProgressBar progress={progress} />
      <ArrowButtons
        canPrev={canPrev}
        canNext={canNext}
        onPrev={() => scrollByCards(-1)}
        onNext={() => scrollByCards(1)}
        railLabel={railLabel}
      />
    </div>
  )

  return (
    <div>
      {controlsOnTop && <div className="mb-4">{controlsRow}</div>}
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
      {!controlsOnTop && <div className="mt-4">{controlsRow}</div>}
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
        <div className="flex items-start gap-3">
          <div className="mt-1 h-8 w-0.5 shrink-0 bg-gold-500" aria-hidden />
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-700">
              {eyebrow}
            </p>
            <h2
              id={headingId}
              className="font-display text-2xl font-bold text-ink-900 sm:text-3xl"
            >
              {title}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {headerLink && (
            <Link
              href={headerLink.href}
              className="text-sm font-medium text-gold-700 whitespace-nowrap transition-colors hover:text-gold-600"
            >
              {headerLink.label} &rsaquo;
            </Link>
          )}
          <ArrowButtons
            canPrev={canPrev}
            canNext={canNext}
            onPrev={() => scrollByCards(-1)}
            onNext={() => scrollByCards(1)}
            railLabel={railLabel}
          />
        </div>
      </div>

      <div className="mt-5">
        <ProgressBar progress={progress} />
      </div>

      <div className="relative mt-5 -mx-4 sm:-mx-6 lg:-mx-8">
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
    </div>
  )
}
