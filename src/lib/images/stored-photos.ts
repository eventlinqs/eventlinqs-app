/**
 * EVERY SLOT TILE ON A STORED PHOTOGRAPH (Lawal, 22:17 and 22:23 on 29 October 2026, through the project manager's
 * 22:20 and 22:24: the African community card, the Communities doorway and the Comedy tile showed no photograph on
 * production, because those tiles asked Pexels at request time and a failed answer was cached for a week).
 *
 * The order for a tile is fixed: Lawal's own licensed photographs first (the spine, src/lib/images/spine.ts), then
 * the bundled originals shipped with the site (public/images/hero, their licences in attribution.json beside them),
 * then the photographs kept once in public/images/library (each the one its tile showed before, or a fitting one,
 * with its photographer, page and licence in public/images/library/attribution.json, fetched by
 * scripts/ops/download-library-photos.mjs). Nothing here is fetched at request time.
 *
 * scripts/guards/tiles-on-stored-photos.mjs fails the build if a community or a real category has no stored
 * photograph, or if a tile resolver could reach Pexels before one.
 */
import { getSpineHero, getSpineScene, type SpineImage } from './spine'

export type StoredPhoto = { readonly src: string; readonly objectPosition?: string }

const bundled = (file: string): StoredPhoto => ({ src: `/images/hero/${file}` })
const kept = (slug: string): StoredPhoto => ({ src: `/images/library/${slug}.jpg` })
const spine = (image: SpineImage | null): StoredPhoto | null => (image ? { src: image.src, objectPosition: image.objectPosition } : null)

/** Where a stored photograph comes from, for the tiles Lawal's spine does not already name per community. */
type Source = { bundled: string } | { kept: string } | { scene: string } | { hero: Parameters<typeof getSpineHero>[0] }

function resolve(source: Source): StoredPhoto | null {
  if ('bundled' in source) return bundled(source.bundled)
  if ('kept' in source) return kept(source.kept)
  if ('scene' in source) return spine(getSpineScene(source.scene))
  return spine(getSpineHero(source.hero))
}

/*
 * Community slugs (the 21 heritage routes, then the older community keys other surfaces still pass). The spine's own
 * COMMUNITY_TO_SCENE answers first for the communities it names (aboriginal-torres-strait-islander, african,
 * caribbean, indian, chinese, italian, latin-american, pacific-pasifika); this table covers every other one.
 */
export const COMMUNITY_STORED: Readonly<Record<string, Source>> = {
  filipino: { bundled: 'filipino.jpg' },
  vietnamese: { bundled: 'lunar.jpg' },
  'other-south-asian': { bundled: 'bollywood.jpg' },
  greek: { kept: 'greek' },
  korean: { kept: 'korean' },
  japanese: { kept: 'japanese' },
  'lebanese-levantine': { kept: 'lebanese-levantine' },
  'persian-iranian': { kept: 'persian-iranian' },
  turkish: { kept: 'turkish' },
  arab: { kept: 'arab' },
  maori: { kept: 'maori' },
  'other-east-southeast-asian': { kept: 'other-east-southeast-asian' },
  'other-european': { kept: 'other-european' },
  // the older community keys
  'south-asian': { scene: 'south-asian' },
  'east-asian': { bundled: 'lunar.jpg' },
  latin: { scene: 'latin' },
  mediterranean: { scene: 'mediterranean' },
  'middle-eastern': { kept: 'lebanese-levantine' },
  european: { kept: 'other-european' },
  pacific: { scene: 'pasifika-maori' },
  gospel: { bundled: 'gospel.jpg' },
  comedy: { bundled: 'comedy.jpg' },
  wellness: { kept: 'health-wellness' },
  pride: { scene: 'pride' },
}

/*
 * Category slugs: every real category on production (read 29 October 2026) that the spine's CATEGORY_TILE_SLOTS do
 * not cover (music, sports, arts-community, food-drink, family, festival, nightlife and business-networking are).
 */
export const CATEGORY_STORED: Readonly<Record<string, Source>> = {
  comedy: { bundled: 'comedy.jpg' },
  religion: { bundled: 'gospel.jpg' },
  pride: { scene: 'pride' },
  pacific: { scene: 'pasifika-maori' },
  european: { kept: 'other-european' },
  community: { hero: 'supportingCrowd' },
  other: { hero: 'supportingDance' },
  'health-wellness': { kept: 'health-wellness' },
  fashion: { kept: 'fashion' },
  film: { kept: 'film' },
  charity: { kept: 'charity' },
  education: { kept: 'education' },
  technology: { kept: 'technology' },
  'middle-eastern': { kept: 'middle-eastern' },
}

export function storedCommunityPhoto(slug: string): StoredPhoto | null {
  const source = COMMUNITY_STORED[slug.toLowerCase()]
  return source ? resolve(source) : null
}

export function storedCategoryPhoto(slug: string): StoredPhoto | null {
  const source = CATEGORY_STORED[slug.toLowerCase()]
  return source ? resolve(source) : null
}
