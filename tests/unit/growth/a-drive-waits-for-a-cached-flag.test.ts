import { describe, expect, it } from 'vitest'
import {
  CALIBRATION_PROBE,
  REGISTER,
  WAITERS,
  calibrationFault,
  judgeSource,
} from '../../../scripts/guards/a-drive-waits-for-a-cached-flag.mjs'

/**
 * A DRIVE THAT FLIPS A FEATURE FLAG MUST WAIT FOR THE SERVER TO AGREE.
 *
 * WHAT HAPPENED, 19 September 2026. The GA2 matcher drive failed three
 * consecutive runs on `locator.click: Timeout 30000ms exceeded` at a disabled
 * "Produce a match", while `feature_flags.enabled` read TRUE and the cached key
 * read null. A drive process has an EMPTY `UPSTASH_REDIS_REST_URL`, so
 * `invalidateFeatureFlag` opens `if (!redis) return` and does nothing, silently,
 * while the server holds the old value for the cache TTL.
 *
 * The drills in scripts/verify/guard-failure-drills.mjs prove the guard FAILS
 * on four real regressions. These tests cover the spellings that are not in the
 * tree today, which is where the first version of the matcher was wrong: it
 * accepted a file whose waiter had been renamed out of existence, because a
 * regex for `name(` matches the declaration as happily as a call.
 */
describe('the flag-wait guard matcher', () => {
  it('reads its own calibration probe correctly', () => {
    expect(calibrationFault()).toBeNull()
  })

  it('sees both spellings of a flag write', () => {
    expect(judgeSource(CALIBRATION_PROBE).writes).toHaveLength(2)
  })

  it.each([
    ['a supabase-js update', "await db.from('feature_flags').update({ enabled: true }).eq('flag', 'x')", 1],
    ['a supabase-js upsert', "await db.from('feature_flags').upsert({ flag: 'x', enabled: true })", 1],
    ['a supabase-js delete', "await db.from('feature_flags').delete().eq('flag', 'x')", 1],
    ['a PostgREST patch', 'await patch(`feature_flags?flag=eq.${f}`, { enabled })', 1],
    ['a plain READ, which is not a write', "await db.from('feature_flags').select('flag, enabled')", 0],
  ])('counts %s', (_label, source, expected) => {
    expect(judgeSource(source).writes).toHaveLength(expected)
  })

  /*
   * THE FOUR SHAPES OF "WAITING", and the two false ones are the point. A
   * waiter that is declared and never called does nothing; a call to a waiter
   * that is nowhere declared or imported is a reference to something that does
   * not exist, which is precisely what renaming the declaration leaves behind.
   */
  it.each([
    [
      'declared and called',
      'async function waitForProduceButton(p) { return p }\nawait waitForProduceButton(page)',
      true,
    ],
    [
      'imported and called',
      "import { waitForFlagToLand } from './lib/x.mjs'\nawait waitForFlagToLand(page)",
      true,
    ],
    ['declared and never called', 'async function waitForProduceButton(p) { return p }', false],
    ['called and nowhere declared', 'await waitForProduceButton(page)', false],
    ['neither', 'await page.goto(url)', false],
  ])('judges a waiter %s', (_label, source, expected) => {
    expect(judgeSource(source).waits).toBe(expected)
  })

  it.each([
    ['page.goto', 'await page.goto(url)', true],
    ['page.getByRole', "await page.getByRole('button', { name: /x/ })", true],
    ['no browser at all', "await db.from('x').select('y')", false],
  ])('judges whether a drive opens a page: %s', (_label, source, expected) => {
    expect(judgeSource(source).drives).toBe(expected)
  })

  it('names at least one waiter, because a guard with an empty list judges nothing', () => {
    expect(WAITERS.length).toBeGreaterThan(0)
  })

  it('carries a dated reason for every registered exposure', () => {
    expect(REGISTER.length).toBeGreaterThan(0)
    for (const entry of REGISTER) {
      expect(entry.file).toMatch(/^scripts\/verify\/.+\.mjs$/)
      expect(entry.since).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.why.length).toBeGreaterThan(40)
    }
  })
})
