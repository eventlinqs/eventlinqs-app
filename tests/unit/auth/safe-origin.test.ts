import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { safeAuthOrigin } from '@/lib/auth/safe-origin'

/**
 * The origin every emailed auth link is built against.
 *
 * These lock the reconciliation made when this branch was rebased onto the
 * environment-manifest work. `safeAuthOrigin` assumed that an unset
 * `NEXT_PUBLIC_SITE_URL` meant local development, so it fell through to the
 * request headers. The manifest declares that variable OPTIONAL on production
 * and correct to leave unset, so that fall-through was reachable on a real
 * production deployment: a forged or merely non-canonical Host header would
 * have decided where a password reset link pointed.
 */

const SAVED = { site: process.env.NEXT_PUBLIC_SITE_URL, vercel: process.env.VERCEL_ENV }

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.invalid/api/auth/recover', { headers })
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL
  delete process.env.VERCEL_ENV
  delete process.env.VERCEL_URL
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL
})

afterEach(() => {
  if (SAVED.site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
  else process.env.NEXT_PUBLIC_SITE_URL = SAVED.site
  if (SAVED.vercel === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = SAVED.vercel
})

describe('an explicit site URL always wins', () => {
  test('the configured origin is used and its trailing slash is dropped', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.eventlinqs.com.au/'
    expect(safeAuthOrigin(req({ host: 'attacker.example' }))).toBe('https://www.eventlinqs.com.au')
  })

  test('it beats a forged Host header, which is the whole point', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.eventlinqs.com.au'
    process.env.VERCEL_ENV = 'production'
    expect(safeAuthOrigin(req({ host: 'attacker.example', origin: 'https://attacker.example' })))
      .toBe('https://www.eventlinqs.com.au')
  })
})

describe('THE REGRESSION: a deployment never trusts the request', () => {
  /**
   * The manifest permits NEXT_PUBLIC_SITE_URL to be unset on production. Before
   * this fix, that configuration handed the Host header control of every
   * emailed auth link.
   */
  test('production with no site URL resolves the canonical host, not the Host header', () => {
    process.env.VERCEL_ENV = 'production'
    const origin = safeAuthOrigin(req({ host: 'attacker.example', origin: 'https://attacker.example' }))
    expect(origin).not.toContain('attacker.example')
    expect(origin).toBe('https://www.eventlinqs.com.au')
  })

  test('a non-canonical but genuine branded host does not become the link host', () => {
    // www.eventlinqs.com answers 301 to the canonical host. A reset link minted
    // on it starts life behind a redirect, and auth cookies live on the
    // canonical host only.
    process.env.VERCEL_ENV = 'production'
    expect(safeAuthOrigin(req({ host: 'www.eventlinqs.com' }))).toBe('https://www.eventlinqs.com.au')
  })

  test('a preview deployment resolves its own url, not production', () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.VERCEL_URL = 'eventlinqs-app-git-feat-x.vercel.app'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'www.eventlinqs.com.au'
    expect(safeAuthOrigin(req({ host: 'anything.example' })))
      .toBe('https://eventlinqs-app-git-feat-x.vercel.app')
  })

  test('a deployment never emits localhost', () => {
    process.env.VERCEL_ENV = 'production'
    expect(safeAuthOrigin(req({ host: 'localhost:3000' }))).not.toContain('localhost')
  })
})

describe('local development still works off the request', () => {
  test('with no deployment signal the Origin header is honoured', () => {
    expect(safeAuthOrigin(req({ origin: 'http://localhost:3000' }))).toBe('http://localhost:3000')
  })

  test('falling back to Host keeps the forwarded scheme', () => {
    expect(safeAuthOrigin(req({ host: 'localhost:3000', 'x-forwarded-proto': 'http' })))
      .toBe('http://localhost:3000')
  })

  test('a bare request with no headers at all still yields a usable local origin', () => {
    expect(safeAuthOrigin(req())).toBe('http://localhost:3000')
  })
})
