import { describe, expect, it } from 'vitest'
// The guard is plain ESM under scripts/, resolved through allowJs.
import {
  judgeSpec,
  collectSpecFacts,
  emptySnapshot,
  MINIMUM_LINES,
  SPEC_FILE,
  TEST_FILE,
} from '../../../scripts/guards/parity-spec-complete.mjs'
// The specification is plain ESM under scripts/, resolved through allowJs.
import { PARITY_LINES } from '../../../scripts/lib/parity-spec.mjs'

/**
 * THE GUARD THAT KEEPS THE SPECIFICATION HONEST (close-out PARITY1).
 *
 * The guard's own invariant is "a line with no check fails the build". These
 * drive its pure judgement over fabricated facts, so every clause is proven
 * without mutating the tree, and then the LIVE tree is put through it once.
 */

function goodFacts() {
  return {
    lines: Array.from({ length: MINIMUM_LINES }, (_, i) => ({
      id: `line-${i}`,
      line: `a table stakes line ${i}`,
      why: 'a reason long enough to be worth reading by somebody triaging it',
      check: () => ({ state: 'blind', observation: 'nothing to see' }),
    })),
    testSource: Array.from({ length: MINIMUM_LINES }, (_, i) => `line-${i}`).join('\n'),
    specSource: 'export const PARITY_LINES = []',
    // Loosely typed on purpose: a verdict is either a state or a recorded
    // throw, and both shapes go through the same judgement.
    verdictsOnEmpty: Object.fromEntries(
      Array.from({ length: MINIMUM_LINES }, (_, i) => [`line-${i}`, { state: 'blind' }]),
    ) as Record<string, { state?: string; threw?: string }>,
  }
}

describe('judgeSpec', () => {
  it('passes a complete specification', () => {
    expect(judgeSpec(goodFacts())).toEqual([])
  })

  it('refuses an empty specification, because the list is the record', () => {
    const said = judgeSpec({ ...goodFacts(), lines: [] }).join('\n')
    expect(said).toMatch(/exports no table-stakes list/)
    expect(said).toMatch(/cannot be deleted/)
  })

  it('refuses a list that has lost a line', () => {
    const f = goodFacts()
    f.lines = f.lines.slice(0, MINIMUM_LINES - 1)
    expect(judgeSpec(f).join('\n')).toMatch(/A line was removed rather than answered/)
  })

  it('refuses a line with no check, which is the invariant in one sentence', () => {
    const f = goodFacts()
    delete (f.lines[3] as { check?: unknown }).check
    expect(judgeSpec(f).join('\n')).toMatch(/line-3 HAS NO CHECK/)
  })

  it('refuses a check that reports PASS when it was shown nothing', () => {
    const f = goodFacts()
    f.verdictsOnEmpty['line-2'] = { state: 'pass' }
    expect(judgeSpec(f).join('\n')).toMatch(/line-2 reports PASS against an empty snapshot/)
  })

  it('refuses a check that throws rather than answering', () => {
    const f = goodFacts()
    f.verdictsOnEmpty['line-5'] = { threw: 'cannot read properties of null' }
    expect(judgeSpec(f).join('\n')).toMatch(/line-5 THREW against an empty snapshot/)
  })

  it('refuses two lines with one id', () => {
    const f = goodFacts()
    f.lines[4].id = f.lines[3].id
    expect(judgeSpec(f).join('\n')).toMatch(/share the id/)
  })

  it('refuses a line whose "why" is too thin to triage', () => {
    const f = goodFacts()
    f.lines[1].why = 'because'
    expect(judgeSpec(f).join('\n')).toMatch(/carries no usable "why"/)
  })

  it('refuses a line that no test names', () => {
    const f = goodFacts()
    f.testSource = f.testSource.replace('line-7', 'something-else')
    expect(judgeSpec(f).join('\n')).toMatch(new RegExp(`line-7 is named nowhere in ${TEST_FILE}`))
  })

  it('refuses a missing test file outright', () => {
    const f = goodFacts()
    f.testSource = null as unknown as string
    expect(judgeSpec(f).join('\n')).toMatch(/does not exist, so no line has a proof/)
  })

  it('refuses a specification that reads configuration, which is the reversal boundary', () => {
    // The job may be switched off. The list may not be emptied by the same
    // switch, or turning the check off would delete the record of the promises.
    const f = goodFacts()
    f.specSource = "const off = process.env.PARITY_CHECK_DISABLED\nexport const PARITY_LINES = []"
    expect(judgeSpec(f).join('\n')).toMatch(new RegExp(`${SPEC_FILE.replace(/[/.]/g, '\\$&')} reads configuration`))
  })
})

describe('against the real tree', () => {
  it('the live specification passes its own guard', async () => {
    expect(judgeSpec(await collectSpecFacts())).toEqual([])
  })

  it('no live check reports PASS on an empty world', () => {
    const empty = emptySnapshot()
    for (const entry of PARITY_LINES as { id: string; check: (s: unknown) => { state: string } }[]) {
      expect(entry.check(empty).state, entry.id).not.toBe('pass')
    }
  })
})
