/**
 * GUARD: EVERY SLOT TILE IS ON A STORED PHOTOGRAPH, AND A FAILED PHOTO LOOKUP IS NEVER KEPT.
 *
 * WHY (Lawal, 22:17 and 22:23 on 29 October 2026, through the project manager's 22:20 and 22:24): on production the
 * African community card and the Communities doorway showed no photograph and the Comedy tile showed the EventLinqs
 * placeholder. Those tiles asked Pexels at request time (src/lib/images/community-photo.ts, category-photo.ts), and a
 * refused answer was cached by unstable_cache for a week, so one refusal that evening blanked them for a week.
 *
 * CLAUSES
 *   1  Every community route (src/lib/communities/data.ts) has a stored photograph: Lawal's own through the spine's
 *      COMMUNITY_TO_SCENE, or an entry in src/lib/images/stored-photos.ts COMMUNITY_STORED.
 *   2  Every slug a page hands getCategoryPhoto has one: every category on production (read 29 October 2026, below),
 *      every curated homepage category, every city page event type (src/lib/cities/data.ts CITY_EVENT_TYPES) and
 *      every category tile on the organisers page strip; from the spine's CATEGORY_TILE_SLOTS, stored-photos.ts
 *      CATEGORY_STORED, or Lawal's scene for a sound (the spine's SOUND_TO_SCENE). Widened on 30 October 2026 after
 *      the city pages' Concerts, DJ Sets, Theatre, Workshops and Sports tiles, and four on /organisers, were found
 *      still asking Pexels on production: the clause had judged only production categories and the homepage's.
 *   3  Every stored file a table names exists under public/, and every kept library photograph has its photographer
 *      and page on record in public/images/library/attribution.json.
 *   4  community-photo.ts makes no request-time call (no fetch, no Pexels).
 *   5  category-photo.ts makes no request-time call (no fetch, no Pexels, no cache of one), and asks the spine and the
 *      stored table first.
 *   6  sub-community-photo.ts makes no request-time call, and every sub-community photograph it keeps exists with its
 *      photographer on record.
 *   7  city-photo.ts makes no request-time call (Lawal's 13 spine cities answer first, every other city is kept once
 *      in public/images/library), and every kept city has its tile and its hero with a photographer on record.
 *   8  suburb-photo.ts makes no request-time call, every suburb in src/lib/cities is kept, and every kept suburb's
 *      photograph exists with its photographer on record.
 *   9  The home page's Communities doorway tile has its own photograph, which exists and is not in the home hero's
 *      raster pool (Lawal, 31 October 2026: the tile drew the placeholder on live; 'lock that in').
 *  10  Every hero page asks for its own subject's photo and none draws its hero empty on purpose (Lawal, 31 October:
 *      one defect is a class), the faith pages included, each with its own faith's photograph.
 *
 * Registered in run-guards.mjs; drilled in scripts/verify/guard-failure-drills.mjs.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TAG = '[tiles-on-stored-photos]'
const FAILURES = []
const fail = (clause, message) => FAILURES.push(`${clause}: ${message}`)
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

/** Every category on production, read only on 29 October 2026 (begin read only on event_categories). */
const PRODUCTION_CATEGORIES = [
  'arts-community', 'business-networking', 'charity', 'comedy', 'community', 'education', 'european', 'family', 'fashion', 'festival', 'film',
  'food-drink', 'health-wellness', 'middle-eastern', 'music', 'nightlife', 'other', 'pacific', 'pride', 'religion', 'sports', 'technology',
]

const keysOf = (src, name) => {
  const at = src.indexOf(name)
  if (at < 0) return null
  const open = src.indexOf('{', at)
  let depth = 0
  let end = open
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    if (src[i] === '}' && --depth === 0) { end = i; break }
  }
  const body = src.slice(open + 1, end)
  return new Set([...body.matchAll(/^\s*'?([a-z0-9-]+)'?\s*:/gm)].map((m) => m[1]))
}

