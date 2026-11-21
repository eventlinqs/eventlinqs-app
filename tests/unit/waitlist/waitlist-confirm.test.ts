import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * THE CITY WAITLIST, ONE STEP (law 50 (a), Lawal, 21 November 2026, 10:06: "If someone ticks the box for anything, that
 * is the record"). The join records the waitlist row AND the city's digest consent at once, with the waitlist's own
 * wording and version, the time and the request's IP; the email says the person is on the list and carries no Confirm
 * link. (Until 21 November the join wrote no consent and emailed a sealed Confirm link.)
 */

const sent: Array<{ to: string; subject: string; html: string; text: string }> = []
const consentWrites: unknown[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }) }))
vi.mock('@/lib/flags', () => ({ isFlagEnabled: vi.fn(async () => true) }))
vi.mock('@/lib/rate-limit/action', () => ({ actionRateLimit: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/site-origin', () => ({ getRequestOrigin: vi.fn(async () => 'https://www.eventlinqs.com.au') }))
vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async (m: { to: string; subject: string; html: string; text: string }) => {
    sent.push(m)
    return { id: 'resend-1' }
  }),
}))
vi.mock('@/lib/consent/record', () => ({
  recordPlatformDigestConsent: vi.fn(async (...a: unknown[]) => {
    consentWrites.push(a)
    return true
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      expect(table).toBe('city_waitlist_signups')
      const q = {
        upsert: () => q,
        select: () => q,
        single: async () => ({ data: { unsubscribe_token: '11111111-2222-3333-4444-555555555555' }, error: null }),
      }
      return q
    },
  }),
}))

import { joinCityWaitlist } from '@/app/waitlist/actions'
import { buildWaitlistConfirmationEmail } from '@/lib/waitlist/confirmation-email'
import { WAITLIST_DIGEST_CONSENT_VERSION, joinConsentText } from '@/lib/waitlist/city-waitlist'

const join = () => joinCityWaitlist({ citySlug: 'geelong', fullName: 'Jo Citizen', email: ' Jo@Example.com.au ', role: 'attendee', marketingOptIn: false })

describe('joining the city waitlist', () => {
  beforeEach(() => {
    sent.length = 0
    consentWrites.length = 0
  })

  it("writes the city's digest consent at once, the waitlist's own words and version, its time and IP; no Confirm link", async () => {
    const result = await join()
    expect(result).toMatchObject({ ok: true, cityName: 'Geelong', alertsOn: true })
    expect(consentWrites).toHaveLength(1)
    const [, params] = consentWrites[0] as [unknown, Record<string, unknown>]
    expect(params).toMatchObject({
      email: 'jo@example.com.au',
      citySlug: 'geelong',
      consentText: joinConsentText('Geelong'),
      consentVersion: WAITLIST_DIGEST_CONSENT_VERSION,
      reference: '203.0.113.7',
    })
    expect(String(params.source)).toContain('law 50')
    expect(Date.parse(String(params.at))).toBeGreaterThan(Date.now() - 60_000)
    expect(sent).toHaveLength(1)
    expect(sent[0].subject).toBe('You are on the Geelong list')
    expect(sent[0].html).not.toContain('/subscribe/confirm/')
    expect(sent[0].text).not.toContain('/subscribe/confirm/')
  })
})

describe('the waitlist email', () => {
  const base = {
    cityName: 'Geelong',
    fullName: 'Jo Citizen',
    role: 'attendee' as const,
    foundingCandidate: false,
    unsubscribeUrl: 'https://www.eventlinqs.com.au/waitlist/unsubscribe/tok',
    marketingOptIn: false,
  }

  it('asks for Confirm and never says the alerts have started', () => {
    const m = buildWaitlistConfirmationEmail({ ...base, confirmUrl: 'https://www.eventlinqs.com.au/subscribe/confirm/abc' })
    expect(m.subject).toBe('Confirm your Geelong alerts')
    expect(m.html).toContain('href="https://www.eventlinqs.com.au/subscribe/confirm/abc"')
    expect(m.html).toContain('Confirm my alerts')
    for (const part of [m.subject, m.html, m.text]) {
      expect(part).not.toMatch(/set up for/i)
      expect(part).not.toMatch(/weekly/i)
      expect(part).not.toMatch(/[\u2013\u2014!]/)
    }
  })

  it('with no Confirm link says no alerts will start yet, and shows no Confirm button', () => {
    const m = buildWaitlistConfirmationEmail({ ...base, confirmUrl: null })
    expect(m.subject).toBe('You are on the Geelong list')
    expect(m.text).toContain('no alerts will start yet')
    expect(m.html).not.toContain('Confirm my alerts')
  })
})
