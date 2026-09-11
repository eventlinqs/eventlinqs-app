/**
 * ONE VENUE ADDRESS FORMAT. A build-failing guard (close-out UX1.2).
 *
 * WHY THIS EXISTS. The first real outside organiser event on production read:
 *
 *     Quakers Centre, Quakers Centre, 484 William Street, West Melbourne, VIC, Australia
 *
 * Two call sites each added the venue name. The event page composed
 * `[venue_name, venue_address, venue_city, venue_state, venue_country]` and
 * `KnowBeforeYouGo` then rendered `[venueName, fullAddress]`. Neither line was
 * wrong by itself. The pair was wrong on the page, because the composition rule
 * lived nowhere and was therefore reinvented at every call site.
 *
 * A duplicated NAME is only the symptom that was noticed. The same shape
 * duplicates a city typed into an address field, and prints a dangling comma
 * whenever a part is null. The fix is that the rule has one home:
 * src/lib/venues/format-venue-address.ts.
 *
 * WHAT IT LOOKS FOR: an array literal naming two or more venue address parts
 * and joined into a string. That is the exact shape that shipped.
 *
 * WHAT IT CANNOT SEE: parts assembled through a template literal or appended in
 * a loop. This matches the shape that actually caused the defect rather than
 * every conceivable way to concatenate two strings, which is the difference
 * between a gate people keep and one they switch off.
 *
 * Run: node scripts/guards/one-venue-address-format.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SRC = join(ROOT, 'src')
const TAG = '[one-venue-address-format]'

/** The formatter that owns the rule. Its own file is naturally exempt. */
const FORMATTER = 'src/lib/venues/format-venue-address.ts'

/** The parts of a venue address, in every spelling the codebase uses. */
const PARTS = [
  'venue_name', 'venueName', 'venue_address', 'venueAddress',
  'venue_city', 'venueCity', 'venue_state', 'venueState',
  'venue_country', 'venueCountry', 'venue_postcode', 'venuePostcode',
]
/** Bare spellings, which only count inside an array that is joined. */
const BARE = ['address', 'city', 'state', 'country', 'postcode', 'name']

/**
 * The parts that make a composition a POSTAL ADDRESS rather than a label.
 *
 * `[venue_name, venue_city].join(' · ')` is a short identity label - "Quakers
 * Centre · West Melbourne" - and is a legitimately different thing from an
 * address. Twelve surfaces build one and none of them has the duplication
 * problem, because two fields cannot disagree about a third. The defect needed
 * a STREET, a STATE, a COUNTRY or a POSTCODE in the mix, so that is what this
 * guard requires before it calls a join an address.
 */
const ADDRESS_LEVEL = [
  'venue_address', 'venueAddress', 'address',
  'venue_state', 'venueState', 'state',
  'venue_country', 'venueCountry', 'country',
  'venue_postcode', 'venuePostcode', 'postcode',
]

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build'])
const EXTS = new Set(['.ts', '.tsx'])

const files = []
const unreadable = []

function walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch (err) {
    unreadable.push(`${relative(ROOT, dir)} (${err.code ?? err.message})`)
    return
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch (err) {
      unreadable.push(`${relative(ROOT, full)} (${err.code ?? err.message})`)
      continue
    }
    if (st.isDirectory()) walk(full)
    else if (EXTS.has(extname(name))) files.push(full)
  }
}
walk(SRC)

/** An array literal that is joined into one string, on one line or wrapped. */
const JOINED_ARRAY = /\[([^[\]]{0,240})\][^\n]{0,80}?\.join\s*\(/g

const violations = []
let linesScanned = 0
let formatterUses = 0

for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    unreadable.push(`${relative(ROOT, file)} (${err.code ?? err.message})`)
    continue
  }
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  linesScanned += text.split('\n').length
  if (rel === FORMATTER) continue

  formatterUses += (text.match(/formatVenue(?:WithAddress|Address)\s*\(/g) ?? []).length

  // Collapse wrapped array literals so a multi-line join is still one match.
  const flat = text.replace(/\s*\n\s*/g, ' ')
  JOINED_ARRAY.lastIndex = 0
  let m
  while ((m = JOINED_ARRAY.exec(flat)) !== null) {
    const inside = m[1]
    const named = PARTS.filter(p => new RegExp(`\\b${p}\\b`).test(inside))
    const bare = BARE.filter(p => new RegExp(`(?:^|[,\\s.])${p}\\b`).test(inside))
    // Two or more parts joined into a string is the address-composition shape.
    const hits = named.length > 0 ? named : bare
    if (hits.length < 2) continue
    // A bare-word array must look like an address, not any pair of nouns.
    if (named.length === 0 && !bare.includes('city') && !bare.includes('address')) continue
    // A short "Name, City" label is not a postal address. See ADDRESS_LEVEL.
    if (!hits.some(h => ADDRESS_LEVEL.includes(h))) continue
    const line = text.split('\n').findIndex(l => l.includes(inside.trim().slice(0, 40))) + 1
    violations.push({ file: rel, line: line || 0, parts: hits.join(', '), text: m[0].slice(0, 120) })
  }
}

console.log(`${TAG} ${files.length} file(s) under src, ${linesScanned} line(s) scanned`)
console.log(`${TAG}   the one formatter: ${FORMATTER}`)
console.log(`${TAG}   ${formatterUses} call(s) to formatVenueAddress / formatVenueWithAddress`)

if (unreadable.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${unreadable.length} path(s) could not be read:`)
  for (const u of unreadable) console.error(`    ${u}`)
  console.error('  A guard that scanned less than the whole tree cannot report a pass.')
  process.exit(1)
}

if (violations.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${violations.length} hand-joined venue address(es):`)
  for (const v of violations) {
    console.error(`    ${v.file}:${v.line}  joins ${v.parts}`)
    console.error(`      ${v.text}`)
  }
  console.error('')
  console.error('  Composing an address at the call site is how production printed')
  console.error('  "Quakers Centre, Quakers Centre, 484 William Street, ...": two sites')
  console.error('  each added the name and neither could see the other.')
  console.error('')
  console.error(`  Use formatVenueWithAddress (name + address) or formatVenueAddress`)
  console.error(`  (address alone) from ${FORMATTER}.`)
  process.exit(1)
}

declareWork('one-venue-address-format', {
  did: {
    'source file scanned': files.length,
    'call through the one formatter': formatterUses,
  },
  found: { 'hand-joined venue address': violations.length },
  zeroIsFine: {
    'hand-joined venue address':
      'every venue address on the platform composed by one formatter is the goal state, and it is what UX1.2 asked for',
  },
  exitOnZero: false,
})

console.log(`${TAG} PASS - every venue address is composed by the one formatter.`)
process.exit(0)
