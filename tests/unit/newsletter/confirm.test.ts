import { beforeEach, describe, expect, it, vi } from 'vitest'

const recorded: Array<Record<string, unknown>> = []
vi.mock('@/lib/consent/record', () => ({
  recordPlatformDigestConsent: vi.fn(async (_db: unknown, params: Record<string, unknown>) => {
    recorded.push(params)
    return true
  }),
}))

import { confirmCityGuide, readConfirmLink } from '@/lib/newsletter/confirm'
import { resolveConfirmSecret, sealConfirmRequest } from '@/lib/newsletter/confirm-token'
import { cityNewsletterConsentWording } from '@/lib/consent/wording'
import { WAITLIST_DIGEST_CONSENT_VERSION, joinConsentText } from '@/lib/waitlist/city-waitlist'
import { confirmationEmail } from '@/lib/newsletter/confirmation-email'

/*
 * THE CONFIRM PRESS (Release 2, item 8: double opt in): the page only reads; the press writes ONE digest consent, with
 * the wording the panel showed, and a second press, or a person already on that city's list, writes nothing more.
 */
const NOW = Date.UTC(2026, 10, 12, 6, 0, 0)
// The key this environment resolves, as the page will: ORDER_ACCESS_SECRET when the env file sets it, else the
// development fallback (so the test holds with and without --env-file).
const SECRET = resolveConfirmSecret() as string
const token = () =>
  sealConfirmRequest(
    { email: 'jo@example.com.au', citySlug: 'geelong', cityName: 'Geelong', consentVersion: 'v1', source: 'newsletter-city', requestedAt: NOW - 3_600_000 },
    SECRET,
  )

function fakeDb(status: string | null) {
  const state = { status }
  const db = {
    from: (table: string) => {
      expect(table).toBe('marketing_consents')
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: async () => ({ data: state.status ? [{ status: state.status }] : [], error: null }),
      }
      return q
    },
  }
  return { db: db as never, state }
}

describe('the confirmation page and its press', () => {
  beforeEach(() => {
    recorded.length = 0
  })

  it('opening the link writes nothing', async () => {
    const { db } = fakeDb(null)
    const link = await readConfirmLink(db, token(), NOW)
    expect(link.state).toBe('waiting')
    expect(recorded).toEqual([])
  })

  it('the press writes one consent, in the words the panel showed, naming both steps', async () => {
    const { db } = fakeDb(null)
    const link = await confirmCityGuide(db, token(), NOW)
    expect(link.state).toBe('confirmed')
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({
      email: 'jo@example.com.au',
      citySlug: 'geelong',
      consentText: cityNewsletterConsentWording('Geelong'),
      consentVersion: 'v1',
      at: new Date(NOW).toISOString(),
    })
    expect(String(recorded[0].source)).toBe('newsletter-city, confirmed by email (asked 2026-11-12T05:00:00.000Z)')
  })

  it("a waitlist join's press writes the waitlist's own words and version, never the guide panel's", async () => {
    const { db } = fakeDb(null)
    const waitlistToken = sealConfirmRequest(
      { email: 'jo@example.com.au', citySlug: 'geelong', cityName: 'Geelong', consentVersion: WAITLIST_DIGEST_CONSENT_VERSION, source: 'waitlist-page', requestedAt: NOW - 3_600_000, kind: 'waitlist' },
      SECRET,
    )
    expect((await readConfirmLink(db, waitlistToken, NOW)).state).toBe('waiting')
    expect(recorded).toEqual([])
    const link = await confirmCityGuide(db, waitlistToken, NOW)
    expect(link.state).toBe('confirmed')
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({ citySlug: 'geelong', consentText: joinConsentText('Geelong'), consentVersion: 'waitlist-v3' })
    expect(String(recorded[0].consentText)).not.toContain('weekly')
  })

  it('a link whose wording version is not the form it names is asked again, not recorded', async () => {
    const { db } = fakeDb(null)
    const crossed = sealConfirmRequest(
      { email: 'jo@example.com.au', citySlug: 'geelong', cityName: 'Geelong', consentVersion: 'v1', source: 'waitlist-page', requestedAt: NOW - 3_600_000, kind: 'waitlist' },
      SECRET,
    )
    expect((await confirmCityGuide(db, crossed, NOW)).state).toBe('expired')
    expect(recorded).toEqual([])
  })

  it('a person already on the list, or a second press, writes nothing more', async () => {
    const { db } = fakeDb('granted')
    expect((await confirmCityGuide(db, token(), NOW)).state).toBe('confirmed')
    expect(recorded).toEqual([])
  })

  it('a person who left the list may confirm again, by their own press', async () => {
    const { db } = fakeDb('withdrawn')
    expect((await confirmCityGuide(db, token(), NOW)).state).toBe('confirmed')
    expect(recorded).toHaveLength(1)
  })

  it('an altered or expired link writes nothing', async () => {
    const { db } = fakeDb(null)
    expect((await confirmCityGuide(db, token().slice(0, -2) + 'AA', NOW)).state).toBe('invalid')
    expect((await confirmCityGuide(db, token(), NOW + 8 * 86_400_000)).state).toBe('expired')
    expect(recorded).toEqual([])
  })
})

describe('the confirmation email', () => {
  const mail = confirmationEmail({ cityName: 'Melbourne', url: 'https://www.eventlinqs.com.au/subscribe/confirm/abc' })

  it('says what was asked for and carries the one link, and nothing else', () => {
    expect(mail.subject).toBe('Confirm your weekly Melbourne guide')
    expect(mail.text).toContain("You asked for Melbourne's best events weekly on EventLinqs.")
    expect(mail.text).toContain('Confirm my weekly guide: https://www.eventlinqs.com.au/subscribe/confirm/abc')
    expect(mail.text).toContain('If you did not ask for this, you need do nothing')
    const links = mail.html.match(/href="[^"]+"/g) ?? []
    expect(links.filter((l) => !l.includes('/subscribe/confirm/'))).toEqual([])
  })

  it('carries no marketing (an email may not ask for consent) and no banned punctuation', () => {
    expect(mail.text).not.toMatch(/tickets?|offer|free month|founding|this weekend|what's on|discover/i)
    expect(mail.subject + mail.text).not.toMatch(/[\u2013\u2014!]/)
  })
})
