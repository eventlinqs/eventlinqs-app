import { describe, expect, test } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DISCOVERY_INDEXING_THRESHOLD,
  INDEXING_POLICY,
  aliasMetadata,
  classifyRoute,
  discoveryIndexing,
  isDiscoveryIndexable,
  noIndexMetadata,
  routesWithClass,
} from '@/lib/seo/indexing-policy'

/**
 * THE INDEXING POLICY (close-out C19).
 *
 * Google Search Console reported this platform's own metadata back to it as
 * five exclusion reasons. Two were self-inflicted: a canonical leaked from the
 * root layout onto 57 routes, and 545 of 550 sitemap URLs were empty templated
 * pages. The policy module is what stops both, so these tests hold the pieces a
 * build guard cannot reach: the pure decisions, and the completeness of the
 * classification in both directions.
 */

const APP = join(__dirname, '..', '..', '..', 'src', 'app')

/** Every page route on disk, the way Next resolves one: groups stripped. */
function pageRoutes(): string[] {
  const out: string[] = []
  const walk = (dir: string, segs: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('_') || entry.name.startsWith('.') || entry.name.startsWith('@')) continue
        const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')')
        walk(join(dir, entry.name), isGroup ? segs : [...segs, entry.name])
      } else if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
        const route = '/' + segs.join('/')
        out.push(route === '/' ? '/' : route)
      }
    }
  }
  walk(APP, [])
  return out
}

describe('the classification is complete, in both directions', () => {
  test('every page route under src/app carries exactly one class', () => {
    const unclassified = pageRoutes().filter(r => !classifyRoute(r))
    expect(unclassified, `unclassified routes: ${unclassified.join(', ')}`).toEqual([])
  })

  test('every classified route still exists on disk', () => {
    const routes = new Set(pageRoutes())
    const stale = INDEXING_POLICY.filter(e => !routes.has(e.route)).map(e => e.route)
    expect(stale, `classified routes that no longer exist: ${stale.join(', ')}`).toEqual([])
  })

  test('no route is classified twice, and every entry carries a reason', () => {
    const seen = new Set<string>()
    for (const entry of INDEXING_POLICY) {
      expect(seen.has(entry.route), `${entry.route} is classified twice`).toBe(false)
      seen.add(entry.route)
      expect(entry.why.length, `${entry.route} carries no reason`).toBeGreaterThan(3)
    }
  })

  test('the four classes are all in use, and the private surfaces are the largest', () => {
    expect(routesWithClass('always').length).toBeGreaterThan(0)
    expect(routesWithClass('conditional').length).toBeGreaterThan(0)
    expect(routesWithClass('alias').length).toBeGreaterThan(0)
    expect(routesWithClass('never').length).toBeGreaterThan(routesWithClass('always').length)
  })

  test('every authenticated and transactional prefix is classed never', () => {
    // Enumerated from the tree, not typed: anything under these prefixes is
    // private by construction, so a new page beneath one cannot be indexable.
    const privatePrefixes = ['/admin', '/dashboard', '/account', '/checkout', '/orders', '/squad', '/t/', '/scan', '/unsubscribe']
    const wrong = pageRoutes()
      .filter(r => privatePrefixes.some(p => r === p || r.startsWith(p.endsWith('/') ? p : `${p}/`)))
      .filter(r => classifyRoute(r) !== 'never')
    expect(wrong, `private routes not classed never: ${wrong.join(', ')}`).toEqual([])
  })
})

describe('the threshold', () => {
  test('is three, the close-out C19.3 default, and is a single named constant', () => {
    expect(DISCOVERY_INDEXING_THRESHOLD).toBe(3)
    const src = readFileSync(join(__dirname, '..', '..', '..', 'src', 'lib', 'seo', 'indexing-policy.ts'), 'utf8')
    expect(src.match(/DISCOVERY_INDEXING_THRESHOLD = \d+/g)).toHaveLength(1)
  })

  test('decides indexability at the boundary, not near it', () => {
    expect(isDiscoveryIndexable(0)).toBe(false)
    expect(isDiscoveryIndexable(DISCOVERY_INDEXING_THRESHOLD - 1)).toBe(false)
    expect(isDiscoveryIndexable(DISCOVERY_INDEXING_THRESHOLD)).toBe(true)
    expect(isDiscoveryIndexable(DISCOVERY_INDEXING_THRESHOLD + 40)).toBe(true)
  })
})

describe('the metadata blocks each page spreads', () => {
  test('noIndexMetadata blocks both the generic crawler and Googlebot, and names no canonical', () => {
    const meta = noIndexMetadata()
    expect(meta.robots.index).toBe(false)
    expect(meta.robots.follow).toBe(false)
    expect(meta.robots.googleBot.index).toBe(false)
    expect(meta).not.toHaveProperty('alternates')
  })

  test('aliasMetadata is noindex, follows through, and points at the real page', () => {
    const meta = aliasMetadata('/events/open-field-party')
    expect(meta.robots.index).toBe(false)
    expect(meta.robots.follow).toBe(true)
    expect(meta.alternates.canonical).toBe('/events/open-field-party')
  })

  test('discoveryIndexing self-canonicalises in BOTH states and only moves the robots directive', () => {
    const empty = discoveryIndexing(0, '/community/african')
    const full = discoveryIndexing(DISCOVERY_INDEXING_THRESHOLD, '/community/african')
    expect(empty.robots.index).toBe(false)
    expect(full.robots.index).toBe(true)
    // The canonical is the same in both states. Pointing an empty page's
    // canonical elsewhere is what produced "Google chose different canonical
    // than user" in the first place.
    expect(empty.alternates.canonical).toBe('/community/african')
    expect(full.alternates.canonical).toBe('/community/african')
    // follow stays true even when noindex: the page still links to real events.
    expect(empty.robots.follow).toBe(true)
  })
})

describe('the root layout no longer leaks a canonical', () => {
  test('src/app/layout.tsx declares no alternates, and the homepage declares its own', () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*/g, '$1')
    const layout = strip(readFileSync(join(APP, 'layout.tsx'), 'utf8'))
    expect(layout).not.toMatch(/alternates:\s*\{/)
    const home = strip(readFileSync(join(APP, 'page.tsx'), 'utf8'))
    expect(home).toMatch(/alternates:\s*\{\s*canonical:\s*'\/'/)
  })
})
