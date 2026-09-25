import { describe, it, expect } from 'vitest'
import {
  chooseChannel,
  isWithinQuietHours,
  isQuietNow,
  localHourFor,
  buildAlertPayload,
  DEFAULT_PREFS,
  NOTIFICATION_TYPES,
  type NotificationPrefs,
} from '@/lib/notifications/policy'

const prefs = (over: Partial<NotificationPrefs> = {}): NotificationPrefs => ({
  ...DEFAULT_PREFS,
  ...over,
})

describe('chooseChannel', () => {
  it('prefers push when enabled and a subscription exists', () => {
    expect(chooseChannel(prefs(), true)).toBe('push')
  })
  it('falls back to email when push is on but there is no subscription', () => {
    expect(chooseChannel(prefs(), false)).toBe('email')
  })
  it('falls back to email when push is disabled', () => {
    expect(chooseChannel(prefs({ push_enabled: false }), true)).toBe('email')
  })
  it('returns null when the user opted out of everything', () => {
    expect(chooseChannel(prefs({ push_enabled: false, email_enabled: false }), true)).toBeNull()
  })
})

describe('isWithinQuietHours', () => {
  it('is never quiet without a window', () => {
    expect(isWithinQuietHours({ quiet_hours_start: null, quiet_hours_end: null }, 3)).toBe(false)
  })
  it('handles a same-day window (9 to 17)', () => {
    expect(isWithinQuietHours({ quiet_hours_start: 9, quiet_hours_end: 17 }, 12)).toBe(true)
    expect(isWithinQuietHours({ quiet_hours_start: 9, quiet_hours_end: 17 }, 8)).toBe(false)
    expect(isWithinQuietHours({ quiet_hours_start: 9, quiet_hours_end: 17 }, 17)).toBe(false)
  })
  it('handles a wrap-around window (22 to 7)', () => {
    expect(isWithinQuietHours({ quiet_hours_start: 22, quiet_hours_end: 7 }, 23)).toBe(true)
    expect(isWithinQuietHours({ quiet_hours_start: 22, quiet_hours_end: 7 }, 3)).toBe(true)
    expect(isWithinQuietHours({ quiet_hours_start: 22, quiet_hours_end: 7 }, 7)).toBe(false)
    expect(isWithinQuietHours({ quiet_hours_start: 22, quiet_hours_end: 7 }, 12)).toBe(false)
  })
})

describe('buildAlertPayload', () => {
  it('builds just-announced copy with organiser, title and city', () => {
    const p = buildAlertPayload(
      'just_announced',
      { eventTitle: 'Afrobeats Night', eventCity: 'Geelong', organiserName: 'Soundwave', url: 'https://eventlinqs.com/events/afrobeats-night' },
      'evt-1',
    )
    expect(p.title).toBe('Just announced')
    expect(p.body).toContain('Soundwave')
    expect(p.body).toContain('Afrobeats Night')
    expect(p.body).toContain('Geelong')
    expect(p.url).toContain('/events/afrobeats-night')
    expect(p.tag).toBe('event:evt-1:just_announced')
  })

  it('omits city and organiser gracefully', () => {
    const p = buildAlertPayload('on_sale', { eventTitle: 'Jazz Club', url: 'https://x/y' }, 'e2')
    expect(p.body).toContain('Jazz Club')
    expect(p.body).not.toContain('undefined')
  })

  it('every lifecycle type yields clean copy (no dashes, no exclamation marks)', () => {
    for (const type of NOTIFICATION_TYPES) {
      const p = buildAlertPayload(type, { eventTitle: 'Test Event', eventCity: 'Melbourne', url: 'https://x/y' }, 'e')
      expect(p.body).not.toMatch(/[–—!]/)
      expect(p.title).not.toMatch(/[–—!]/)
      expect(p.body.length).toBeGreaterThan(0)
    }
  })
})


/*
 * THE HOUR THE USER IS ACTUALLY LIVING IN.
 *
 * isWithinQuietHours has always been correct and has always been tested. It was
 * also called by nothing, because the piece that turns an instant into the
 * user's own hour did not exist, so the window the account screen collects was
 * never consulted on any send. These cover that missing piece and the decision
 * built on it.
 */
describe('localHourFor', () => {
  const tenAmUtc = new Date('2026-09-13T10:00:00.000Z')

  it('reads the hour in the user zone, not the server one', () => {
    expect(localHourFor('Australia/Sydney', tenAmUtc)).toBe(20)
    expect(localHourFor('UTC', tenAmUtc)).toBe(10)
    expect(localHourFor('America/New_York', tenAmUtc)).toBe(6)
  })

  it('is right on the day the hour does not exist', () => {
    // Sydney enters daylight saving at 2am on 4 October 2026, when 2am becomes
    // 3am. The hour of 2 never happens, and a window of 1 to 3 must stop being
    // quiet at the jump rather than an hour later.
    expect(localHourFor('Australia/Sydney', new Date('2026-10-03T15:30:00.000Z'))).toBe(1)
    expect(localHourFor('Australia/Sydney', new Date('2026-10-03T16:30:00.000Z'))).toBe(3)
  })

  it('returns midnight as 0 rather than 24', () => {
    expect(localHourFor('Australia/Sydney', new Date('2026-09-13T14:10:00.000Z'))).toBe(0)
  })

  it('falls back instead of throwing on a zone the runtime cannot resolve', () => {
    // The preferences API used to accept any string, so such a row can exist.
    // Throwing here would abort a whole cron batch at the first bad row.
    expect(() => localHourFor('Somewhere/Nowhere', tenAmUtc)).not.toThrow()
    expect(localHourFor('Somewhere/Nowhere', tenAmUtc)).toBe(20)
  })
})

describe('isQuietNow', () => {
  const threeThirtyAmSydney = new Date('2026-09-13T17:30:00.000Z')

  it('is quiet at 3am under a 10pm to 7am window', () => {
    expect(
      isQuietNow(
        { quiet_hours_start: 22, quiet_hours_end: 7, timezone: 'Australia/Sydney' },
        threeThirtyAmSydney,
      ),
    ).toBe(true)
  })

  it('is not quiet for a user whose own clock says late afternoon', () => {
    expect(
      isQuietNow(
        { quiet_hours_start: 22, quiet_hours_end: 7, timezone: 'Europe/London' },
        threeThirtyAmSydney,
      ),
    ).toBe(false)
  })

  it('is never quiet when no window is set', () => {
    expect(
      isQuietNow(
        { quiet_hours_start: null, quiet_hours_end: null, timezone: 'Australia/Sydney' },
        threeThirtyAmSydney,
      ),
    ).toBe(false)
    expect(
      isQuietNow(
        { quiet_hours_start: 22, quiet_hours_end: null, timezone: 'Australia/Sydney' },
        threeThirtyAmSydney,
      ),
    ).toBe(false)
  })

  it('agrees with the predicate for every hour of a day, in the user zone', () => {
    const window = { quiet_hours_start: 22, quiet_hours_end: 7, timezone: 'Australia/Perth' }
    for (let h = 0; h < 24; h += 1) {
      // 13 September 2026, hour h in Perth (UTC+8, no daylight saving).
      const instant = new Date(Date.UTC(2026, 8, 13, (h - 8 + 24) % 24, 30))
      expect(isQuietNow(window, instant)).toBe(isWithinQuietHours(window, h))
    }
  })
})
