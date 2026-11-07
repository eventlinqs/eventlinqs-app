import { describe, expect, test } from 'vitest'
import type { TrendRow } from '../../../src/lib/listings/accuracy-trend'
import { sourceTrust, trustReport, trustTable } from '../../../src/lib/listings/source-trust'

/**
 * LEARNING PART 4 (the CONTROLLER's 08:42 of 7 November 2026): each source earns a trust record from its own accuracy
 * history, and that record says how often it is re-read. Built on the sweep's trend rows; a record only, never a switch,
 * until Lawal rules on the gate (C:\dev\EVIDENCE\EL-8NOV\car56\plan.md).
 */

const row = (date: string, bySource: Record<string, [number, number]>): TrendRow => ({
  at: `${date}T06:00:00Z`,
  date,
  facts: 0,
  wrong: 0,
  unreadable: 0,
  rate: 0,
  byField: {},
  bySource: Object.fromEntries(Object.entries(bySource).map(([h, [facts, wrong]]) => [h, { facts, wrong }])),
})

const days = (n: number, host: string, wrongOn: number[] = []) =>
  Array.from({ length: n }, (_, i) => row(`2026-11-${String(i + 1).padStart(2, '0')}`, { [host]: [10, wrongOn.includes(i + 1) ? 1 : 0] }))

describe('the four states, in their order', () => {
  test('unproven: one run is not enough history', () => {
    expect(sourceTrust(days(1, 'a.example'), 'a.example')).toMatchObject({ trust: 'unproven', runs: 1, reason: 'one run has checked it; two are needed' })
    expect(sourceTrust([], 'a.example').reason).toBe('no run has checked a fact from it yet')
  })
  test('earned: right in every one of its last seven runs', () => {
    expect(sourceTrust(days(9, 'a.example', [1]), 'a.example')).toMatchObject({ trust: 'earned', reason: 'right in each of its last 7 runs' })
  })
  test('failing: the newest run found it wrong', () => {
    expect(sourceTrust(days(5, 'a.example', [5]), 'a.example')).toMatchObject({ trust: 'failing', reason: 'the newest run found 1 wrong fact from it' })
  })
  test('failing: two of its last three runs, though the newest was right', () => {
    expect(sourceTrust(days(6, 'a.example', [4, 5]).concat(row('2026-11-07', { 'a.example': [10, 0] })), 'a.example').trust).toBe('watch')
    expect(sourceTrust(days(6, 'a.example', [5]).concat(row('2026-11-07', { 'a.example': [10, 0] })), 'a.example').trust).toBe('watch')
    expect(sourceTrust(days(5, 'a.example', [4, 5]).concat(row('2026-11-06', { 'a.example': [10, 0] })), 'a.example')).toMatchObject({
      trust: 'failing',
      reason: 'two of its last three runs found it wrong',
    })
  })
  test('watch: a wrong fact in the last seven runs, none of the newest', () => {
    expect(sourceTrust(days(8, 'a.example', [3]), 'a.example')).toMatchObject({ trust: 'watch', reason: '1 of its last 7 runs found it wrong, none of the newest' })
  })
  test('a run that checked none of its facts does not count for or against it', () => {
    const rows = [...days(3, 'a.example'), row('2026-11-04', { 'b.example': [5, 5] }), row('2026-11-05', { 'a.example': [0, 0] })]
    expect(sourceTrust(rows, 'a.example')).toMatchObject({ runs: 3, facts: 30, wrong: 0, trust: 'earned' })
  })
})

describe('what it means for re-reading', () => {
  test('a failing source is re-read before every publication; an earned one on its learned interval', () => {
    expect(sourceTrust(days(4, 'a.example', [4]), 'a.example').reread).toContain('before every publication')
    expect(sourceTrust(days(4, 'a.example'), 'a.example').reread).toBe('on its learned interval, 6 to 24 hours')
  })
})

describe('the record as Lawal reads it', () => {
  const rows = [
    row('2026-11-01', { 'good.example': [10, 0], 'bad.example': [8, 0], 'new.example': [3, 0] }),
    row('2026-11-02', { 'good.example': [12, 0], 'bad.example': [9, 2] }),
  ]
  test('the sources needing attention come first', () => {
    expect(trustTable(rows).map((s) => `${s.host} ${s.trust}`)).toEqual(['bad.example failing', 'new.example unproven', 'good.example earned'])
  })
  test('plain words with the counts, and no dash', () => {
    const report = trustReport(rows, '2026-11-02')
    expect(report).toContain('3 sources: 1 earned, 0 on watch, 1 failing, 1 not yet proven.')
    expect(report).toContain('- bad.example: failing, because the newest run found 2 wrong facts from it; 2 wrong of 17 facts over 2 runs.')
    expect(report).not.toMatch(/[\u2013\u2014]| - (?![a-z0-9.]+:)/)
  })
})
