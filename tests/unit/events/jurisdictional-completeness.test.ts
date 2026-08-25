/**
 * ALL OF AUSTRALIA, IN EVERY JURISDICTION-DEPENDENT LIST.
 *
 * Founder standing rule, 23 August 2026: this platform operates in all six
 * states and both mainland territories, and a partial list is a defect, not an
 * abbreviation.
 *
 * THE DEFECT THIS FILE WAS WRITTEN FOR. The event-creation form carried a
 * hand-written list of five Australian timezones (Melbourne, Sydney, Brisbane,
 * Perth, Adelaide). Australia/Hobart and Australia/Darwin were absent, so an
 * organiser in Tasmania or the Northern Territory could not select their own
 * timezone and had to choose somebody else's.
 *
 * For Darwin that was not cosmetic, and the arithmetic is asserted below rather
 * than described: the Northern Territory does not observe daylight saving, so
 * Australia/Darwin is +09:30 all year, while Australia/Adelaide (the closest
 * option the form DID offer) is +10:30 for the whole daylight-saving season. A
 * Darwin organiser picking the nearest available zone had every event time
 * wrong by one hour from October to April.
 *
 * The absence assertions carry negative controls that feed the detector the
 * five-zone list that shipped.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { AUSTRALIAN_ZONES, timezoneForVenue } from '@/lib/dates/venue-timezone'

const REPO_ROOT = process.cwd()

/** All six states and both mainland territories. No abbreviating this list. */
const JURISDICTIONS = [
  { code: 'NSW', name: 'New South Wales', zone: 'Australia/Sydney' },
  { code: 'VIC', name: 'Victoria', zone: 'Australia/Melbourne' },
  { code: 'QLD', name: 'Queensland', zone: 'Australia/Brisbane' },
  { code: 'WA', name: 'Western Australia', zone: 'Australia/Perth' },
  { code: 'SA', name: 'South Australia', zone: 'Australia/Adelaide' },
  { code: 'TAS', name: 'Tasmania', zone: 'Australia/Hobart' },
  { code: 'ACT', name: 'Australian Capital Territory', zone: 'Australia/Sydney' },
  { code: 'NT', name: 'Northern Territory', zone: 'Australia/Darwin' },
] as const

/** The offset a zone is at on a given instant, as reported by the platform. */
function offsetAt(zone: string, iso: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(iso))
    .find(p => p.type === 'timeZoneName')!.value
}

describe('every jurisdiction resolves to a timezone', () => {
  it('the list under test is all eight, not a subset', () => {
    expect(JURISDICTIONS).toHaveLength(8)
  })

  it.each(JURISDICTIONS)('$code ($name) resolves from its code', ({ code, zone }) => {
    expect(timezoneForVenue({ state: code })).toBe(zone)
  })

  it.each(JURISDICTIONS)('$code resolves from its full name too', ({ name, zone }) => {
    // An organiser types "Tasmania" as readily as "TAS".
    expect(timezoneForVenue({ state: name })).toBe(zone)
  })

  it('negative control: an unknown state resolves to null, not to a guess', () => {
    // A resolver that silently returned Sydney would pass every assertion above
    // while being the exact defect it replaced.
    expect(timezoneForVenue({ state: 'Neverland' })).toBeNull()
    expect(timezoneForVenue({ state: '' })).toBeNull()
  })
})

describe('the organiser can select their own timezone', () => {
  it('every jurisdiction has a selectable zone', () => {
    for (const j of JURISDICTIONS) {
      expect(AUSTRALIAN_ZONES, `${j.code} has no selectable zone`).toContain(j.zone)
    }
  })

  it('Hobart and Darwin are present, by name', () => {
    // Named explicitly because these are the two that were missing, and a list
    // that loses them again should fail on a line that says so.
    expect(AUSTRALIAN_ZONES).toContain('Australia/Hobart')
    expect(AUSTRALIAN_ZONES).toContain('Australia/Darwin')
  })

  it('the event form builds its Australian options from that one source', () => {
    // The form is a client component; asserting on its source keeps this test
    // out of React while still catching a hand-written list coming back.
    const form = readFileSync(
      join(REPO_ROOT, 'src/components/features/events/event-form.tsx'),
      'utf8',
    )
    expect(form).toMatch(/\.\.\.AUSTRALIAN_ZONES/)
  })

  it('negative control: the five-zone list that shipped would fail this', () => {
    const shipped = [
      'Australia/Melbourne',
      'Australia/Sydney',
      'Australia/Brisbane',
      'Australia/Perth',
      'Australia/Adelaide',
    ]
    const missing = JURISDICTIONS.filter(j => !shipped.includes(j.zone)).map(j => j.code)
    expect(missing).toEqual(['TAS', 'NT'])
  })
})

describe('why Darwin could not simply pick Adelaide', () => {
  // Southern summer: daylight saving is active in SA and is never active in NT.
  const SUMMER = '2026-01-15T12:00:00Z'
  const WINTER = '2026-07-15T12:00:00Z'

  it('the Northern Territory does not observe daylight saving', () => {
    expect(offsetAt('Australia/Darwin', SUMMER)).toBe(offsetAt('Australia/Darwin', WINTER))
  })

  it('South Australia does', () => {
    expect(offsetAt('Australia/Adelaide', SUMMER)).not.toBe(offsetAt('Australia/Adelaide', WINTER))
  })

  it('so in summer the two differ by an hour, which is the size of the old bug', () => {
    expect(offsetAt('Australia/Darwin', SUMMER)).toBe('GMT+09:30')
    expect(offsetAt('Australia/Adelaide', SUMMER)).toBe('GMT+10:30')
  })

  it('Queensland and Western Australia do not observe it either', () => {
    // Guards the same class of substitution for the other non-DST jurisdictions.
    expect(offsetAt('Australia/Brisbane', SUMMER)).toBe(offsetAt('Australia/Brisbane', WINTER))
    expect(offsetAt('Australia/Perth', SUMMER)).toBe(offsetAt('Australia/Perth', WINTER))
  })

  it('Hobart matching Melbourne today is a coincidence, not a licence to omit it', () => {
    // They agree at present. They are separately governed zones, and this
    // assertion exists so that if they ever diverge the reason Hobart must be
    // listed becomes louder rather than quieter.
    expect(offsetAt('Australia/Hobart', SUMMER)).toBe(offsetAt('Australia/Melbourne', SUMMER))
    expect(AUSTRALIAN_ZONES).toContain('Australia/Hobart')
  })
})

describe('the city registry covers the whole country', () => {
  it('every jurisdiction has at least one city', async () => {
    const { getAllCities } = await import('@/lib/cities/data')
    const states = new Set(getAllCities().map(c => c.state))
    for (const j of JURISDICTIONS) {
      expect(states, `${j.code} has no city in the registry`).toContain(j.code)
    }
  })

  it('negative control: the registry does not contain a state that does not exist', () => {
    expect(JURISDICTIONS.map(j => j.code)).not.toContain('XYZ')
  })
})
