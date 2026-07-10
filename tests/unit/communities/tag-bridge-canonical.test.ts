import { describe, expect, test } from 'vitest'
import {
  COMMUNITY_CANONICAL_TOKEN,
  COMMUNITY_TO_TAGS,
  communitiesFromTags,
  canonicalTokensForCommunities,
  stripCanonicalCommunityTokens,
  buildCommunityTagOrFilter,
} from '@/lib/communities/tag-bridge'
import type { CommunitySlug } from '@/lib/communities/data'

const ALL_SLUGS = Object.keys(COMMUNITY_TO_TAGS) as CommunitySlug[]

describe('community canonical-token bridge (event creation -> discovery)', () => {
  test('every community has a canonical token that is one of its own tokens', () => {
    for (const slug of ALL_SLUGS) {
      const token = COMMUNITY_CANONICAL_TOKEN[slug]
      expect(token, slug).toBeTruthy()
      expect(COMMUNITY_TO_TAGS[slug], slug).toContain(token)
    }
  })

  test('each canonical token is UNIQUE to its community (no cross-match)', () => {
    for (const slug of ALL_SLUGS) {
      const token = COMMUNITY_CANONICAL_TOKEN[slug]
      const owners = ALL_SLUGS.filter(s => COMMUNITY_TO_TAGS[s].includes(token))
      expect(owners, `${token} owned by ${owners.join(',')}`).toEqual([slug])
    }
  })

  test('tick -> tags -> discovery round-trips for any selection', () => {
    const selected: CommunitySlug[] = ['african', 'indian', 'aboriginal-torres-strait-islander', 'greek']
    const tags = canonicalTokensForCommunities(selected)
    // The form derives the ticked communities back from the tags exactly.
    expect(communitiesFromTags(tags).sort()).toEqual([...selected].sort())
    // Discovery (the community page filter) matches an event carrying the token.
    for (const slug of selected) {
      const filter = buildCommunityTagOrFilter(slug)
      expect(filter, slug).toContain(`["${COMMUNITY_CANONICAL_TOKEN[slug]}"]`)
    }
  })

  test('free-text tags are preserved; only community canonical tokens are stripped', () => {
    const free = ['outdoor', 'family-friendly', 'amapiano']
    const withCommunity = [...free, COMMUNITY_CANONICAL_TOKEN['greek'], COMMUNITY_CANONICAL_TOKEN['italian']]
    expect(stripCanonicalCommunityTokens(withCommunity).sort()).toEqual([...free].sort())
  })

  test('an event tagged to NO community resolves to none', () => {
    expect(communitiesFromTags(['outdoor', 'free', 'music'])).toEqual([])
  })
})
