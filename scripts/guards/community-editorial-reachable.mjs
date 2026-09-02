/**
 * GUARD: hand-written community editorial reaches a page, or is declared dead.
 *
 * WHAT WAS FOUND, 3 September 2026, by driving the pages rather than reading the
 * template. src/lib/communities/intersection-editorial.ts carries 271 bespoke
 * city-by-community paragraphs. They are keyed on COMMUNITY TAXONOMY V1 slugs.
 * The live site runs TAXONOMY V2 (src/lib/communities/data.ts, 21 slugs), and
 * v1 slugs 301 away to their v2 replacement (src/lib/communities/redirects.ts).
 *
 * The consequence: 211 of the 271 paragraphs, 78 percent, were unreachable. The
 * pages still returned 200, because getIntersectionEditorial falls back to a
 * templated paragraph when the key misses, so nothing anywhere reported a
 * problem. The bespoke editorial that is meant to be the SEO differentiator on
 * 441 of the 552 sitemap URLs was quietly not being served, and a fallback that
 * works is exactly what stops anyone noticing.
 *
 * WHY A GUARD. This failure mode is silent by construction. A missing key is
 * indistinguishable from a key that was never written, and the fallback makes
 * the page look finished. Nothing in the repository could tell the difference,
 * so the next taxonomy change would do the same thing again.
 *
 * WHAT THIS DOES NOT DECIDE. It does not move copy. Six of the retired v1 slugs
 * are regional ROLL-UPS (south-asian, east-asian, mediterranean, middle-eastern,
 * european, latin) which founder Decision C retired as landing pages, keeping
 * them as discovery filters. Their paragraphs describe a roll-up: rekeying
 * "South Asian Melbourne" onto the Indian page would publish claims about
 * Pakistani, Sri Lankan and Nepali communities on a page about Indian ones.
 * That is a content decision for the founder, not a mechanical rename, so the
 * orphans are ENUMERATED here rather than moved or deleted.
 *
 * THE ONE THAT WAS A MECHANICAL RENAME WAS FIXED. `pacific` became
 * `pacific-pasifika` in v2, a 1:1 rename of the same community. Its 20
 * paragraphs were rekeyed and the missing redirect was added, because
 * /community/pacific/<city> was returning a 404 on a live server: the only
 * retired slug in that file with no redirect at all.
 *
 * THE CITY HALF IS NOT CHECKED AGAINST THE CITY CATALOGUE ON PURPOSE. The
 * editorial deliberately holds non-Australian keys (london, toronto, lagos), and
 * getIntersectionEditorial gates them behind an AU-only check by founder ruling
 * of 27 June 2026, so they are unreachable BY DESIGN and are not rot.
 */
import { readFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'

const EDITORIAL = 'src/lib/communities/intersection-editorial.ts'
const COMMUNITIES = 'src/lib/communities/data.ts'
const REDIRECTS = 'src/lib/communities/redirects.ts'

/**
 * Retired v1 prefixes whose paragraphs are knowingly unreachable, each with the
 * decision that retired it. This list may only SHRINK. A prefix that stops
 * matching must be deleted from here, and a prefix that appears without being
 * listed fails the build.
 */
const ORPHANED = [
  { prefix: 'south-asian', why: 'v1 regional roll-up, retired as a page by founder Decision C, 301s to /community/indian' },
  { prefix: 'east-asian', why: 'v1 regional roll-up, retired by Decision C, 301s to /community/chinese' },
  { prefix: 'mediterranean', why: 'v1 regional roll-up, retired by Decision C, 301s to /community/greek' },
  { prefix: 'middle-eastern', why: 'v1 regional roll-up, retired by Decision C, 301s to /community/lebanese-levantine' },
  { prefix: 'european', why: 'v1 regional roll-up, retired by Decision C, 301s to /community/other-european' },
  { prefix: 'latin', why: 'v1 regional roll-up, retired by Decision C, 301s to /community/latin-american' },
  { prefix: 'gospel', why: 'not a heritage in v2. Moved to the Faith dimension, 301s to /faith/christian' },
  { prefix: 'comedy', why: 'not a heritage in v2. It is an event type, 301s to /events' },
  { prefix: 'wellness', why: 'not a heritage in v2. It is an event type, 301s to /events' },
  { prefix: 'pride', why: 'not a heritage in v2. It is an identity, 301s to /events' },
]

const read = (p) => readFileSync(p, 'utf8')

const editorialKeys = [...read(EDITORIAL).matchAll(/^ {2}'([a-z0-9-]+)\/([a-z0-9-]+)':/gm)].map((m) => ({
  prefix: m[1],
  city: m[2],
}))

const liveSlugs = new Set(
  [...read(COMMUNITIES).matchAll(/^ {4}slug: '([a-z0-9-]+)',/gm)].map((m) => m[1]),
)

const redirectedSlugs = new Set(
  [...read(REDIRECTS).matchAll(/^ {2}'?([a-z-]+)'?: '/gm)].map((m) => m[1]),
)

const orphanPrefixes = new Set(ORPHANED.map((o) => o.prefix))

const byPrefix = new Map()
for (const k of editorialKeys) byPrefix.set(k.prefix, (byPrefix.get(k.prefix) || 0) + 1)

const reachable = []
const declaredOrphans = []
const undeclared = []

for (const [prefix, count] of byPrefix) {
  if (liveSlugs.has(prefix)) reachable.push({ prefix, count })
  else if (orphanPrefixes.has(prefix)) declaredOrphans.push({ prefix, count })
  else undeclared.push({ prefix, count })
}

const staleOrphans = ORPHANED.filter((o) => !byPrefix.has(o.prefix))

/* A retired prefix with no redirect 404s. That is the defect that was found. */
const retiredWithNoRedirect = [...byPrefix.keys()].filter(
  (p) => !liveSlugs.has(p) && !redirectedSlugs.has(p),
)

const reachableCount = reachable.reduce((n, r) => n + r.count, 0)
const orphanCount = declaredOrphans.reduce((n, r) => n + r.count, 0)
const say = (s = '') => process.stdout.write(s + String.fromCharCode(10))

say(`community-editorial-reachable: ${editorialKeys.length} editorial entr(ies), ${liveSlugs.size} live community slug(s)`)
say(`  reachable: ${reachableCount} across ${reachable.length} live prefix(es)`)
say(`  knowingly orphaned: ${orphanCount} across ${declaredOrphans.length} retired prefix(es)`)

declareWork('community-editorial-reachable', {
  did: {
    'editorial entry checked': editorialKeys.length,
    'live community slug read': liveSlugs.size,
  },
  found: {
    'undeclared orphan prefix': undeclared.length,
    'stale orphan declaration': staleOrphans.length,
    'retired prefix with no redirect': retiredWithNoRedirect.length,
  },
})

let failed = false

if (undeclared.length > 0) {
  failed = true
  say('')
  say(`FAIL: ${undeclared.length} editorial prefix(es) reach no live community and are not declared.`)
  say('Either the taxonomy moved and the editorial was not moved with it, or a')
  say('new prefix was invented. Bespoke copy that reaches no page is copy nobody')
  say('reads, and the templated fallback hides it completely.')
  say('')
  for (const u of undeclared) say(`  ${u.prefix}  (${u.count} entr(ies))`)
}

if (staleOrphans.length > 0) {
  failed = true
  say('')
  say(`FAIL: ${staleOrphans.length} orphan declaration(s) match nothing.`)
  say('The copy was rekeyed or removed but the declaration was not pruned. This')
  say('list may only shrink, so that it cannot become a permanent excuse.')
  say('')
  for (const s of staleOrphans) say(`  ${s.prefix}  (${s.why})`)
}

if (retiredWithNoRedirect.length > 0) {
  failed = true
  say('')
  say(`FAIL: ${retiredWithNoRedirect.length} retired prefix(es) have no redirect, so they 404.`)
  say('redirects.ts exists to guarantee zero 404s on retired slugs, and Law 5')
  say('requires every link to resolve. Add the redirect.')
  say('')
  for (const p of retiredWithNoRedirect) say(`  /community/${p}/<city>`)
}

if (failed) process.exit(1)

say('')
say('PASS: every editorial entry either reaches a live community or is a declared orphan.')
for (const r of reachable.sort((a, b) => b.count - a.count)) {
  say(`  live      ${r.prefix.padEnd(20)} ${r.count}`)
}
say('')
say('DECLARED ORPHANS, awaiting a founder ruling on the copy, not corruption:')
for (const o of ORPHANED) {
  const n = byPrefix.get(o.prefix) || 0
  say(`  orphan    ${o.prefix.padEnd(20)} ${String(n).padStart(3)}  ${o.why}`)
}
