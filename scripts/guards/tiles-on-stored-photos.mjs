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
 *   2  Every category on production (read 29 October 2026, below) and every curated homepage category has one: the
 *      spine's CATEGORY_TILE_SLOTS or stored-photos.ts CATEGORY_STORED.
 *   3  Every stored file a table names exists under public/, and every kept library photograph has its photographer
 *      and page on record in public/images/library/attribution.json.
 *   4  community-photo.ts makes no request-time call (no fetch, no Pexels).
 *   5  category-photo.ts asks the spine and the stored table before Pexels, and never returns the placeholder from
 *      inside the cached function (a failure is thrown there, so it is not kept).
 *   6  sub-community-photo.ts makes no request-time call, and every sub-community photograph it keeps exists with its
 *      photographer on record.
 *   7  city-photo.ts never returns null from inside a cached Pexels fetch (the 13 spine cities answer first; the
 *      others still ask Pexels until their photographs are kept, and a refusal there must not be kept for a week).
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
let categoriesChecked = 0
for (const slug of new Set([...PRODUCTION_CATEGORIES, ...curated])) {
  categoriesChecked += 1
  if (!categoryTiles?.has(slug) && !categoryStored?.has(slug)) fail('2', `the category '${slug}' has no stored photograph (spine CATEGORY_TILE_SLOTS or CATEGORY_STORED)`)
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
const pexelsAt = getPhoto.indexOf('fetchPexelsPool(')
if (storedAt < 0 || pexelsAt < 0 || storedAt > pexelsAt) fail('5', 'getCategoryPhoto does not ask the spine and the stored table before Pexels')
const raw = category.slice(category.indexOf('async function fetchPexelsPoolRaw'), category.indexOf('unstable_cache(', category.indexOf('async function fetchPexelsPoolRaw')))
if (/return \[FALLBACK\]|return FALLBACK/.test(raw)) fail('5', 'fetchPexelsPoolRaw returns the placeholder inside the cached function, so a refusal is kept for a week')

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
for (const name of ['fetchCityPhotoRaw', 'fetchCityHeroPhotoRaw']) {
  const at = city.indexOf(`async function ${name}`)
  const body = at < 0 ? '' : city.slice(at, city.indexOf('unstable_cache(', at))
  if (!body) fail('7', `src/lib/images/city-photo.ts has no ${name} to judge`)
  else if (/return null\b/.test(body)) fail('7', `${name} returns null inside the cached function, so a refused city lookup is kept for a week`)
}

console.log(`${TAG} checked ${communitiesChecked} community route(s), ${categoriesChecked} categories, ${filesChecked} stored file(s), ${subFilesChecked} sub-community file(s), and the three photo resolvers`)
if (FAILURES.length) {
  console.error(`${TAG} FAILED`)
  for (const f of FAILURES) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - every community and category tile is on a stored photograph, and no refused lookup is kept`)
