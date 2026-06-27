/**
 * Licensed image spine (photo-day, 2026-06).
 *
 * The 56-image spine is uploaded to Supabase storage as responsive AVIF
 * renditions by scripts/ingest-imagery.mjs (manifest: supabase/seed/imagery-map.json).
 * Object paths are deterministic:
 *
 *   <base>/storage/v1/object/public/event-images/stock/<role>/<key?>/<city?>/<descriptor>-<width>.avif
 *
 * so we don't read the manifest at runtime - we build the URL from a committed
 * slot registry below. Each slot resolves to the LARGEST guaranteed rendition
 * (>= the ingest dimension floor for its role); next/image then downscales per
 * the component's `sizes` hint, so a raw multi-MB file is never served and the
 * source is always sharp enough to downscale from.
 *
 * The spine is the PRIORITY source for SLOT surfaces only - heroes and
 * city/scene/category/community TILES (one representative image per slot).
 * Per-event card imagery keeps its own cover -> Pexels-variety chain
 * (see event-media.ts / category-photo.ts) so event rails never collapse into
 * a wall of one repeated photo (CLAUDE.md Design system, Rails).
 *
 * Focal points: every slot carries an object-position so the cover-crop keeps
 * the subject in frame across the band / square / portrait aspects the slot is
 * rendered into (CLAUDE.md Cards and tiles; Task-7 focal-point rule). Defaults
 * by role; per-slot overrides where the subject sits off-centre.
 */

export type SpineRole = 'hero' | 'categories' | 'scenes' | 'cities'

// Largest rendition guaranteed to exist for each role (= the ingest dimension
// floor in scripts/ingest-imagery.mjs MIN_WIDTH). Pointing next/image here gives
// it the sharpest legal source to downscale from.
const ROLE_WIDTH: Record<SpineRole, number> = {
  hero: 1920,
  categories: 1440,
  scenes: 1440,
  cities: 1200,
}

const ROLE_DEFAULT_FOCAL: Record<SpineRole, string> = {
  hero: '50% 42%',      // wide band: hold faces/stage above the bottom scrim
  categories: '50% 48%',
  scenes: '50% 42%',    // square/portrait tiles: keep hands-up / subjects in frame
  cities: '50% 45%',    // skylines/horizons sit a touch high
}

interface SpineSlot {
  role: SpineRole
  /** category/scene slug, else null. */
  key: string | null
  /** city slug, else null. */
  city: string | null
  descriptor: string
  /** object-position override; falls back to the role default. */
  focal?: string
}

function publicBase(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  return `${url.replace(/\/+$/, '')}/storage/v1/object/public/event-images/stock`
}

function buildUrl(slot: SpineSlot): string | null {
  const base = publicBase()
  if (!base) return null
  const width = ROLE_WIDTH[slot.role]
  const path = [slot.role, slot.key, slot.city, slot.descriptor].filter(Boolean).join('/')
  return `${base}/${path}-${width}.avif`
}

export interface SpineImage {
  src: string
  objectPosition: string
}

function resolve(slot: SpineSlot | undefined): SpineImage | null {
  if (!slot) return null
  const src = buildUrl(slot)
  if (!src) return null
  return { src, objectPosition: slot.focal ?? ROLE_DEFAULT_FOCAL[slot.role] }
}

// ── CITIES ────────────────────────────────────────────────────────────────
// One landscape photo per launch city. Slug is 1:1 with the city slug used by
// getCityPhoto / getCityHeroPhoto / the homepage city rail.
const CITY_SLOTS: Record<string, SpineSlot> = {
  sydney:        { role: 'cities', key: null, city: 'sydney',     descriptor: 'harbour-dusk', focal: '50% 50%' },
  melbourne:     { role: 'cities', key: null, city: 'melbourne',  descriptor: 'skyline-sunrise' },
  brisbane:      { role: 'cities', key: null, city: 'brisbane',   descriptor: 'southbank-golden-hour' },
  perth:         { role: 'cities', key: null, city: 'perth',      descriptor: 'foreshore-day' },
  adelaide:      { role: 'cities', key: null, city: 'adelaide',   descriptor: 'festival-crowd-day' },
  'gold-coast':  { role: 'cities', key: null, city: 'gold-coast', descriptor: 'beachfront-day' },
  canberra:      { role: 'cities', key: null, city: 'canberra',   descriptor: 'parliament-dusk' },
  newcastle:     { role: 'cities', key: null, city: 'newcastle',  descriptor: 'beach-foreshore-day' },
  hobart:        { role: 'cities', key: null, city: 'hobart',     descriptor: 'waterfront-day' },
  darwin:        { role: 'cities', key: null, city: 'darwin',     descriptor: 'mindil-sunset-evening' },
  wollongong:    { role: 'cities', key: null, city: 'wollongong', descriptor: 'coast-day' },
  geelong:       { role: 'cities', key: null, city: 'geelong',    descriptor: 'waterfront-golden-hour' },
  cairns:        { role: 'cities', key: null, city: 'cairns',     descriptor: 'esplanade-tropical-day' },
}

