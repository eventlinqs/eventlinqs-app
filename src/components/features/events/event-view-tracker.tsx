'use client'

import { useEffect } from 'react'
import { trackEventView } from '@/lib/analytics/plausible'
import { reportClientError } from '@/lib/observability/client-error-report'
import {
  FIRST_TOUCH_COOKIE,
  FIRST_TOUCH_MAX_AGE_SECONDS,
  campaignFromQuery,
  encodeFirstTouch,
  hasAttribution,
  referringHost,
} from '@/lib/growth/visit-attribution'

interface Props {
  eventId: string
  eventTitle: string
  category: string
  venueCity: string
  priceRange: string
  /**
   * Whether this page is showing somebody a slot they cannot buy into. It
   * changes which demand row is written, because "how many people wanted this
   * and could not have it" is a number an organiser has never had.
   */
  soldOut?: boolean
}

/**
 * WHY THE DEMAND ROW IS A BEACON AND NOT A SERVER RENDER SIDE EFFECT. The event
 * page is cached, so a view recorded during the render would be recorded once
 * for the whole cache lifetime and then never again. The same reason the share
 * view beacon already exists (src/app/api/broadcast/track).
 *
 * The first-touch attribution is written HERE for a plainer reason: this is the
 * page every tracked link lands on, and it is the last moment anything knows
 * where the visitor came from. By the time the sale is recorded, on a Stripe
 * webhook, there is no browser to ask.
 */
export function EventViewTracker({
  eventId,
  eventTitle,
  category,
  venueCity,
  priceRange,
  soldOut = false,
}: Props) {
  useEffect(() => {
    trackEventView({
      event_id: eventId,
      event_title: eventTitle,
      category,
      venue_city: venueCity,
      price_range: priceRange,
    })
  }, [eventId, eventTitle, category, venueCity, priceRange])

  useEffect(() => {
    // FIRST touch, so it is written only when absent: a person brought by an
    // organiser's post who comes back later through a search was brought by the
    // post, and crediting the search would credit the wrong channel.
    try {
      const already = document.cookie.split('; ').some(c => c.startsWith(`${FIRST_TOUCH_COOKIE}=`))
      if (!already) {
        const query = new URLSearchParams(window.location.search)
        const attribution = {
          referrer: referringHost(document.referrer, window.location.host),
          ...campaignFromQuery(query),
          device: null,
        }
        if (hasAttribution(attribution)) {
          document.cookie =
            `${FIRST_TOUCH_COOKIE}=${encodeFirstTouch(attribution)}; path=/; max-age=${FIRST_TOUCH_MAX_AGE_SECONDS}; samesite=lax`
        }
      }
    } catch {
      // Attribution is a nice-to-have. It never interferes with the page.
    }

    // The demand row. Fire and forget: it must never delay or break the page,
    // and the server dedupes it per visitor per slot per day.
    const body = JSON.stringify({ eventId, action: soldOut ? 'sold_out_view' : 'page_view' })
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/ledger/demand', new Blob([body], { type: 'application/json' }))
      } else {
        void fetch('/api/ledger/demand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(error => {
          reportClientError(error, { where: 'EventViewTracker:demand-beacon-fetch', eventId })
        })
      }
    } catch (error) {
      /*
       * A beacon that cannot be sent is not a broken page, and it never becomes
       * one. It is still SAID: this row is the only record of how many people
       * wanted a slot without buying, so a beacon that has quietly stopped
       * sending looks exactly like a slot nobody looked at, and nothing else on
       * the platform would ever contradict that.
       */
      reportClientError(error, { where: 'EventViewTracker:demand-beacon', eventId })
    }
  }, [eventId, soldOut])

  return null
}
