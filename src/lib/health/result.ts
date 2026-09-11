/**
 * The SHAPE of a health check's answer, and the pure roll-up over a set of them.
 *
 * WHY THIS IS ITS OWN MODULE (close-out S1, 11 September 2026). These three
 * declarations used to live in src/lib/health/checks.ts, which imports
 * `@/lib/ai/client` for the AI check, which imports `server-only`. That made a
 * type and a pure function unreachable from any plain Node process, and the
 * consequence was not theoretical: the daily heartbeat email builder could not
 * be imported by a drive, so proving the email renders at 390 would have meant
 * a second copy of the email in the harness. A copy of an email is not evidence
 * about the email.
 *
 * So the pure part sits here, with no dependency at all, and checks.ts re-exports
 * it so no call site moved.
 */

export type Severity = 'critical' | 'warning'

export interface HealthResult {
  id: string
  label: string
  severity: Severity
  ok: boolean
  detail: string
  probableCause?: string
  /** Plain-language, non-engineer action to resolve it. */
  action?: string
  durationMs?: number
  /** True when the check could not run meaningfully in this environment (e.g. https-only on localhost) - reported as ok with a note. */
  skipped?: boolean
}

/** One critical failure outranks any number of warnings, and one warning
 *  outranks every green: the worst thing that is true is the answer. */
export function overallStatus(results: HealthResult[]): 'green' | 'warning' | 'critical' {
  if (results.some(r => !r.ok && r.severity === 'critical')) return 'critical'
  if (results.some(r => !r.ok && r.severity === 'warning')) return 'warning'
  return 'green'
}
