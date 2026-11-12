import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * THE CITY WAITLIST, DOUBLE OPT IN (WINDOW 5A, 12 November 2026, the waitlist car of Release 2). The join records the
 * waitlist row and emails a sealed Confirm link; it writes no consent and starts no alert. The link opens as the
 * waitlist's own form, so Confirm records the waitlist's words (tests/unit/newsletter/confirm.test.ts).
 */

const sent: Array<{ to: string; subject: string; html: string; text: string }> = []
const consentWrites: unknown[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
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
import { openConfirmRequest, resolveConfirmSecret } from '@/lib/newsletter/confirm-token'
import { buildWaitlistConfirmationEmail } from '@/lib/waitlist/confirmation-email'
import { WAITLIST_DIGEST_CONSENT_VERSION } from '@/lib/waitlist/city-waitlist'

const join = () => joinCityWaitlist({ citySlug: 'geelong', fullName: 'Jo Citizen', email: ' Jo@Example.com.au ', role: 'attendee', marketingOptIn: false })

describe('joining the city waitlist', () => {
  beforeEach(() => {
    sent.length = 0
    consentWrites.length = 0
  })

  it('emails a Confirm link sealed as the waitlist form, and writes no consent', async () => {
    const result = await join()
    expect(result).toMatchObject({ ok: true, cityName: 'Geelong', confirmationEmailed: true })
    expect(consentWrites).toEqual([])
    expect(sent).toHaveLength(1)
    const href = /href="https:\/\/www\.eventlinqs\.com\.au\/subscribe\/confirm\/([A-Za-z0-9_-]+)"/.exec(sent[0].html)
    expect(href).not.toBeNull()
    const opened = openConfirmRequest(href![1], resolveConfirmSecret() as string, Date.now())
    expect(opened.ok).toBe(true)
    if (opened.ok) {
      expect(opened.request).toMatchObject({
        email: 'jo@example.com.au',
        citySlug: 'geelong',
        cityName: 'Geelong',
        consentVersion: WAITLIST_DIGEST_CONSENT_VERSION,
        source: 'waitlist-page',
        kind: 'waitlist',
      })
    }
    expect(sent[0].text).toContain(`/subscribe/confirm/${href![1]}`)
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
