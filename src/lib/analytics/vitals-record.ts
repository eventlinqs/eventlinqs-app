/**
 * THE REAL VISITOR RECORD: WHAT A BROWSER MAY SEND AND WHAT THE SERVER KEEPS (Lawal's law of 10 November 2026, 13:30:
 * one second, internal only; the PM's ruling of 15:05 (2); WINDOW 5A). Pure, read by the browser
 * (src/components/analytics/web-vitals-record.tsx) and the server (src/app/api/vitals/route.ts).
 *
 * Numbers only: the kind of page (never its address), phone or desktop, one of three measures and its value. Nothing
 * identifies a person or a device, nothing is set on the device, and the rows are read only internally, at the 75th
 * percentile (public.page_vitals_p75); no screen shows them.
 */

export const VITAL_METRICS = ['LCP', 'INP', 'CLS'] as const
export type VitalMetric = (typeof VITAL_METRICS)[number]
const RATINGS = ['good', 'needs-improvement', 'poor'] as const
type Rating = (typeof RATINGS)[number]

/** The kinds of page the law is read by, from the address alone (its query and any slug dropped). */
const PAGE_TYPES: readonly [RegExp, string][] = [
  [/^\/$/, 'home'],
  [/^\/city\/[^/]+$/, 'city'],
  [/^\/city\/[^/]+\/[^/]+$/, 'suburb'],
  [/^\/state\/[^/]+$/, 'state'],
  [/^\/cities$/, 'cities'],
  [/^\/events$/, 'events'],
  [/^\/events\/[^/]+$/, 'event'],
  [/^\/events\/[^/]+\/.+$/, 'event-more'],
  [/^\/e\/[^/]+$/, 'event-short'],
  [/^\/this-weekend$/, 'this-weekend'],
  [/^\/communities$/, 'communities'],
  [/^\/community\/.+$/, 'community'],
  [/^\/categories\/.+$/, 'category'],
  [/^\/organisers$/, 'organisers'],
  [/^\/start$/, 'start'],
  [/^\/submit-event$/, 'submit-event'],
  [/^\/pricing$/, 'pricing'],
  [/^\/checkout(\/.*)?$/, 'checkout'],
  [/^\/(login|signup|forgot-password)$/, 'auth'],
  [/^\/help(\/.*)?$/, 'help'],
  [/^\/legal\/.+$/, 'legal'],
]

export function pageTypeOf(pathname: string): string {
  const path = (pathname.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/'
  for (const [pattern, type] of PAGE_TYPES) if (pattern.test(path)) return type
  return 'other'
}

/** What the browser sends: short keys, numbers only. */
export type VitalsBody = { m: VitalMetric; v: number; p: string; d: 'mobile' | 'desktop'; r: Rating | null }

/** The metric Next.js's useReportWebVitals hands its callback, as far as this reads it. */
export type ReportedMetric = { name: string; value: number; rating?: string }

/**
 * The body to send for one reported measure, or null for anything the record does not keep (another measure, a value
 * that is not a finite non-negative number).
 */
export function vitalsBody(metric: ReportedMetric, pathname: string, narrow: boolean): VitalsBody | null {
  if (!(VITAL_METRICS as readonly string[]).includes(metric.name)) return null
  if (typeof metric.value !== 'number' || !Number.isFinite(metric.value) || metric.value < 0) return null
  const value = metric.name === 'CLS' ? Math.round(metric.value * 10000) / 10000 : Math.round(metric.value)
  const rating = (RATINGS as readonly string[]).includes(metric.rating ?? '') ? (metric.rating as Rating) : null
  return { m: metric.name as VitalMetric, v: value, p: pageTypeOf(pathname), d: narrow ? 'mobile' : 'desktop', r: rating }
}

/** The row the server keeps from a body, or null where the body is not one this record accepts. */
export function vitalsRow(body: unknown): { page_type: string; device: 'mobile' | 'desktop'; metric: VitalMetric; value: number; rating: Rating | null } | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (!(VITAL_METRICS as readonly string[]).includes(String(b.m))) return null
  if (b.d !== 'mobile' && b.d !== 'desktop') return null
  if (typeof b.v !== 'number' || !Number.isFinite(b.v) || b.v < 0 || b.v >= 600000) return null
  const known = new Set([...PAGE_TYPES.map(([, t]) => t), 'other'])
  if (typeof b.p !== 'string' || !known.has(b.p)) return null
  const rating = b.r === null || b.r === undefined ? null : (RATINGS as readonly string[]).includes(String(b.r)) ? (b.r as Rating) : undefined
  if (rating === undefined) return null
  return { page_type: b.p, device: b.d, metric: b.m as VitalMetric, value: b.v, rating }
}
