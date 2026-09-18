import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// A .mjs guard, imported for its exported readers so this test exercises the
// code the build runs rather than a second copy of the same parsing.
import { stripCommentsAndStrings, headerRules, isPublicEdgeCacheRule, sourceOf, pageFileFor, indexingClassOf } from '../../../scripts/guards/edge-cache-is-viewer-independent.mjs'

/**
 * A ROUTE WHOSE RESPONSES ARE SHARED AT THE EDGE MAY NOT RENDER ONE VISITOR'S
 * NAME (close-out C8, 18 September 2026).
 *
 * `/events` carried `CDN-Cache-Control: public, s-maxage=60,
 * stale-while-revalidate=300` with no signed-in exclusion, while rendering the
 * ordinary `<SiteHeader />`. That header reads the session and renders the
 * signed-in visitor's initials and display name, and `deriveAccountUser` falls
 * back to the local part of their email address when the profile carries no
 * name. Production answered `X-Vercel-Cache: HIT` with `Age: 80` on that URL,
 * so the shared cache was real rather than theoretical.
 *
 * The two halves, both required, neither sufficient:
 *   `missing` on the marker cookie   stops a signed-in render being STORED
 *   `staticSafe` on the header       stops a per-viewer render EXISTING, which
 *                                    matters because cookies are not part of the
 *                                    edge cache key, so a signed-in visitor can
 *                                    still be SERVED a stored anonymous copy
 *
 * These tests hold the shape. The live behaviour is driven separately by
 * scripts/verify/edge-cache-headers-drive.mjs against a served production build.
 */
const ROOT = join(__dirname, '..', '..', '..')
const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')
/*
 * `headerRules` answers null when it cannot find the array returned by
 * `async headers()`. That is a FINDING rather than an empty set: it means the
 * config was restructured and this file is now asserting nothing. It is turned
 * into an empty list here and the first test refuses an empty list, so the
 * restructure fails loudly instead of passing vacuously.
 */
const rules: string[] = headerRules(stripCommentsAndStrings(config)) ?? []
const publicRules: string[] = rules.filter((r: string) => isPublicEdgeCacheRule(r))

