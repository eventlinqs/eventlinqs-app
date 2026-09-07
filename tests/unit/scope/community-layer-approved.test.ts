import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAllCommunities } from '@/lib/communities/data'
import { getAllCities } from '@/lib/cities/data'
import { getAllFaiths, SMALLER_FAITHS } from '@/lib/faiths/data'
import { getAllHeroCategories } from '@/lib/hero-categories'

/**
 * THE APPROVED TAXONOMY RECORD AND ITS PROSE CANNOT DRIFT FROM THE SOURCE
 * (close-out C18 FINAL, 7 September 2026). docs/scope/community-layer-approved.json
 * is what the guard judges against; the addendum is what the owner reads. Both
 * must name exactly what the source ships.
 */
const ROOT = process.cwd()
const approved = JSON.parse(readFileSync(join(ROOT, 'docs/scope/community-layer-approved.json'), 'utf8')) as {
  communities: Array<{ slug: string; name: string; tier: number; heritageOrder: number }>
  communityCityMatrix: { cities: string[] }
  faiths: { pages: Array<{ slug: string; name: string }>; filterOnly: Array<{ slug: string; name: string }> }
  categories: { rows: Array<{ slug: string; name: string; inScopeV5: string | null }>; scopeV5Line351: string[] }
  heroCategories: { slugs: string[] }
}
const addendum = readFileSync(join(ROOT, 'docs/EventLinqs_Scope_v5-Addendum-A-Community-Layer.md'), 'utf8')
const scope = readFileSync(join(ROOT, 'docs/EventLinqs_Scope_v5.md'), 'utf8')

describe('the approved community layer', () => {
  it('records the 21 communities the source ships, in the same order, with the same names', () => {
    const source = getAllCommunities().map((c) => ({ slug: c.slug, name: c.displayName, tier: c.tier, heritageOrder: c.heritageOrder }))
    expect(source).toHaveLength(21)
    expect(approved.communities).toEqual(source)
  })

  it('records the 20 cities of the community-by-city matrix', () => {
    expect(approved.communityCityMatrix.cities).toEqual(getAllCities().map((c) => c.slug))
    expect(approved.communityCityMatrix.cities).toHaveLength(20)
  })

  it('records the faith pages and the filter-only faiths exactly', () => {
    expect(approved.faiths.pages.map((f) => f.slug)).toEqual(getAllFaiths().map((f) => f.slug))
    expect(approved.faiths.filterOnly.map((f) => f.slug)).toEqual(SMALLER_FAITHS.map((f) => f.slug))
  })

  it('records the seven hero category slugs', () => {
    expect(approved.heroCategories.slugs).toEqual(getAllHeroCategories().map((h) => h.slug))
  })

  it('maps every Scope v5 line 351 category to exactly one approved slug', () => {
    const line351 = scope.split('\n').find((l) => l.includes('Event categories: Music, Sports'))
    expect(line351, 'the scope line the categories come from has moved').toBeDefined()
    for (const name of approved.categories.scopeV5Line351) {
      expect(line351).toContain(name)
      const rows = approved.categories.rows.filter((r) => r.inScopeV5 === name)
      expect(rows, `${name} maps to one slug`).toHaveLength(1)
    }
    expect(approved.categories.scopeV5Line351).toHaveLength(15)
  })

  it('the addendum names every approved community, faith and category slug and is marked approved', () => {
    for (const c of approved.communities) expect(addendum).toContain(`/community/${c.slug}`)
    for (const f of approved.faiths.pages) expect(addendum).toContain(`/faith/${f.slug}`)
    for (const r of approved.categories.rows) expect(addendum).toContain(`\`${r.slug}\``)
    expect(addendum).toContain('APPROVED BY OWNER')
    expect(addendum).toContain('September 2026')
  })

  it('the scope document points at the addendum without its body being edited', () => {
    expect(scope).toContain('EventLinqs_Scope_v5-Addendum-A-Community-Layer.md')
    expect(scope).toContain('**END OF SCOPE OF WORK**')
    const bodyEnd = scope.indexOf('**END OF SCOPE OF WORK**')
    expect(scope.slice(0, bodyEnd)).not.toContain('Addendum-A-Community-Layer')
  })
})
