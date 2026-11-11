/**
 * AN EDGE CACHED PAGE READS ITS FLAGS THROUGH THE PUBLIC CLIENT, NEVER REDIS (the CONTROLLER's 11:31 of 3 November 2026,
 * the sweep; WINDOW 5's 07:32 cause: '/ ANSWERS MISS (Cache-Control: private, no-cache, no-store)' because the home's
 * Featured row read isFeatureEnabled('paid_promotions') through Upstash, whose fetch is cache 'no-store', and a no-store
 * fetch in a render opts the page out of the edge cache).
 *
 * Every page under src/app that exports a positive `revalidate` (0 is not cached), and every server component or read such a page draws
 * (named below), passes { cachedPage: true } on every isFeatureEnabled call. /artists is force-dynamic and is not judged.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..', '..')

function pages(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...pages(p))
    else if (name === 'page.tsx') out.push(p)
  }
  return out
}

/** Drawn by an edge cached page, so held to the same rule. */
const DRAWN_BY_CACHED_PAGES = [
  'src/components/events/walk-in/walk-in-event-page.tsx',
  'src/components/features/city-guide/city-guide-screen.tsx',
]

/** Each isFeatureEnabled call in code (comments stripped) that does not pass cachedPage: true. */
function uncached(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
  const calls = [...code.matchAll(/isFeatureEnabled\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)].map((m) => m[0])
  return calls.filter((c) => !/cachedPage:\s*true/.test(c))
}

describe('edge cached pages read flags through the public client', () => {
  const cached = pages(join(ROOT, 'src', 'app')).filter((p) => /^export const revalidate = [1-9]\d*/m.test(readFileSync(p, 'utf8')))

  it('finds the edge cached pages it judges (the home, the event page, the city guide, venues, artists)', () => {
    const rel = cached.map((p) => p.slice(ROOT.length + 1).replace(/\\/g, '/'))
    for (const must of ['src/app/page.tsx', 'src/app/events/[slug]/page.tsx', 'src/app/venues/[handle]/page.tsx', 'src/app/artists/[slug]/page.tsx']) {
      expect(rel).toContain(must)
    }
  })

  it.each([...cached.map((p) => p.slice(ROOT.length + 1)), ...DRAWN_BY_CACHED_PAGES])('%s: every isFeatureEnabled passes cachedPage', (file) => {
    expect(uncached(readFileSync(join(ROOT, file), 'utf8'))).toEqual([])
  })

  it("the home's Featured row reads cached, so the home is in the edge cache (car 40's #418 found and fixed, 11 November 2026)", () => {
    const src = readFileSync(join(ROOT, 'src/lib/promotions/promotions.ts'), 'utf8')
    const body = src.slice(src.indexOf('export async function featuredForPage'))
    const firstCall = body.split(/\r?\n/).find((l) => l.includes("isFeatureEnabled('paid_promotions'")) ?? ''
    // The cause was the root's render made for "/index" (src/lib/navigation/route-pathname.ts), not this read.
    expect(firstCall).toMatch(/isFeatureEnabled\('paid_promotions', \{ client: createPublicClient\(\), cachedPage: true \}\)/)
  })

  it('the judge sees an uncached call (drill)', () => {
    expect(uncached("const a = await isFeatureEnabled('listing_claims')")).toHaveLength(1)
    expect(uncached("const a = await isFeatureEnabled('listing_claims', { client: createPublicClient(), cachedPage: true })")).toHaveLength(0)
    expect(uncached("// isFeatureEnabled('listing_claims')")).toHaveLength(0)
  })
})