// ── SCENES (sounds + wired community) ───────────────────────────────────────
// Keyed by the spine scene slug (the locked CLAUDE.md Scene-layer slug).
// pride and faith-worship are uploaded but NOT mapped to a heritage community
// (the /communities index is heritage-only - no pride/faith tile - and /community/pride
// 308-redirects away). They await a dedicated scene/faith landing. first-nations
// IS wired: aboriginal-torres-strait-islander is its exact heritage slug.
// NOTE on the `descriptor`/`key` strings below: these are the PHYSICAL object
// filenames in the licensed stock bucket (event-images/stock), NOT user-facing
// taxonomy. The lookup slugs (the map keys + the public API) are community-first;
// a few descriptors/keys retain their original asset filenames because that is
// what physically exists in storage, and renaming the bucket objects is a
// founder-gated production-storage migration (do not rename in code alone, or the
// URL 404s). When the prod assets are re-uploaded community-first, update these
// path strings to match in the same change.
const SCENE_SLOTS: Record<string, SpineSlot> = {
  'first-nations':      { role: 'scenes', key: 'first-nations',      city: null, descriptor: 'cultural-ceremony-day' },
  // sounds (12)
  'electronic-dance':   { role: 'scenes', key: 'electronic-dance',   city: null, descriptor: 'mainstage-night' },
  country:              { role: 'scenes', key: 'country',            city: null, descriptor: 'outdoor-festival-day' },
  'indie-rock':         { role: 'scenes', key: 'indie-rock',         city: null, descriptor: 'festival-golden-hour' },
  'hip-hop-rnb':        { role: 'scenes', key: 'hip-hop-rnb',        city: null, descriptor: 'mc-set-night' },
  pop:                  { role: 'scenes', key: 'pop',                city: null, descriptor: 'arena-night' },
  'folk-acoustic':      { role: 'scenes', key: 'folk-acoustic',      city: null, descriptor: 'lawn-session-golden-hour' },
  'blues-roots':        { role: 'scenes', key: 'blues-roots',        city: null, descriptor: 'riverside-stage-day' },
  'afrobeats-amapiano': { role: 'scenes', key: 'afrobeats-amapiano', city: null, descriptor: 'crowd-hands-up-night', focal: '50% 38%' },
  latin:                { role: 'scenes', key: 'latin',              city: null, descriptor: 'beachfront-social-dusk' },
  'caribbean-dancehall':{ role: 'scenes', key: 'caribbean-dancehall',city: null, descriptor: 'carnival-colour-day' },
  'jazz-soul':          { role: 'scenes', key: 'jazz-soul',          city: null, descriptor: 'club-session-night' },
  'metal-hardcore':     { role: 'scenes', key: 'metal-hardcore',     city: null, descriptor: 'moshpit-day' },
  // community (5 wired)
  'south-asian':        { role: 'scenes', key: 'south-asian',        city: null, descriptor: 'celebration-colour-day' },
  mediterranean:        { role: 'scenes', key: 'mediterranean',      city: null, descriptor: 'food-festa-golden-hour' },
  pride:                { role: 'scenes', key: 'pride',              city: null, descriptor: 'parade-colour-day' },
  asian:                { role: 'scenes', key: 'asian',              city: null, descriptor: 'lantern-festival-night' },
  'pasifika-maori':     { role: 'scenes', key: 'pasifika-maori',     city: null, descriptor: 'cultural-festival-day' },
}

// Map the homepage SoundsRail slug -> spine scene slug (they differ).
const SOUND_TO_SCENE: Record<string, string> = {
  electronic: 'electronic-dance',
  country: 'country',
  'indie-rock': 'indie-rock',
  'hip-hop': 'hip-hop-rnb',
  pop: 'pop',
  'folk-acoustic': 'folk-acoustic',
  'blues-roots': 'blues-roots',
  afrobeats: 'afrobeats-amapiano',
  latin: 'latin',
  caribbean: 'caribbean-dancehall',
  'jazz-soul': 'jazz-soul',
  metal: 'metal-hardcore',
}

// Map the REAL /community/[slug] route slug -> spine scene slug, for the WIRED
// community scenes only (CLAUDE.md community moat). Keyed by the canonical
// heritage slugs that resolve 200 (not the community-photo query keys, which
// differ). pride + faith-worship are absent on purpose (no heritage tile).
const COMMUNITY_TO_SCENE: Record<string, string> = {
  'aboriginal-torres-strait-islander': 'first-nations', // exact community match
  indian: 'south-asian',           // Indian leads the South Asian community (ABS)
  chinese: 'asian',                // lantern-festival shot
  italian: 'mediterranean',        // Mediterranean food festa
  'pacific-pasifika': 'pasifika-maori',
}

