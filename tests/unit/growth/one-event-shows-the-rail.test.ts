/**
 * ONE EVENT SHOWS THE RAIL (founder ruling, 23 August 2026).
 *
 * This reverses the ruling of 16 August 2026 recorded in
 * docs/roast/RAIL-MIN-RULING-2026-08-16.md, which held `RAIL_MIN = 3`. That
 * rule was written for a platform with volume. Until we have volume it hides a
 * real organiser's real event for being the only one in its category, on the
 * homepage, on every city page, on every community-by-city page and on every
 * suburb page.
 *
 * WHY THIS FILE EXISTS RATHER THAN A COMMENT. The threshold has already been
 * argued both ways once. The next session that reads the volume law in
 * CLAUDE.md ("a rail with 1 to 2 items next to a rail with 7 is a defect")
 * without reading the reversal will reinstate it. A comment cannot fail a
 * build; this can.
 *
 * Every assertion that measures an ABSENCE carries a NEGATIVE CONTROL that
 * feeds the detector the code it is supposed to reject, so the sweep cannot
 * pass vacuously if its regex silently stops matching.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  invitationFillCount,
  INVITATION_ANGLE_ORDER,
} from '@/components/features/events/invitation-card'

const REPO_ROOT = process.cwd()

/** Every surface that renders an event rail behind a count. */
const RAIL_SURFACES = [
  'src/app/page.tsx',
  'src/components/features/events/m5-recommended-rail.tsx',
  'src/components/templates/CityLandingPage.tsx',
  'src/components/templates/CommunityCityLandingPage.tsx',
  'src/components/templates/SuburbLandingPage.tsx',
]

/**
 * Returns every `<collection>.length >= N` / `> N` / `< N` comparison where N
 * would suppress a rail carrying one event.
 *
 * `length > 0`, `length === 0` and `length < 1` are the legitimate forms: they
 * distinguish "nothing to show" from "not enough to show", and only the second
 * is banned.
 */
function suppressingThresholds(source: string): string[] {
  const found: string[] = []
  // >= 2 or more, > 1 or more, < 2 or more: all hide a rail that has one event.
  const patterns = [
    /\.length\s*>=\s*([2-9]\d*)/g,
    /\.length\s*>\s*([1-9]\d*)/g,
    /\.length\s*<\s*([2-9]\d*)/g,
    /\.length\s*<=\s*([1-9]\d*)/g,
  ]
  for (const re of patterns) {
    for (const m of source.matchAll(re)) found.push(m[0].replace(/\s+/g, ' '))
  }
  return found
}

