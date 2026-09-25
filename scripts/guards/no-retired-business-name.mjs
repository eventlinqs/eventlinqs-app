/**
 * GUARD: no retired business name on a surface a person reads.
 *
 * WHY (founder ruling, 25 September 2026). The second business has been
 * Bookedproof since 18 September 2026. A week later the live privacy page still
 * said "EventLinqs uses Fullproof AI as its service provider to send these
 * messages on its behalf", because the rename was a decision and nothing
 * enforced it. A rename is a sweep plus a guard on the same day.
 *
 * THE RETIRED NAMES: Fullproof AI, Fullproof, Fillrate, Fill rate used as a
 * name, Fullsure, Sales Proof, SalesProof, Filltide. RETIRED below holds each
 * as a pattern, and every pattern is aimed at the NAME rather than at English:
 *
 *   - one-word coinages (fullproof, fullsure, filltide, salesproof) match in
 *     any case, because none of them is a word;
 *   - two-word forms match only capitalised as a name ("Full Proof", "Sales
 *     Proof", "Fill rate", "Fill Rate"), so "a waitlist fill rate" and "the
 *     first full proof pass" are the ordinary words they are;
 *   - Fillrate matches capitalised only. The lower-case `fillrate` is the
 *     recovery engine's module path (src/lib/fillrate), its log tag and a
 *     stored message type (organiser_fillrate_nudge): code identifiers no
 *     person is shown, and renaming a stored type would orphan the rows that
 *     already carry it.
 *
 * WHERE IT LOOKS: src (every page, legal page, email, SMS and admin surface is
 * rendered from here), public, and supabase (migrations and seeds, which is
 * where seeded wording and data live). docs/ is not read: Vercel strips it
 * from the upload (.vercelignore), and a build-time read of it is the mistake
 * that has cost four deployments. On 26 September 2026 docs/ carried no
 * retired name.
 *
 * THE REGISTER, and why it is not a pattern. Some records must stay exactly as
 * written: the v1 consent wording is the sentence people agreed to, and an
 * applied migration is history that production has already run. Each is named
 * below by FILE, with the exact number of occurrences it may hold and the
 * reason. A registered file that gains one more occurrence fails, so the
 * register excuses a record, never a directory and never a future edit. An
 * entry that no longer matches is printed as rot so the list cannot outlive
 * what it excuses.
 *
 * Run standalone:  node scripts/guards/no-retired-business-name.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TAG = '[no-retired-business-name]'

export const CURRENT_NAME = 'Bookedproof'

export const RETIRED = [
  { name: 'Fullproof / Fullproof AI', res: [/fullproof/gi, /\bFull Proof\b/g] },
  { name: 'Fullsure', res: [/fullsure/gi, /\bFull Sure\b/g] },
  { name: 'Filltide', res: [/filltide/gi, /\bFill Tide\b/g] },
  { name: 'SalesProof / Sales Proof', res: [/salesproof/gi, /\bSales Proof\b/g] },
  { name: 'Fillrate / Fill rate as a name', res: [/\bFill ?[Rr]ate\b/g, /\bFILL ?RATE\b/g] },
]

export const SCAN_ROOTS = ['src', 'public', 'supabase']

/**
 * Records that must stay as written. `count` is exact: one more occurrence in
 * the same file fails the build.
 */
export const REGISTER = [
  {
    file: 'supabase/migrations/20260913000040_consent_ledger.sql',
    count: 2,
    reason:
      'Applied migration. It seeds consent wording v1, the exact sentence every person who ticked the box agreed to; ' +
      'consent_wordings refuses UPDATE, and v2 (naming Bookedproof) is a new row, not an edit. The second occurrence is its header comment.',
  },
  {
    file: 'supabase/migrations/20260913000060_attribution_spine.sql',
    count: 1,
    reason: 'Applied migration, header comment. Production has run it; editing it would make the file disagree with what ran.',
  },
  {
    file: 'supabase/migrations/20260913000030_audience_asset.sql',
    count: 1,
    reason: 'Applied migration, header comment. Production has run it; editing it would make the file disagree with what ran.',
  },
  {
    file: 'supabase/migrations/20260910000003_recovery_engine.sql',
    count: 1,
    reason: 'Applied migration, header comment. Production has run it; editing it would make the file disagree with what ran.',
  },
]

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.temp', '.branches'])
const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|md|mdx|sql|json|txt|html|svg|xml|webmanifest|css)$/i

