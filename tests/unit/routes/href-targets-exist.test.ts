/**
 * Law 5, made unskippable without a browser.
 *
 * THE DEFECT THAT PROMPTED THIS. Every organiser profile rendered a
 * "Send a message" button pointing at `/organisers/${slug}/contact`. That
 * route has never existed: `src/app/organisers/[handle]/` contains `page.tsx`
 * and nothing else. So the button 404d on every organiser profile on the
 * platform, and every gate was green, because a link is only proven by
 * following it and nothing followed this one.
 *
 * The link-integrity crawler would catch it, but only on pages it visits, only
 * against a running server, and it is not a CI job. This is: it reads the
 * hrefs out of the source and asserts each one has a route file behind it.
 *
 * WHAT IT CANNOT CATCH, stated so it is not mistaken for more than it is: an
 * href built entirely at runtime, a route that exists but throws notFound()
 * for a given parameter (that is D3, the sitemap divergence), and external
 * links. Those still need the crawler.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { safeRead, safeWalkSource, safeIsDirectory } from '../../helpers/safe-walk'

const ROOT = path.resolve(__dirname, '../../..')
const APP = path.join(ROOT, 'src/app')

/** Route groups like (marketing) do not appear in the URL. */
function isGroup(segment: string): boolean {
  return segment.startsWith('(') && segment.endsWith(')')
}

/**
 * Does a page, route handler, or a permanent redirect exist for this path?
 * A dynamic segment ([slug], [...rest]) matches any single literal segment.
 */
function routeExists(urlPath: string): boolean {
  const wanted = urlPath.split('/').filter(Boolean)

  // Next.js serves a route from any of these, not only page.tsx. Metadata
  // files count: /events/[slug]/opengraph-image is a real, fetchable URL.
  const ROUTE_FILES = [
    'page.tsx',
    'page.ts',
    'route.ts',
    'route.tsx',
    'opengraph-image.tsx',
    'opengraph-image.ts',
    'twitter-image.tsx',
    'icon.tsx',
  ]

  const servesHere = (dir: string): boolean => {
    if (ROUTE_FILES.some((f) => existsSync(path.join(dir, f)))) return true
    // A route group is transparent in the URL, so /admin is served by
    // admin/(authed)/page.tsx. The terminal check has to look through groups
    // too, not only the descent.
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return false
    }
    return entries.some(
      (e) => isGroup(e) && safeIsDirectory(path.join(dir, e)) && servesHere(path.join(dir, e)),
    )
  }

  const search = (dir: string, depth: number): boolean => {
    if (depth === wanted.length) return servesHere(dir)

    // The last segment can be a metadata FILE rather than a directory:
    // /events/[slug]/opengraph-image is served by opengraph-image.tsx sitting
    // beside page.tsx, so there is no directory of that name to descend into.
    if (depth === wanted.length - 1) {
      const asFile = wanted[depth]
      if (
        existsSync(path.join(dir, `${asFile}.tsx`)) ||
        existsSync(path.join(dir, `${asFile}.ts`))
      ) {
        return true
      }
    }

    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return false
    }
    for (const entry of entries) {
      const full = path.join(dir, entry)
      if (!safeIsDirectory(full)) continue
      // A route group is transparent: same depth, one level deeper on disk.
      if (isGroup(entry)) {
        if (search(full, depth)) return true
        continue
      }
      const dynamic = entry.startsWith('[')
      if (entry === wanted[depth] || dynamic) {
        // A catch-all swallows every remaining segment.
        if (entry.startsWith('[...') || entry.startsWith('[[...')) return true
        if (search(full, depth + 1)) return true
      }
    }
    return false
  }

  return search(APP, 0)
}

/** Paths that are redirects, rewrites, or handled outside src/app. */
const KNOWN_NON_APP_PATHS = new Set([
  '/sitemap.xml',
  '/robots.txt',
  '/manifest.webmanifest',
])

function collectHrefs(): { file: string; href: string }[] {
  const found: { file: string; href: string }[] = []
  // safeWalkSource + safeRead guard the vanish race: readdirSync, statSync and
  // the read all tolerate a file that disappears mid-walk. This collector runs
  // at DESCRIBE scope, so an unguarded ENOENT here would fail COLLECTION and
  // vitest would report "no tests" rather than a failure.
  for (const file of safeWalkSource(path.join(ROOT, 'src'))) {
    const src = safeRead(file)
    if (src === null) continue
    // href="/literal" and href={`/tpl/${x}/more`}
    const patterns = [/href="(\/[^"#?]*)"/g, /href=\{`(\/[^`#?]*)`\}/g]
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        let raw = m[1]
        // A hole that FOLLOWS A SLASH is a dynamic segment, so it stands in as
        // one: /events/${slug} is checkable as /events/x.
        raw = raw.replace(/\/\$\{[^}]*\}/g, '/x')
        // A hole that does not follow a slash is a SUFFIX on the segment before
        // it, and only the static prefix is checkable. Substituting there
        // invents a route: `/login${emailParam}` became "/loginx" and was
        // reported as a dead link, when emailParam is `?email=...` and the real
        // targets are /login and /login?email=... Truncating at the hole checks
        // what can actually be checked, and a literal typo like href="/loginx"
        // is still caught because no template is involved.
        //
        // Same fix as on feat/launch-kit-artefacts, which hit this first when
        // main's collector met that branch's signup form. It arrives here for
        // the same reason: this branch now carries that form.
        const hole = raw.indexOf('${')
        if (hole !== -1) raw = raw.slice(0, hole)
        // Drop a trailing partial segment left by a query or hash split.
        raw = raw.split('?')[0].split('#')[0]
        raw = raw.replace(/\/$/, '')
        if (!raw.startsWith('/') || raw.startsWith('//')) continue
        if (raw === '/') continue
        found.push({ file: path.relative(ROOT, file), href: raw })
      }
    }
  }
  return found
}

describe('every internal href has a route behind it', () => {
  const hrefs = collectHrefs()

  it('finds a meaningful number of hrefs to check', () => {
    // If the collector silently stops matching, the suite would pass by
    // checking nothing. This is the guard against a vacuous green.
    expect(hrefs.length).toBeGreaterThan(50)
  })

  it('resolves the organiser contact CTA, the defect this test was written for', () => {
    // Before the fix this pointed at /organisers/[handle]/contact.
    expect(routeExists('/organisers/x/contact')).toBe(false)
    expect(routeExists('/contact')).toBe(true)
  })

  it('resolves known-good routes, so the checker is not trivially true', () => {
    expect(routeExists('/events')).toBe(true)
    expect(routeExists('/events/some-slug')).toBe(true)
    expect(routeExists('/city/sydney/newtown')).toBe(true)
    expect(routeExists('/community/african/sydney')).toBe(true)
    expect(routeExists('/definitely/not/a/route')).toBe(false)
  })

  it('has no href pointing at a route that does not exist', () => {
    const broken = hrefs
      .filter((h) => !KNOWN_NON_APP_PATHS.has(h.href))
      .filter((h) => !routeExists(h.href))
      .map((h) => `${h.href}   (${h.file})`)

    const unique = [...new Set(broken)].sort()
    expect(unique, `hrefs with no route:\n${unique.join('\n')}`).toEqual([])
  })
})
