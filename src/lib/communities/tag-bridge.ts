/**
 * Community Taxonomy v2 - heritage -> event-tag bridge.
 *
 * The public heritage surface (the /events?community= filter, the
 * /community/[slug] and /community/[slug]/[city] landings, and the
 * /communities index counts) resolves a heritage to the set of identifying
 * tokens carried in the event `tags` jsonb array. Events keep their
 * existing tags; this bridge reinterprets them under the v2 21-heritage
 * model with NO data backfill required (the v2 re-tagging is achieved
 * here, not by mutating event rows).
 *
 * Only heritage-distinctive tokens are listed. Generic tokens
 * (family, free, festival, music, food, premium, community, community,
 * dance, nightlife, brunch, day-party, watch-party, charity) are
 * excluded so the filter never over-matches. Faith tokens (gospel,
 * worship, christian, eid) and identity tokens (pride, mardi-gras,
 * queer, lgbtq) are deliberately excluded from the heritage axis - they
 * resolve on the Faith dimension (src/lib/faiths) and the Identity
 * facet respectively, so e.g. a Mardi Gras event correctly resolves to
 * NO heritage.
 *
 * The generic regional token 'middle-eastern' is intentionally not
 * assigned to any single heritage; Lebanese / Persian / Turkish / Arab
 * events are disambiguated by their specific token.
 */

import type { CommunitySlug } from './data'

export const COMMUNITY_TO_TAGS: Record<CommunitySlug, string[]> = {
  'aboriginal-torres-strait-islander': [
    'first-nations', 'aboriginal', 'torres-strait', 'torres-strait-islander',
    'naidoc', 'indigenous', 'blak', 'mob',
  ],
  african: [
    'african', 'afrobeats', 'afropop', 'alte', 'amapiano', 'owambe',
    'west-african', 'east-african', 'southern-african', 'south-african',
    'africultures', 'yoruba', 'nigerian', 'ghanaian', 'highlife',
    'bongo-flava', 'gqom', 'kwaito',
  ],
  caribbean: [
    'caribbean', 'soca', 'dancehall', 'reggae', 'steel-pan', 'calypso',
    'mas', 'trinidad', 'trinidadian', 'jamaican', 'jouvert', 'roots',
  ],
  indian: [
    'indian', 'bollywood', 'bhangra', 'dhol', 'south-asian', 'diwali',
    'sangeet', 'mehndi', 'mela', 'garba', 'raas', 'navratri', 'holi',
    'desi', 'tamil', 'telugu', 'jaipur',
  ],
  chinese: [
    'chinese', 'lunar-new-year', 'lunar', 'cantonese', 'mandarin',
    'cantopop', 'mandopop', 'mid-autumn', 'lion-dance',
  ],
  filipino: [
    'filipino', 'opm', 'sariwa', 'pinoy', 'tagalog', 'pilipino',
    'sinulog', 'pasko', 'ati-atihan',
  ],
  'latin-american': [
    'latin', 'latino', 'salsa', 'reggaeton', 'bachata', 'cuban',
    'merengue', 'cumbia', 'mariachi', 'brazilian', 'samba', 'mexican',
    'colombian', 'argentinian',
  ],
  vietnamese: [
    'vietnamese', 'tet', 'v-pop', 'ao-dai',
  ],
  'lebanese-levantine': [
    'lebanese', 'levantine', 'dabke', 'mahrajan', 'syrian',
    'palestinian',
  ],
  greek: [
    'greek', 'glendi', 'rebetiko', 'panigiri', 'bouzouki', 'cypriot',
  ],
  italian: [
    'italian', 'sagra', 'festa', 'tarantella', 'siciliani', 'calabrese',
  ],
  korean: [
    'korean', 'k-pop', 'kpop', 'hallyu', 'seollal', 'chuseok',
  ],
  japanese: [
    'japanese', 'matsuri', 'anime', 'j-rock', 'j-pop', 'taiko',
    'hanami',
  ],
  'pacific-pasifika': [
    'pacific', 'pasifika', 'samoan', 'tongan', 'fijian', 'islander',
    'cook-islands',
  ],
  maori: [
    'maori', 'kapa-haka', 'matariki', 'te-reo', 'waiata', 'haka',
  ],
  'persian-iranian': [
    'persian', 'iranian', 'nowruz', 'yalda', 'farsi', 'chaharshanbe',
  ],
  turkish: [
    'turkish', 'saz', 'sema', 'anatolian',
  ],
  arab: [
    'arab', 'arabic', 'egyptian', 'iraqi', 'khaleeji', 'gulf', 'oud',
    'tarab',
  ],
  'other-south-asian': [
    'nepali', 'sri-lankan', 'pakistani', 'bangladeshi', 'dashain',
    'tihar', 'pohela-boishakh', 'qawwali', 'sinhala',
  ],
  'other-east-southeast-asian': [
    'thai', 'indonesian', 'malaysian', 'cambodian', 'lao', 'songkran',
    'hmong', 'gamelan',
  ],
  'other-european': [
    'european', 'polish', 'german', 'irish', 'ukrainian', 'balkan',
    'eurovision', 'oktoberfest', 'french', 'maltese', 'russian',
  ],
}

