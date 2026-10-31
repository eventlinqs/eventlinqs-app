// THE GROWTH PLAN IS THE TARGET, AND ITS HISTORY IS KEPT (Law 8, Lawal 1 November 2026 03:27, in C:\dev\CLAUDE.md):
// growth/plan.json is the single source of the mission, targets, scorecard, daily quotas, city benchmarks and rollout
// gates; "It changes only by a new dated version, never by overwriting history." The CONTROLLER's 03:32 (G2): "a guard
// that fails the build if it is invalid or loses a dated version." These tests hold the validator and the ledger the
// guard runs, against the real files and against broken copies of them.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { checkLedger, planProblems, sha256Lf } from '../../../scripts/lib/growth-plan.mjs'

const root = process.cwd()
const read = (f: string) => readFileSync(resolve(root, f), 'utf8')
const plan = () => JSON.parse(read('growth/plan.json'))

describe('the growth plan is valid', () => {
  test('the plan in the repo passes', () => {
    expect(planProblems(plan())).toEqual([])
  })

  test('a plan without its targets, its open cities or a benchmark for each is refused', () => {
    const noTargets = { ...plan(), targets: undefined }
    expect(planProblems(noTargets).join(' ')).toMatch(/targets/)
    const p = plan()
    p.cities.pilot_benchmark_checked_events_14_days = { Geelong: 50 }
    expect(planProblems(p).join(' ')).toMatch(/benchmark/)
    const q = plan()
    q.daily_quotas.outreach_messages = 'twenty'
    expect(planProblems(q).join(' ')).toMatch(/outreach_messages/)
  })

  test('version 2 carries the ticketing gap: dated targets, who first, and the daily conversion asks as a count', () => {
    expect(plan().version).toBe(2)
    const noGap = { ...plan(), close_the_ticketing_gap: undefined }
    expect(planProblems(noGap).join(' ')).toMatch(/close_the_ticketing_gap/)
    const p = plan()
    p.close_the_ticketing_gap.targets[0].by = '15 November'
    expect(planProblems(p).join(' ')).toMatch(/targets\[0\]\.by/)
    const q = plan()
    q.close_the_ticketing_gap.who_first = []
    expect(planProblems(q).join(' ')).toMatch(/who_first/)
    const r = plan()
    r.close_the_ticketing_gap.daily = 'some conversion asks each day'
    expect(planProblems(r).join(' ')).toMatch(/daily/)
  })
})

describe('the growth plan keeps every dated version', () => {
  const files = (overrides: Record<string, string | null> = {}) => (f: string) =>
    f in overrides ? overrides[f] : (() => { try { return read(f) } catch { return null } })()

  test('the ledger holds, and the plan equals its newest version', () => {
    expect(checkLedger(files())).toEqual([])
  })

  test('version 1 is still kept whole beside version 2 (Law 8: a new dated version, never an overwrite)', () => {
    const ledger = JSON.parse(read('growth/versions/LEDGER.json'))
    expect(ledger.versions.map((v: { version: number }) => v.version)).toEqual([1, 2])
    expect(JSON.parse(read('growth/versions/2026-11-01.json')).version).toBe(1)
    expect(sha256Lf(read('growth/versions/2026-11-01.json'))).toBe('2a5a09f5a31745763173629024a212050d6c686f12beb8c26f78cb372ce16ff3')
  })

  test('a version changed after it was recorded is caught', () => {
    const changed = read('growth/versions/2026-11-01.json').replace('"version": 1', '"version": 1 ')
    expect(checkLedger(files({ 'growth/versions/2026-11-01.json': changed })).join(' ')).toMatch(/changed/)
  })

  test('a version that is gone is caught', () => {
    expect(checkLedger(files({ 'growth/versions/2026-11-01.json': null })).join(' ')).toMatch(/missing/)
  })

  test('a plan edited in place, without a new dated version, is caught', () => {
    const edited = read('growth/plan.json').replace('"outreach_messages": 20', '"outreach_messages": 25')
    expect(checkLedger(files({ 'growth/plan.json': edited })).join(' ')).toMatch(/newest version/)
  })

  test('the hash reads a CRLF checkout the same as an LF one', () => {
    expect(sha256Lf('a\r\nb\r\n')).toBe(sha256Lf('a\nb\n'))
  })

  test('the guard is registered with its header line and has a drill', () => {
    const runner = read('scripts/guards/run-guards.mjs')
    expect(runner).toMatch(/'scripts\/guards\/growth-plan-is-versioned\.mjs'/)
    expect(runner).toMatch(/\*\s+growth-plan-is-versioned\s/)
    expect(read('scripts/verify/guard-failure-drills.mjs')).toMatch(/growth-plan-is-versioned\.mjs/)
  })
})
