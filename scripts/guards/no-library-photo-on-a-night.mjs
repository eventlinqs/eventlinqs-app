/**
 * NO LIBRARY PHOTOGRAPH STANDS FOR A NIGHT (the project manager's 18:38 of 29 October 2026, under Lawal's 19:52
 * directive of 28 October: authorised photographs, else premium typography; contextual photography only for pieces
 * that name no night). On production that evening all 334 public nights still to come wore a library photograph as
 * their cover, and the home hero led 'Bavarian Sunset Market' with an art-gallery shot
 * (C:\dev\EVIDENCE\LIBRARY-PHOTOS-29OCT\production-count.txt).
 *
 * The clauses, each read from the source:
 *   1. No event surface picks a library photograph: no file under the night's paths imports the photo spine's
 *      category or city getters, or the category photo, for a night.
 *   2. The three cover rules refuse a library photograph: hasRealCover in src/lib/events/fetchers.ts and
 *      src/lib/events/publish-gate.ts and isRealCover in src/lib/images/event-media.ts each ask isLibraryPhoto.
 *   3. The media resolver gives a night without its own photograph the branded ground, never getCategoryPhoto.
 *   4. The home hero's slides are chosen by isOwnPhoto.
 *   5. The city week card names nights, so it draws no backdrop photograph.
 *
 * It judges the source, so a stored cover is the database's to refuse (a NOT VALID check on events.cover_image_url
 * follows the backfill of the 334). Exits 1 naming each clause that fails.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[no-library-photo-on-a-night]'
const FAILURES = []
const fail = (clause, message) => FAILURES.push(`${clause}: ${message}`)
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null)
/**
 * Comments out, so a sentence that names a function is not mistaken for a call. A line comment needs whitespace or
 * the line's start before it: a regular expression's '\//' is not one (the first run cut isRealCover's own line there).
 */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

/** The paths that draw or write a night. */
const NIGHT_PATHS = ['src/lib/listings', 'src/lib/events', 'src/lib/social', 'src/components/events', 'src/components/features/events', 'src/app/events', 'src/app/free', 'src/components/features/home/FeaturedHero.tsx']
const PICKERS = /\b(getSpineCategoryHero|getSpineCategoryTile|getSpineCity|getCategoryPhoto|listingPhotoFor|cityWeekPhotoFor)\b/

function files(path) {
  if (!existsSync(path)) return []
  if (statSync(path).isFile()) return [path]
  return readdirSync(path).flatMap((e) => files(join(path, e)))
}

let judged = 0
for (const file of NIGHT_PATHS.flatMap(files).filter((f) => /\.(ts|tsx)$/.test(f))) {
  judged += 1
  const m = PICKERS.exec(code(readFileSync(file, 'utf8')))
  if (m) fail('1', `${file.split(sep).join('/')} uses ${m[1]}, which picks a library or category photograph for a night`)
}

function body(src, name) {
  const at = src.search(new RegExp(`function ${name}\\(`))
  if (at === -1) return null
  const open = src.indexOf('{', src.indexOf(')', at))
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1)
  }
  return null
}

for (const [file, name] of [['src/lib/events/fetchers.ts', 'hasRealCover'], ['src/lib/events/publish-gate.ts', 'hasRealCover'], ['src/lib/images/event-media.ts', 'isRealCover']]) {
  const src = read(file)
  const b = src && body(code(src), name)
  if (!b) fail('2', `${file} has no ${name} to judge`)
  else if (!/\bisLibraryPhoto\(/.test(b)) fail('2', `${file} ${name} does not refuse a library photograph (isLibraryPhoto)`)
}

const media = read('src/lib/images/event-media.ts')
for (const name of ['getEventMedia', 'getFeaturedEventMedia']) {
  const b = media && body(code(media), name)
  if (!b) fail('3', `src/lib/images/event-media.ts has no ${name} to judge`)
  else if (/\bgetCategoryPhoto\(/.test(b)) fail('3', `${name} gives a night without its own photograph a category photograph`)
}

const hero = read('src/components/features/home/FeaturedHero.tsx')
if (!hero || !/const featured = [^\n]*isOwnPhoto\(/.test(code(hero))) fail('4', 'the home hero does not choose its slides by isOwnPhoto')

const cityCard = read('src/app/free/[city]/this-week/card/[format]/route.ts')
if (!cityCard || !/const backdrop = null\b/.test(code(cityCard))) fail('5', 'the city week card draws a backdrop photograph beside named nights')

console.log(`${TAG} did ${judged} night source file(s) read, 3 cover rules, 2 resolvers, the home hero and the city week card judged`)
declareWork('no-library-photo-on-a-night', {
  did: { 'night source file read': judged, 'cover rule judged': 3, 'resolver judged': 2 },
  found: { 'clause failed': FAILURES.length },
})
if (FAILURES.length) {
  console.error(`${TAG} FAILED`)
  for (const f of FAILURES) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - no library or category photograph is picked for a night, and every cover rule refuses one`)