// ── CATEGORIES ──────────────────────────────────────────────────────────────
// Two surfaces per category where two photos exist: the TILE (3/2 browse tile,
// day-bright) and the landing HERO (wide band, the alternate/golden-hour shot).
const CATEGORY_TILE_SLOTS: Record<string, SpineSlot> = {
  music:                { role: 'categories', key: 'music',                city: null, descriptor: 'live-band-day' },
  sports:               { role: 'categories', key: 'sports',               city: null, descriptor: 'fans-cheering-day' },
  // lookup slug is community-first ('arts-community'); the storage path component
  // ('key') is the original asset folder name in the bucket. See SCENE_SLOTS note.
  'arts-community':       { role: 'categories', key: 'arts-culture',           city: null, descriptor: 'theatre-interior-evening', focal: '50% 45%' },
  'food-drink':         { role: 'categories', key: 'food-drink',           city: null, descriptor: 'street-food-night' },
  family:               { role: 'categories', key: 'family',               city: null, descriptor: 'outdoor-picnic-day' },
  festival:             { role: 'categories', key: 'festival',             city: null, descriptor: 'field-stage-day' },
  nightlife:            { role: 'categories', key: 'nightlife',            city: null, descriptor: 'rooftop-party-night' },
  'business-networking':{ role: 'categories', key: 'business-networking',  city: null, descriptor: 'conference-keynote-day' },
}

const CATEGORY_HERO_SLOTS: Record<string, SpineSlot> = {
  // where a second shot exists, the landing hero gets the cinematic alternate;
  // single-image categories reuse the one slot.
  music:                { role: 'categories', key: 'music',                city: null, descriptor: 'intimate-gig-night' },
  festival:             { role: 'categories', key: 'festival',             city: null, descriptor: 'twilight-stage-golden-hour' },
  nightlife:            { role: 'categories', key: 'nightlife',            city: null, descriptor: 'club-dancefloor-night' },
  'food-drink':         { role: 'categories', key: 'food-drink',           city: null, descriptor: 'rooftop-tasting-golden-hour' },
  // 'arts' gallery-day shot used as the arts-community landing hero (file lives
  // under key 'arts'); tile uses the theatre interior above.
  'arts-community':       { role: 'categories', key: 'arts',                 city: null, descriptor: 'gallery-day' },
  sports:               { role: 'categories', key: 'sports',               city: null, descriptor: 'fans-cheering-day' },
  family:               { role: 'categories', key: 'family',               city: null, descriptor: 'outdoor-picnic-day' },
  'business-networking':{ role: 'categories', key: 'business-networking',  city: null, descriptor: 'conference-keynote-day' },
}

// ── HEROES ───────────────────────────────────────────────────────────────────
const HERO_SLOTS = {
  homepageDayFestival:     { role: 'hero', key: null, city: null, descriptor: 'homepage-day-festival' },
  homepageFestivalNight:   { role: 'hero', key: null, city: null, descriptor: 'homepage-festival-night' },
  homepageRooftop:         { role: 'hero', key: null, city: null, descriptor: 'homepage-rooftop-golden-hour' },
  organisersStage:         { role: 'hero', key: null, city: null, descriptor: 'organisers-stage-production-day', focal: '50% 45%' },
  organisersSoldout:       { role: 'hero', key: null, city: null, descriptor: 'organisers-soldout-house-night' },
  supportingTickets:       { role: 'hero', key: null, city: null, descriptor: 'supporting-tickets-moment-day' },
  supportingDiscovery:     { role: 'hero', key: null, city: null, descriptor: 'supporting-discovery-browse-day' },
  supportingCrowd:         { role: 'hero', key: null, city: null, descriptor: 'supporting-crowd-singalong-golden-hour' },
  supportingDance:         { role: 'hero', key: null, city: null, descriptor: 'supporting-dance-celebration-night' },
  supportingOrganiser:     { role: 'hero', key: null, city: null, descriptor: 'supporting-organiser-success-day' },
  supportingEntryScan:     { role: 'hero', key: null, city: null, descriptor: 'supporting-entry-scan-night' },
} satisfies Record<string, SpineSlot>

// ── public API ────────────────────────────────────────────────────────────
export function getSpineCity(slug: string): SpineImage | null {
  return resolve(CITY_SLOTS[slug.toLowerCase()])
}

export function getSpineScene(sceneSlug: string): SpineImage | null {
  return resolve(SCENE_SLOTS[sceneSlug.toLowerCase()])
}

export function getSpineSceneForSound(soundSlug: string): SpineImage | null {
  const scene = SOUND_TO_SCENE[soundSlug.toLowerCase()]
  return scene ? getSpineScene(scene) : null
}

export function getSpineSceneForCommunity(communitySlug: string): SpineImage | null {
  const scene = COMMUNITY_TO_SCENE[communitySlug.toLowerCase()]
  return scene ? getSpineScene(scene) : null
}

export function getSpineCategoryTile(slug: string): SpineImage | null {
  return resolve(CATEGORY_TILE_SLOTS[slug.toLowerCase()])
}

export function getSpineCategoryHero(slug: string): SpineImage | null {
  return resolve(CATEGORY_HERO_SLOTS[slug.toLowerCase()])
}

export function getSpineHero(name: keyof typeof HERO_SLOTS): SpineImage | null {
  return resolve(HERO_SLOTS[name])
}
