import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * THE WELCOME, AT ONCE (law 50 (a), Lawal, 21 November 2026, 10:06: "If somebody clicks on 'Subscribe to a newsletter,'
 * that is the record"). The first email a subscriber receives is this week's picks for their city, built by the weekly
 * digest's own reads and template, with the one click unsubscribe pair from the token the digest uses. Never a request
 * to confirm.
 */

const sent: Array<Record<string, unknown>> = []
const fetched: unknown[][] = []
let digestEvents: unknown[] = [{ id: 'e1' }, { id: 'e2' }]
let consentRow: { data: Array<{ unsubscribe_token: string | null; status: string }> | null; error: { message: string } | null } = {
  data: [{ unsubscribe_token: 'tok-123', status: 'granted' }],
  error: null,
}
let sendFails = false
let bounced = new Set<string>()
let ledgerSays = true

vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async (m: Record<string, unknown>) => {
    if (sendFails) throw new Error('provider refused')
    sent.push(m)
    return { id: 'resend-1' }
  }),
}))
vi.mock('@/lib/consent/resolver', () => ({
  filterPermittedRecipients: vi.fn(async (_a: unknown, emails: string[]) =>
    ledgerSays ? { permitted: emails, refused: [] } : { permitted: [], refused: emails.map((email) => ({ email, reason: 'suppressed' })) },
  ),
}))
vi.mock('@/lib/email/delivery-events', () => ({
  undeliverableAddresses: vi.fn(async () => bounced),
}))
vi.mock('@/lib/broadcast/digest', () => ({
  resolveDigestPeriod: vi.fn(() => ({ start: '2026-11-21', end: '2026-11-28' })),
  fetchDigestEvents: vi.fn(async (...a: unknown[]) => {
    fetched.push(a)
    return digestEvents
  }),
  buildDigestEmailHtml: vi.fn((input: { cityName: string; unsubscribeUrl: string }) => ({
    subject: 'unused',
    html: `<p>${input.cityName}</p><a href="${input.unsubscribeUrl}">Unsubscribe</a>`,
    text: `${input.cityName} ${input.unsubscribeUrl}`,
  })),
}))

import { sendNewsletterWelcome, welcomeSubject } from '@/lib/newsletter/welcome'

function admin() {
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: async () => consentRow,
  }
  return { from: (table: string) => { expect(table).toBe('marketing_consents'); return q } } as never
}

const input = { email: 'jo@example.com.au', citySlug: 'melbourne', cityName: 'Melbourne', origin: 'https://www.eventlinqs.com.au' }

describe('the newsletter welcome', () => {
  beforeEach(() => {
    sent.length = 0
    fetched.length = 0
    digestEvents = [{ id: 'e1' }, { id: 'e2' }]
    consentRow = { data: [{ unsubscribe_token: 'tok-123', status: 'granted' }], error: null }
    sendFails = false
    bounced = new Set<string>()
    ledgerSays = true
  })

  it("sends this week's picks for the city at once, with the one click unsubscribe from the digest's own token", async () => {
    expect(await sendNewsletterWelcome(admin(), input)).toBe('sent')
    expect(fetched[0][1]).toBe('melbourne')
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('jo@example.com.au')
    expect(sent[0].subject).toBe("Welcome to the Melbourne guide: this week's picks")
    expect(String(sent[0].html)).toContain('https://www.eventlinqs.com.au/unsubscribe/digest/tok-123')
    const headers = sent[0].headers as Record<string, string>
    expect(Object.values(headers).join(' ')).toContain('tok-123')
    expect(String(sent[0].html)).not.toMatch(/confirm/i)
  })

  it('a week with no picks sends nothing: Wednesday is then the first edition', async () => {
    digestEvents = []
    expect(await sendNewsletterWelcome(admin(), input)).toBe('no_picks')
    expect(sent).toHaveLength(0)
  })

  it('no granted row, or a failed read, sends nothing and says so', async () => {
    consentRow = { data: [{ unsubscribe_token: 'tok-123', status: 'withdrawn' }], error: null }
    expect(await sendNewsletterWelcome(admin(), input)).toBe('no_token')
    consentRow = { data: null, error: { message: 'timeout' } }
    expect(await sendNewsletterWelcome(admin(), input)).toBe('no_token')
    expect(sent).toHaveLength(0)
  })

  it('an address with a recorded hard bounce is never sent to (law 50 (d))', async () => {
    bounced = new Set(['jo@example.com.au'])
    expect(await sendNewsletterWelcome(admin(), input)).toBe('undeliverable')
    expect(sent).toHaveLength(0)
  })

  it('the consent ledger decides, as for the digest: a refusal there sends nothing', async () => {
    ledgerSays = false
    expect(await sendNewsletterWelcome(admin(), input)).toBe('refused')
    expect(sent).toHaveLength(0)
  })

  it('a refused send is reported as not sent, never as sent', async () => {
    sendFails = true
    expect(await sendNewsletterWelcome(admin(), input)).toBe('not_sent')
  })

  it('the subject carries no exclamation mark and no dash (the copy laws)', () => {
    const s = welcomeSubject('Geelong')
    expect(s).not.toMatch(/[!\u2013\u2014]/)
    expect(s).not.toContain(' - ')
  })
})
