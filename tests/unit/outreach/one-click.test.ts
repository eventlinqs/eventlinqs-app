import { beforeEach, describe, expect, test, vi } from 'vitest'
import { parseOutreachUnsubscribe } from '@/lib/outreach/unsubscribe'

/**
 * THE CRM's UNSUBSCRIBE: the link names the contact by its token (organiser_contacts.unsubscribe_token), so the page
 * never asks for an address, and the one-click POST stops mail at once. The database half (one row per address, the
 * held drafts voided) is proved on TEST: C:\dev\EVIDENCE\CRM-28OCT\tok-GREEN.txt.
 */

const rpc = vi.fn()
let limited = false

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))
vi.mock('@/lib/rate-limit/middleware', () => ({
  applyRateLimit: async () => (limited ? new Response('slow down', { status: 429 }) : null),
}))

const TOKEN = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'
const ctx = (token: string) => ({ params: Promise.resolve({ token }) })

describe('the page takes the token in place of the address', () => {
  test('a token is enough: no address is asked', () => {
    expect(parseOutreachUnsubscribe({ token: TOKEN })).toEqual({
      ok: true,
      value: { hubspotContactId: null, contactToken: TOKEN, email: null, reason: null, comment: null },
    })
  })
  test('a malformed token is not one, so the address is asked', () => {
    expect(parseOutreachUnsubscribe({ token: 'zzzz' })).toMatchObject({ ok: false, field: 'email' })
  })
  test('the HubSpot link still works as before', () => {
    const parsed = parseOutreachUnsubscribe({ id: '12345' })
    expect(parsed).toEqual({ ok: true, value: { hubspotContactId: '12345', email: null, reason: null, comment: null } })
  })
})

describe('POST /api/outreach/one-click-unsubscribe/[token]', () => {
  beforeEach(() => {
    rpc.mockReset()
    limited = false
  })

  test('records the stop against the token and answers 200', async () => {
    rpc.mockResolvedValue({ data: 'done', error: null })
    const { POST } = await import('@/app/api/outreach/one-click-unsubscribe/[token]/route')
    const res = await POST(new Request('https://www.eventlinqs.com.au/api/outreach/one-click-unsubscribe/x', { method: 'POST', body: 'List-Unsubscribe=One-Click' }), ctx(TOKEN))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, outcome: 'unsubscribed' })
    expect(rpc).toHaveBeenCalledWith('outreach_unsubscribe_by_token', { p_token: TOKEN, p_comment: 'One-click unsubscribe (RFC 8058).' })
  })

  test('a second press is still 200 and writes nothing more', async () => {
    rpc.mockResolvedValue({ data: 'already', error: null })
    const { POST } = await import('@/app/api/outreach/one-click-unsubscribe/[token]/route')
    const res = await POST(new Request('https://x/api', { method: 'POST' }), ctx(TOKEN))
    expect(await res.json()).toEqual({ ok: true, outcome: 'already-unsubscribed' })
  })

  test('a value that cannot be a token is 200 and asks no database', async () => {
    const { POST } = await import('@/app/api/outreach/one-click-unsubscribe/[token]/route')
    const res = await POST(new Request('https://x/api', { method: 'POST' }), ctx('not-a-token'))
    expect(res.status).toBe(200)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('nothing recorded is never reported as done', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    const { POST } = await import('@/app/api/outreach/one-click-unsubscribe/[token]/route')
    const res = await POST(new Request('https://x/api', { method: 'POST' }), ctx(TOKEN))
    expect(res.status).toBe(503)
  })

  test('GET changes nothing and sends the person to the page', async () => {
    const { GET } = await import('@/app/api/outreach/one-click-unsubscribe/[token]/route')
    const res = await GET(new Request('https://www.eventlinqs.com.au/api/outreach/one-click-unsubscribe/x'), ctx(TOKEN))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`https://www.eventlinqs.com.au/unsubscribe/outreach?t=${TOKEN}`)
    expect(rpc).not.toHaveBeenCalled()
  })
})
