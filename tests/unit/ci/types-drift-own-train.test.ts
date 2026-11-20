import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error a plain .mjs module, no declarations
import { trainOwnDeltas } from '../../../scripts/ci/types-drift-own-train.mjs'

// A TRAIN'S OWN TYPES, JUDGED BEFORE ITS PUSH (law 4; the PM's order of 20 November 2026). #323's CI went red on one
// line the local checks never judged: public.Functions.events_within_distance.Returns.facts_changed_at, which
// 20261120160001 gave the types through a function that RETURNS SETOF events. This drives the guard's decision on the
// real files: the committed types with that one line taken out (the drill, red) and as they stand (green).

const MIG = 'supabase/migrations'
const OWN = '20261120160001_events_facts_changed_at.sql'
const real = readFileSync('src/types/database.ts', 'utf8')
const train = [{ file: OWN, version: '20261120160001', sql: readFileSync(join(MIG, OWN), 'utf8') }]
const corpus = readdirSync(MIG)
  .filter((f) => f.endsWith('.sql') && f !== OWN)
  .map((f) => readFileSync(join(MIG, f), 'utf8'))

/** The committed types with the one line #323 missed: facts_changed_at inside events_within_distance's Returns. */
function withoutTheMissedLine(text: string): string {
  const fn = text.indexOf('events_within_distance: {')
  expect(fn).toBeGreaterThan(0)
  const at = text.indexOf('facts_changed_at: string | null', fn)
  expect(at).toBeGreaterThan(fn)
  const start = text.lastIndexOf('\n', at)
  const end = text.indexOf('\n', at)
  return text.slice(0, start) + text.slice(end)
}

describe("a train's own types, judged before its push", () => {
  it("DRILL: #323's missed line is named as this train's own and fails", () => {
    const { own } = trainOwnDeltas({ committedText: withoutTheMissedLine(real), testText: real, trainMigrations: train, corpus })
    expect(own.map((e: { delta: { path: string } }) => e.delta.path)).toContain('public.Functions.events_within_distance.Returns.facts_changed_at')
  })

  it('the committed types as they stand hold every line the train gives: nothing of its own to fail', () => {
    const { own } = trainOwnDeltas({ committedText: real, testText: real, trainMigrations: train, corpus })
    expect(own).toEqual([])
  })

  it("a difference no migration of this train explains (another branch on TEST) is counted, never judged", () => {
    // TEST holds a column the train never names: add it to the generated side only.
    const fn = real.indexOf('events_within_distance: {')
    const at = real.indexOf('facts_changed_at: string | null', fn)
    const other = real.slice(0, at) + 'some_other_branch_column: string | null\n          ' + real.slice(at)
    const { own, others } = trainOwnDeltas({ committedText: real, testText: other, trainMigrations: train, corpus })
    expect(own).toEqual([])
    expect(others).toBeGreaterThan(0)
  })
})
