import { describe, it, expect } from 'vitest'
import {
  PERMANENT_REDIRECTS,
  LEGACY_CATEGORY_REDIRECTS,
  isRedirected,
  redirectFor,
} from '@/lib/seo/permanent-redirects'
import { getCommunityRedirect } from '@/lib/communities/redirects'

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
    // /faith/christian, not /community/gospel: see the chain note below.
    expect(redirectFor('/categories/gospel')?.destination).toBe('/faith/christian')
    expect(redirectFor('/cultures')?.destination).toBe('/communities')
    expect(redirectFor('/pricing')).toBeNull()
  })

  /*
   * THIS TEST WAS ALREADY RIGHT AND ALREADY BLIND, AND THAT IS THE LESSON.
   *
   * It asserted "never to another redirect" and asked only `isRedirected`, which
   * reads THIS module. /categories/gospel pointed at /community/gospel, and the
   * redirect that forwards /community/gospel to /faith/christian lives in a
   * different module (src/lib/communities/redirects.ts), so the assertion passed
   * over a real two-hop chain. Measured on production on 8 September 2026 by
   * scripts/verify/published-url-graveyard.mjs (close-out C19.5): 308 to a 308,
   * which is what Search Console reports back as "page with redirect".
   *
   * The destination is now /faith/christian, and the assertion asks BOTH redirect
   * sources, so a chain across the two cannot pass again.
   */
  it('sends every legacy category straight to a live page, never to another redirect', () => {
    for (const r of LEGACY_CATEGORY_REDIRECTS) {
      expect(r.destination.startsWith('/community/') || r.destination.startsWith('/faith/')).toBe(true)
      expect(isRedirected(r.destination), `${r.source} -> ${r.destination} is redirected again`).toBe(false)
      const communitySlug = r.destination.startsWith('/community/') ? r.destination.split('/')[2] : null
      if (communitySlug) {
        expect(
          getCommunityRedirect(communitySlug),
          `${r.source} -> ${r.destination} is forwarded again by the community redirect table`,
        ).toBeNull()
      }
    }
  })
})
