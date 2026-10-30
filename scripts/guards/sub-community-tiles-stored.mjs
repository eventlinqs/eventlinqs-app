/**
 * GUARD: EVERY SUB-COMMUNITY TILE IS ON A STORED PHOTOGRAPH.
 *
 * WHY (Lawal, 16:05 on 30 October 2026, through the project manager's 16:06, L14): on production the First Nations
 * tiles (NAIDOC, Dance and Song, Art and Markets...) and the Indian ones (Bollywood, Garba and Raas, Holi and Diwali...)
 * drew no photograph. Read from the served HTML that afternoon, 90 of the 105 'Every sound, every scene' tiles were the
 * navy gradient: src/lib/images/sub-community-photo.ts kept a photograph for 15 and answered null for the rest, and the
 * rail and the community-by-city page draw nothing for a null. tiles-on-stored-photos.mjs clause 6 judged only that the
 * 15 it kept existed, never that every tile had one.
 *
 * CLAUSES
 *   1  Every sub-community of every community in src/lib/communities/data.ts has a stored photograph in
 *      sub-community-photo.ts: Lawal's own (FROM_LAWAL, a spine scene, category tile or hero) or one kept once in
 *      public/images/library (KEPT).
 *   2  Every FROM_LAWAL entry names a slot the spine has (src/lib/images/spine.ts), and every KEPT photograph exists
 *      with its photographer, page and alt text on record in public/images/library/attribution.json.
 *   3  No table names a sub-community that data.ts does not have (a renamed tile would keep its photograph and lose
 *      its page).
 *
 * Registered in run-guards.mjs; drilled in scripts/verify/guard-failure-drills.mjs.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TAG = '[sub-community-tiles-stored]'
const FAILURES = []
const fail = (clause, message) => FAILURES.push(`${clause}: ${message}`)
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

const bodyOf = (src, name, open, close) => {
  const at = src.indexOf(name)
  if (at < 0) return null
  // From the '=', so a type annotation's own braces are never read as the table.
  const start = src.indexOf(open, src.indexOf('=', at))
  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth++
    if (src[i] === close && --depth === 0) return src.slice(start + 1, i)
  }
  return null
}

// data.ts: each community's slug, then its subCommunities list.
const data = code(read('src/lib/communities/data.ts'))
const expected = []
for (const m of data.matchAll(/^ {4}slug: '([a-z0-9-]+)',[\s\S]*?subCommunities: \[([\s\S]*?)\n {4}\]/gm)) {
  for (const s of m[2].matchAll(/slug: '([a-z0-9-]+)'/g)) expected.push(`${m[1]}:${s[1]}`)
}
if (expected.length < 100) fail('1', `only ${expected.length} sub-community tile(s) found in src/lib/communities/data.ts; the scan cannot be trusted`)

const sub = code(read('src/lib/images/sub-community-photo.ts'))
if (!sub) fail('1', 'src/lib/images/sub-community-photo.ts is missing')
const keptBody = bodyOf(sub, 'const KEPT', '[', ']')
const lawalBody = bodyOf(sub, 'const FROM_LAWAL', '{', '}')
if (sub && keptBody === null) fail('1', 'sub-community-photo.ts has no KEPT set to judge')
if (sub && lawalBody === null) fail('1', 'sub-community-photo.ts has no FROM_LAWAL table to judge')
const kept = new Set([...(keptBody ?? '').matchAll(/'([a-z0-9-]+:[a-z0-9-]+)'/g)].map((m) => m[1]))
const fromLawal = new Map(
  [...(lawalBody ?? '').matchAll(/'([a-z0-9-]+:[a-z0-9-]+)':\s*\{\s*(scene|tile|hero):\s*'([a-zA-Z0-9-]+)'\s*\}/g)].map((m) => [m[1], { kind: m[2], slot: m[3] }]),
)

for (const key of expected) {
  if (!kept.has(key) && !fromLawal.has(key)) fail('1', `the sub-community tile '${key}' has no stored photograph (FROM_LAWAL or KEPT)`)
}

const spine = code(read('src/lib/images/spine.ts'))
const slotKeys = (name) => new Set([...(bodyOf(spine, name, '{', '}') ?? '').matchAll(/^\s*'?([a-zA-Z0-9-]+)'?\s*:/gm)].map((m) => m[1]))
const slots = { scene: slotKeys('const SCENE_SLOTS'), tile: slotKeys('const CATEGORY_TILE_SLOTS'), hero: slotKeys('const HERO_SLOTS') }
for (const [key, { kind, slot }] of fromLawal) {
  if (!slots[kind].has(slot)) fail('2', `FROM_LAWAL gives '${key}' the ${kind} '${slot}', which src/lib/images/spine.ts does not have`)
}
const attribution = existsSync('public/images/library/attribution.json') ? JSON.parse(read('public/images/library/attribution.json')).photos ?? {} : {}
for (const key of kept) {
  const name = `sub-${key.replace(':', '-')}`
  const rec = attribution[name]
  if (!existsSync(join('public/images/library', `${name}.jpg`))) fail('2', `public/images/library/${name}.jpg is kept and does not exist`)
  else if (!rec?.photographer || !rec?.page || !rec?.alt) fail('2', `public/images/library/${name}.jpg has no photographer, page and alt text on record in attribution.json`)
}

const known = new Set(expected)
for (const key of [...kept, ...fromLawal.keys()]) {
  if (!known.has(key)) fail('3', `'${key}' has a photograph but no such sub-community in src/lib/communities/data.ts`)
}

console.log(`${TAG} checked ${expected.length} sub-community tile(s): ${fromLawal.size} on Lawal's photographs, ${kept.size} kept in the library`)
if (FAILURES.length) {
  console.error(`${TAG} FAILED (${FAILURES.length})`)
  for (const f of FAILURES) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - every sub-community tile is on a stored photograph`)
