/**
 * site-header-cookie-snapshot.test.ts
 *
 * Regression test for the React #185 ("Maximum update depth exceeded")
 * incident on 2026-05-24 (PR #34).
 *
 * Architecture history:
 *   - 2026-05-03 (commit 2df3e9e): cookie sync migrated from
 *     useState+useEffect to useSyncExternalStore, with a no-op
 *     subscribe. The getSnapshot returned a fresh object literal
 *     every call when the cookie was set, violating the hook's
 *     referential-stability contract and producing React #185 once a
 *     second render fired post-mount.
 *   - 2026-05-24 (PR #34): hotfix added a module-level cache so the
 *     getSnapshot returned identical references for identical cookie
 *     values. Closed #185.
 *   - 2026-05-24 (PR after this one): refactored back to
 *     useState+useEffect with a synthetic 'el_city_updated' event
 *     dispatched by LocationPicker after the cookie write. The cache
 *     was removed because useState only re-renders on setState, not
 *     on every getSnapshot call, so reference stability is no longer
 *     a contract.
 *
 * Contract under test (current architecture):
 *   1. readCityCookie returns a parsed DetectedLocation with
 *      source: 'cookie' when the cookie holds a valid payload, and
 *      identical cookies produce value-equal results across calls.
 *   2. Changing the cookie value yields a result reflecting the new
 *      city.
 *   3. Absent cookie -> null.
 *   4. Malformed JSON -> null, no throw.
 *   5. document undefined (SSR path) -> null.
 *
 * NOTE: This test does NOT assert Object.is reference equality, which
 * the PR #34 hotfix cache provided but the PR-following refactor
 * intentionally removes. The useSyncExternalStore misuse that needed
 * that invariant is gone.
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

describe('readCityCookie - cookie parsing contract', () => {
  beforeEach(() => {
    clearDoc()
  })
  afterEach(() => {
    ;(globalThis as { document?: unknown }).document = originalDocument
  })

  it('parses a valid Melbourne cookie payload and returns it value-equal across calls', () => {
    setDocCookie('el_city=' + encodeURIComponent(JSON.stringify({ city: 'Melbourne', country: 'AU' })))
    const first = readCityCookie()
    const second = readCityCookie()
    expect(first).not.toBeNull()
    expect(first?.city).toBe('Melbourne')
    expect(first?.source).toBe('cookie')
    // Value equality is what the consumer (useState + render) relies
    // on. Reference equality is no longer required (the
    // useSyncExternalStore misuse that needed it is gone, see PR #34).
    expect(second).toEqual(first)
  })

  it('returns the new city after the cookie value changes', () => {
    setDocCookie('el_city=' + encodeURIComponent(JSON.stringify({ city: 'Melbourne', country: 'AU' })))
    const melbourne = readCityCookie()
    setDocCookie('el_city=' + encodeURIComponent(JSON.stringify({ city: 'Sydney', country: 'AU' })))
    const sydney = readCityCookie()
    expect(melbourne?.city).toBe('Melbourne')
    expect(sydney?.city).toBe('Sydney')
    expect(sydney).not.toEqual(melbourne)
  })

  it('returns null when the el_city cookie is absent', () => {
    setDocCookie('other_cookie=foo')
    expect(readCityCookie()).toBeNull()
    expect(readCityCookie()).toBeNull()
  })

  it('returns null when the cookie value is malformed JSON, without throwing', () => {
    setDocCookie('el_city=' + encodeURIComponent('{not valid json'))
    expect(readCityCookie()).toBeNull()
  })

  it('returns null when document is undefined (SSR path)', () => {
    clearDoc()
    expect(readCityCookie()).toBeNull()
  })
})
