import { describe, expect, it, vi, afterEach } from 'vitest'
import { declareWork } from '../../../scripts/lib/work-report.mjs'

/**
 * THE NEGATIVE CONTROL FOR THE CLAIM CONTRACT.
 *
 * The whole value of `declareWork` is the branch where it REFUSES. A helper that
 * prints a tidy count and never exits would be the warm step all over again,
 * wearing a contract: it would look like enforcement in every green log, and the
 * only run that could tell the difference is the one that never happens.
 *
 * So the zero path is asserted here, with `exitOnZero: false` so the assertion
 * can read the return value rather than killing the test process.
 */

const lines: string[] = []

function capture() {
  lines.length = 0
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    lines.push(a.join(' '))
  })
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    lines.push(a.join(' '))
  })
}

afterEach(() => vi.restoreAllMocks())

describe('declareWork', () => {
  it('prints what was done and what was found', () => {
    capture()
    const ok = declareWork('warm', {
      did: { 'page warmed twice': 4, 'optimised image variant requested': 82 },
      found: { 'warm request that did not return 200': 0 },
      exitOnZero: false,
    })
    expect(ok).toBe(true)
    expect(lines[0]).toBe('[warm] did 4 pages warmed twice, 82 optimised image variants requested')
    expect(lines[1]).toBe('[warm] found 0 warm requests that did not return 200')
  })

  /*
   * THE INCIDENT. A step named "Warm ISR + the next/image optimiser" requested
   * page HTML and never touched /_next/image at all, for weeks, printing a tidy
   * list of 200s. Zero images warmed and a green tick are the same log.
   */
  it('REFUSES a zero: doing nothing is not a pass', () => {
    capture()
    const ok = declareWork('warm', {
      did: { 'page warmed twice': 4, 'optimised image variant requested': 0 },
      exitOnZero: false,
    })
    expect(ok).toBe(false)
    expect(lines.join('\n')).toContain('DID NOTHING: optimised image variant requested came back zero')
  })

  it('refuses a step that declares no work at all', () => {
    capture()
    expect(declareWork('empty', { did: {}, exitOnZero: false })).toBe(false)
    expect(lines.join('\n')).toContain('DECLARED NO WORK AT ALL')
  })

  it('a zero is allowed only with a reason, and the reason is printed', () => {
    capture()
    const ok = declareWork('sweep', {
      did: { 'file scanned': 12, 'quarantined file re-checked': 0 },
      zeroIsFine: { 'quarantined file re-checked': 'nothing is quarantined on a clean tree' },
      exitOnZero: false,
    })
    expect(ok).toBe(true)
    expect(lines.join('\n')).toContain(
      'zero is expected here, quarantined file re-checked: nothing is quarantined on a clean tree',
    )
  })

  /*
   * THE SECOND INCIDENT, which is a different failure from the first. The
   * replacement warmer DID warm images, then reported "40 variants" across four
   * pages. Four pages sitting on exactly 40 is not a measurement, it is the cap.
   */
  it('names a truncation so a cap can never be read as a finding', () => {
    capture()
    declareWork('warm', {
      did: { 'page warmed twice': 4, 'optimised image variant requested': 320 },
      truncated: ['4 page(s) hit the 80-variant cap and were NOT fully warmed'],
      exitOnZero: false,
    })
    expect(lines.join('\n')).toContain(
      '[warm] TRUNCATED: 4 page(s) hit the 80-variant cap and were NOT fully warmed',
    )
  })

  /*
   * A `found` count of zero is the PASS, not a failure. Conflating the two would
   * make every clean run red, which is the fastest way to get a gate switched
   * off.
   */
  it('a found count of zero is the pass, never a failure', () => {
    capture()
    const ok = declareWork('map-guard', {
      did: { 'surface loaded in a real browser': 3 },
      found: { 'surface rendering no live map': 0 },
      exitOnZero: false,
    })
    expect(ok).toBe(true)
  })

  describe('the head noun pluralises, not the participle', () => {
    it.each([
      [['source file read', 915], '915 source files read'],
      [['boot specifier checked', 3], '3 boot specifiers checked'],
      [['report checked for indexability', 11], '11 reports checked for indexability'],
      [['dated exemption in force', 2], '2 dated exemptions in force'],
      [['URL swept', 730], '730 URLs swept'],
      [['page', 2], '2 pages'],
      [['hot-route rule applied', 1], '1 hot-route rule applied'],
    ])('%s', (input, expected) => {
      capture()
      const [label, n] = input as [string, number]
      declareWork('t', { did: { [label]: n }, exitOnZero: false })
      expect(lines[0]).toBe(`[t] did ${expected}`)
    })
  })
})
