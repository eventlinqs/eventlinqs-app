import { describe, expect, it } from 'vitest'

import { parseEventsSearchParams, resolveCategorySlug } from '@/lib/events/search-params'

/**
 * The rename in 20260812000002_category_taxonomy_repair removes `arts-culture`
 * from the database. These pin the one thing that rename could break: a URL
 * somebody already has.
 *
 * The failure being prevented is not a 404. It is HTTP 200 with zero events,
 * because an unknown category slug resolves to NO_MATCH in the fetcher. That
 * reads as "this category is empty" rather than "this link is old", and nobody
 * reports it.
 */
describe('category slug aliases survive the taxonomy rename', () => {
  it('resolves the retired arts-culture slug to the live one', () => {
    expect(resolveCategorySlug('arts-culture')).toBe('arts-community')
  })

  it('carries the alias through the parsed filters, which is what the fetcher reads', () => {
    const f = parseEventsSearchParams({ category: 'arts-culture' }).filters
    expect(f.category).toBe('arts-community')
  })

  it('leaves a live slug alone', () => {
    expect(resolveCategorySlug('comedy')).toBe('comedy')
    expect(parseEventsSearchParams({ category: 'music' }).filters.category).toBe('music')
  })

  it('normalises case and whitespace, because a shared link is not always tidy', () => {
    expect(resolveCategorySlug('  Arts-Culture  ')).toBe('arts-community')
  })

  it('still yields undefined for no category, so the browse page stays unfiltered', () => {
    expect(resolveCategorySlug(undefined)).toBeUndefined()
    expect(resolveCategorySlug('   ')).toBeUndefined()
  })

  /*
   * The alias table must never point at a slug that does not exist, or it turns
   * one dead link into another. arts-community is created by the same migration
   * that retires arts-culture, so the pair is asserted here rather than assumed.
   */
  it('never aliases to a slug the taxonomy does not define', () => {
    const live = new Set(['arts-community', 'comedy', 'music', 'sports', 'food-drink'])
    expect(live.has(resolveCategorySlug('arts-culture')!)).toBe(true)
  })
})
