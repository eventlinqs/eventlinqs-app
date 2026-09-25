/**
 * THE TWO READERS BEHIND scripts/guards/every-guard-has-been-seen-to-fail.mjs.
 *
 * Lane B, 18 September 2026. That guard promises that every guard registered in
 * run-guards.mjs has been watched to fail by a drill. The promise is worth
 * exactly what its two readers are worth, and both of them were wrong on their
 * first run in a way that reported MORE drills than exist, which is the
 * dangerous direction: a guard read as drilled is a guard nobody goes back to.
 *
 * Every case below is a real shape out of this repository rather than an
 * invented one.
 *
 *   - `drilledGuards` first searched for the guard's FILE NAME anywhere in the
 *     harness. Five guards are named in the harness's prose and aimed at by no
 *     drill at all, so five were read as drilled: cron-routes-scheduled,
 *     no-ai-authorship, no-ambiguous-embed, no-control-characters and
 *     no-inherited-git-env.
 *   - Once it parsed `guard:` fields instead, the guard's OWN second drill
 *     broke it: that drill has to write a `guard:` field inside a string, and
 *     the unanchored parse counted the quoted one as a real drill, so the
 *     mutation read as no change and the guard passed on a broken tree.
 */
import { describe, it, expect } from 'vitest'
import {
  registeredEntryPoints,
  drilledGuards,
} from '../../../scripts/guards/lib/guard-drill-coverage.mjs'

const BT = String.fromCharCode(96)

describe('registeredEntryPoints', () => {
  it('reads every scripts/ path out of the registry, once each, sorted', () => {
    const source = [
      "const GUARDS = [",
      "  'scripts/guards/b-guard.mjs',",
      "  'scripts/guards/a-guard.mjs',",
      "  'scripts/security/rls-exposure-scan.mjs',",
      "  'scripts/guards/a-guard.mjs',",
      ']',
    ].join('\n')
    expect(registeredEntryPoints(source)).toEqual([
      'scripts/guards/a-guard.mjs',
      'scripts/guards/b-guard.mjs',
      'scripts/security/rls-exposure-scan.mjs',
    ])
  })

  it('reads paths outside scripts/guards, because four registered entries are', () => {
    const source = "['scripts/verify/payment-critical-doctrine.mjs', 'scripts/pricing-derive.mjs']"
    expect(registeredEntryPoints(source)).toContain('scripts/verify/payment-critical-doctrine.mjs')
    expect(registeredEntryPoints(source)).toContain('scripts/pricing-derive.mjs')
  })

  it('ignores a path that is not under scripts/', () => {
    const source = "['src/lib/guards/not-a-guard.mjs', 'scripts/guards/real.mjs']"
    expect(registeredEntryPoints(source)).toEqual(['scripts/guards/real.mjs'])
  })
})

describe('drilledGuards', () => {
  it('reads the template form the harness uses for a guard under scripts/guards', () => {
    const source = `  {\n    name: 'x',\n    guard: ${BT}\${GUARDS}/one-refund-path.mjs${BT},\n  },`
    expect(drilledGuards(source)).toEqual(['scripts/guards/one-refund-path.mjs'])
  })

  it('reads the quoted form the harness uses for a path outside scripts/guards', () => {
    const source = "  {\n    guard: 'scripts/ops/production-parity.mjs',\n  },"
    expect(drilledGuards(source)).toEqual(['scripts/ops/production-parity.mjs'])
  })

  it('does NOT count a guard merely named in prose', () => {
    const source = [
      '/*',
      ' * no-ai-authorship rejects a Co-Authored-By trailer, and this comment',
      ' * mentions scripts/guards/no-ai-authorship.mjs without drilling it.',
      ' */',
      `  {\n    guard: ${BT}\${GUARDS}/something-else.mjs${BT},\n  },`,
    ].join('\n')
    expect(drilledGuards(source)).toEqual(['scripts/guards/something-else.mjs'])
  })

  it('does NOT count a guard field quoted inside a drill string', () => {
    // This is the guard's own second drill, verbatim in shape: it plants a
    // renamed `guard:` field and must not be read as declaring a drill.
    const source = [
      `  {`,
      `    guard: ${BT}\${GUARDS}/every-guard-has-been-seen-to-fail.mjs${BT},`,
      `    find: '    guard: ${BT}\${GUARDS}/attribution-one-record-per-order.mjs${BT},',`,
      `  },`,
    ].join('\n')
    expect(drilledGuards(source)).toEqual(['scripts/guards/every-guard-has-been-seen-to-fail.mjs'])
  })

  it('counts a guard once however many drills aim at it', () => {
    const one = `    guard: ${BT}\${GUARDS}/launch-readiness-honest.mjs${BT},`
    expect(drilledGuards([one, one, one].join('\n'))).toEqual([
      'scripts/guards/launch-readiness-honest.mjs',
    ])
  })

  it('returns nothing for a harness with no drills, rather than guessing', () => {
    expect(drilledGuards('const DRILLS = []')).toEqual([])
  })
})
