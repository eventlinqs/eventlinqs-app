import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONFIRM_LINK_DAYS,
  openConfirmRequest,
  resolveConfirmSecret,
  sealConfirmRequest,
  type ConfirmRequest,
} from '@/lib/newsletter/confirm-token'

/*
 * THE CITY GUIDE'S CONFIRMATION LINK (Release 2, item 8: double opt in). The link carries the request sealed, so nothing
 * is stored before the owner of the address confirms; it must open only for us, only unaltered, only for seven days, and
 * never show the address to anyone reading a URL or a log.
 */
const SECRET = 'test-secret-for-the-confirmation-link'
const NOW = Date.UTC(2026, 10, 12, 6, 0, 0)
const request: ConfirmRequest = {
  email: 'jo.citizen@example.com.au',
  citySlug: 'melbourne',
  cityName: 'Melbourne',
  consentVersion: 'v1',
  source: 'newsletter-city',
  requestedAt: NOW,
}

describe('the sealed confirmation link', () => {
  it('opens to exactly the request it sealed', () => {
    const token = sealConfirmRequest(request, SECRET)
    expect(openConfirmRequest(token, SECRET, NOW + 60_000)).toEqual({ ok: true, request })
  })

  it('never carries the address readable, in plain or in base64', () => {
    const token = sealConfirmRequest(request, SECRET)
    expect(token).not.toContain('jo.citizen')
    expect(Buffer.from(token, 'base64url').toString('latin1')).not.toContain('jo.citizen')
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('refuses a link altered by a single character', () => {
    const token = sealConfirmRequest(request, SECRET)
    const i = Math.floor(token.length / 2)
    const altered = token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1)
    expect(openConfirmRequest(altered, SECRET, NOW)).toEqual({ ok: false, why: 'invalid' })
  })

  it('refuses a link sealed under another key, and anything that is not a link', () => {
    const token = sealConfirmRequest(request, 'another-secret')
    expect(openConfirmRequest(token, SECRET, NOW)).toEqual({ ok: false, why: 'invalid' })
    for (const junk of ['', 'abc', 'x'.repeat(3000), 'not a token at all, with spaces and more than forty characters']) {
      expect(openConfirmRequest(junk, SECRET, NOW)).toEqual({ ok: false, why: 'invalid' })
    }
  })

  it(`works for ${CONFIRM_LINK_DAYS} days and not a minute after`, () => {
    const token = sealConfirmRequest(request, SECRET)
    expect(openConfirmRequest(token, SECRET, NOW + CONFIRM_LINK_DAYS * 86_400_000).ok).toBe(true)
    expect(openConfirmRequest(token, SECRET, NOW + CONFIRM_LINK_DAYS * 86_400_000 + 60_000)).toEqual({ ok: false, why: 'expired' })
  })

  it('refuses a request dated in the future', () => {
    const token = sealConfirmRequest({ ...request, requestedAt: NOW + 3_600_000 }, SECRET)
    expect(openConfirmRequest(token, SECRET, NOW)).toEqual({ ok: false, why: 'invalid' })
  })

  it('seals the same request differently every time, so two links never match', () => {
    expect(sealConfirmRequest(request, SECRET)).not.toBe(sealConfirmRequest(request, SECRET))
  })
})

describe('the key', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('comes from ORDER_ACCESS_SECRET through its one reader; production without it has none, so no link is sent unopenable', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ORDER_ACCESS_SECRET', 's3')
    expect(resolveConfirmSecret()).toBe('s3')
    vi.stubEnv('ORDER_ACCESS_SECRET', '  ')
    expect(resolveConfirmSecret()).toBeNull()
    vi.stubEnv('ORDER_ACCESS_SECRET', '')
    expect(resolveConfirmSecret()).toBeNull()
  })

  it('outside production a development key stands in, so the flow can be walked locally', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ORDER_ACCESS_SECRET', '')
    expect(resolveConfirmSecret()).toBeTruthy()
  })
})
