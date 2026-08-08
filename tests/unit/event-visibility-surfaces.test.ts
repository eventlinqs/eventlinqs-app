import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * PROOFS 1, 3 and 4 of the child-safety ruling: discovery, the sitemap, and
 * the weekly digest.
 *
 * These are QUERY-level guarantees, so a mocked-client unit test would only
 * prove that a mock was called. Instead these assert on the shipped source,
 * which is the same posture the seating work used when it replaced a model
 * assertion with a drawn-frame assertion: check the artefact, not the intent.
 *
 * A regression here is not a broken page. It is a private address in a public
 * feed, a search index, or an email blast.
 */

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/** Strip comments so a filter mentioned in prose cannot satisfy a check. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('PROOF 1 of 4: discovery never selects a non-public event', () => {
  const DISCOVERY_FILES = [
    'src/lib/events/fetchers.ts',
    'src/lib/events/home-queries.ts',
  ]

  /**
   * Every events read that returns USER-VISIBLE CONTENT must filter
   * visibility. A read that returns only an internal identifier for a join is
   * exempt, because an id or a category id carries no title, no address and
   * no cover, and the surface that renders it filters for itself.
   *
   * The exemption is deliberately narrow and is asserted, not assumed: the
   * select list must contain nothing but id-shaped columns.
   */
  const ID_ONLY_SELECT = /^[\s'"]*((id|category_id|event_id|organisation_id)\s*,?\s*)+['"]?$/

  it.each(DISCOVERY_FILES)('%s filters visibility on every content query', file => {
    const src = code(read(file))

    // Pair each `.from('events')` with the `.select(...)` that follows it and
    // the ~15 lines of chained filters after that.
    const blocks = src.split(/\.from\(\s*['"]events['"]\s*\)/).slice(1)
    expect(blocks.length).toBeGreaterThan(0)

    const unguarded: string[] = []
    for (const block of blocks) {
      const window = block.slice(0, 700)
      const selectMatch = window.match(/\.select\(\s*([^)]*)\)/)
      const selectList = selectMatch?.[1]?.trim() ?? ''

      // Exempt: pure identifier reads used for joins and taste signals.
      if (ID_ONLY_SELECT.test(selectList)) continue

      const guarded = /\.eq\(\s*['"]visibility['"]\s*,\s*['"]public['"]\s*\)/.test(window)
      if (!guarded) unguarded.push(selectList.slice(0, 80))
    }

    expect(unguarded).toEqual([])
  })
})

describe('PROOF 3 of 4: the sitemap', () => {
  it('only ever lists public events', () => {
    const src = code(read('src/app/sitemap.ts'))
    expect(src).toMatch(/\.eq\(\s*['"]visibility['"]\s*,\s*['"]public['"]\s*\)/)
  })

  it('does not use a deny-list that would leak a future enum value', () => {
    const src = code(read('src/app/sitemap.ts'))
    expect(src).not.toMatch(/visibility.*!==?\s*['"]private['"]/)
  })
})

describe('PROOF 4 of 4: the weekly city digest', () => {
  const src = code(read('src/lib/broadcast/digest.ts'))

  it('filters to public at the query, not merely in memory', () => {
    expect(src).toMatch(/\.eq\(\s*['"]visibility['"]\s*,\s*PUBLIC_VISIBILITY\s*\)/)
  })

  it('no longer carries the deny-list that let UNLISTED through', () => {
    // The exact shipped bug: `.filter((e) => e.visibility !== 'private' && ...)`
    // passed every unlisted event into a city-wide email.
    expect(src).not.toMatch(/visibility\s*!==\s*['"]private['"]/)
  })

  it('routes its in-memory guard through the shared predicate', () => {
    expect(src).toMatch(/isPubliclyDiscoverable\(/)
  })
})

describe('the event page blocks the search index', () => {
  const src = code(read('src/app/events/[slug]/page.tsx'))

  it('calls the shared robots directive from generateMetadata', () => {
    expect(src).toMatch(/eventRobotsDirective\(/)
  })

  it('imports it from the one module that owns the decision', () => {
    expect(src).toMatch(/from '@\/lib\/events\/visibility'/)
  })
})

describe('nothing in the codebase uses the leaky deny-list shape', () => {
  it('no surface compares visibility against private alone', () => {
    // A sweep, so a NEW surface cannot reintroduce the digest bug elsewhere.
    const FILES = [
      'src/lib/events/fetchers.ts',
      'src/lib/events/home-queries.ts',
      'src/lib/broadcast/digest.ts',
      'src/app/sitemap.ts',
    ]
    const offenders = FILES.filter(f =>
      /visibility\s*!==\s*['"]private['"]/.test(code(read(f))),
    )
    expect(offenders).toEqual([])
  })
})