const spine = code(read('src/lib/images/spine.ts'))
const stored = code(read('src/lib/images/stored-photos.ts'))
const communityScenes = keysOf(spine, 'COMMUNITY_TO_SCENE')
const categoryTiles = keysOf(spine, 'CATEGORY_TILE_SLOTS')
const communityStored = keysOf(stored, 'COMMUNITY_STORED')
const categoryStored = keysOf(stored, 'CATEGORY_STORED')
if (!communityScenes || !categoryTiles) fail('1', 'src/lib/images/spine.ts has no COMMUNITY_TO_SCENE or CATEGORY_TILE_SLOTS to judge')
if (!communityStored || !categoryStored) fail('1', 'src/lib/images/stored-photos.ts has no COMMUNITY_STORED or CATEGORY_STORED to judge')

const communities = [...read('src/lib/communities/data.ts').matchAll(/^ {4}slug: '([a-z0-9-]+)'/gm)].map((m) => m[1])
if (communities.length < 20) fail('1', `only ${communities.length} community route(s) found in src/lib/communities/data.ts; the scan cannot be trusted`)
let communitiesChecked = 0
for (const slug of communities) {
  communitiesChecked += 1
  if (!communityScenes?.has(slug) && !communityStored?.has(slug)) fail('1', `the community '${slug}' has no stored photograph (spine COMMUNITY_TO_SCENE or COMMUNITY_STORED)`)
}

const curated = [...code(read('src/lib/categories/homepage-curation.ts')).matchAll(/^\s*'([a-z0-9-]+)',?\s*$/gm)].map((m) => m[1])
const cityData = code(read('src/lib/cities/data.ts'))
const eventTypes = [...(/CITY_EVENT_TYPES[^=]*=\s*\[([\s\S]*?)\n\]/.exec(cityData)?.[1] ?? '').matchAll(/slug:\s*'([a-z0-9-]+)'/g)].map((m) => m[1])
if (eventTypes.length === 0) fail('2', 'no event type found in src/lib/cities/data.ts CITY_EVENT_TYPES; the scan cannot be trusted')
const strip = [...read('src/components/features/organisers/community-strip.tsx').matchAll(/kind: 'category', slug: '([a-z0-9-]+)'/g)].map((m) => m[1])
if (strip.length === 0) fail('2', 'no category tile found in the organisers page strip; the scan cannot be trusted')
const soundScenes = keysOf(spine, 'SOUND_TO_SCENE')
let categoriesChecked = 0
for (const slug of new Set([...PRODUCTION_CATEGORIES, ...curated, ...eventTypes, ...strip])) {
  categoriesChecked += 1
  if (!categoryTiles?.has(slug) && !categoryStored?.has(slug) && !soundScenes?.has(slug)) fail('2', `the category slug '${slug}' has no stored photograph (spine CATEGORY_TILE_SLOTS, CATEGORY_STORED or SOUND_TO_SCENE)`)
}

const attribution = existsSync('public/images/library/attribution.json') ? JSON.parse(read('public/images/library/attribution.json')).photos ?? {} : {}
let filesChecked = 0
for (const m of stored.matchAll(/\{ (bundled|kept): '([^']+)' \}/g)) {
  filesChecked += 1
  const [kind, name] = [m[1], m[2]]
  const file = kind === 'bundled' ? join('public/images/hero', name) : join('public/images/library', `${name}.jpg`)
  if (!existsSync(file)) fail('3', `${file} is named in stored-photos.ts and does not exist`)
  if (kind === 'kept' && !attribution[name]?.photographer) fail('3', `public/images/library/${name}.jpg has no photographer on record in attribution.json`)
}

