import { describe, it, expect } from 'vitest'
import {
  PERMANENT_REDIRECTS,
  LEGACY_CATEGORY_REDIRECTS,
  isRedirected,
  redirectFor,
} from '@/lib/seo/permanent-redirects'

/**
 * The redirect table is now read by THREE consumers: next.config.ts serves it,
 * src/app/sitemap.ts subtracts it, and scripts/guards/sitemap-resolves.mjs
 * checks it. Before this pass it was a literal inside next.config.ts that
 * nothing else could see, and the sitemap published six URLs it redirects away.
 * Measured against production, redirects not followed: six 308s and one 200
 * across the seven /categories/* URLs the sitemap was publishing.
 */
describe('the permanent redirect table', () => {
  it('is not empty, because an empty table would make every consumer silently permissive', () => {
    expect(PERMANENT_REDIRECTS.length).toBeGreaterThan(0)
  })

  it('is permanent throughout: a temporary redirect in here would be a lie to the crawler', () => {
    for (const r of PERMANENT_REDIRECTS) expect(r.permanent).toBe(true)
  })

  it('matches the six legacy category slugs that production answers 308 for', () => {
    for (const slug of [
      'afrobeats',
      'amapiano',
      'owambe',
      'heritage-and-independence',
      'caribbean',
      'gospel',
    ]) {
      expect(isRedirected(`/categories/${slug}`)).toBe(true)
    }
  })

  it('leaves /categories/networking alone, because production answers 200 for it', () => {
    expect(isRedirected('/categories/networking')).toBe(false)
  })

  it('matches a parameterised source on any single segment, and not across a slash', () => {
    expect(isRedirected('/culture/african')).toBe(true)
    expect(isRedirected('/culture/african/melbourne')).toBe(true)
    // Three segments is not a rule in the table, so it must not match.
    expect(isRedirected('/culture/african/melbourne/extra')).toBe(false)
  })

  it('does not match a path that merely starts the same way', () => {
    expect(isRedirected('/communities')).toBe(false)
    expect(isRedirected('/community/african')).toBe(false)
    expect(isRedirected('/categories')).toBe(false)
  })

  it('names the destination, so a caller can publish the canonical URL instead', () => {
    expect(redirectFor('/categories/gospel')?.destination).toBe('/community/gospel')
    expect(redirectFor('/cultures')?.destination).toBe('/communities')
    expect(redirectFor('/pricing')).toBeNull()
  })

  it('sends every legacy category to a community page, never to another redirect', () => {
    for (const r of LEGACY_CATEGORY_REDIRECTS) {
      expect(r.destination.startsWith('/community/')).toBe(true)
      expect(isRedirected(r.destination)).toBe(false)
    }
  })
})
