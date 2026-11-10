'use client'

import { useReportWebVitals } from 'next/web-vitals'
import { vitalsBody, type ReportedMetric } from '@/lib/analytics/vitals-record'

/**
 * THE REAL VISITOR RECORD'S BROWSER HALF (Lawal's law of 10 November 2026, 13:30, internal only; the PM's ruling of
 * 15:05 (2); WINDOW 5A).
 *
 * Next.js's own web vitals hook (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-report-web-vitals.md)
 * hands each measure to `report`, which sends LCP, INP and CLS as numbers only to the platform's own route: the kind of
 * page, phone or desktop, the value. No cookie, no identifier, nothing stored on the device. It renders nothing.
 *
 * It is mounted inside the deferred measurement tree (measurement-stack.tsx, fetched after hydration by
 * measurement-boot.tsx), so it adds nothing to any page's first load, and the hook's observers are buffered, so a measure
 * taken before the chunk arrived is still reported. The callback is a module function so its reference never changes
 * between renders (the hook's own documentation: a changed reference reports the same data twice).
 */
function report(metric: ReportedMetric): void {
  const body = vitalsBody(metric, window.location.pathname, window.matchMedia('(max-width: 767px)').matches)
  if (!body || typeof navigator.sendBeacon !== 'function') return
  navigator.sendBeacon('/api/vitals', new Blob([JSON.stringify(body)], { type: 'application/json' }))
}

export function WebVitalsRecord(): null {
  useReportWebVitals(report)
  return null
}
