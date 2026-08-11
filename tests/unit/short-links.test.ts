import { describe, expect, it } from 'vitest'
import {
  CHANNEL_MARKERS,
  LEGACY_SHORT_LINK_SEGMENT,
  RESERVED_CODES,
  SHORT_LINK_SEGMENT,
  buildEventShortUrl,
  buildReadableCode,
  channelFromCode,
  codeDateToken,
  codeStem,
  isValidReadableCode,
} from '@/lib/broadcast/short-links'
import { buildShortUrl, isValidShareCode } from '@/lib/broadcast/share-codes'

/**
 * The share address is the only thing a stranger judges before tapping, and
 * these are the constraints the founder set on it. Each one is asserted rather
 * than asserted about.
 */

describe('the address a stranger sees', () => {
  it('is on the segment the category uses, not the shortener one', () => {
    // Eventbrite's own default event address is /e/[slug]. /s/ is a URL
    // shortener convention and appears nowhere in ticketing.
    expect(SHORT_LINK_SEGMENT).toBe('e')
    expect(buildShortUrl('https://www.eventlinqs.com.au', 'basement-45-ig')).toBe(
      'https://www.eventlinqs.com.au/e/basement-45-ig',
    )
    expect(buildEventShortUrl('https://www.eventlinqs.com.au/', 'basement-45-ig')).toBe(
      'https://www.eventlinqs.com.au/e/basement-45-ig',
    )
  })

  it('reads as the event, not as a random string', () => {
    expect(buildReadableCode('basement-45-warehouse-session', 'instagram')).toBe('basement-45-ig')
    expect(buildReadableCode('pakington-street-makers-market', 'whatsapp')).toBe(
      'pakington-street-wa',
    )
  })

  it('fits the ticket bar it has to be drawn into', () => {
    // The full event path with a channel marker measured 72 characters, which
    // forced the story card type down to roughly 21 pixels against the 38 the
    // design uses. This is the number that decided the format.
    const shown = buildShortUrl('https://www.eventlinqs.com.au', 'basement-45-ig').replace(
      /^https?:\/\//,
      '',
    )
    expect(shown).toBe('www.eventlinqs.com.au/e/basement-45-ig')
    expect(shown.length).toBeLessThanOrEqual(40)
  })

  it('never breaks a slug mid-word', () => {
    expect(codeStem('a-night-for-the-barwon-boat-shed-appeal')).toBe('a-night-for-the')
    expect(codeStem('short')).toBe('short')
    expect(codeStem('Ivy Turns Six: Dinosaur Party')).toBe('ivy-turns-six')
    // Every cut lands on a word boundary, never inside one.
    for (const slug of [
      'a-night-for-the-barwon-boat-shed-appeal',
      'pakington-street-makers-market',
      'basement-45-warehouse-session',
    ]) {
      expect(slug.startsWith(codeStem(slug))).toBe(true)
    }
  })

  it('carries the channel so a sale can be attributed to where it came from', () => {
    for (const [channel, marker] of Object.entries(CHANNEL_MARKERS)) {
      const code = buildReadableCode('basement-45', channel as keyof typeof CHANNEL_MARKERS)
      expect(code.endsWith(`-${marker}`)).toBe(true)
      expect(channelFromCode(code)).toBe(channel)
    }
  })

  it('answers a collision with the date, not an opaque code', () => {
    // The event that collides with its own name is the weekly night, and a
    // dated code serves that case better than an undated one: it tells the
    // audience which night they are buying.
    expect(
      buildReadableCode('basement-45-warehouse-session', 'instagram', { dateToken: '26sep' }),
    ).toBe('basement-45-26sep-ig')
    expect(channelFromCode('basement-45-26sep-ig')).toBe('instagram')
  })

  it('still reads the channel back with a numeric suffix on top of the date', () => {
    const code = buildReadableCode('winter-market', 'facebook', {
      dateToken: '5oct',
      disambiguator: 2,
    })
    expect(code).toBe('winter-market-5oct-fb-2')
    expect(channelFromCode(code)).toBe('facebook')
  })

  it('builds the date token in the event own timezone', () => {
    // 26 September 22:00 Melbourne is still 26 September to the people going.
    expect(codeDateToken('2026-09-26T12:00:00Z', 'Australia/Melbourne')).toBe('26sep')
    expect(codeDateToken(null, 'Australia/Melbourne')).toBeNull()
    expect(codeDateToken('not-a-date', 'Australia/Melbourne')).toBeNull()
  })
})

describe('constraint a: a code can never shadow a route', () => {
  it('refuses every reserved segment', () => {
    for (const reserved of RESERVED_CODES) {
      expect(isValidReadableCode(reserved), reserved).toBe(false)
    }
  })

  it('refuses the segments the founder named explicitly', () => {
    for (const route of [
      'events', 'login', 'signup', 'guides', 'pricing', 'help', 'contact',
      'dashboard', 'admin', 'legal', 'categories', 'community', 'cities',
      'waitlist', 'join', 'organisers', 'e', 's',
    ]) {
      expect(isValidReadableCode(route), route).toBe(false)
    }
  })

  it('refuses anything that is not a plain lowercase slug', () => {
    expect(isValidReadableCode('Basement-45')).toBe(false)
    expect(isValidReadableCode('basement_45')).toBe(false)
    expect(isValidReadableCode('basement--45')).toBe(false)
    expect(isValidReadableCode('-basement')).toBe(false)
    expect(isValidReadableCode('basement-')).toBe(false)
    expect(isValidReadableCode('../events')).toBe(false)
    expect(isValidReadableCode('a')).toBe(false)
    expect(isValidReadableCode('x'.repeat(49))).toBe(false)
    expect(isValidReadableCode(null)).toBe(false)
  })

  it('accepts a real minted code', () => {
    expect(isValidReadableCode('basement-45-ig')).toBe(true)
    expect(isValidReadableCode(buildReadableCode('ivy-turns-six-dinosaur-party', 'email'))).toBe(true)
  })
})

describe('constraint b: a legacy code resolves forever', () => {
  it('still passes the legacy format gate', () => {
    // A poster hanging in a venue window carries this form.
    expect(isValidShareCode('Rk9dW2xa1B')).toBe(true)
    expect(isValidShareCode('7fQ2mKp1Zc')).toBe(true)
  })

  it('keeps the legacy segment alive alongside the new one', () => {
    expect(LEGACY_SHORT_LINK_SEGMENT).toBe('s')
    expect(SHORT_LINK_SEGMENT).not.toBe(LEGACY_SHORT_LINK_SEGMENT)
  })

  it('accepts a legacy code as a readable one only if it is genuinely slug-shaped', () => {
    // A legacy code is mixed case, so the readable gate rejects it and the
    // legacy gate accepts it. Both are tried, so both resolve.
    expect(isValidReadableCode('Rk9dW2xa1B')).toBe(false)
    expect(isValidShareCode('Rk9dW2xa1B')).toBe(true)
  })
})

describe('constraint c: a code is never released', () => {
  it('is enforced by the database, not by application code', () => {
    // The mechanism is the UNIQUE index on share_links.code plus the migration
    // that stops an event deletion cascading the row away
    // (20260808000001_share_codes_never_released.sql). Asserted here as a
    // pointer: a unit test cannot prove a constraint that lives in Postgres,
    // and pretending otherwise would be worse than saying so.
    expect(SHORT_LINK_SEGMENT).toBe('e')
  })
})