function walk(root, rel, out) {
  let st
  try {
    st = statSync(join(root, rel))
  } catch {
    return
  }
  if (st.isFile()) {
    if (TEXT.test(rel)) out.push(rel)
    return
  }
  for (const entry of readdirSync(join(root, rel))) {
    if (SKIP_DIRS.has(entry)) continue
    walk(root, `${rel}/${entry}`, out)
  }
}

/** Every retired-name occurrence in one text, with its line. */
export function findRetired(text) {
  const hits = []
  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    for (const r of RETIRED) {
      for (const re of r.res) {
        for (const m of line.matchAll(new RegExp(re.source, re.flags))) hits.push({ line: i + 1, name: r.name, match: m[0] })
      }
    }
  })
  return hits
}

/** The whole ruling over a map of file -> text. Returns { faults, rot, scanned }. */
export function judge(files, register = REGISTER) {
  const faults = []
  const rot = []
  const byFile = new Map(register.map((r) => [r.file, r]))
  const seen = new Map()
  for (const [file, text] of files) {
    const hits = findRetired(text)
    if (hits.length === 0) continue
    seen.set(file, hits.length)
    const entry = byFile.get(file)
    if (entry && hits.length === entry.count) continue
    if (entry) {
      faults.push(
        `${file} is registered for exactly ${entry.count} occurrence(s) and now holds ${hits.length}. ` +
          `The register excuses a record as written, never a new edit:\n` +
          hits.map((h) => `      line ${h.line}: "${h.match}" (${h.name})`).join('\n'),
      )
      continue
    }
    for (const h of hits) {
      faults.push(`${file}:${h.line} names "${h.match}", a retired name (${h.name}). The business is ${CURRENT_NAME}.`)
    }
  }
  for (const entry of register) {
    if (!seen.has(entry.file)) rot.push(`${entry.file} is registered and no longer names a retired business: delete its register entry`)
  }
  return { faults, rot, scanned: files.size }
}

function main() {
  const paths = []
  for (const root of SCAN_ROOTS) walk(ROOT, root, paths)
  const files = new Map(paths.map((p) => [p, readFileSync(join(ROOT, p), 'utf8')]))
  const { faults, rot, scanned } = judge(files)

  console.log(`${TAG} register (${REGISTER.length} record(s) kept as written):`)
  for (const r of REGISTER) console.log(`${TAG}   ${r.file} x${r.count}: ${r.reason}`)
  for (const r of rot) console.log(`${TAG} ROT ${r}`)

  declareWork('no-retired-business-name', {
    did: { 'file scanned': scanned, 'retired name checked': RETIRED.length },
    found: { 'retired name on a surface': faults.length },
  })

  if (scanned === 0) {
    console.error(`${TAG} FAIL - scanned no files under ${SCAN_ROOTS.join(', ')}; a guard that reads nothing proves nothing.`)
    process.exitCode = 1
    return
  }
  if (faults.length > 0) {
    console.error(`${TAG} FAIL - ${faults.length} retired business name(s) where a person can read them:`)
    for (const f of faults) console.error(`    ${f}`)
    console.error('')
    console.error(`  Name the business ${CURRENT_NAME}. Consent and legal wording is versioned, never edited:`)
    console.error('  a change is a new dated version, and a record that must stay as written goes in REGISTER with its reason.')
    process.exitCode = 1
    return
  }
  console.log(`${TAG} PASS - ${scanned} files under ${SCAN_ROOTS.join(', ')} name no retired business outside the ${REGISTER.length} registered records.`)
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) main()