export function getCommunityTags(community: CommunitySlug): string[] {
  return COMMUNITY_TO_TAGS[community] ?? []
}

/**
 * Canonical token per community: the first (heritage-distinctive, unique to the
 * community) token in each list. The event-creation Communities multi-select
 * writes these into `events.tags`, so a tagged event resolves to exactly that
 * community through this same bridge - no new schema, the existing discovery
 * (community pages, homepage rail, /events?community=, the feed) picks it up.
 */
export const COMMUNITY_CANONICAL_TOKEN: Record<CommunitySlug, string> = Object.fromEntries(
  (Object.entries(COMMUNITY_TO_TAGS) as [CommunitySlug, string[]][]).map(([slug, tokens]) => [slug, tokens[0]]),
) as Record<CommunitySlug, string>

const ALL_CANONICAL_TOKENS = new Set<string>(Object.values(COMMUNITY_CANONICAL_TOKEN))

/** Communities whose canonical token is present in the given tag list. */
export function communitiesFromTags(tags: string[]): CommunitySlug[] {
  const present = new Set(tags)
  return (Object.keys(COMMUNITY_CANONICAL_TOKEN) as CommunitySlug[]).filter(
    slug => present.has(COMMUNITY_CANONICAL_TOKEN[slug]),
  )
}

/** Removes any community canonical tokens from a free-text tag list (the multi-select owns them). */
export function stripCanonicalCommunityTokens(tags: string[]): string[] {
  return tags.filter(t => !ALL_CANONICAL_TOKENS.has(t))
}

/** The canonical tokens for the given communities (to write into events.tags). */
export function canonicalTokensForCommunities(communities: CommunitySlug[]): string[] {
  return communities.map(slug => COMMUNITY_CANONICAL_TOKEN[slug])
}

/**
 * Build the PostgREST `.or(...)` filter string that matches an event
 * whose `tags` jsonb array contains ANY of the heritage's tag tokens.
 *
 * When `subCommunity` is supplied and is itself a recognised token for
 * the heritage, the filter narrows to that single token so deep links
 * such as /events?community=african&sub_community=amapiano resolve
 * precisely. An unrecognised sub_community is ignored and the full
 * heritage set applies. Returns null when the heritage has no tokens.
 */
export function buildCommunityTagOrFilter(
  community: CommunitySlug,
  subCommunity?: string | null,
): string | null {
  const tokens = getCommunityTags(community)
  if (tokens.length === 0) return null

  const narrowed =
    subCommunity && tokens.includes(subCommunity) ? [subCommunity] : tokens

  return narrowed.map(t => `tags.cs.["${t}"]`).join(',')
}
