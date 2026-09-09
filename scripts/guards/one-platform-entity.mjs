/**
 * ONE PLATFORM ENTITY. A build-failing guard (close-out UX2.1, LEGAL).
 *
 * WHY THIS EXISTS. The platform's own ABN was written by hand in TWELVE places
 * across nine files, in three formats, beside TWO different postal addresses and
 * THREE different descriptions of the entity: the footer, About, Press, four
 * legal pages, the ticket confirmation email and both variants of the refund
 * email.
 *
 * That is a legal defect, not untidiness. The entity taking ticket money must be
 * the entity named on the receipt. When the Pty Ltd is registered the number
 * changes, and thirteen hand-edits is a job somebody does twelve of - with the
 * missed one on a tax document.
 *
 * THE TRAP THIS GUARD EXISTS FOR. In FOUR of those nine files the number was
 * broken across two source lines by ordinary prose wrapping:
 *
 *     ... trading as EventLinqs, ABN 30 837
 *     447 587, PO Box 141, Newcomb VIC 3219, Australia. ...
 *
 * A line-based search finds nine of twelve, reports a clean tree, and leaves
 * three wrong on the legal pages. So this guard NORMALISES WHITESPACE ACROSS
 * LINE BOUNDARIES before it matches. That single decision is the whole reason it
 * can be trusted, and it is why it is not a grep.
 *
 * WHAT IT CHECKS
 *   1. No ABN-shaped number appears anywhere in src/ outside the one source.
 *   2. The one source's own ABN passes the ATO modulus-89 check, so a typo in a
 *      future edit fails the build rather than shipping onto a tax invoice.
 *
 * WHAT IT CANNOT SEE, stated plainly: whether the number is the founder's
 * CURRENT registered ABN. That is a fact about the Australian Business Register,
 * not about this tree. `scripts/verify/platform-entity-matches-stripe.mjs`
 * compares it against the live Stripe account, and it is a verification script
 * rather than a build guard because it needs a token the Vercel build host does
 * not have (close-out F2.1).
 *
 * Run: node scripts/guards/one-platform-entity.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SRC = join(ROOT, 'src')
const TAG = '[one-platform-entity]'

/** The one source. Its own file is naturally exempt. */
const ONE_SOURCE = 'src/lib/legal/platform-entity.ts'

/**
 * ABNs that are legitimately in the tree and are NOT the platform's entity.
 *
 * The scan stays broad on purpose. Narrowing it to the CURRENT declared number
 * would pass a tree where the founder changed the ABN in the one source and a
 * STALE OLD copy survived somewhere else, which is precisely the failure this
 * guard exists to prevent. So every valid ABN is a finding unless it is listed
 * here with a reason.
 */
const REVIEWED_ABNS = [
  {
    value: '51824753556',
    reason:
      "the Australian Business Register's own published worked example, used in the checksum docblock and as the ABN field placeholder",
    files: ['src/lib/tax/abn.ts', 'src/components/organisation/tax-details-form.tsx'],
  },
]
const reviewedHits = new Map(REVIEWED_ABNS.map(r => [r.value, 0]))

/**
 * An ABN as a human writes it: eleven digits, optionally grouped 2-3-3-3.
 * Matched against whitespace-normalised text, so a wrapped literal is caught.
 */
const ABN_SHAPED = /\b\d{2} ?\d{3} ?\d{3} ?\d{3}\b|\b\d{11}\b/g

/** ATO modulus-89 check, the same algorithm as src/lib/tax/abn.ts. */
const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
function validAbn(digits) {
  if (!/^\d{11}$/.test(digits) || digits[0] === '0') return false
  let sum = 0
  for (let i = 0; i < 11; i += 1) sum += (Number(digits[i]) - (i === 0 ? 1 : 0)) * WEIGHTS[i]
  return sum % 89 === 0
}

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

// ---------------------------------------------------------------------------
// 1. The one source must hold a valid ABN.
// ---------------------------------------------------------------------------
const faults = []
let declaredAbn = null
try {
  const source = readFileSync(join(ROOT, ONE_SOURCE), 'utf8')
  const m = /const ABN_DIGITS = '(\d+)'/.exec(source)
  declaredAbn = m?.[1] ?? null
  if (!declaredAbn) {
    faults.push(`${ONE_SOURCE} no longer declares ABN_DIGITS as a plain literal, so nothing can check it.`)
  } else if (!validAbn(declaredAbn)) {
    faults.push(
      `${ONE_SOURCE} declares an ABN that FAILS the ATO modulus-89 check: ${declaredAbn}.\n` +
        `      The platform refuses an organiser's ABN for failing this exact check. Its own must pass it.`,
    )
  }
} catch (err) {
  faults.push(`${ONE_SOURCE} could not be read (${err.code ?? err.message}). It is the one source; a build cannot proceed without it.`)
}

