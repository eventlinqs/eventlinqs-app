'use client'

import { useEffect } from 'react'
import { SHARE_COOKIE } from '@/lib/broadcast/share-codes'

/**
 * Share view beacon. Renders nothing. When the browser carries a share
 * attribution cookie (it arrived via a tracked /s/ link), report one 'view'
 * for this page load so the organiser's reach panel counts event-page views
 * reached through shared links. The event page is ISR-cached, so this runs
 * client side; the server dedupes per (link, visitor, day) and validates
 * the code, so this beacon can never inflate or corrupt attribution.
 *
 * A session guard keeps repeat client navigations from even hitting the
 * endpoint; the server-side dedupe is the real invariant.
 */
export function ShareViewBeacon() {
  useEffect(() => {
    try {
      const match = document.cookie
        .split('; ')
        .find((c) => c.startsWith(`${SHARE_COOKIE}=`))
      const code = match?.split('=')[1]
      if (!code) return

      const guardKey = `el-share-view:${code}`
      if (window.sessionStorage.getItem(guardKey)) return
      window.sessionStorage.setItem(guardKey, '1')

      const payload = JSON.stringify({ code, kind: 'view' })
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/broadcast/track',
          new Blob([payload], { type: 'application/json' }),
        )
      } else {
        void fetch('/api/broadcast/track', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {})
      }
    } catch {
      // Instrumentation only: never affects the page.
    }
  }, [])

  return null
}
