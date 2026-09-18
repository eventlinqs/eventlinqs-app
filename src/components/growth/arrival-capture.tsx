'use client'

import { useEffect } from 'react'
import {
  ARRIVAL_COOKIE,
  ARRIVAL_MAX_AGE_SECONDS,
  arrivalIsEmpty,
  encodeArrival,
  readArrival,
} from '@/lib/growth/arrival'

/**
 * CAPTURES HOW THIS PERSON ARRIVED, once, on whatever page they land on first.
 *
 * Close-out AN1. Renders nothing. It sits in the root layout because the
 * question it answers is "which surface brought this ACCOUNT", and an organiser
 * can land anywhere: the homepage, /organisers, a city page, an event page, or
 * one of PL1's share links. Mounting it on the event page alone, which is where
 * the SALE attribution lives, would answer the question for exactly the
 * visitors who were already going to be counted.
 *
 * FIRST TOUCH: written only when the cookie is absent, so a later visit can
 * never overwrite the link that actually earned the account.
 *
 * IT WRITES NOTHING WHEN THERE IS NOTHING TO SAY. An organic arrival with no
 * parameters and no referrer sets no cookie at all, rather than a cookie that
 * records an absence. That keeps the cookie count honest against the cookie
 * policy, which lists every cookie the platform sets.
 *
 * NOTHING IDENTIFYING CROSSES INTO IT: the referrer is reduced to a host and
 * the URL to a path before anything is stored (src/lib/growth/arrival.ts).
 */
export function ArrivalCapture() {
  useEffect(() => {
    try {
      const already = document.cookie.split('; ').some(c => c.startsWith(`${ARRIVAL_COOKIE}=`))
      if (already) return
      const arrival = readArrival({
        url: window.location.href,
        referrer: document.referrer,
        ownHost: window.location.host,
      })
      if (arrivalIsEmpty(arrival)) return
      document.cookie = `${ARRIVAL_COOKIE}=${encodeArrival(arrival)}; path=/; max-age=${ARRIVAL_MAX_AGE_SECONDS}; samesite=lax`
    } catch {
      // Attribution is a nice-to-have and never interferes with the page. There
      // is nothing to report: a browser that refuses a cookie has told us its
      // answer, and it is a legitimate one.
    }
  }, [])

  return null
}
