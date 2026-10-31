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
})

describe('the growth plan keeps every dated version', () => {
  const files = (overrides: Record<string, string | null> = {}) => (f: string) =>
    f in overrides ? overrides[f] : (() => { try { return read(f) } catch { return null } })()

  test('the ledger holds, and the plan equals its newest version', () => {
    expect(checkLedger(files())).toEqual([])
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
