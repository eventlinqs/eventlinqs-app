/**
 * THE GUARD THAT PASSES BY FINDING NOTHING, AND THE TWO WAYS THAT GOES WRONG.
 *
 * `no-loading-boundary-in-front-of-a-hero` enforces a rule whose satisfied state
 * is a ZERO: no hero-bearing page sits behind a route-level `loading.tsx`. That
 * makes it unlike most guards here, because a zero is also exactly what a broken
 * derivation produces, and the two are indistinguishable from the exit code.
 *
 * So these cases come at it from both sides. The pure helper is tested on inputs
 * whose answer is known by construction, including the prefix trap that a
 * sibling segment sets. And the real tree is judged, with an assertion that the
 * guard's own preconditions were genuinely MET rather than merely checked, so a
 * green run here means "it looked and found nothing" rather than "it could not
 * see".
 *
 * WHY THE PREFIX CASE IS IN HERE AT ALL. `pagesBehind` decides membership with
 * `startsWith(segment + '/')`. Drop that slash, as the obvious version of this
 * function does, and `src/app/events/[slug]` starts claiming every page under a
 * sibling whose name merely begins with the same characters. The guard would
 * then report a hero standing behind a boundary that is not in front of it, and
 * the fix for a fault that does not exist is to delete a boundary that was
 * correct.
 */
import { describe, expect, test } from 'vitest'
import { judge, pagesBehind } from '../../../scripts/guards/no-loading-boundary-in-front-of-a-hero.mjs'

describe('pagesBehind', () => {
  test('claims the boundary segment own page and every page below it', () => {
    const pages = [
      'src/app/events/[slug]/page.tsx',
      'src/app/events/[slug]/holder/page.tsx',
      'src/app/events/[slug]/with/[artist]/page.tsx',
    ]
    expect(pagesBehind('src/app/events/[slug]/loading.tsx', pages).sort()).toEqual(pages.sort())
  })

  test('claims nothing above the boundary', () => {
    const pages = ['src/app/events/page.tsx', 'src/app/page.tsx']
    expect(pagesBehind('src/app/events/[slug]/loading.tsx', pages)).toEqual([])
  })

  test('does not claim a sibling segment whose name merely starts the same way', () => {
    // The prefix trap. Without the separator this returns the sibling's page and
    // the guard invents a fault on a boundary that is nowhere near it.
    const pages = ['src/app/events/[slug]-archive/page.tsx']
    expect(pagesBehind('src/app/events/[slug]/loading.tsx', pages)).toEqual([])
  })
})

describe('judge, against the tree this repository actually has', () => {
  const verdict = judge('src')

  test('no hero-bearing page sits behind a loading boundary', () => {
    expect(verdict.faults).toEqual([])
  })

  test('and the pass was earned by looking, not by going blind', () => {
    // Both halves of clause 1's join must be non-empty, or a zero fault count
    // means the guard could not see rather than that there was nothing to see.
    // These are the same two quantities clause 3 refuses a pass without.
    expect(verdict.loadings).toBeGreaterThan(0)
    expect(verdict.heroPages).toBeGreaterThan(0)
    expect(verdict.pages).toBeGreaterThan(verdict.heroPages)
  })
})
