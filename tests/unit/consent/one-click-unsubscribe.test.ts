// THE ONE-CLICK UNSUBSCRIBE PAIR, AND THE ENDPOINT THAT ANSWERS IT.
//
// The defect these exist for: src/lib/email/send.ts handed Resend five fields
// and no headers, a grep for List-Unsubscribe over the whole tree matched
// nothing, and there was no endpoint that could answer the POST the headers
// advertise. Both marketing send paths therefore shipped without what Google
// requires of bulk senders from 1 February 2024
// (https://support.google.com/a/answer/81126, fetched 2026-09-19).
//
// WHY THE ASSERTIONS ARE ON EXACT BYTES rather than on "a header is present".
// A receiver compares List-Unsubscribe-Post literally. "List-Unsubscribe=one-click"
// is a non-conforming message that reads correctly to every human who looks at
// it, which is the whole reason this is pinned here and in the registered guard
// rather than left to review.
//
// RFC 8058 (https://www.rfc-editor.org/rfc/rfc8058.html, fetched 2026-09-19)
// supplies the rest: the List-Unsubscribe header "MUST contain one HTTPS URI",
// the receiver POSTs to it, and "The mail receiver MUST NOT perform a POST on
// the HTTPS URI without user consent."

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LIST_UNSUBSCRIBE_HEADER,
  LIST_UNSUBSCRIBE_POST_HEADER,
  LIST_UNSUBSCRIBE_POST_VALUE,
  ONE_CLICK_UNSUBSCRIBE_ROUTE,
  OneClickUnsubscribeError,
  oneClickUnsubscribeHeaders,
  oneClickUnsubscribeUrl,
} from '@/lib/consent/one-click'

const TOKEN = '6f1b1d1e-2c3a-4b5c-8d9e-0f1a2b3c4d5e'

describe('the two headers, against the bytes the specification publishes', () => {
  it('sets List-Unsubscribe-Post to exactly the RFC 8058 value', () => {
    // Not "contains", not case-insensitive. A receiver does a literal compare.
    expect(LIST_UNSUBSCRIBE_POST_VALUE).toBe('List-Unsubscribe=One-Click')
    const headers = oneClickUnsubscribeHeaders('https://eventlinqs.com', TOKEN)
    expect(headers[LIST_UNSUBSCRIBE_POST_HEADER]).toBe('List-Unsubscribe=One-Click')
  })

  it('wraps the URI in angle brackets, as RFC 2369 list headers are written', () => {
    const headers = oneClickUnsubscribeHeaders('https://eventlinqs.com', TOKEN)
    expect(headers[LIST_UNSUBSCRIBE_HEADER]).toBe(
      `<https://eventlinqs.com${ONE_CLICK_UNSUBSCRIBE_ROUTE}/${TOKEN}>`,
    )
  })

  it('composes both headers and nothing else', () => {
    const headers = oneClickUnsubscribeHeaders('https://eventlinqs.com', TOKEN)
    expect(Object.keys(headers).sort()).toEqual(['List-Unsubscribe', 'List-Unsubscribe-Post'])
  })

  it('offers no mailto, because no mailbox on this platform reads unsubscribe mail', () => {
    // RFC 8058 permits one. A header naming an address nobody reads is an
    // unsubscribe facility that silently fails, which is worse than no header.
    const headers = oneClickUnsubscribeHeaders('https://eventlinqs.com', TOKEN)
    expect(headers[LIST_UNSUBSCRIBE_HEADER]).not.toContain('mailto:')
  })
})

describe('the HTTPS rule, enforced rather than reviewed', () => {
  it('refuses a plain http origin that is not loopback', () => {
    // The cost of shipping one is not an error anybody sees: it is bulk mail
    // delivered with a malformed one-click facility.
    expect(() => oneClickUnsubscribeUrl('http://eventlinqs.com', TOKEN)).toThrow(
      OneClickUnsubscribeError,
    )
  })

  it('names the scheme in the refusal, so the reason is readable', () => {
    expect(() => oneClickUnsubscribeUrl('http://eventlinqs.com', TOKEN)).toThrow(/scheme is http:/)
  })

  it('allows http on loopback, because a local drive is not deliverable mail', () => {
    expect(oneClickUnsubscribeUrl('http://localhost:3100', TOKEN)).toBe(
      `http://localhost:3100${ONE_CLICK_UNSUBSCRIBE_ROUTE}/${TOKEN}`,
    )
    expect(oneClickUnsubscribeUrl('http://127.0.0.1:3100', TOKEN)).toContain('127.0.0.1')
  })

  it('refuses an origin that is not a URL at all', () => {
    expect(() => oneClickUnsubscribeUrl('eventlinqs.com', TOKEN)).toThrow(/not a URL/)
  })

  it('refuses an empty token rather than composing an address that identifies nobody', () => {
    expect(() => oneClickUnsubscribeUrl('https://eventlinqs.com', '   ')).toThrow(
      /no unsubscribe token/,
    )
  })
})

