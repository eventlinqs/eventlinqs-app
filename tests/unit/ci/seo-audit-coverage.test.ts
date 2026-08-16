// SEO COVERAGE, BOUND TO THE CONFIG.
//
// The Lighthouse gate asserted `categories:seo >= 1` against a Vercel preview.
// Previews are noindex BY DESIGN since the 15 August 2026 fix, and Lighthouse's
// is-crawlable audit carries 4.04 of the SEO category's 13.04 weighted points,
// so a correctly configured preview tops out at 0.69 and the floor was
// unreachable. Measured on PR #118, is-crawlable was the ONLY failing SEO audit
// on all eleven gated URLs: the gate was failing the fix.
//
// SEO is now asserted audit by audit. That is the same bar - a category score of
// 1 is reached exactly when every weighted audit passes - but only for as long
// as the list stays complete. A hand-written list is weaker than a category
// floor the moment somebody deletes a line from it, and nothing about deleting
// that line looks like lowering a threshold.
//
// So this test binds lighthouserc.json to the baseline in
// scripts/ci/assert-seo-audits.mjs. Drop an assertion and the suite fails here,
// in the repository, without waiting for a CI run against a preview.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Assertion = string | [string, Record<string, unknown>]

const config = JSON.parse(readFileSync(join(process.cwd(), 'lighthouserc.json'), 'utf8')) as {
  ci: { assert: { assertMatrix?: Array<{ matchingUrlPattern?: string; assertions?: Record<string, Assertion> }> } }
}

const matrix = config.ci.assert.assertMatrix ?? []

/** The audits the per-audit entry must assert, mirroring SEO_AUDIT_BASELINE minus the two stated exclusions. */
const MUST_BE_ASSERTED = [
  'canonical',
  'crawlable-anchors',
  'document-title',
  'hreflang',
  'http-status-code',
  'image-alt',
  'link-text',
  'meta-description',
  'robots-txt',
]

function errorLevelAssertions(): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>()
  for (const entry of matrix) {
    for (const [name, value] of Object.entries(entry.assertions ?? {})) {
      if (Array.isArray(value) && value[0] === 'error') out.set(name, value[1] ?? {})
    }
  }
  return out
}

describe('lighthouse SEO per-audit coverage', () => {
  it('asserts every SEO audit that replaced the categories:seo floor', () => {
    const asserted = errorLevelAssertions()
    const missing = MUST_BE_ASSERTED.filter((id) => !asserted.has(id))
    expect(
      missing,
      'these SEO audits replaced the categories:seo floor. Dropping one lowers the bar silently, ' +
        'because the category score is no longer there to catch it. Keep this list, ' +
        'scripts/ci/assert-seo-audits.mjs SEO_AUDIT_BASELINE, and lighthouserc.json in step.',
    ).toEqual([])
  })

  it('demands a perfect score on each of them, not a fraction', () => {
    const asserted = errorLevelAssertions()
    for (const id of MUST_BE_ASSERTED) {
      expect(asserted.get(id)?.minScore, `${id} must assert minScore 1`).toBe(1)
    }
  })

  it('judges them the same way the category floor it replaced was judged', () => {
    // The category floors are pinned optimistic by the aggregation contract. If
    // these were left unpinned they would default to optimistic anyway, but an
    // unstated default is exactly how the 2026-08-05 median-versus-maximum
    // confusion cost hours. Pinned, the replacement is provably neither stricter
    // nor looser than what it replaced.
    const asserted = errorLevelAssertions()
    for (const id of MUST_BE_ASSERTED) {
      expect(asserted.get(id)?.aggregationMethod, `${id} must pin aggregationMethod`).toBe('optimistic')
    }
  })

  it('no longer asserts categories:seo at error level anywhere', () => {
    // If a categories:seo floor came back, it would fail on every preview run
    // for a reason that has nothing to do with page quality, and the temptation
    // would be to un-fix the indexing defect to make it green.
    const offenders = matrix
      .filter((e) => {
        const v = e.assertions?.['categories:seo']
        return Array.isArray(v) && v[0] === 'error'
      })
      .map((e) => e.matchingUrlPattern)
    expect(offenders).toEqual([])
  })

  it('keeps the auth pages exempt, because they legitimately fail canonical too', () => {
    // /login and /signup are deliberately noindex AND non-canonical; measured on
    // PR #118 they fail is-crawlable and canonical, scoring 0.58. The per-audit
    // entry must not reach them or it would assert canonical against pages
    // designed to fail it.
    const perAudit = matrix.find((e) => e.assertions?.canonical)
    expect(perAudit, 'the per-audit SEO entry has moved or been removed').toBeDefined()
    const pattern = new RegExp(perAudit!.matchingUrlPattern!)
    expect(pattern.test('https://example.vercel.app/login')).toBe(false)
    expect(pattern.test('https://example.vercel.app/signup')).toBe(false)
    expect(pattern.test('https://example.vercel.app/pricing')).toBe(true)
    expect(pattern.test('https://example.vercel.app/')).toBe(true)
  })
})
