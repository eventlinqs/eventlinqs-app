/**
 * GUARD: A CARD NEVER SAYS 'FREE' FOR A NIGHT THAT IS NOT STORED AS FREE (rules E6 and E7; the project manager's 12:40
 * of 30 October 2026, under Lawal's mobile-first rule).
 *
 * WHY: on production at 390 x 844, /city/geelong's card for Kate Ceberano, a paid Costa Hall show sold by Geelong Arts
 * Centre, read 'Free'. Production holds is_free = false, entry_mode tickets and its external_ticket_url; the card read
 * 'Free' because it had no ticket types of ours and its own price function answered 'Free' for no tiers. Three more
 * surfaces kept their own copy of the same guess (the bento tile, the this-week card, the trending bento, which also
 * said 'Free' for a $0 ticket beside paid ones), and the /events map pins said 'Free' for no paid price.
 *
 * THE RULE: every card, tile and pin takes its price words from the night's call to action, through ONE function,
 * src/lib/broadcast/price-line.ts broadcastPriceLabel (or the map's price_line, which the server fills from it).
 *
 * CLAUSES
 *   1  No component under src/components imports the raw tier label (src/lib/events/price-label): it cannot know a
 *      night sold elsewhere, or one whose price nobody checked.
 *   2  No component returns the word 'Free' itself, except the reviewed exceptions below, each with its reason.
 *   3  Every card, tile and pin surface named below asks broadcastPriceLabel (or shows the server's price_line).
 *
 * Registered in run-guards.mjs; drilled in scripts/verify/guard-failure-drills.mjs.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TAG = '[card-price-from-cta]'
const FAILURES = []
const fail = (clause, message) => FAILURES.push(`${clause}: ${message}`)
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

/** Reviewed exceptions to clause 2, printed every run so the list cannot rot. */
const FREE_WORD_ALLOWED = [
  { file: 'src/components/checkout/ticket-selector.tsx', reason: "one of OUR OWN ticket types priced $0, inside checkout: the type itself is stored, so 'Free' is a fact" },
]
const SURFACES = [
  ['src/components/features/events/event-card.tsx', /broadcastPriceLabel\(/],
  ['src/components/features/events/event-bento-tile.tsx', /broadcastPriceLabel\(/],
  ['src/components/features/events/this-week-card.tsx', /broadcastPriceLabel\(/],
  ['src/components/features/home/trending-events-bento.tsx', /broadcastPriceLabel\(/],
  ['src/components/features/events/m5-events-map.tsx', /\.price_line\b/],
  ['src/app/events/actions.ts', /price_line:\s*broadcastPriceLabel\(/],
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p.replace(/\\/g, '/'))
  }
  return out
}

let filesScanned = 0
for (const file of walk('src/components')) {
  filesScanned += 1
  const src = code(readFileSync(file, 'utf8'))
  if (/from ['"]@\/lib\/events\/price-label['"]/.test(src)) fail('1', `${file} imports the raw tier label; take the price words from broadcastPriceLabel`)
  if (/return\s+['"]Free['"]|[?:]\s*['"]Free['"]\s*(?:[:;)\n]|$)/m.test(src) && !FREE_WORD_ALLOWED.some((a) => a.file === file)) {
    fail('2', `${file} says 'Free' itself; free is said only where it is stored, through the night's call to action`)
  }
}
if (filesScanned < 100) fail('2', `only ${filesScanned} component file(s) found under src/components; the scan cannot be trusted`)

let surfacesChecked = 0
for (const [file, asks] of SURFACES) {
  surfacesChecked += 1
  if (!existsSync(file)) { fail('3', `${file} is missing`); continue }
  if (!asks.test(code(readFileSync(file, 'utf8')))) fail('3', `${file} does not take its price words from the night's call to action`)
}

console.log(`${TAG} did ${filesScanned} component file(s) scanned, ${surfacesChecked} card, tile and pin surface(s) judged`)
console.log(`${TAG} reviewed exceptions to clause 2, printed so they cannot rot:`)
for (const a of FREE_WORD_ALLOWED) console.log(`${TAG}   ${a.file}: ${a.reason}`)
if (FAILURES.length) {
  console.error(`${TAG} FAILED`)
  for (const f of FAILURES) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - every card, tile and pin says a price only from the night's call to action, never 'Free' unless stored`)
