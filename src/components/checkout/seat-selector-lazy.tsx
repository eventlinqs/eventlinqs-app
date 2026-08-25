'use client'

/**
 * Client boundary that code-splits the seating engine AND keeps its data off
 * the document.
 *
 * ============================================================================
 * PART ONE, THE CODE SPLIT (unchanged)
 * ============================================================================
 *
 * `SeatSelector` pulls in the whole Canvas 2D seating stack: the scene graph,
 * the chair glyphs, the LOD tables, the palette sets, the key plan and the
 * best-available search. The event detail page renders it only when the event
 * is seated, but it was imported STATICALLY by `src/app/events/[slug]/page.tsx`,
 * so every event detail page downloaded it, including general admission events
 * that can never display a seat map. Measured on the gated GA event: 61KB
 * transferred across three chunks for a page showing none of it.
 *
 * The wrapper exists rather than a `next/dynamic` call in the page because the
 * Next.js documentation states that when a Server Component dynamically imports
 * a Client Component, automatic code splitting is NOT supported. `page.tsx` is
 * a Server Component, so a `next/dynamic` call made there splits nothing. That
 * trap had already caught this codebase once with VenueMap.
 *
 * ============================================================================
 * PART TWO, THE DATA (added 25 August 2026, and it is the bigger half)
 * ============================================================================
 *
 * Splitting the code did nothing for the DATA. `seats` was a prop, props cross
 * the server/client boundary by being serialised into the document, and the
 * chart's 1,200 rows therefore shipped inside the initial HTML of every seated
 * event whether the buyer ever scrolled to the chart or not.
 *
 * Measured on /events/arena-sessions-large-room-performance-test, the page the
 * Lighthouse gate picked:
 *
 *   document        571,171 bytes uncompressed  (79KB transferred)
 *   inline script   483,048 chars, 85 percent of the page
 *   LCP             4,396ms against a 4,500ms cap
 *   performance     0.78 against a 0.80 floor
 *
 * The seats now arrive from `/api/events/<id>/seats` after mount. Nothing is
 * lost visually: `SeatSelector` draws into a `<canvas>`, and a canvas server
 * renders as an empty element, so a buyer never saw a seat before hydration in
 * the first place. What changes is that the bytes describing 1,200 seats are no
 * longer in front of the hero image in the critical path.
 *
 * `ssr` stays at its default. The surrounding chrome still server renders; only
 * the seat array is deferred, behind a skeleton whose height matches the chart
 * so the settle is zero-shift (CLAUDE.md Motion: "Skeleton dimensions match the
 * real content").
 *
 * A FAILED LOAD SAYS SO. An empty chart is indistinguishable from a sold-out
 * room, and a buyer who reads it that way leaves. On error the component says
 * the plan could not be loaded and offers a retry, rather than rendering
 * nothing and letting the silence speak.
 */

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import type { SeatSelector as SeatSelectorType, SeatData } from './seat-selector'

const SeatSelector = dynamic(() => import('./seat-selector').then(m => m.SeatSelector))

type SelectorProps = ComponentProps<typeof SeatSelectorType>

/** Everything the selector needs except the seats, which this component fetches. */
type Props = Omit<SelectorProps, 'seats'>

/**
 * Matches the chart's own minimum height so the skeleton settles into the
 * canvas with no layout shift.
 */
const CHART_MIN_HEIGHT = 'min-h-[420px] sm:min-h-[520px]'

/**
 * How close the chart must come to the viewport before its seats are fetched.
 *
 * Roughly one screen. Far enough that the plan is already drawn by the time a
 * scrolling buyer reaches it; near enough that it is nowhere near the load
 * window, which is the entire point.
 */
const PREFETCH_MARGIN = '600px'

export function SeatSelectorLazy(props: Props) {
  const { eventId } = props
  const [seats, setSeats] = useState<SeatData[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  /*
   * MOVING THE BYTES WAS NOT ENOUGH, AND THE FIRST ATTEMPT MADE IT WORSE.
   *
   * Taking the seats out of the document and fetching them on mount shrank the
   * HTML from 571,171 bytes to 188,996, and the score went DOWN:
   *
   *                       document only   +eager fetch on mount
   *   performance                 0.78            0.66
   *   LCP                     4,396ms         5,845ms
   *   total byte weight        538,445         832,860
   *
   * FCP improved (1,531ms to 1,230ms), which is the document shrink working.
   * Everything else got worse, because a 332KB fetch fired the instant the
   * component mounted and competed with the hero image for a throttled mobile
   * connection. The bytes had moved out of the HTML and stayed in the load.
   *
   * A chart nobody has scrolled to does not need to load during the load. It is
   * fetched when it comes within a screen of the viewport, using the same
   * IntersectionObserver the platform's motion engine already runs on.
   */
  const [near, setNear] = useState(false)
  const hostRef = useRef<HTMLDivElement | null>(null)

  const retry = useCallback(() => {
    setFailed(false)
    setSeats(null)
    setAttempt(a => a + 1)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // No IntersectionObserver (an old browser, a headless tool that stubs it
    // out) means fetch now rather than never. A buyer who cannot see the chart
    // cannot buy a seat, so the failure mode has to be "loads early", not
    // "loads never".
    if (typeof IntersectionObserver !== 'function') {
      setNear(true)
      return
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: PREFETCH_MARGIN },
    )
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!near) return
    let cancelled = false
    const controller = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/seats`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        })
        if (!res.ok) throw new Error(`seats responded ${res.status}`)
        const body = (await res.json()) as { seats?: SeatData[] }
        if (cancelled) return
        setSeats(Array.isArray(body.seats) ? body.seats : [])
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === 'AbortError')) return
        console.error('[seat-selector] could not load the seat plan:', err)
        setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [eventId, attempt, near])

  if (failed) {
    return (
      <div
        ref={hostRef}
        className={`flex ${CHART_MIN_HEIGHT} flex-col items-center justify-center gap-3 rounded-2xl border border-ink-200 bg-white p-8 text-center`}
        role="alert"
      >
        <p className="type-body text-ink-700">
          The seating plan did not load. Your seats are still available.
        </p>
        <button
          type="button"
          onClick={retry}
          className="min-h-[44px] rounded-full bg-navy px-6 text-white transition-colors duration-200 hover:bg-navy/90"
        >
          Try again
        </button>
      </div>
    )
  }

  if (seats === null) {
    /*
     * role="status", NOT a bare div with an aria-label.
     *
     * The first version of this skeleton was `<div aria-busy aria-label="...">`
     * and it cost the Lighthouse accessibility floor on the very run that proved
     * the performance fix: 0.97 against a floor of 1.00, identical on all three
     * runs, failing `aria-prohibited-attr`. A plain div maps to role=generic,
     * and a generic role is PROHIBITED from carrying an accessible name, so the
     * label was both invalid and unannounced.
     *
     * `status` is a live region that permits a name and announces politely once,
     * which is exactly the semantic: something is loading here, it is not urgent,
     * and it will be replaced. The visible text is inside rather than only in the
     * attribute, so the announcement does not depend on the label alone.
     */
    return (
      <div
        ref={hostRef}
        role="status"
        aria-busy="true"
        className={`flex ${CHART_MIN_HEIGHT} items-center justify-center rounded-2xl border border-ink-200 bg-ink-100/60`}
      >
        <span className="sr-only">Loading the seating plan</span>
        <span aria-hidden="true" className="h-full w-full animate-pulse rounded-2xl bg-ink-100/60" />
      </div>
    )
  }

  return (
    <div ref={hostRef}>
      <SeatSelector {...props} seats={seats} />
    </div>
  )
}
