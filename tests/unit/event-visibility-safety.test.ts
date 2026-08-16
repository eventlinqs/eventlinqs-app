import { describe, expect, it } from 'vitest'
import {
  PUBLIC_VISIBILITY,
  eventRobotsDirective,
  inferVisibility,
  isPubliclyDiscoverable,
  looksLikePrivateResidence,
} from '@/lib/events/visibility'

/**
 * CHILD SAFETY GATE. Founder ruling 9 August 2026.
 *
 * A sixteenth birthday at a home address with forty minors must never reach
 * the public feed, a search index, the sitemap, or the weekly digest.
 *
 * These tests are written to FAIL against the behaviour that shipped before
 * this branch, which is the only way to know they are not vacuous:
 *
 *  - the digest filtered `visibility !== 'private'`, so UNLISTED passed through
 *  - the event page emitted no robots directive at all, so UNLISTED was indexable
 */

const ARRIVALS = {
  dj: 'Warehouse party at the Barwon Club, Marlo Reyes b2b Kita, Sat 20th, doors 10, $25 presale',
  comedian: 'Comedy night at the Prince, first Tuesday every month, 5 comics, $15 on the door',
  market: 'Geelong makers market, third Sunday, 40 stalls, free entry, 9am to 2pm, Johnstone Park',
  workshop: 'Pottery workshop, 6 places, $85, Saturday 27th 10am, my studio in Newtown',
  charity: 'Trivia night for Geelong Animal Rescue, Sat 12th, $30 a head, tables of 8, at the RSL',
  birthday: "Ruby's 16th, Saturday 20th, 6pm at our place in Belmont, about 40 kids, no charge",
} as const

describe('the one predicate fails closed', () => {
  it('only the exact string public is discoverable', () => {
    expect(isPubliclyDiscoverable('public')).toBe(true)
    expect(isPubliclyDiscoverable('unlisted')).toBe(false)
    expect(isPubliclyDiscoverable('private')).toBe(false)
  })

  it('treats null, undefined and empty as NOT public', () => {
    expect(isPubliclyDiscoverable(null)).toBe(false)
    expect(isPubliclyDiscoverable(undefined)).toBe(false)
    expect(isPubliclyDiscoverable('')).toBe(false)
  })

  it('treats an unrecognised future enum value as NOT public', () => {
    // The regression this stops: a migration adds 'members_only' and a
    // deny-list style check (`!== 'private'`) silently publishes it.
    expect(isPubliclyDiscoverable('members_only')).toBe(false)
    expect(isPubliclyDiscoverable('Public')).toBe(false)
    expect(isPubliclyDiscoverable('PUBLIC')).toBe(false)
  })
})

describe('PROOF 2 of 4: the search index', () => {
  it('a public event gets no robots block', () => {
    expect(eventRobotsDirective(PUBLIC_VISIBILITY)).toBeUndefined()
  })

  it('an UNLISTED event is noindex, nofollow, noimageindex', () => {
    // This is the assertion that fails against origin/main, where the event
    // page emitted no robots directive of any kind.
    const robots = eventRobotsDirective('unlisted')
    expect(robots).toBeDefined()
    expect(robots?.index).toBe(false)
    expect(robots?.follow).toBe(false)
    expect(robots?.googleBot.index).toBe(false)
    expect(robots?.googleBot.noimageindex).toBe(true)
  })

  it('a PRIVATE event is noindex', () => {
    expect(eventRobotsDirective('private')?.index).toBe(false)
  })

  it('a missing visibility is noindex rather than indexed by default', () => {
    expect(eventRobotsDirective(null)?.index).toBe(false)
  })
})

describe('composer inference defaults to unlisted, never public', () => {
  it('the kids birthday is UNLISTED', () => {
    const v = inferVisibility(ARRIVALS.birthday)
    expect(v.visibility).toBe('unlisted')
    expect(v.signals).toContain('birthday-age')
    expect(v.signals).toContain('private-home')
  })

  it('a private signal beats a public signal, because the cost is asymmetric', () => {
    // Deliberately mixes both: a birthday held at a pub with ticket language.
    // Private must still win.
    const v = inferVisibility("Ruby's 16th at the Barwon Club, $25 tickets")
    expect(v.visibility).toBe('unlisted')
  })

  it('silence returns unlisted, not public', () => {
    expect(inferVisibility('').visibility).toBe('unlisted')
    expect(inferVisibility('saturday').visibility).toBe('unlisted')
    expect(inferVisibility('a thing happening').visibility).toBe('unlisted')
  })

  it('every private-gathering shape is caught', () => {
    for (const text of [
      'engagement party at our place',
      'baby shower, my house, Sunday',
      'housewarming Saturday night',
      "Mum's 60th at home",
      'private function, invite only',
      'wake for Dad, Thursday',
    ]) {
      expect(inferVisibility(text).visibility, text).toBe('unlisted')
    }
  })

  it('the four genuinely public arrivals are public', () => {
    expect(inferVisibility(ARRIVALS.dj).visibility).toBe('public')
    expect(inferVisibility(ARRIVALS.comedian).visibility).toBe('public')
    expect(inferVisibility(ARRIVALS.market).visibility).toBe('public')
    expect(inferVisibility(ARRIVALS.charity).visibility).toBe('public')
  })

  it('the workshop at a private studio is UNLISTED despite a price', () => {
    // "my studio" is a private-residence signal and outranks the $85.
    // The organiser can publish it in one tap; we do not do it for them.
    expect(inferVisibility(ARRIVALS.workshop).visibility).toBe('unlisted')
  })

  it('always gives the organiser a plain sentence, never jargon or a warning', () => {
    for (const text of Object.values(ARRIVALS)) {
      const { reason } = inferVisibility(text)
      expect(reason.length).toBeGreaterThan(10)
      expect(reason).not.toMatch(/[!—–]/)
      expect(reason.toLowerCase()).not.toMatch(/\b(error|warning|denied|blocked|invalid)\b/)
    }
  })
})

describe('private residences hold the street address back', () => {
  it('catches the residence phrasings', () => {
    expect(looksLikePrivateResidence('our place')).toBe(true)
    expect(looksLikePrivateResidence('my studio')).toBe(true)
    expect(looksLikePrivateResidence('Home')).toBe(true)
  })

  it('does not catch real venues', () => {
    expect(looksLikePrivateResidence('The Barwon Club')).toBe(false)
    expect(looksLikePrivateResidence('Johnstone Park')).toBe(false)
    expect(looksLikePrivateResidence(null)).toBe(false)
  })
})