describe('the address itself', () => {
  it('does not double the slash when the origin carries a trailing one', () => {
    expect(oneClickUnsubscribeUrl('https://eventlinqs.com/', TOKEN)).toBe(
      `https://eventlinqs.com${ONE_CLICK_UNSUBSCRIBE_ROUTE}/${TOKEN}`,
    )
  })

  it('percent-encodes the token, so a token can never extend the path', () => {
    const url = oneClickUnsubscribeUrl('https://eventlinqs.com', 'a/b?c=d')
    expect(url).toBe(`https://eventlinqs.com${ONE_CLICK_UNSUBSCRIBE_ROUTE}/a%2Fb%3Fc%3Dd`)
  })
})

// ---------------------------------------------------------------------------
// THE ENDPOINT. The safety argument of this route is entirely about which verb
// mutates, so that is what is asserted: POST withdraws, GET does not.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  withdrawals: [] as { token: string; captureSurface: string | undefined }[],
  result: null as { source: string; email: string; alreadyWithdrawn: boolean } | null,
  rateLimited: false,
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

vi.mock('@/lib/consent/record', () => ({
  withdrawDigestByAnyToken: async (
    _admin: unknown,
    token: string,
    _at: string,
    captureSurface?: string,
  ) => {
    h.withdrawals.push({ token, captureSurface })
    return h.result
  },
}))

vi.mock('@/lib/rate-limit/middleware', () => ({
  applyRateLimit: async () =>
    h.rateLimited ? new Response('{"ok":false}', { status: 429 }) : null,
}))

const { POST, GET } = await import('@/app/api/marketing/one-click-unsubscribe/[token]/route')

function ctx(token: string) {
  return { params: Promise.resolve({ token }) }
}

function req(method: string, token: string): Request {
  return new Request(`https://eventlinqs.com${ONE_CLICK_UNSUBSCRIBE_ROUTE}/${token}`, {
    method,
    // What a conforming receiver sends, per RFC 8058.
    ...(method === 'POST'
      ? {
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: 'List-Unsubscribe=One-Click',
        }
      : {}),
  })
}

beforeEach(() => {
  h.withdrawals = []
  h.result = { source: 'consent', email: 'someone@example.com', alreadyWithdrawn: false }
  h.rateLimited = false
})

describe('POST is the verb that withdraws', () => {
  it('withdraws the consent behind the token and answers 200', async () => {
    const res = await POST(req('POST', TOKEN), ctx(TOKEN))
    expect(res.status).toBe(200)
    expect(h.withdrawals).toEqual([{ token: TOKEN, captureSurface: 'one-click-unsubscribe' }])
    await expect(res.json()).resolves.toMatchObject({ ok: true, outcome: 'unsubscribed' })
  })

  it('records the one-click surface on the ledger row, so the two facilities are tellable apart', async () => {
    await POST(req('POST', TOKEN), ctx(TOKEN))
    expect(h.withdrawals[0].captureSurface).toBe('one-click-unsubscribe')
  })

  it('answers 200 for a second press rather than inventing a second withdrawal', async () => {
    h.result = { source: 'consent', email: 'someone@example.com', alreadyWithdrawn: true }
    const res = await POST(req('POST', TOKEN), ctx(TOKEN))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ outcome: 'already-unsubscribed' })
  })

  it('answers 200 for a token that matches nothing, and says so only in the body', async () => {
    // A machine reads the status and cannot read an explanation: a non-2xx is
    // read as "this unsubscribe facility is broken", which is the judgement the
    // headers exist to avoid earning. A distinguishable 404 would also make the
    // endpoint an oracle for which tokens exist.
    h.result = null
    const res = await POST(req('POST', 'not-a-real-token'), ctx('not-a-real-token'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, outcome: 'no-matching-subscription' })
  })

  it('is keyed on the token when it asks the limiter, never on the caller address', async () => {
    // The caller is a mailbox provider, so an IP-keyed bucket would put every
    // recipient of one campaign into one window.
    const mod = await import('@/lib/rate-limit/middleware')
    const spy = vi.spyOn(mod, 'applyRateLimit')
    await POST(req('POST', TOKEN), ctx(TOKEN))
    expect(spy).toHaveBeenCalledWith('marketing-one-click', expect.anything(), TOKEN)
    spy.mockRestore()
  })
})

describe('GET is the verb that changes nothing', () => {
  it('withdraws nothing when a mail scanner follows the header URI', async () => {
    // If this ever regresses, a security appliance scanning an inbox
    // unsubscribes its owner from everything and the ledger records a
    // withdrawal that person never made.
    const res = await GET(req('GET', TOKEN), ctx(TOKEN))
    expect(h.withdrawals).toEqual([])
    expect(res.status).toBe(303)
  })

  it('sends the person to the page that explains what is on file', async () => {
    const res = await GET(req('GET', TOKEN), ctx(TOKEN))
    expect(res.headers.get('location')).toBe(
      `https://eventlinqs.com/marketing/preferences/${TOKEN}`,
    )
  })
})
