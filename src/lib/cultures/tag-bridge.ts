/**
 * Culture Taxonomy v2 - heritage -> event-tag bridge.
 *
 * The public heritage surface (the /events?culture= filter, the
 * /culture/[slug] and /culture/[slug]/[city] landings, and the
 * /cultures index counts) resolves a heritage to the set of identifying
 * tokens carried in the event `tags` jsonb array. Events keep their
 * existing tags; this bridge reinterprets them under the v2 21-heritage
 * model with NO data backfill required (the v2 re-tagging is achieved
 * here, not by mutating event rows).
 *
 * Only heritage-distinctive tokens are listed. Generic tokens
 * (family, free, festival, music, food, premium, community, cultural,
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

import type { CultureSlug } from './data'

export const CULTURE_TO_TAGS: Record<CultureSlug, string[]> = {
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

export function getCultureTags(culture: CultureSlug): string[] {
  return CULTURE_TO_TAGS[culture] ?? []
}

/**
 * Build the PostgREST `.or(...)` filter string that matches an event
 * whose `tags` jsonb array contains ANY of the heritage's tag tokens.
 *
 * When `subCulture` is supplied and is itself a recognised token for
 * the heritage, the filter narrows to that single token so deep links
 * such as /events?culture=african&sub_culture=amapiano resolve
 * precisely. An unrecognised sub_culture is ignored and the full
 * heritage set applies. Returns null when the heritage has no tokens.
 */
export function buildCultureTagOrFilter(
  culture: CultureSlug,
  subCulture?: string | null,
): string | null {
  const tokens = getCultureTags(culture)
  if (tokens.length === 0) return null

  const narrowed =
    subCulture && tokens.includes(subCulture) ? [subCulture] : tokens

  return narrowed.map(t => `tags.cs.["${t}"]`).join(',')
}
