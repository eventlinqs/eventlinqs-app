import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deadLinkLine } from '@/lib/health/dead-link-line'
import type { HealthResult } from '@/lib/health/runner'

/*
 * DEAD BOOKING LINKS, SAID TO THE PM, NEVER ALARMED TO LAWAL (the PM's 11:53 of 26 November 2026, item 2): the visitor
 * sentinel's dead link results are warnings, and the 08:00 report's System line says what its newest run healed, held or
 * could not decide.
 */

const r = (id: string, ok: boolean, label: string, detail: string): HealthResult => ({ id, label, severity: 'warning', ok, detail })

describe("the morning's line for dead booking links", () => {
  it('all well when no dead link result failed', () => {
    const run = { ranAt: '2026-11-25T19:40:00Z', results: [r('visitor-held-dead-booking', true, 'Held', 'none held'), r('visitor-dead-booking:/city/geelong', true, 'Dead (/city/geelong)', 'none')] }
    expect(deadLinkLine(run, null)).toMatch(/^the visitor sentinel's run of Thu 06:40: no night with a dead booking link left live\.$/)
  })

  it('names what it held and what it could not decide, and nothing of the other checks', () => {
    const run = {
      ranAt: '2026-11-26T01:40:00Z',
      results: [
        r('visitor-held-dead-booking', false, 'Nights held this run', 'held, private until a link answers: 1: the-greatest-christmas-show-costa-hall-2026-11-29'),
        r('visitor-dead-booking-everywhere', false, 'Nights with every booking link dead', '1: some-night'),
        { id: 'visitor-ended:/', label: 'Ended nights shown (/)', severity: 'critical', ok: false, detail: '1: old' } as HealthResult,
      ],
    }
    const line = deadLinkLine(run, null)
    expect(line).toContain('Nights held this run: held, private until a link answers: 1: the-greatest-christmas-show-costa-hall-2026-11-29')
    expect(line).toContain('Nights with every booking link dead: 1: some-night')
    expect(line).not.toContain('Ended nights')
  })

  it('a run that cannot be read is said, never a calm line', () => {
    expect(deadLinkLine(null, 'The sentinel has not run since its runs were first kept.')).toBe('not read: The sentinel has not run since its runs were first kept.')
  })
})

describe("the sentinel's dead link results are warnings, and the report reads them every morning", () => {
  it('no dead link result is built critical any more; the report carries the line', () => {
    const run = readFileSync('src/lib/health/visitor-sentinel-run.ts', 'utf8').replace(/\r\n/g, '\n')
    for (const id of ['visitor-dead-booking-everywhere', 'visitor-source-stopped-dead-links']) {
      const at = run.indexOf(`id: '${id}'`)
      expect(at).toBeGreaterThan(0)
      expect(run.slice(at, at + 900)).toMatch(/severity: 'warning'/)
    }
    const page = readFileSync('src/lib/health/visitor-sentinel.ts', 'utf8')
    expect(page).toMatch(/give it its new booking link\.', 'warning'\)/)
    const route = readFileSync('src/app/api/cron/health-heartbeat/route.ts', 'utf8')
    expect(route).toMatch(/const deadLinks = await readDeadLinkLine\(db\)\.catch\(\(err: unknown\) => `not read: /)
  })
})
