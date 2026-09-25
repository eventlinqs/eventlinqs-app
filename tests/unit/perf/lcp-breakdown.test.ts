/**
 * THE TWO LARGEST CONTENTFUL PAINTS IN ONE REPORT.
 *
 * `scripts/perf/lib/lcp-breakdown.mjs` exists because a real mobile run on
 * 19 September 2026 printed an LCP of 3,740 ms above a phase split that summed
 * to 1,881 ms, and the reporter said nothing about the two being different
 * quantities. They are: the score is computed from the SIMULATED paint and the
 * phases are a breakdown of the OBSERVED one.
 *
 * The cases below fix that reconciliation, and - more importantly - fix what
 * must happen when a future Lighthouse changes the audit's shape: the split is
 * WITHHELD rather than printed, because a split that no longer sums to the
 * thing it splits is not a finding about this platform.
 */
import { describe, expect, it } from 'vitest'
import {
  explainPhases,
  lcpPhases,
  observedLcp,
  simulatedLcp,
} from '../../../scripts/perf/lib/lcp-breakdown.mjs'

/** The shape of a real report, with the real numbers from that homepage run. */
function report({
  rows = [
    { label: 'Time to first byte', duration: 1549 },
    { label: 'Resource load delay', duration: 17 },
    { label: 'Resource load duration', duration: 46 },
    { label: 'Element render delay', duration: 269 },
  ],
  observed = 1881,
  simulated = 3740,
}: {
  rows?: { label: string; duration: number }[] | null
  observed?: number | null
  simulated?: number | null
} = {}) {
  return {
    audits: {
      'largest-contentful-paint': simulated === null ? {} : { numericValue: simulated },
      metrics: {
        details: {
          items: [observed === null ? {} : { observedLargestContentfulPaint: observed }],
        },
      },
      'lcp-breakdown-insight':
        rows === null ? {} : { details: { items: [{ type: 'table', items: rows }] } },
    },
  }
}

describe('reading the two paints apart', () => {
  it('reads the phases verbatim, keeping Lighthouse own labels', () => {
    expect(lcpPhases(report())).toEqual({
      'Time to first byte': 1549,
      'Resource load delay': 17,
      'Resource load duration': 46,
      'Element render delay': 269,
    })
  })

  it('reads the observed paint the phases are a breakdown of', () => {
    expect(observedLcp(report())).toBe(1881)
  })

  it('reads the simulated paint the score is computed from, and they are NOT the same', () => {
    expect(simulatedLcp(report())).toBe(3740)
    expect(simulatedLcp(report())).not.toBe(observedLcp(report()))
  })

  it('answers null rather than 0 when a report carries neither', () => {
    expect(observedLcp(report({ observed: null }))).toBeNull()
    expect(simulatedLcp(report({ simulated: null }))).toBeNull()
    expect(observedLcp({})).toBeNull()
  })
})

describe('explainPhases', () => {
  it('trusts a split that sums to the observed paint', () => {
    const e = explainPhases(report())
    expect(e.trustworthy).toBe(true)
    expect(Math.round(e.sum)).toBe(1881)
    expect(e.observed).toBe(1881)
    expect(e.simulated).toBe(3740)
  })

  it('allows a millisecond of rounding, because the two are rounded separately', () => {
    expect(explainPhases(report({ observed: 1882 })).trustworthy).toBe(true)
  })

  it('WITHHOLDS a split that does not sum to the paint it splits', () => {
    const e = explainPhases(report({ observed: 2500 }))
    expect(e.trustworthy).toBe(false)
    expect(e.note).toContain('1881')
    expect(e.note).toContain('2500')
  })

  it('withholds when a Lighthouse release drops the phase table entirely', () => {
    const e = explainPhases(report({ rows: null }))
    expect(e.trustworthy).toBe(false)
    expect(e.phases).toEqual({})
    expect(e.note).toContain('no lcp-breakdown-insight rows')
  })

  it('withholds when there is no observed paint to check the split against', () => {
    const e = explainPhases(report({ observed: null }))
    expect(e.trustworthy).toBe(false)
    expect(e.note).toContain('cannot be checked')
  })

  it('notices a FIFTH phase, because a sum that no longer matches is the signal', () => {
    const e = explainPhases(
      report({
        rows: [
          { label: 'Time to first byte', duration: 1549 },
          { label: 'Resource load delay', duration: 17 },
          { label: 'Resource load duration', duration: 46 },
          { label: 'Element render delay', duration: 269 },
          { label: 'Something new', duration: 400 },
        ],
      }),
    )
    expect(e.trustworthy).toBe(false)
  })

  it('says plainly which paint the split describes when it is trustworthy', () => {
    expect(explainPhases(report()).note).toContain('OBSERVED')
    expect(explainPhases(report()).note).toContain('SIMULATED')
  })
})
