'use client'

import { useEffect, useRef } from 'react'
import { trackFunnel } from '@/lib/analytics/funnel'
import { useConsent } from './consent-provider'

/**
 * THE FIRST STEP OF THE FUNNEL: somebody arrived.
 *
 * Close-out AN1. Fired ONCE per page load, and only after the person has agreed
 * to analytics, because before that there is nothing loaded to receive it.
 *
 * WHY IT IS NOT JUST THE PROVIDER'S OWN PAGE VIEW. PostHog captures page views
 * by itself, and those answer "how much traffic". `landed` is the first step of
 * a NAMED funnel whose other four steps are named the same way, so the owner
 * can read the drop from one to the next without building a query that knows
 * which of five event names means the top. A funnel whose first step is called
 * something else is a funnel nobody assembles.
 *
 * IT WAITS FOR THE DECISION. `loading` is true for the first tick and the
 * effect does nothing while it is, so a refused visitor never fires it and an
 * accepting one fires it once the scripts exist to hear it.
 */
export function FunnelLanded() {
  const { decision, loading } = useConsent()
  const fired = useRef(false)

  useEffect(() => {
    if (loading || fired.current) return
    if (!decision.analytics) return
    fired.current = true
    trackFunnel('landed', { path: window.location.pathname })
  }, [loading, decision.analytics])

  return null
}
