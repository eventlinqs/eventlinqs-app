import { describe, expect, test } from 'vitest'
import { isNoindex, judgePage, judgeSitemapEntry } from '../../../scripts/verify/lib/indexing-rules.mjs'

/**
 * THE FIVE INDEXING RULES, DRIVEN IN BOTH DIRECTIONS (close-out C19.6).
 *
 * The standing law is that every guard is proven to FAIL as well as to pass.
 * Two of these five could not be, and the roast of C19 caught it: RULE 2 (the
 * sitemap contains a noindex URL) and RULE 5 (the page and the sitemap disagree)
 * only fire against a host in a broken state, and nobody had produced one, so
 * both were green forever and neither had ever been seen firing.
 *
 * Every test below asserts the rule fires on the broken shape AND stays silent
 * on the correct one. A rule with only one of those halves is not a rule.
 */

const page = (over: Record<string, unknown> = {}) => ({
  path: '/community/african',
  route: '/community/[community]',
  klass: 'conditional',
  status: 200,
  redirect: null,
  robots: 'index, follow',
  canonical: '/community/african',
  canonicalRaw: 'https://www.eventlinqs.com.au/community/african',
  inSitemap: true,
  ...over,
})

describe('isNoindex', () => {
  test('reads the directive, in either order and either case', () => {
    expect(isNoindex('noindex, nofollow')).toBe(true)
    expect(isNoindex('nofollow, NOINDEX')).toBe(true)
    expect(isNoindex('index, follow')).toBe(false)
    expect(isNoindex(null)).toBe(false)
  })
})

describe('RULE 1: a never route must be noindex, absent from the sitemap, and name no canonical', () => {
  const never = (over = {}) =>
    page({ path: '/dashboard', route: '/dashboard', klass: 'never', robots: 'noindex, nofollow', canonical: null, inSitemap: false, ...over })

  test('passes on the correct shape', () => {
    expect(judgePage(never())).toEqual([])
  })

  test('FIRES when a private route is indexable', () => {
    const faults = judgePage(never({ robots: 'index, follow' }))
    expect(faults.join('\n')).toContain('RULE 1')
    expect(faults.join('\n')).toContain('is INDEXABLE')
  })

  test('FIRES when a private route is published in the sitemap', () => {
    expect(judgePage(never({ inSitemap: true })).join('\n')).toContain('must never be in it')
  })

  test('FIRES when a noindex page also names a canonical, which is what 57 routes did', () => {
    expect(judgePage(never({ canonical: '/' })).join('\n')).toContain('emits a canonical')
  })
})

describe('RULE 3: every indexable page names itself', () => {
  test('passes with a self-referencing canonical', () => {
    expect(judgePage(page())).toEqual([])
  })

  test('FIRES when an indexable page emits no canonical', () => {
    expect(judgePage(page({ canonical: null })).join('\n')).toContain('RULE 3')
  })
})

describe('RULE 4: only an alias may point its canonical elsewhere', () => {
  test('FIRES on the exact defect Search Console reported: the homepage as another page canonical', () => {
    const faults = judgePage(
      page({ path: '/help/getting-started', route: '/help/[slug]', klass: 'always', canonical: '/', canonicalRaw: 'https://www.eventlinqs.com.au' }),
    )
    expect(faults.join('\n')).toContain('RULE 4')
    expect(faults.join('\n')).toContain('Google chose different')
  })

  test('an alias passes when it is noindex and points at the real page', () => {
    expect(
      judgePage(page({ path: '/e/abc', route: '/e/[code]', klass: 'alias', robots: 'noindex, follow', canonical: '/events/some-night', inSitemap: false })),
    ).toEqual([])
  })

  test('FIRES when an alias is indexable, and again when it points at itself', () => {
    const indexable = judgePage(page({ path: '/e/abc', route: '/e/[code]', klass: 'alias', robots: 'index, follow', canonical: '/events/x', inSitemap: false }))
    expect(indexable.join('\n')).toContain('an alias and is INDEXABLE')
    const selfPointing = judgePage(page({ path: '/e/abc', route: '/e/[code]', klass: 'alias', robots: 'noindex, follow', canonical: '/e/abc', inSitemap: false }))
    expect(selfPointing.join('\n')).toContain('points at itself')
  })
})

describe('an always route carrying noindex by accident is a defect too', () => {
  test('FIRES', () => {
    const faults = judgePage(page({ path: '/pricing', route: '/pricing', klass: 'always', robots: 'noindex, nofollow' }))
    expect(faults.join('\n')).toContain('classified always and is NOINDEX')
  })
})

describe('RULE 5: the page and the sitemap must agree about a templated discovery page', () => {
  test('passes when both say indexable, and when both say not', () => {
    expect(judgePage(page({ robots: 'index, follow', inSitemap: true }))).toEqual([])
    expect(judgePage(page({ robots: 'noindex, follow', inSitemap: false }))).toEqual([])
  })

  test('FIRES when the page is noindex and the sitemap still publishes it', () => {
    const faults = judgePage(page({ robots: 'noindex, follow', inSitemap: true }))
    expect(faults.join('\n')).toContain('RULE 5')
    expect(faults.join('\n')).toContain('says noindex and the sitemap says PUBLISHED')
  })

  test('FIRES when the page is indexable and the sitemap has dropped it', () => {
    expect(judgePage(page({ robots: 'index, follow', inSitemap: false })).join('\n')).toContain('says INDEXABLE and the sitemap says absent')
  })
})

describe('a redirect has no document, so only its sitemap membership is judged', () => {
  test('passes when it is not published', () => {
    expect(judgePage(page({ status: 308, redirect: '/organisers', inSitemap: false, robots: null, canonical: null }))).toEqual([])
  })

  test('FIRES when the sitemap advertises a redirect, which Google tells sitemaps not to do', () => {
    expect(judgePage(page({ status: 308, redirect: '/organisers', inSitemap: true, robots: null, canonical: null })).join('\n')).toContain(
      'redirects to /organisers and is published in the sitemap',
    )
  })
})

describe('RULE 2: every URL in the sitemap answers 200 and is indexable', () => {
  const entry = (over = {}) => ({ path: '/city/melbourne', status: 200, location: null, robots: 'index, follow', canonical: '/city/melbourne', ...over })

  test('passes on the correct shape', () => {
    expect(judgeSitemapEntry(entry())).toEqual([])
  })

  test('FIRES when a sitemap URL is NOINDEX, the contradiction Search Console reports', () => {
    const faults = judgeSitemapEntry(entry({ robots: 'noindex, follow' }))
    expect(faults.join('\n')).toContain('RULE 2')
    expect(faults.join('\n')).toContain('is NOINDEX')
  })

  test('FIRES when a sitemap URL 404s', () => {
    expect(judgeSitemapEntry(entry({ status: 404 })).join('\n')).toContain('answered 404')
  })

  test('FIRES when a sitemap URL redirects, and names where to', () => {
    expect(judgeSitemapEntry(entry({ status: 308, location: '/somewhere' })).join('\n')).toContain('answered 308 -> /somewhere')
  })

  test('FIRES when a sitemap URL emits no canonical', () => {
    expect(judgeSitemapEntry(entry({ canonical: null })).join('\n')).toContain('RULE 3')
  })
})