// ---------------------------------------------------------------------------
// 2. No other file may carry an ABN.
// ---------------------------------------------------------------------------
const strays = []
let linesScanned = 0
let entityUses = 0

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
  if (rel === ONE_SOURCE) continue

  entityUses += (text.match(/PLATFORM_ENTITY|entityFooterLine|entityLegalLine|tradingAsLine/g) ?? []).length

  // THE POINT OF THIS GUARD: collapse every run of whitespace, including
  // newlines, so a number broken across two source lines reads as one string.
  const flat = text.replace(/\s+/g, ' ')
  ABN_SHAPED.lastIndex = 0
  let m
  while ((m = ABN_SHAPED.exec(flat)) !== null) {
    const digits = m[0].replace(/\s/g, '')
    if (digits.length !== 11) continue
    // Only a number that IS a valid ABN, so timestamps, ids and phone-shaped
    // strings do not become false positives. A wrong ABN is caught by clause 1.
    if (!validAbn(digits)) continue
    const reviewed = REVIEWED_ABNS.find(r => r.value === digits)
    if (reviewed) {
      reviewedHits.set(digits, reviewedHits.get(digits) + 1)
      // A documented example belongs where it is documented, and nowhere else.
      if (reviewed.files.includes(rel)) continue
      strays.push({ file: rel, value: m[0].trim(), note: 'a documented example ABN outside the files that document it' })
      continue
    }
    strays.push({ file: rel, value: m[0].trim(), note: "not the platform's ABN and not a reviewed example" })
  }
}

console.log(`${TAG} ${files.length} file(s) under src, ${linesScanned} line(s) scanned`)
console.log(`${TAG}   the one source: ${ONE_SOURCE}${declaredAbn ? ` (ABN ends ${declaredAbn.slice(-3)}, checksum OK)` : ''}`)
console.log(`${TAG}   ${entityUses} reference(s) to the shared entity`)
console.log(`${TAG}   matched on WHITESPACE-NORMALISED text: a literal wrapped across two lines is still found`)

const staleReviewed = []
for (const r of REVIEWED_ABNS) {
  const hits = reviewedHits.get(r.value)
  console.log(`${TAG}   reviewed: an ABN ending ${r.value.slice(-3)} (${hits} occurrence) - ${r.reason}`)
  if (hits === 0) staleReviewed.push(r.value)
}
if (staleReviewed.length > 0) {
  console.log(`${TAG}   ${staleReviewed.length} reviewed ABN(s) match nothing now - delete the entry`)
}

if (unreadable.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${unreadable.length} path(s) could not be read:`)
  for (const u of unreadable) console.error(`    ${u}`)
  console.error('  A guard that scanned less than the whole tree cannot report a pass.')
  process.exit(1)
}

if (strays.length > 0 || faults.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${strays.length + faults.length} fault(s):`)
  for (const f of faults) console.error(`    ${f}`)
  for (const s of strays) {
    console.error(`    ${s.file} carries an ABN of its own: ${s.value}  (${s.note})`)
  }
  console.error('')
  console.error('  The entity taking ticket money must match the ABN displayed. When the')
  console.error('  Pty Ltd is registered the number changes, and a copy nobody remembers')
  console.error('  is a wrong number on a tax document.')
  console.error('')
  console.error(`  Import PLATFORM_ENTITY, entityLegalLine or entityFooterLine from ${ONE_SOURCE}.`)
  process.exit(1)
}

declareWork('one-platform-entity', {
  did: {
    'source file scanned': files.length,
    'reference to the shared entity': entityUses,
  },
  found: { 'stray platform ABN': strays.length },
  zeroIsFine: {
    'stray platform ABN':
      'the platform ABN written down exactly once is the goal state, and it is what UX2.1 asked for',
  },
  exitOnZero: false,
})

console.log(`${TAG} PASS - the platform ABN is written once and passes its checksum.`)
process.exit(0)