const community = code(read('src/lib/images/community-photo.ts'))
if (!community) fail('4', 'src/lib/images/community-photo.ts is missing')
else if (/\bfetch\s*\(|api\.pexels\.com|unstable_cache/.test(community)) fail('4', 'community-photo.ts makes a request-time call (fetch, Pexels or a cache of one)')

const category = code(read('src/lib/images/category-photo.ts'))
const getPhoto = category.slice(category.indexOf('export async function getCategoryPhoto'))
const storedAt = getPhoto.search(/storedCategoryPhoto\(|getSpineCategoryTile\(/)
if (storedAt < 0) fail('5', 'getCategoryPhoto does not ask the spine and the stored table')
if (!category) fail('5', 'src/lib/images/category-photo.ts is missing')
else if (/\bfetch\s*\(|api\.pexels\.com|unstable_cache/.test(category)) fail('5', 'category-photo.ts makes a request-time call (fetch, Pexels or a cache of one)')

const sub = code(read('src/lib/images/sub-community-photo.ts'))
if (!sub) fail('6', 'src/lib/images/sub-community-photo.ts is missing')
else if (/\bfetch\s*\(|api\.pexels\.com|unstable_cache/.test(sub)) fail('6', 'sub-community-photo.ts makes a request-time call (fetch, Pexels or a cache of one)')
let subFilesChecked = 0
for (const m of sub.matchAll(/^\s+'([a-z0-9-]+):([a-z0-9-]+)',$/gm)) {
  subFilesChecked += 1
  const name = `sub-${m[1]}-${m[2]}`
  if (!existsSync(join('public/images/library', `${name}.jpg`))) fail('6', `public/images/library/${name}.jpg is kept by sub-community-photo.ts and does not exist`)
  else if (!attribution[name]?.photographer) fail('6', `public/images/library/${name}.jpg has no photographer on record in attribution.json`)
}
if (sub && subFilesChecked === 0) fail('6', 'no kept sub-community photograph found in sub-community-photo.ts; the scan cannot be trusted')

const city = code(read('src/lib/images/city-photo.ts'))
if (!city) fail('7', 'src/lib/images/city-photo.ts is missing')
else if (/\bfetch\s*\(|api\.pexels\.com|unstable_cache/.test(city)) fail('7', 'city-photo.ts makes a request-time call (fetch, Pexels or a cache of one)')
const keptCities = [...(/const KEPT_CITIES = new Set\(\[([\s\S]*?)\]\)/.exec(city)?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].map((m) => m[1])
if (city && keptCities.length === 0) fail('7', 'no kept city found in city-photo.ts; the scan cannot be trusted')
let cityFilesChecked = 0
for (const slug of keptCities) {
  for (const name of [`city-${slug}`, `city-hero-${slug}`]) {
    cityFilesChecked += 1
    if (!existsSync(join('public/images/library', `${name}.jpg`))) fail('7', `public/images/library/${name}.jpg is kept by city-photo.ts and does not exist`)
    else if (!attribution[name]?.photographer) fail('7', `public/images/library/${name}.jpg has no photographer on record in attribution.json`)
  }
}

const suburb = code(read('src/lib/images/suburb-photo.ts'))
if (!suburb) fail('8', 'src/lib/images/suburb-photo.ts is missing')
else if (/\bfetch\s*\(|api\.pexels\.com|unstable_cache/.test(suburb)) fail('8', 'suburb-photo.ts makes a request-time call (fetch, Pexels or a cache of one)')
const keptSuburbs = new Set([...(/const KEPT_SUBURBS = new Set\(\[([\s\S]*?)\]\)/.exec(suburb)?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].map((m) => m[1]))
if (suburb && keptSuburbs.size === 0) fail('8', 'no kept suburb found in suburb-photo.ts; the scan cannot be trusted')
const suburbSlugs = new Set([...cityData.matchAll(/slug: '((?:sydney|melbourne|brisbane|perth|gold-coast|canberra|hobart|adelaide|darwin|geelong)-[a-z-]+)'/g)].map((m) => m[1]))
let suburbFilesChecked = 0
for (const slug of suburbSlugs) if (!keptSuburbs.has(slug)) fail('8', `the suburb '${slug}' in src/lib/cities/data.ts has no kept photograph in suburb-photo.ts`)
for (const slug of keptSuburbs) {
  suburbFilesChecked += 1
  const name = `suburb-${slug}`
  if (!existsSync(join('public/images/library', `${name}.jpg`))) fail('8', `public/images/library/${name}.jpg is kept by suburb-photo.ts and does not exist`)
  else if (!attribution[name]?.photographer) fail('8', `public/images/library/${name}.jpg has no photographer on record in attribution.json`)
}

// 9  The home page's Communities doorway tile has its own photograph (Lawal on live, 31 October 2026, through the
//    controller's 11:15: 'lock that in'; it drew the EventLinqs placeholder after car 18 took its borrowed photo away):
//    category-nav-rail.tsx COMMUNITY_DOOR_TILE names a stored file that exists, and that file is not in the home hero's
//    raster pool (src/lib/images/event-media.ts HOMEPAGE_HERO_RASTERS), so it never shows twice on one page.
const navRail = read('src/components/features/home/category-nav-rail.tsx')
const door = /export const COMMUNITY_DOOR_TILE\s*=\s*\{([\s\S]*?)\n\}/.exec(navRail)
const doorSrc = door && /imageSrc:\s*'([^']*)'/.exec(door[1])
if (!door) fail('9', 'COMMUNITY_DOOR_TILE is not found in src/components/features/home/category-nav-rail.tsx; the scan cannot be trusted')
else if (!doorSrc || !doorSrc[1]) fail('9', 'the Communities doorway tile names no photograph (COMMUNITY_DOOR_TILE.imageSrc is empty), so it draws the placeholder')
else if (doorSrc[1].startsWith('/') && !existsSync(join('public', doorSrc[1]))) fail('9', `the Communities doorway photograph public${doorSrc[1]} does not exist`)
else {
  const pool = /HOMEPAGE_HERO_RASTERS\s*=\s*\[([^\]]*)\]/.exec(read('src/lib/images/event-media.ts'))
  const base = doorSrc[1].replace(/^.*\//, '').replace(/\.[a-z]+$/, '')
  if (pool && pool[1].includes(`'${base}'`)) fail('9', `the Communities doorway photograph '${base}' is also in the home hero raster pool, so one page could show it twice`)
}

// 10 No hero is drawn empty on purpose (Lawal, 31 October 2026, 11:13 'one defect is a class', through the controller's
//    11:18; his standing directive: real photography is never swapped for a placeholder). Each hero page names its own
//    subject's photo and never hard-codes an empty hero (the faith pages through src/lib/images/faith-photo.ts, their
//    own faith's photographs). A page that cannot yet have its own photo goes in HERO_NOT_YET, printed on every run,
//    never passed silently.
const HERO_PAGES = [
  ['src/app/community/[community]/[city]/page.tsx', /\bgetCommunityHeroPhoto\b/],
  ['src/app/community/[community]/page.tsx', /\bgetCommunityHeroPhoto\b/],
  ['src/app/city/[slug]/page.tsx', /\bgetCityHeroPhoto\b/],
  ['src/app/events/browse/[city]/page.tsx', /\bgetCityHeroPhoto\b/],
  ['src/app/free/[city]/this-week/page.tsx', /\bgetCityHeroPhoto\b/],
  ['src/app/categories/[slug]/page.tsx', /\bgetCategoryPhoto\b/],
  ['src/app/faith/[faith]/page.tsx', /\bFAITH_PHOTOS\b/],
]
const HERO_NOT_YET = []
const EMPTY_HERO = /heroImage=\{null\}|const heroImage = null\b/
for (const [page, resolver] of HERO_PAGES) {
  const src = code(read(page))
  if (!src) fail('10', `${page} is missing; the hero scan cannot be trusted`)
  else if (EMPTY_HERO.test(src)) fail('10', `${page} draws its hero empty on purpose (heroImage null); it shows its own subject's photo`)
  else if (!resolver.test(src)) fail('10', `${page} no longer asks for its own subject's photo (${resolver.source.replace(/\\b/g, '')})`)
}
for (const page of HERO_NOT_YET) console.log(`${TAG} NOT YET (clause 10): ${page} has no photograph of its own subject; it is listed until it does`)

console.log(`${TAG} checked ${communitiesChecked} community route(s), ${categoriesChecked} category slugs (${eventTypes.length} city event types, ${strip.length} organiser strip tiles), ${filesChecked} stored file(s), ${subFilesChecked} sub-community file(s), ${cityFilesChecked} city file(s), ${suburbFilesChecked} suburb file(s) (${suburbSlugs.size} in the city data), and the five photo resolvers`)
if (FAILURES.length) {
  console.error(`${TAG} FAILED`)
  for (const f of FAILURES) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - every community, category, city and suburb tile is on a stored photograph, and no resolver asks Pexels at request time`)
