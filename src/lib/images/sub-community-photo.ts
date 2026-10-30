import { getSpineCategoryTile, getSpineHero, getSpineScene } from './spine'

/**
 * The photograph for a sub-community tile on a community page (Afrobeats, Soca, Bollywood, NAIDOC and so on).
 *
 * STORED PHOTOGRAPHS ONLY, NEVER A REQUEST-TIME CALL (Lawal, 22:17 and 22:23 on 29 October 2026, through the project
 * manager's 22:20 and 22:24). This used to ask Pexels on every render and cache the answer for a week through
 * unstable_cache, a refusal included, so one refused lookup blanked a tile for a week.
 *
 * EVERY TILE HAS ONE (Lawal, 16:05 on 30 October 2026, L14): read from production's served HTML that afternoon, 90 of
 * the 105 tiles drew the navy gradient, the First Nations and Indian rails among them, because this file kept 15 and
 * answered null for the rest. Each tile is now either Lawal's own licensed photograph (FROM_LAWAL, through the spine)
 * or one kept once in public/images/library with its photographer, page, alt text and licence in
 * public/images/library/attribution.json. Each kept photograph was chosen by eye from a search for that tile, and
 * counted only when its own alt text or page title names the community or the tile; four that did not (the reggae
 * jazz band, the OPM church, and the Greek and Other East and Southeast Asian community photographs) were replaced.
 * The First Nations tiles are on Lawal's own First Nations photograph, never a stock picture of ceremony, dance or
 * art. scripts/guards/sub-community-tiles-stored.mjs fails the build if any tile has none.
 */

/** Lawal's own photographs, for the tiles no kept photograph names truly. */
const FROM_LAWAL: Readonly<Record<string, { scene: string } | { tile: string } | { hero: Parameters<typeof getSpineHero>[0] }>> = {
  'aboriginal-torres-strait-islander:naidoc': { scene: 'first-nations' },
  'aboriginal-torres-strait-islander:dance-song': { scene: 'first-nations' },
  'aboriginal-torres-strait-islander:art-markets': { scene: 'first-nations' },
  'aboriginal-torres-strait-islander:language-story': { scene: 'first-nations' },
  'aboriginal-torres-strait-islander:torres-strait': { scene: 'first-nations' },
  'aboriginal-torres-strait-islander:community-day': { scene: 'first-nations' },
  'chinese:mandarin': { scene: 'pop' },
  'vietnamese:v-pop': { scene: 'pop' },
  'lebanese-levantine:dabke': { hero: 'supportingDance' },
  'korean:k-pop': { scene: 'pop' },
  'korean:fan-meet': { hero: 'supportingCrowd' },
  'pacific-pasifika:tongan': { hero: 'supportingCrowd' },
  'pacific-pasifika:cook-islands': { scene: 'pasifika-maori' },
  'maori:community': { tile: 'family' },
}

/** `${communitySlug}:${subCommunitySlug}` for each photograph kept in public/images/library. */
const KEPT = new Set([
  'african:afrobeats',
  'african:amapiano',
  'african:owambe',
  'african:west-african',
  'african:east-african',
  'african:southern-african',
  'caribbean:soca',
  'caribbean:dancehall',
  'caribbean:reggae',
  'caribbean:trinidadian',
  'caribbean:jamaican',
  'caribbean:afro-caribbean',
  'indian:bollywood',
  'indian:bhangra',
  'indian:garba-raas',
  'indian:holi-diwali',
  'indian:tamil-telugu',
  'indian:classical',
  'chinese:lunar-new-year',
  'chinese:mid-autumn',
  'chinese:cantonese',
  'chinese:banquet',
  'filipino:opm',
  'filipino:fiesta',
  'filipino:sinulog',
  'filipino:pasko',
  'filipino:modern-filipino',
  'latin-american:salsa',
  'latin-american:bachata',
  'latin-american:reggaeton',
  'latin-american:cumbia',
  'latin-american:mexican',
  'latin-american:brazilian',
  'vietnamese:tet',
  'vietnamese:mid-autumn',
  'vietnamese:ao-dai',
  'vietnamese:community',
  'lebanese-levantine:mahrajan',
  'lebanese-levantine:tarab-oud',
  'lebanese-levantine:syrian',
  'lebanese-levantine:palestinian',
  'greek:glendi',
  'greek:rebetiko',
  'greek:panigiri',
  'greek:dance',
  'greek:cypriot',
  'italian:sagra',
  'italian:festa',
  'italian:opera',
  'italian:italian-film',
  'italian:regional',
  'korean:seollal-chuseok',
  'korean:korean-film',
  'korean:korean-food',
  'japanese:matsuri',
  'japanese:anime',
  'japanese:taiko',
  'japanese:hanami',
  'japanese:tea-arts',
  'pacific-pasifika:samoan',
  'pacific-pasifika:fijian',
  'pacific-pasifika:pasifika-fest',
  'maori:kapa-haka',
  'maori:matariki',
  'maori:te-reo',
  'persian-iranian:nowruz',
  'persian-iranian:yalda',
  'persian-iranian:classical',
  'persian-iranian:diaspora-pop',
  'turkish:folk-saz',
  'turkish:festival',
  'turkish:sema',
  'turkish:modern',
  'arab:egyptian',
  'arab:iraqi',
  'arab:gulf-khaleeji',
  'arab:tarab-oud',
  'other-south-asian:nepali',
  'other-south-asian:sri-lankan',
  'other-south-asian:pakistani',
  'other-south-asian:bangladeshi',
  'other-east-southeast-asian:thai',
  'other-east-southeast-asian:indonesian',
  'other-east-southeast-asian:malaysian',
  'other-east-southeast-asian:cambodian-lao',
  'other-european:german',
  'other-european:polish',
  'other-european:irish',
  'other-european:ukrainian',
  'other-european:balkan',
  'other-european:eurovision',
])

const keyOf = (communitySlug: string, subCommunitySlug: string) => `${communitySlug.toLowerCase()}:${subCommunitySlug.toLowerCase()}`

export async function getSubCommunityPhoto(communitySlug: string, subCommunitySlug: string): Promise<string | null> {
  const key = keyOf(communitySlug, subCommunitySlug)
  const lawal = FROM_LAWAL[key]
  if (lawal) {
    const image = 'scene' in lawal ? getSpineScene(lawal.scene) : 'tile' in lawal ? getSpineCategoryTile(lawal.tile) : getSpineHero(lawal.hero)
    if (image) return image.src
  }
  if (!KEPT.has(key)) return null
  return `/images/library/sub-${key.replace(':', '-')}.jpg`
}

export function isKnownSubCommunityKey(communitySlug: string, subCommunitySlug: string): boolean {
  const key = keyOf(communitySlug, subCommunitySlug)
  return KEPT.has(key) || key in FROM_LAWAL
}
