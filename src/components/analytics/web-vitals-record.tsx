'use client'

import { useEffect } from 'react'
import { useReportWebVitals } from 'next/web-vitals'
import { vitalsBody, type ReportedMetric, type VitalsBody } from '@/lib/analytics/vitals-record'

/**
 * THE REAL VISITOR RECORD'S BROWSER HALF (Lawal's law of 10 November 2026, 13:30, internal only; the PM's ruling of
 * 15:05 (2); WINDOW 5A).
 *
 * Next.js's own web vitals hook (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-report-web-vitals.md)
 * hands each measure to `report`: LCP, INP, CLS, and since 13 November TTFB and FCP, as numbers only (the kind of page,
 * phone or desktop, the value). No cookie, no identifier, nothing stored on the device. It renders nothing.
 *
 * ONE BEACON PER PAGE VIEW (13 November 2026; C:\dev\EVIDENCE\EL-12NOV\speed\PLAN-vitals-breakdown.md): the measures are
 * kept, one per kind (a later value of the same kind replaces the earlier), and sent together to the platform's own
 * route when the page is hidden (visibilitychange to hidden, and pagehide), the moment the web vitals library itself
 * finalises CLS and INP. Three beacons a view became one, so five measures cost fewer calls than three did.
 *
 * It is mounted inside the deferred measurement tree (measurement-stack.tsx, fetched after hydration by
 * measurement-boot.tsx), so it adds nothing to any page's first load, and the hook's observers are buffered, so a measure
 * taken before the chunk arrived is still reported. The callback is a module function so its reference never changes
 * between renders (the hook's own documentation: a changed reference reports the same data twice).
 */
const pending = new Map<string, VitalsBody>()

function report(metric: ReportedMetric): void {
  const body = vitalsBody(metric, window.location.pathname, window.matchMedia('(max-width: 767px)').matches)
  if (body) pending.set(body.m, body)
}

/** Sends what the page view has measured, once, and forgets it. Exported for its test. */
export function flushVitals(): void {
  if (pending.size === 0 || typeof navigator.sendBeacon !== 'function') return
  const batch = [...pending.values()]
  pending.clear()
  navigator.sendBeacon('/api/vitals', new Blob([JSON.stringify(batch)], { type: 'application/json' }))
}

function onHidden(): void {
  if (document.visibilityState === 'hidden') flushVitals()
}

export function WebVitalsRecord(): null {
  useReportWebVitals(report)
  // Registered after the hook's own listeners (effects run in order), so a CLS or INP the library finalises on the same
  // hide is already kept when this sends; pagehide catches a page leaving without a visibility change.
  useEffect(() => {
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', flushVitals)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', flushVitals)
    }
  }, [])
  return null
}

/** For tests only: the measures kept so far. */
export function pendingVitalsForTest(): VitalsBody[] {
  return [...pending.values()]
}

/** For tests only: the callback the hook is given. */
export const reportForTest = report
