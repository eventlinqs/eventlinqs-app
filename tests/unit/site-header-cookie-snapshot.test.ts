/**
 * site-header-cookie-snapshot.test.ts
 *
 * Regression test for the React #185 ("Maximum update depth exceeded")
 * incident on 2026-05-24.
 *
 * Background:
 *   src/components/layout/site-header-client.tsx uses useSyncExternalStore
 *   to read the `el_city` cookie. React's contract for that hook is that
 *   the `getSnapshot` argument MUST return a referentially stable value
 *   when the underlying data has not changed - React calls getSnapshot
 *   on every render and uses Object.is to detect store changes.
 *
 *   The original implementation returned a fresh object literal
 *   `{ ...parsed, source: 'cookie' as const }` on every call when the
 *   cookie was set. That fails Object.is, so React kept seeing "store
 *   changed" and rescheduling renders until the safety limit kicked in
 *   and threw #185. Manifested in any session that had picked a city
 *   via the LocationPicker once HeroPresenceProvider or the scroll
 *   sentinel triggered a post-mount re-render.
 *
 * Contract under test:
 *   1. When document.cookie is unchanged between calls, readCityCookie
 *      returns the SAME object reference (Object.is true).
 *   2. When document.cookie changes, readCityCookie returns a NEW
 *      object reflecting the new value.
 *   3. When the cookie is absent, readCityCookie returns null and
 *      consecutive calls remain referentially stable (null === null).
 *   4. When the cookie value is malformed, readCityCookie returns null
 *      without throwing.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readCityCookie } from '../../src/components/layout/site-header-client'

// Minimal Document shim - we only need .cookie. The vitest config uses
// the 'node' environment, so there is no built-in document.
type CookieDoc = { cookie: string }
const originalDocument = (globalThis as { document?: unknown }).document

function setDocCookie(value: string): void {
  ;(globalThis as { document?: CookieDoc }).document = { cookie: value }
}
function clearDoc(): void {
  ;(globalThis as { document?: unknown }).document = undefined
}

describe('readCityCookie - useSyncExternalStore snapshot stability', () => {
  beforeEach(() => {
    clearDoc()
  })
  afterEach(() => {
    ;(globalThis as { document?: unknown }).document = originalDocument
  })

  it('returns referentially-stable snapshot for identical cookie values (the React #185 invariant)', () => {
    setDocCookie('el_city=' + encodeURIComponent(JSON.stringify({ city: 'Melbourne', country: 'AU' })))
    const first = readCityCookie()
    const second = readCityCookie()
    const third = readCityCookie()
    expect(first).not.toBeNull()
    expect(first?.city).toBe('Melbourne')
    // The critical assertion: Object.is across calls. If this fails,
    // useSyncExternalStore re-schedules renders forever -> React #185.
    expect(Object.is(first, second)).toBe(true)
    expect(Object.is(second, third)).toBe(true)
  })

  it('returns a new reference when the cookie value changes', () => {
    setDocCookie('el_city=' + encodeURIComponent(JSON.stringify({ city: 'Melbourne', country: 'AU' })))
    const melbourne = readCityCookie()
    setDocCookie('el_city=' + encodeURIComponent(JSON.stringify({ city: 'Sydney', country: 'AU' })))
    const sydney = readCityCookie()
    expect(melbourne?.city).toBe('Melbourne')
    expect(sydney?.city).toBe('Sydney')
    expect(Object.is(melbourne, sydney)).toBe(false)
  })

  it('returns null when the cookie is absent', () => {
    setDocCookie('other_cookie=foo')
    expect(readCityCookie()).toBeNull()
    expect(readCityCookie()).toBeNull()
  })

  it('returns null when the cookie value is malformed JSON', () => {
    setDocCookie('el_city=' + encodeURIComponent('{not valid json'))
    expect(readCityCookie()).toBeNull()
  })

  it('returns null when document is undefined (SSR path)', () => {
    clearDoc()
    expect(readCityCookie()).toBeNull()
  })
})
