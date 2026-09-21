import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  wholeResultBindings,
  wholeResultCalibrationFault,
  WHOLE_RESULT_PROBE,
  RESULT_DOORS,
  elementsOf,
} from '../../../scripts/guards/lib/whole-result-bindings.mjs'

/**
 * THE SECOND SPELLING OF A DISCARDED READ ERROR, JUDGED.
 *
 * `scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs` reads a
 * DESTRUCTURE. `src/lib/consent/resolver.ts` binds the whole response, so the
 * guard written for this exact family could not see the family's worst live
 * instance: a blink on the suppression read PERMITTED a message to somebody who
 * had unsubscribed.
 *
 * These are unit tests of the matcher rather than of the guard, because the
 * matcher is the part that can be wrong quietly. A guard whose scanner sees
 * nothing prints PASS.
 */

const DOORS = ['readOrThrow', 'readEveryRow', 'mustRead', 'mustReadEvery']
const ROOT = join(__dirname, '..', '..', '..')

type Binding = { name: string; line: number; handled: boolean; shape: string }
const judge = (src: string): Binding[] => wholeResultBindings(src, DOORS) as Binding[]

describe('the matcher answers its own probe', () => {
  it('reports no calibration fault', () => {
    expect(wholeResultCalibrationFault(DOORS)).toBeNull()
  })

  /*
   * THE PROBE CARRIES A SHAPE THE FIRST DRAFT GOT WRONG, and this asserts the
   * probe still carries it rather than trusting the check above. A calibration
   * that quietly loses its hardest case passes for the wrong reason.
   */
  it('keeps the two same-named bindings the scope rule exists for', () => {
    expect(WHOLE_RESULT_PROBE.match(/const \[bad/g)).toHaveLength(2)
    const bad = judge(WHOLE_RESULT_PROBE).filter((b) => b.name === 'bad')
    expect(bad.map((b) => b.handled)).toEqual([false, true])
  })
})

describe('what it catches', () => {
  it('an element of a Promise.all whose error is never read', () => {
    const src = [
      'async function f(admin) {',
      '  const [a] = await Promise.all([admin.from("t").select("c").maybeSingle()])',
      '  return a.data ?? []',
      '}',
    ].join('\n')
    expect(judge(src)).toEqual([{ name: 'a', line: 2, handled: false, shape: 'element' }])
  })

  it('a plain awaited assignment whose error is never read', () => {
    const src = [
      'async function f(admin) {',
      '  const a = await admin.from("t").select("c").maybeSingle()',
      '  return a.data',
      '}',
    ].join('\n')
    expect(judge(src)[0]).toMatchObject({ name: 'a', handled: false, shape: 'assignment' })
  })

  it('a count read coalesced to zero, reached through an index', () => {
    const src = [
      'async function f(admin) {',
      '  const counts = await Promise.all([admin.from("t").select("id", { count: "exact", head: true })])',
      '  return counts[0].count ?? 0',
      '}',
    ].join('\n')
    expect(judge(src)[0]).toMatchObject({ name: 'counts', handled: false })
  })

  it('an rpc whose result is cast rather than destructured', () => {
    const src = [
      'async function f(admin) {',
      '  const ranked = (await admin.rpc("f", {})) as unknown as { data: null; error: null }',
      '  return ranked.data ?? []',
      '}',
    ].join('\n')
    expect(judge(src)[0]).toMatchObject({ name: 'ranked', handled: false, shape: 'assignment' })
  })
})

describe('what it deliberately lets past, because a guard that fires on correct code gets switched off', () => {
  it('a read that goes through a door', () => {
    const src = [
      'async function f(admin) {',
      '  const rows = await readEveryRow("x", (from, to) => admin.from("t").select("c").range(from, to))',
      '  return rows.data',
      '}',
    ].join('\n')
    expect(judge(src)).toEqual([])
  })

  it('a response handed to a door that reads the error there', () => {
    const src = [
      'async function f(admin) {',
      '  const counts = await Promise.all([admin.from("t").select("id", { count: "exact", head: true })])',
      '  return countOrRaise("things", counts[0])',
      '}',
    ].join('\n')
    expect(judge(src)[0]).toMatchObject({ name: 'counts', handled: true })
    expect(RESULT_DOORS).toContain('countOrRaise')
  })

  it('a name bound to an object literal, which carries no response at all', () => {
    const src = [
      'async function f(rows) {',
      '  const made = { data: rows }',
      '  return made.data',
      '}',
    ].join('\n')
    expect(judge(src)).toEqual([])
  })

  it('an element that is an object destructure, which the sibling matcher judges', () => {
    const src = [
      'async function f(admin) {',
      '  const [{ data: a }] = await Promise.all([admin.from("t").select("c").maybeSingle()])',
      '  return a',
      '}',
    ].join('\n')
    expect(judge(src)).toEqual([])
  })

  it('a binding that is awaited and then never used', () => {
    const src = [
      'async function f(admin) {',
      '  const a = await admin.from("t").select("c").maybeSingle()',
      '  return 1',
      '}',
    ].join('\n')
    expect(judge(src)).toEqual([])
  })

  /*
   * A STRING CONTAINING A PARENTHESIS IS THE ONE THAT BREAKS A NAIVE WALKER,
   * and this tree writes it: `audience_members(email)` is an embed, inside a
   * select string, in src/lib/attribution/read.ts.
   */
  it('reads a chain whose select string contains brackets', () => {
    const src = [
      'async function f(admin) {',
      '  const [a] = await Promise.all([admin.from("t").select("id, audience_members(email)").maybeSingle()])',
      '  return a.data',
      '}',
    ].join('\n')
    expect(judge(src)[0]).toMatchObject({ name: 'a', handled: false })
  })
})

describe('the scope rule, which is the fault the first draft shipped with', () => {
  /*
   * TWO FUNCTIONS, ONE NAME, and only one of them handles its error. Asked
   * file-wide the correct one excuses the defective one, which is exactly what
   * hid the two reads at the centre of this item from the guard's own output.
   */
  it('judges each binding where that binding is live, not across the file', () => {
    const src = [
      'async function broken(admin) {',
      '  const [r] = await Promise.all([admin.from("t").select("c").maybeSingle()])',
      '  return r.data ?? []',
      '}',
      'async function correct(admin) {',
      '  const [r] = await Promise.all([admin.from("t").select("c").maybeSingle()])',
      '  if (r.error) throw new Error("said")',
      '  return r.data',
      '}',
    ].join('\n')
    const found = judge(src)
    expect(found).toHaveLength(2)
    expect(found.map((b) => b.handled)).toEqual([false, true])
    expect(found.map((b) => b.line)).toEqual([2, 6])
  })
})

describe('the element splitter', () => {
  it('splits only at top level, so a nested array is one element', () => {
    const code = '[a, [b, c], d(e, f)]'
    expect(elementsOf(code, 0)).toHaveLength(3)
  })
})

describe('the live tree', () => {
  /*
   * THE FIX ITSELF, PINNED. These three files each held an unhandled binding on
   * 21 September 2026 and the guard now reports none. Read through the matcher
   * rather than by grepping for `readOrThrow`, so the assertion is about the
   * judgement rather than about a spelling.
   */
  it.each([
    'src/lib/consent/resolver.ts',
    'src/lib/attribution/read.ts',
    'src/lib/audience/read.ts',
    'src/lib/matching/config.ts',
  ])('%s binds no response whose error goes unread', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8')
    expect(judge(src).filter((b) => !b.handled)).toEqual([])
  })

  it('the one door still binds responses, so the assertion above is not vacuous', () => {
    const src = readFileSync(join(ROOT, 'src/lib/attribution/read.ts'), 'utf8')
    expect(judge(src).length).toBeGreaterThan(0)
  })
})
