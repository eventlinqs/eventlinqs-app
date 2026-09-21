// WHERE A PERSON LANDS AFTER SIGNING IN, AND WHERE THEY MUST NEVER LAND.
//
// ---------------------------------------------------------------------------
// DEFECT 1: THE DEEP LINK WAS WRITTEN BY ONE HALF OF THE PLATFORM AND READ BY
// NEITHER.
//
// Nine places send a signed-out person to `/login?next=<where they were going>`.
// `login-form.tsx` read `searchParams.get('redirect')` and nothing else, so
// every one of those nine deep links dropped the person on the dashboard
// instead of the page they asked for. Twelve other places emit `?redirect=` and
// work. Both spellings are real conventions in this tree: `/auth/callback` and
// `/auth/confirm` have always read `next`, which is Supabase's own name for it.
//
// The two that are not merely annoying are `/scan/[eventId]`, which is a door
// staffer at a venue on their phone, and `/squad/[token]/pay/[member_id]`, which
// is somebody paying their share of a group booking.
//
// ---------------------------------------------------------------------------
// DEFECT 2: THE SIGN-IN PAGE WOULD REDIRECT OFF-ORIGIN, AND THE STRICTER CHECK
// WAS ALREADY IN THE TREE.
//
// The login form validated the path inline: starts with `/`, not `//`, no
// `://`. `safeNextPath` in the magic-link route rejects one more thing, a
// BACKSLASH, and that one more thing is the whole difference. Measured:
//
//     new URL('/\\evil.com', 'https://eventlinqs.com.au/login').href
//       -> 'https://evil.com/'
//
// WHATWG URL parsing treats a backslash as a forward slash for special schemes,
// so `/\evil.com` is protocol-relative in effect and the inline check waved it
// through. An open redirect matters most on the page where somebody has just
// typed their password and is watching for the app to take them somewhere.

import { describe, expect, it } from 'vitest'
import { readRedirectParam, safeRedirectPath } from '@/lib/auth/safe-redirect'

describe('safeRedirectPath', () => {
  it('keeps an ordinary internal path', () => {
    expect(safeRedirectPath('/tickets')).toBe('/tickets')
    expect(safeRedirectPath('/dashboard/payouts')).toBe('/dashboard/payouts')
    expect(safeRedirectPath('/scan/abc-123')).toBe('/scan/abc-123')
  })

  it('keeps a path that carries its own query and hash', () => {
    expect(safeRedirectPath('/events?city=geelong')).toBe('/events?city=geelong')
    expect(safeRedirectPath('/help#refunds')).toBe('/help#refunds')
  })

  it('falls back when there is nothing to go to', () => {
    expect(safeRedirectPath(undefined)).toBe('/dashboard')
    expect(safeRedirectPath(null)).toBe('/dashboard')
    expect(safeRedirectPath('')).toBe('/dashboard')
  })

  it('refuses a protocol-relative path', () => {
    expect(safeRedirectPath('//evil.com')).toBe('/dashboard')
    expect(safeRedirectPath('//evil.com/pay')).toBe('/dashboard')
  })

  it('refuses an absolute URL, whatever the scheme', () => {
    expect(safeRedirectPath('https://evil.com')).toBe('/dashboard')
    expect(safeRedirectPath('http://evil.com')).toBe('/dashboard')
    expect(safeRedirectPath('javascript://evil.com')).toBe('/dashboard')
  })

  it('refuses a BACKSLASH, which is the one the login form used to wave through', () => {
    // Measured, not assumed: each of these resolves off-origin under WHATWG URL
    // parsing, and the login form's inline check accepted every one.
    for (const candidate of ['/\\evil.com', '/\\/evil.com', '/\\\\evil.com']) {
      expect(safeRedirectPath(candidate)).toBe('/dashboard')
      // And the reason, pinned so a future reader does not have to take it on
      // trust: this is where the browser would actually have gone.
      expect(new URL(candidate, 'https://eventlinqs.com.au/login').origin).toBe('https://evil.com')
    }
  })

  it('refuses anything that is not an absolute path at all', () => {
    expect(safeRedirectPath('dashboard')).toBe('/dashboard')
    expect(safeRedirectPath('../admin')).toBe('/dashboard')
  })
})

/** A stand-in for URLSearchParams that is readable in the assertions below. */
const params = (init: Record<string, string>) => new URLSearchParams(init)

describe('readRedirectParam', () => {
  it('reads the redirect parameter, which twelve places in the tree emit', () => {
    expect(readRedirectParam(params({ redirect: '/tickets' }))).toBe('/tickets')
  })

  it('reads the next parameter, which nine places emit and nothing used to read', () => {
    expect(readRedirectParam(params({ next: '/scan/abc-123' }))).toBe('/scan/abc-123')
  })

  it('prefers redirect when both are present, so neither convention can surprise the other', () => {
    expect(readRedirectParam(params({ redirect: '/tickets', next: '/feed' }))).toBe('/tickets')
  })

  it('falls back when neither is there', () => {
    expect(readRedirectParam(params({}))).toBe('/dashboard')
  })

  it('applies the safety check to whichever one it read', () => {
    expect(readRedirectParam(params({ next: '/\\evil.com' }))).toBe('/dashboard')
    expect(readRedirectParam(params({ redirect: '//evil.com' }))).toBe('/dashboard')
    // A poisoned `redirect` does not fall through to a clean `next`: the
    // refusal is a refusal, not a reason to try the other spelling.
    expect(readRedirectParam(params({ redirect: '//evil.com', next: '/tickets' }))).toBe('/dashboard')
  })
})
