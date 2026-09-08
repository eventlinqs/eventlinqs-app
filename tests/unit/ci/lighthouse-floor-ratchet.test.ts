/**
 * THE SECOND LAYER OF THE RATCHET.
 *
 * scripts/guards/lighthouse-floor-ratchet.mjs holds the high-water mark and
 * fails the build when lighthouserc.json falls below it. That guard is source,
 * and a lowering could be pushed through by editing the config AND the mark in
 * one commit. This file is the other half of the pair: it pins the floors that
 * matter as LITERALS, so the same lowering has to be written out three times,
 * in three files, one of which says in its header that it must never happen.
 *
 * The same two-layer shape Law 8 uses for the authorship trailer, for the same
 * reason: one layer can be bypassed by somebody in a hurry, two cannot be
 * bypassed by accident.
 *
 * WHY THESE NUMBERS. Close-out P0.7 and L3, 8 September 2026: once every gated
 * URL cleared 0.80 at median with headroom, the floors were raised to just under
 * the measured medians so the gain can never be given back. Each one is the
 * LOWER of two independent local median-of-five collections, minus 3 points,
 * minus 1 more where that URL's run spread exceeded 5 points. Derivation and the
 * measured table live in lighthouserc.json's own _derivation note.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { judge, readAssertions } from '../../../scripts/guards/lighthouse-floor-ratchet.mjs'

const config = JSON.parse(readFileSync(join(process.cwd(), 'lighthouserc.json'), 'utf8'))
const found = readAssertions(config)

/**
 * The floors in force, written out as literals. Lowering one here as well as in
 * the config and in the guard is a deliberate act, which is the point.
 */
const FLOORS_IN_FORCE: Array<[string, number]> = [
  ['^(?!.*/(login|signup)$)(?!https?://[^/]+/?$).* :: categories:performance', 0.85],
  ['/events/browse/[^/]+$ :: categories:performance', 0.86],
  ['/(login|signup)$ :: categories:performance', 0.87],
  ['/community/[^/]+$ :: categories:performance', 0.88],
  ['/(events|organisers)$ :: categories:performance', 0.88],
  ['^https?://[^/]+/?$ :: categories:performance', 0.88],
  ['/(help|pricing|legal/terms)$ :: categories:performance', 0.91],
]

describe('the Lighthouse floor ratchet', () => {
  it.each(FLOORS_IN_FORCE)('holds %s at %s', (key, floor) => {
    const assertion = found.get(key)
    expect(assertion, `${key} is no longer asserted at all`).toBeDefined()
    expect(assertion?.level).toBe('error')
    expect(assertion?.minScore).toBe(floor)
  })

  it('holds every performance floor at ERROR level, with no waiver anywhere', () => {
    const relaxed = [...found.entries()]
      .filter(([key]) => key.endsWith(':: categories:performance'))
      .filter(([, value]) => value.level !== 'error')
      .map(([key]) => key)
    expect(relaxed, 'a performance floor has been moved off error level').toEqual([])
  })

  it('has no performance floor below 0.85 anywhere in the matrix', () => {
    const low = [...found.entries()]
      .filter(([key]) => key.endsWith(':: categories:performance'))
      .filter(([, value]) => (value.minScore ?? 0) < 0.85)
    expect(low, 'the platform-wide floor is 0.85 and only ever rises').toEqual([])
  })

  it('keeps accessibility and best-practices at 1 on every entry that asserts them', () => {
    const slipped = [...found.entries()]
      .filter(
        ([key]) =>
          key.endsWith(':: categories:accessibility') || key.endsWith(':: categories:best-practices'),
      )
      .filter(([, value]) => value.level !== 'error' || value.minScore !== 1)
      .map(([key]) => key)
    expect(slipped).toEqual([])
  })

  it('keeps the homepage waiver deleted: no dated exemption is in force', () => {
    const dated = (config.ci.assert.assertMatrix as Array<Record<string, unknown>>).filter(
      (entry) => typeof entry._expiresOn === 'string',
    )
    expect(dated, 'a warn-level waiver has come back').toEqual([])
  })

  it('passes on the tree as committed', () => {
    expect(judge(found)).toEqual([])
  })

  it('refuses a floor that has been lowered', () => {
    const lowered = new Map(found)
    lowered.set('^https?://[^/]+/?$ :: categories:performance', { level: 'error', minScore: 0.8 })
    const faults = judge(lowered)
    expect(faults.some((f) => f.startsWith('LOWERED'))).toBe(true)
  })

  it('refuses a check moved from error to warn', () => {
    const weakened = new Map(found)
    weakened.set('^https?://[^/]+/?$ :: categories:performance', { level: 'warn', minScore: 0.88 })
    const faults = judge(weakened)
    expect(faults.some((f) => f.startsWith('WEAKENED'))).toBe(true)
  })

  it('refuses a check that has been deleted outright', () => {
    const deleted = new Map(found)
    deleted.delete('/events/browse/[^/]+$ :: categories:performance')
    const faults = judge(deleted)
    expect(faults.some((f) => f.startsWith('DELETED'))).toBe(true)
  })

  it('refuses a numeric budget that has been loosened', () => {
    const loosened = new Map(found)
    loosened.set('/events/[^/]+$ :: resource-summary:script:size', {
      level: 'error',
      maxNumericValue: 691520,
    })
    const faults = judge(loosened)
    expect(faults.some((f) => f.startsWith('LOOSENED'))).toBe(true)
  })

  it('refuses a new floor that nobody declared, so a weak one cannot slip in', () => {
    const added = new Map(found)
    added.set('/artists/[^/]+$ :: categories:performance', { level: 'warn', minScore: 0.5 })
    const faults = judge(added)
    expect(faults.some((f) => f.startsWith('UNDECLARED'))).toBe(true)
  })

  it('refuses an unrecorded RISE, so the mark cannot silently trail the gate', () => {
    const risen = new Map(found)
    risen.set('/(help|pricing|legal/terms)$ :: categories:performance', {
      level: 'error',
      minScore: 0.95,
    })
    const faults = judge(risen)
    expect(faults.some((f) => f.startsWith('RISEN'))).toBe(true)
  })

  it('refuses a numeric budget tightened without being recorded, for the same reason', () => {
    const tightened = new Map(found)
    tightened.set('/events/[^/]+$ :: mainthread-work-breakdown', {
      level: 'error',
      maxNumericValue: 2000,
    })
    const faults = judge(tightened)
    expect(faults.some((f) => f.startsWith('TIGHTENED'))).toBe(true)
  })
})
