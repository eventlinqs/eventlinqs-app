/**
 * The security response headers, asserted on the config that ships.
 *
 * THE DEFECT THIS PINS. The Content-Security-Policy shipped ONLY as
 * Content-Security-Policy-Report-Only, which blocks nothing: a report-only CSP is
 * a measurement instrument, not a control. The header list even described it
 * alongside the real controls as though it were enforcing, which is how a
 * measurement gets mistaken for a mitigation.
 *
 * The fix is deliberately narrow rather than brave. Flipping the full policy
 * would enforce script-src/style-src allowlists whose report run has not been
 * confirmed clean, and on this platform a CSP that breaks the Stripe iframe
 * breaks checkout. So four directives that are already satisfied, carry no
 * allowlist, and need no nonce work are enforced now, and the wide policy keeps
 * measuring beside them.
 *
 * ASVS 3.4.1 (HSTS), 3.4.3 (CSP with object-src none and base-uri),
 * 3.4.4 (nosniff), 3.4.5 (referrer policy), 3.4.6 (frame-ancestors, and it
 * states X-Frame-Options is obsolete and must not be relied upon).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const config = readFileSync(path.resolve(__dirname, '../../../next.config.ts'), 'utf8')

/** The value of a header entry in the SECURITY_HEADERS array. */
function headerValue(key: string): string | null {
  const re = new RegExp(`key:\\s*'${key}',\\s*value:\\s*([A-Za-z_]+|'[^']*')`)
  const m = config.match(re)
  if (!m) return null
  const raw = m[1]!
  if (!raw.startsWith("'")) {
    // a named constant: pull the joined array literal it is built from
    const block = config.match(new RegExp(`const ${raw} = \\[([\\s\\S]*?)\\]\\.join`))
    return block ? block[1]! : raw
  }
  return raw.slice(1, -1)
}

describe('an ENFORCING Content-Security-Policy is present', () => {
  it('sets Content-Security-Policy, not only the report-only variant', () => {
    // The regression that matters: deleting this leaves a header set that looks
    // complete and enforces no CSP at all.
    expect(config).toMatch(/key:\s*'Content-Security-Policy'/)
  })

  const enforced = headerValue('Content-Security-Policy') ?? ''

  it.each([
    ["object-src 'none'", 'blocks <object>/<embed>, a classic injection sink'],
    ["base-uri 'self'", 'an injected <base> cannot re-point every relative URL'],
    ["frame-ancestors 'self'", 'real clickjacking protection; X-Frame-Options is obsolete'],
    ["form-action 'self'", 'a form cannot be made to POST to another origin'],
  ])('enforces %s', (directive) => {
    expect(enforced).toContain(directive)
  })

  it('declares NO default-src, so it cannot break what works today', () => {
    // This is what makes the narrow policy safe to ship without a verified report
    // run. If someone adds default-src here they have changed the risk profile
    // entirely and should do the nonce work first.
    expect(
      enforced,
      'adding default-src to the enforced policy restrains scripts and styles; do the nonce work instead',
    ).not.toContain('default-src')
  })

  it('keeps the wider policy in report-only beside it', () => {
    expect(config).toMatch(/key:\s*'Content-Security-Policy-Report-Only'/)
  })
})

describe('the headers that were already correct stay correct', () => {
  it('HSTS is at least one year and covers subdomains', () => {
    const hsts = headerValue('Strict-Transport-Security') ?? ''
    const maxAge = Number(hsts.match(/max-age=(\d+)/)?.[1] ?? 0)
    expect(maxAge).toBeGreaterThanOrEqual(31536000)
    expect(hsts).toContain('includeSubDomains')
  })

  it('nosniff is set', () => {
    expect(headerValue('X-Content-Type-Options')).toBe('nosniff')
  })

  it('the referrer policy does not leak a full URL cross-origin', () => {
    // Directly load-bearing for this pass: it governs whether a URL that has
    // caught a credential travels to a third party in the Referer header.
    const rp = headerValue('Referrer-Policy') ?? ''
    expect(['strict-origin-when-cross-origin', 'no-referrer', 'same-origin']).toContain(rp)
  })

  it('X-Frame-Options is still set as the belt for old agents', () => {
    expect(headerValue('X-Frame-Options')).toMatch(/SAMEORIGIN|DENY/)
  })

  it('a Permissions-Policy is present', () => {
    expect(headerValue('Permissions-Policy')).toContain('camera=()')
  })
})

describe('the known gap is recorded, not quietly tolerated', () => {
  it("the report-only policy still carries unsafe-inline, and the file says why that matters", () => {
    // Not a failure. It is the honest state: the enforced policy does not mitigate
    // XSS, and this asserts the codebase admits that rather than implying
    // otherwise. If someone removes unsafe-inline and adds nonces, this test
    // should be deleted along with the caveat.
    const reportOnly = headerValue('Content-Security-Policy-Report-Only') ?? ''
    expect(reportOnly).toContain("'unsafe-inline'")
    expect(config).toMatch(/nonce/i)
  })
})

describe('the report-only policy names every origin the venue finder talks to', () => {
  // The Places (New) library calls places.googleapis.com by XHR from the
  // organiser's browser (observed 4 September 2026 as a connect-src violation
  // of this very policy, C:\dev\EVIDENCE\A3-finder-create-path-probe.txt). A
  // report-only policy that omits it is a finder that dies quietly on every
  // organiser the day the policy is enforced.
  const reportOnly = headerValue('Content-Security-Policy-Report-Only') ?? ''
  const connectSrc = reportOnly.match(/"connect-src[^"]*"/)?.[0] ?? ''

  it.each(['https://maps.googleapis.com', 'https://places.googleapis.com'])('connect-src allows %s', (origin) => {
    expect(connectSrc).toContain(origin)
  })

  it('script-src allows the Maps JavaScript API itself', () => {
    expect(reportOnly.match(/"script-src[^"]*"/)?.[0] ?? '').toContain('https://maps.googleapis.com')
  })
})
