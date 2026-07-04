import { describe, it, expect } from 'vitest'
import {
  chooseChannel,
  isWithinQuietHours,
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