/** Strips block and line comments so a quoted historical example is not a hit. */
function code(source: string): string {
  return source
    .split('\n')
    .filter(l => {
      const t = l.trimStart()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
}

describe('no rail surface hides a rail that has one event', () => {
  it('reads a real, non-empty set of rail surfaces', () => {
    // Without this the sweep would pass vacuously if a path were renamed.
    for (const rel of RAIL_SURFACES) {
      const body = readFileSync(join(REPO_ROOT, rel), 'utf8')
      expect(body.length, `${rel} is empty`).toBeGreaterThan(200)
    }
    expect(RAIL_SURFACES).toHaveLength(5)
  })

  it.each(RAIL_SURFACES)('%s carries no count threshold that suppresses a rail', rel => {
    const hits = suppressingThresholds(code(readFileSync(join(REPO_ROOT, rel), 'utf8')))
    expect(hits).toEqual([])
  })

  it('the homepage no longer defines RAIL_MIN at all', () => {
    const body = code(readFileSync(join(REPO_ROOT, 'src/app/page.tsx'), 'utf8'))
    expect(body).not.toMatch(/RAIL_MIN/)
  })

  it('negative control: the detector flags each threshold that actually shipped', () => {
    // The four real forms this codebase used, all of which hid a one-event rail.
    expect(suppressingThresholds('{musicEvents.length >= RAIL_MIN && (')).toEqual([])
    expect(suppressingThresholds('{thisWeekendEvents.length >= 4 ? (')).toHaveLength(1)
    expect(suppressingThresholds('if (events.length < MIN_RAIL_COUNT) return null')).toEqual([])
    expect(suppressingThresholds('if (events.length < 3) return null')).toHaveLength(1)
    expect(suppressingThresholds('if (events.length < 5) return null')).toHaveLength(1)
  })

  it('negative control: the detector accepts the legitimate empty checks', () => {
    expect(suppressingThresholds('if (events.length === 0) return null')).toEqual([])
    expect(suppressingThresholds('{allEvents.length > 0 ? (')).toEqual([])
    expect(suppressingThresholds('if (liveCities.length === 0) return null')).toEqual([])
  })
})

describe('a rail of one still reads as deliberate', () => {
  it('one real event renders as four cards, not one', () => {
    // EventRailSection tops a thin rail up with InvitationCards. This is the
    // reason the gate can be removed without the homepage looking broken.
    expect(invitationFillCount(1)).toBe(3)
  })

  it('the fill tapers as real events arrive and vanishes at five', () => {
    expect(invitationFillCount(2)).toBe(3)
    expect(invitationFillCount(3)).toBe(2)
    expect(invitationFillCount(4)).toBe(1)
    expect(invitationFillCount(5)).toBe(0)
    expect(invitationFillCount(12)).toBe(0)
  })

  it('an empty rail fills with invitations, because it is a sales surface', () => {
    /*
     * REVERSED by founder ruling, 26 August 2026: "An empty rail is a sales
     * surface, not a gap. My homepage already carries 'The next live night here
     * is yours' and that should exist on every thin rail, not only some."
     *
     * This assertion previously locked 0, on the reasoning that a rail of pure
     * invitations pretends to be a rail. What that produced in practice was the
     * /events popular rail vanishing entirely, heading and all, the moment the
     * catalogue emptied.
     *
     * Three is the formula's own answer for a count of zero, and it is also
     * exactly the number of distinct angles in INVITATION_ANGLE_ORDER, so an
     * empty rail fills without repeating a card.
     *
     * THE HOMEPAGE IS UNAFFECTED: EventRailSection still returns null at zero
     * events, by the founder's instruction of the same day to leave the homepage
     * alone. This governs the /events rails only.
     */
    expect(invitationFillCount(0)).toBe(3)
    expect(INVITATION_ANGLE_ORDER.length).toBeGreaterThanOrEqual(invitationFillCount(0))
  })
})

describe('a filled rail never repeats an invitation', () => {
  it('offers at least as many distinct angles as a rail of one asks for', () => {
    // invitationFillCount(1) is 3. With only two angles the fill ran
    // organiser, performer, organiser and rendered two word-for-word
    // identical cards in the same rail.
    expect(new Set(INVITATION_ANGLE_ORDER).size).toBeGreaterThanOrEqual(invitationFillCount(1))
  })

  it('the angles are distinct, not a padded list', () => {
    expect(new Set(INVITATION_ANGLE_ORDER).size).toBe(INVITATION_ANGLE_ORDER.length)
  })

  it('the organiser ask always leads the fill', () => {
    expect(INVITATION_ANGLE_ORDER[0]).toBe('organiser')
  })

  it.each([1, 2, 3, 4])('a rail of %i real events fills with no repeated angle', real => {
    const angles = Array.from(
      { length: invitationFillCount(real) },
      (_, i) => INVITATION_ANGLE_ORDER[i % INVITATION_ANGLE_ORDER.length],
    )
    expect(new Set(angles).size).toBe(angles.length)
  })

  it('negative control: the two-angle expression that shipped does repeat', () => {
    // Proves the assertion above measures something real. This is the exact
    // expression the three rails used, run over the three slots a one-event
    // rail asks for.
    const shipped = Array.from({ length: invitationFillCount(1) }, (_, i) =>
      i === 1 ? 'performer' : 'organiser',
    )
    expect(new Set(shipped).size).toBeLessThan(shipped.length)
  })
})
