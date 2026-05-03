'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { loadMoreEventCards } from '@/app/events/actions'
import type { EventsSearchParams } from '@/lib/events/search-params'
import { EventCard, type EventCardData } from './event-card'
import { EventCardSkeleton } from './event-card-skeleton'

type Props = {
  initialCards: EventCardData[]
  params: EventsSearchParams
  startPage: number
  totalPages: number
  /**
   * When true, the first card preloads with fetchpriority=high so the
   * grid's first image is the LCP candidate. Pages that render a rail
   * above the grid pass false: priority preloads on the grid then
   * compete with the rail's LCP candidate for bandwidth and inflate
   * Lantern's simulated LCP.
   */
  firstCardEager?: boolean
}

/**
 * Infinite-scroll grid. Hydrates with the server-rendered first page
 * (initialCards for whatever ?page=N the user landed on), then appends
 * subsequent pages as an IntersectionObserver sentinel enters the
 * viewport. Numbered pagination below the grid remains the canonical
 * server-rendered route for SEO and crawler deep links.
 */
export function EventsGridClient({
  initialCards,
  params,
  startPage,
  totalPages,
  firstCardEager = true,
}: Props) {
  const [cards, setCards] = useState<EventCardData[]>(initialCards)
  const [currentPage, setCurrentPage] = useState(startPage)
  const [hasMore, setHasMore] = useState(startPage < totalPages)
  const [isPending, startTransition] = useTransition()
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)

  // Reset when filters (params) or startPage change - the server just
  // rendered a different initial slice, so we throw away the appended tail.
  useEffect(() => {
    setCards(initialCards)
    setCurrentPage(startPage)
    setHasMore(startPage < totalPages)
  }, [initialCards, startPage, totalPages])

  const loadNext = useCallback(() => {
    if (loadingRef.current || !hasMore) return
    loadingRef.current = true
    const next = currentPage + 1
    startTransition(async () => {
      try {
        const res = await loadMoreEventCards(params, next)
        setCards(prev => [...prev, ...res.cards])
        setCurrentPage(res.page)
        setHasMore(res.hasMore)
      } finally {
        loadingRef.current = false
      }
    })
  }, [currentPage, hasMore, params])

  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) loadNext()
      },
      { rootMargin: '400px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadNext])

  return (
    <>
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card, i) => (
          <li key={card.id}>
            <EventCard event={card} priority={firstCardEager && i === 0} />
          </li>
        ))}
        {isPending
          ? Array.from({ length: 4 }).map((_, i) => (
              <li key={`skeleton-${i}`} aria-hidden="true">
                <EventCardSkeleton />
              </li>
            ))
          : null}
      </ul>

      {hasMore ? (
        <div
          ref={sentinelRef}
          aria-hidden="true"
          className="mt-8 h-4"
          data-infinite-scroll-sentinel
        />
      ) : null}
    </>
  )
}
