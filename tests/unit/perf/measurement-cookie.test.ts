/**
 * THE LOCAL MEASUREMENT COOKIE, PINNED.
 *
 * WHY THESE TESTS EXIST. On 20 September 2026 a C8 measurement pass tried to
 * price the consent banner on /events by re-measuring with a recorded refusal
 * in the Cookie header. The attempt failed for a reason worth keeping (the
 * banner reads `document.cookie` on the client, which an HTTP header does not
 * reach), but on the way it went past a second trap that WOULD have produced a
 * confident wrong number: a cookie value contains `=`, and parsing the flag
 * with `split('=')[1]` truncates it to the name with no value.
 *
 * `scripts/perf/lh-local-median.mjs` cannot be imported by a test - it runs
 * top-level `await`, starts a server and launches Chrome on import - so the
 * decision is pinned in a pure module and exercised here, which is the shape
 * CLAUDE.md's dependency-bump law prescribes for exactly this situation.
 */
import { describe, it, expect } from 'vitest'
import { composeCookie, cookieArgumentFrom, GATE_COOKIE } from '../../../scripts/perf/lib/measurement-cookie.mjs'

describe('the gate cookie is never dropped', () => {
  it('sends the gate cookie alone when no extra is given', () => {
    expect(composeCookie(null)).toBe('el-audit=1')
    expect(composeCookie(undefined)).toBe('el-audit=1')
  })

  it('keeps the gate cookie FIRST when an extra is appended', () => {
    // A local number is only worth quoting because it is comparable to the
    // gate's, and that comparability rests on this cookie being present.
    expect(composeCookie('el_consent=abc')).toBe('el-audit=1; el_consent=abc')
    expect(composeCookie('el_consent=abc').startsWith(GATE_COOKIE)).toBe(true)
  })

  it('treats an empty or whitespace extra as no extra at all', () => {
    expect(composeCookie('')).toBe('el-audit=1')
    expect(composeCookie('   ')).toBe('el-audit=1')
  })
})

describe('a cookie value containing = survives whole', () => {
  /*
   * THE REGRESSION THIS FILE EXISTS FOR. Splitting on '=' yields 'el_consent'
   * and measures a cookie with no value. The page then behaves as though the
   * visitor never answered, the run looks normal, and the median at the end is
   * confident and meaningless.
   */
  it('does not truncate a value at its first equals sign', () => {
    const encodedRefusal =
      'el_consent=%7B%22v%22%3A1%2C%22a%22%3A0%2C%22d%22%3A0%2C%22t%22%3A%222026-09-20T00%3A00%3A00.000Z%22%7D'
    expect(cookieArgumentFrom([`--cookie=${encodedRefusal}`])).toBe(encodedRefusal)
    expect(composeCookie(cookieArgumentFrom([`--cookie=${encodedRefusal}`]))).toBe(
      `el-audit=1; ${encodedRefusal}`,
    )
  })

  it('preserves a raw unencoded value carrying several equals signs', () => {
    expect(cookieArgumentFrom(['--cookie=a=b=c=d'])).toBe('a=b=c=d')
  })

  it('proves the naive parse would have been wrong', () => {
    // Kept as an executable statement of the bug rather than a comment about it.
    const arg = '--cookie=el_consent=%7B%22v%22%3A1%7D'
    expect(arg.split('=')[1]).toBe('el_consent')
    expect(cookieArgumentFrom([arg])).toBe('el_consent=%7B%22v%22%3A1%7D')
  })
})

describe('reading the flag out of argv', () => {
  it('returns null when the flag is absent', () => {
    expect(cookieArgumentFrom(['--serve', '--port=3200', '--path=events'])).toBeNull()
  })

  it('finds the flag wherever it sits in the argument list', () => {
    expect(cookieArgumentFrom(['--serve', '--cookie=k=v', '--runs=5'])).toBe('k=v')
  })

  it('does not mistake --cookies or --cookie-jar for --cookie', () => {
    // The prefix match is exact on '--cookie=', so a neighbouring flag whose
    // ninth character is not '=' does not match and is left alone.
    expect(cookieArgumentFrom(['--cookie-jar=/tmp/j'])).toBeNull()
    expect(cookieArgumentFrom(['--cookies=a=b'])).toBeNull()
  })
})
