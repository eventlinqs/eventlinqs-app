import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// @ts-expect-error - a plain .mjs guard with no type declarations, imported for
// its judgement so the drill exercises the shipped code and not a copy of it.
import { judgeSource, ROLES_THAT_PROHIBIT_A_NAME } from '../../../scripts/guards/busy-region-names-itself.mjs'
// @ts-expect-error - same, for the comment stripper the guard reads source through.
import { stripComments } from '../../../scripts/guards/lib/source.mjs'

/**
 * A LOADING SKELETON THAT NAMES ITSELF MUST CARRY A ROLE ALLOWED TO HAVE A NAME.
 *
 * The guard `scripts/guards/busy-region-names-itself.mjs` is the blocking half
 * of this; its header carries the four incidents and the measured evidence for
 * its scope. This file holds the two things a build-time guard cannot do for
 * itself.
 *
 * 1. IT RE-DERIVES THE GUARD'S ROLE TABLE FROM THE INSTALLED axe-core.
 *
 *    The guard pins that table as a constant rather than reading node_modules,
 *    because axe-core is a transitive DEV dependency and a build-time script
 *    that reads one is the bet that has cost this project four deployments. A
 *    pinned constant is a CLAIM about another package, and a claim goes stale
 *    silently: nothing about the guard changes on the day axe adds a role. So
 *    the claim is checked here, where dev dependencies exist by definition, and
 *    an axe upgrade that moves the table turns this red instead of quietly
 *    widening what the guard lets through.
 *
 * 2. IT DRILLS THE JUDGEMENT, red and green, on the shapes that matter.
 *
 *    Including the two the guard deliberately declines to judge, so that
 *    "declines" stays a decision with a test on it rather than a gap nobody
 *    can see.
 */
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('the pinned role table still matches the installed axe-core', () => {
  test('every role axe says prohibits an accessible name is in the guard constant', () => {
    const axe = read('node_modules/axe-core/axe.js')
    const lines = axe.split('\n')
    const derived: string[] = []
    lines.forEach((line, i) => {
      if (!/prohibitedAttrs:/.test(line)) return
      // Walk back to the nearest role key that opens a spec object.
      for (let j = i; j >= 0 && j > i - 60; j--) {
        const m = /^\s{6}([a-zA-Z]+):\s*\{\s*$/.exec(lines[j])
        if (m) {
          derived.push(m[1])
          return
        }
      }
    })

    // A derivation that finds nothing proves nothing: fail loudly rather than
    // compare two empty lists and call it agreement.
    expect(derived.length).toBeGreaterThan(0)
    expect([...derived].sort()).toEqual([...ROLES_THAT_PROHIBIT_A_NAME].sort())
  })
})

describe('the judgement, drilled', () => {
  const judge = (src: string) => judgeSource(src, 'drill.tsx').found

  test('RED: aria-busy with a name and no role is a finding', () => {
    const found = judge('<div aria-busy="true" aria-label="Loading checkout" />')
    expect(found).toHaveLength(1)
    expect(found[0].detail).toContain('has no role')
  })

  test('RED: aria-busy with aria-labelledby and no role is a finding', () => {
    const found = judge('<div aria-busy aria-labelledby="h" />')
    expect(found).toHaveLength(1)
    expect(found[0].detail).toContain('aria-labelledby')
  })

  test('RED: a role that itself prohibits a name is a finding', () => {
    const found = judge('<div role="presentation" aria-busy="true" aria-label="Loading" />')
    expect(found).toHaveLength(1)
    expect(found[0].detail).toContain('role="presentation"')
  })

  test('GREEN: role="status" with the name in a child is clean', () => {
    expect(judge('<div role="status" aria-busy="true"><span className="sr-only">Loading</span></div>')).toHaveLength(0)
  })

  test('GREEN: aria-busy with no name at all is clean, a busy region need not be named', () => {
    expect(judge('<div aria-busy="true" />')).toHaveLength(0)
  })

  test('GREEN: a name without aria-busy is out of scope, and that is deliberate', () => {
    // axe returns `incomplete` rather than a violation when the subtree has
    // text, and a source scanner cannot know whether it will. The guard header
    // records the six shapes this was measured on.
    expect(judge('<div aria-label="My waitlist entries"><p>Brunswick Ballroom</p></div>')).toHaveLength(0)
  })

  test('GREEN: a computed role is not guessed at, in either direction', () => {
    expect(judge('<div role={busy ? "status" : undefined} aria-busy aria-label="Loading" />')).toHaveLength(0)
  })

  test('the tag reader is not fooled by a > inside an attribute expression', () => {
    const found = judge('<div className={cx(a > b ? "x" : "y")} aria-busy aria-label="Loading" />')
    expect(found).toHaveLength(1)
  })
})

describe('the four skeletons that shipped this defect stay fixed', () => {
  const FIXED = [
    'src/app/checkout/[reservation_id]/loading.tsx',
    'src/app/events/[slug]/loading.tsx',
    'src/components/ui/LoadingState.tsx',
    'src/components/checkout/seat-selector-lazy.tsx',
  ]

  test.each(FIXED)('%s names its busy region through a role', (rel) => {
    // Through the SAME view the guard uses. seat-selector-lazy.tsx documents the
    // banned shape verbatim in its own comment, and reading the raw file would
    // convict the one file that carries the fix, which is precisely why the
    // guard reads comment-stripped source.
    expect(judgeSource(stripComments(read(rel)), rel).found).toHaveLength(0)
  })

  test('and the stripper is load-bearing here, not decoration', () => {
    const raw = read('src/components/checkout/seat-selector-lazy.tsx')
    expect(judgeSource(raw, 'raw').found.length).toBeGreaterThan(0)
  })
})
