import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/*
 * THE OUTREACH UNSUBSCRIBE PAGE, AS A LINK SCANNER OPENS IT (the PM's 08:13 of 24 November 2026: Sentry's 06:02:31 email
 * on /unsubscribe/outreach, 81 seconds after the first source ask went out; "a scanner's GET must never error and never
 * unsubscribe on its own"). The page itself, rendered for every shape of t a link can carry (valid, valid in capitals,
 * malformed, missing, repeated) and of id: it reads no table, writes no row, calls no network and sends nothing, and it
 * renders the form without throwing. Only a valid token rides on the form; anything else asks for the address. The
 * database client, the email sender and the limiter are stand ins that count every call; the action itself is the real
 * one, wired to the form and never run by a load. The press is held in tests/unit/outreach/outreach-unsubscribe.test.ts.
 */

const h = vi.hoisted(() => ({ admin: 0, sent: 0, limited: 0, captured: 0 }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    h.admin += 1
    throw new Error('the page asked the database on load')
  },
}))
vi.mock('@/lib/email/send', () => ({
  sendEmail: async () => {
    h.sent += 1
    return { id: 'email-1' }
  },
}))
vi.mock('@/lib/rate-limit/action', () => ({
  actionRateLimit: async () => {
    h.limited += 1
    return { ok: true, retryAfterSeconds: 60 }
  },
}))
vi.mock('@/lib/observability/sentry', () => ({
  captureException: () => {
    h.captured += 1
  },
}))

const { default: OutreachUnsubscribePage } = await import('@/app/unsubscribe/outreach/page')

const TOKEN = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'
const HEADING = 'Unsubscribe from EventLinqs emails'

const fetchSpy = vi.fn()
beforeEach(() => {
  h.admin = 0
  h.sent = 0
  h.limited = 0
  h.captured = 0
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => vi.unstubAllGlobals())

const open = async (query: Record<string, string | string[]>) => render(await OutreachUnsubscribePage({ searchParams: Promise.resolve(query) }))

describe('a GET of /unsubscribe/outreach reads nothing, writes nothing and never throws', () => {
  const CASES: [string, Record<string, string | string[]>, string | null][] = [
    ['a valid token', { t: TOKEN }, TOKEN],
    ['a valid token in capitals', { t: TOKEN.toUpperCase() }, TOKEN],
    ['a malformed token', { t: 'Object Not Found Matching Id:1' }, null],
    ['a token cut short', { t: TOKEN.slice(0, 20) }, null],
    ['no token', {}, null],
    ['an empty token', { t: '' }, null],
    ['a repeated token', { t: [TOKEN, TOKEN] }, null],
    ['a repeated id', { id: ['123456', '654321'] }, null],
    ['a token and an id both malformed', { t: 'zzzz', id: 'abc' }, null],
  ]

  for (const [name, query, carried] of CASES) {
    it(`${name}: the form, and nothing asked of the database, the network, the sender or the limiter`, async () => {
      const { container } = await open(query)
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(HEADING)
      const t = container.querySelector('input[name="t"]') as HTMLInputElement | null
      expect(t?.value ?? null).toBe(carried)
      // Only a link that names the contact skips the address; every other shape asks for it.
      expect(container.querySelector('input[name="email"]') === null).toBe(carried !== null)
      expect({ admin: h.admin, sent: h.sent, limited: h.limited, captured: h.captured }).toEqual({ admin: 0, sent: 0, limited: 0, captured: 0 })
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  }
})
