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

describe('a rail of one draws one card, and nothing fills it', () => {
  /*
   * REVERSED by Lawal's emergency correction of 31 October 2026 (17:44; the CONTROLLER's 17:55 order 1). A thin rail
   * used to top up with 'Open slot' InvitationCards (invitationFillCount: a rail of one drew four cards, an empty
   * /events rail three). A public collection now draws only real published events, fewer cards when inventory is thin,
   * and an empty rail is hidden. The rendered proof is tests/component/home/no-filler-in-rails.test.tsx; the source
   * proof is scripts/guards/no-filler-in-event-collections.mjs.
   */
  const RAIL_FILES = [
    'src/components/features/home/event-rail-section.tsx',
    'src/components/features/events/m5-recommended-rail.tsx',
    'src/components/features/home/featured-venues-section.tsx',
  ]

  it.each(RAIL_FILES)('%s draws no card from a count', rel => {
    expect(code(readFileSync(join(REPO_ROOT, rel), 'utf8'))).not.toMatch(/Array\.from\(\s*\{\s*length|InvitationCard|invitationFillCount/)
  })

  it('negative control: the detector flags the fill that shipped', () => {
    expect('{Array.from({ length: invitationFillCount(events.length) }, (_, i) => (').toMatch(/Array\.from\(\s*\{\s*length|InvitationCard|invitationFillCount/)
  })

  it('the shared rails hide when they have nothing to show', () => {
    for (const rel of RAIL_FILES.slice(0, 2)) {
      expect(code(readFileSync(join(REPO_ROOT, rel), 'utf8')), rel).toMatch(/if \(events\.length === 0\) return null/)
    }
  })
})