describe('every publicly edge-cached route excludes a signed-in request', () => {
  it('finds the publicly cached rules at all, so an empty set can never pass silently', () => {
    expect(rules.length).toBeGreaterThan(0)
    expect(publicRules.length).toBeGreaterThan(0)
  })

  it.each(publicRules.map((r: string) => [sourceOf(r), r] as const))(
    'the rule for %s carries missing: el-signed-in',
    (_source, rule) => {
      expect(rule).toMatch(/missing:\s*\[\s*\{[^}]*key:\s*'el-signed-in'/)
    },
  )

  it('/events carries it, which is the rule that did not', () => {
    const events = publicRules.find((r: string) => sourceOf(r) === '/events')
    expect(events, '/events is no longer publicly cached; this test must be re-aimed rather than deleted').toBeDefined()
    expect(events).toMatch(/missing:\s*\[\s*\{[^}]*key:\s*'el-signed-in'/)
  })
})

describe('every publicly edge-cached page renders the anonymous header', () => {
  it.each(publicRules.map((r: string) => [sourceOf(r)] as const))('%s passes staticSafe and never the bare header', (source) => {
    const file = pageFileFor(source as string, ROOT)
    expect(file, `no page route under src/app answers ${source}`).not.toBeNull()
    const page = stripCommentsAndStrings(readFileSync(file as string, 'utf8'))
    expect(page).toMatch(/<SiteHeader\s+staticSafe/)
    expect(page).not.toMatch(/<SiteHeader\s*\/>/)
    expect(page).not.toMatch(/<PageShell[\s>]/)
  })

  it('no publicly cached route is one the indexing policy keeps out of search', () => {
    const policy = readFileSync(join(ROOT, 'src', 'lib', 'seo', 'indexing-policy.ts'), 'utf8')
    for (const rule of publicRules) {
      const klass = indexingClassOf(sourceOf(rule) as string, policy)
      expect(klass, `${sourceOf(rule)} is '${klass}'`).not.toBe('never')
      expect(klass, `${sourceOf(rule)} is '${klass}'`).not.toBe('alias')
    }
  })
})

describe('the boundary that ships inside every page renders nobody', () => {
  /*
   * Next serialises the ROOT NOT-FOUND BOUNDARY into the RSC payload of every
   * page, not only into a real 404. Measured on this build against a real
   * session: the 404's own copy appears once in the response for `/`, for
   * `/events` and for `/events/browse/melbourne`, and it brought a second
   * SiteHeader with it carrying the visitor's display name and email.
   *
   * That is why a page passing `staticSafe` was not enough on its own, and
   * why `/events/[slug]` carried an identity for the whole time it has been
   * publicly edge-cached.
   */
  it('the root not-found renders the anonymous chrome', () => {
    const source = stripCommentsAndStrings(readFileSync(join(ROOT, 'src', 'app', 'not-found.tsx'), 'utf8'))
    expect(source).toMatch(/<PageShell\s+staticSafe/)
    expect(source).not.toMatch(/<PageShell>/)
  })

  it('PageShell still defaults to the per-viewer header, so no other caller was changed by this', () => {
    const shell = readFileSync(join(ROOT, 'src', 'components', 'layout', 'PageShell.tsx'), 'utf8')
    expect(shell).toMatch(/staticSafe\s*=\s*false/)
    expect(shell).toMatch(/<SiteHeader\s+staticSafe=\{staticSafe\}/)
  })
})

describe('the reader the guard and this test share cannot be fooled by a comment', () => {
  it('a rule described in a comment is not mistaken for a rule', () => {
    const source = [
      'async headers() {',
      '  return [',
      "    // missing: [{ type: 'cookie', key: 'el-signed-in' }] would go here",
      "    { source: '/thing', headers: [{ key: 'CDN-Cache-Control', value: 'public, s-maxage=60' }] },",
      '  ]',
      '}',
    ].join('\n')
    const found: string[] = headerRules(stripCommentsAndStrings(source)) ?? []
    expect(found).toHaveLength(1)
    expect(isPublicEdgeCacheRule(found[0])).toBe(true)
    expect(found[0]).not.toMatch(/missing:/)
  })

  it('a nested missing: [{ ... }] does not end its own rule early', () => {
    const source = [
      'async headers() {',
      '  return [',
      "    { source: '/a', missing: [{ type: 'cookie', key: 'el-signed-in' }], headers: [{ key: 'CDN-Cache-Control', value: 'public, s-maxage=60' }] },",
      "    { source: '/b', headers: [{ key: 'X-Other', value: '1' }] },",
      '  ]',
      '}',
    ].join('\n')
    const found: string[] = headerRules(stripCommentsAndStrings(source)) ?? []
    expect(found.map((r: string) => sourceOf(r))).toEqual(['/a', '/b'])
    expect(isPublicEdgeCacheRule(found[0])).toBe(true)
    expect(found[0]).toMatch(/key:\s*'el-signed-in'/)
  })

  it('a route source maps to the page file that answers it', () => {
    expect(pageFileFor('/events', ROOT)).toContain(join('src', 'app', 'events', 'page.tsx'))
    expect(pageFileFor('/events/:slug', ROOT)).toContain(join('src', 'app', 'events', '[slug]', 'page.tsx'))
    expect(pageFileFor('/no/such/route/anywhere', ROOT)).toBeNull()
  })

  it('reads the indexing class of a route as the policy writes it', () => {
    const policy = readFileSync(join(ROOT, 'src', 'lib', 'seo', 'indexing-policy.ts'), 'utf8')
    expect(indexingClassOf('/events', policy)).toBe('always')
    expect(indexingClassOf('/events/:slug', policy)).toBe('always')
    expect(indexingClassOf('/account', policy)).toBe('never')
  })
})
