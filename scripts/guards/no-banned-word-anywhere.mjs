/**
 * GUARD: the banned word, everywhere it can live, not only in copy.
 *
 * FOUNDER RULING, 26 August 2026:
 *
 *   "'culture' is banned in every form, and two live instances survived because
 *   the existing guard scans customer-facing TEXT only. A slug in a storage path
 *   is not text and a string comparison in TypeScript is not copy, so both sat
 *   in a blind spot for months."
 *
 * THE TWO THAT GOT THROUGH, and they are different blind spots:
 *
 *  1. `src/lib/broadcast/captions.ts` compared `slug === 'arts-culture'` against
 *     a slug that no longer exists. Every arts event fell through to the wrong
 *     caption register. A string comparison is code, not copy, so the copy gate
 *     was never going to see it, and the exemption that DID cover the file
 *     justified itself with "the live event_categories row still carries the
 *     slug arts-culture" - measured false on 26 August 2026: 22 rows, none
 *     carrying the word.
 *
 *  2. `stock/categories/arts-culture/...` is a storage key baked into an image
 *     URL that browsers request today. Not text, not code, and served on every
 *     homepage.
 *
 * WHAT THIS SCANS THAT THE COPY GATE DOES NOT: identifiers, object keys, string
 * comparisons, slugs, route fragments, storage keys, filenames, and JSON config.
 * It reads whole files including comments, because a comment naming a live slug
 * is how the last stale justification survived being read.
 *
 * WHAT IS LEGITIMATELY EXEMPT, and why the list is short. A retired name has to
 * be SPELLED in exactly three kinds of place, all of which exist to keep old
 * links working: the redirect table, the slug alias map, and the reserved-path
 * list. Migrations are exempt as a class because they are an immutable record of
 * what was already run; rewriting one to remove a word would be rewriting
 * history and would not change a single byte in the database.
 *
 * EVERY EXEMPTION IS CHECKED FOR STALENESS ON EVERY RUN. An entry whose file no
 * longer contains the word is reported and fails, because an exemption that
 * excuses nothing is an exemption nobody has read, and this guard exists because
 * exactly that happened.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PROPER_NOUNS, withoutProperNouns } from './lib/proper-nouns.mjs'

const SEP = String.fromCharCode(92)
const ROOTS = ['src', 'scripts', 'supabase/seed']
const EXT = /\.(ts|tsx|mjs|js|json|css|sql|yml|yaml)$/

/** The word, in every form, as a whole word or inside a hyphenated identifier. */
const BANNED = /cultur(e|es|al|ally)/i
/** Words that legitimately contain the letters and are not the banned word. */
const NOT_THE_WORD = /agricultur|apicultur|aquacultur|horticultur|africultures|permacultur|subcultur|viticultur/i

const EXEMPT = [
  {
    file: 'src/lib/seo/permanent-redirects.ts',
    occurrences: 4,
    why: 'the redirect table has to SPELL the retired path, because that path is the thing being redirected. Every destination in the table is a /community route',
  },
  {
    file: 'src/lib/events/search-params.ts',
    occurrences: 4,
    why: 'CATEGORY_SLUG_ALIASES maps the retired slug to the community-first one. It is the string arriving in a URL somebody already shared',
  },
  {
    file: 'src/lib/images/spine.ts',
    occurrences: 2,
    why: 'TWO SCENE DESCRIPTORS, first-nations and pasifika-maori, name a storage OBJECT that exists under that name in the bucket. Found on 26 August 2026 by this guard the moment the file stopped being exempt as a whole, which is the widening working. Changing either string without copying the object first serves a 404 instead of a photo, so they are recorded in docs/POST-LAUNCH-FINDINGS.md and left. The category key that generated the retired path on every homepage WAS fixed the same day',
  },
  {
    file: 'src/lib/broadcast/short-links.ts',
    occurrences: 1,
    why: 'the RESERVED list holds back the two legacy paths so a minted share code cannot shadow a live 301',
  },
  {
    file: 'src/lib/ai/magic-start.ts',
    occurrences: 1,
    why: 'the system prompt has to name the banned word in order to prohibit it',
  },
  {
    file: 'scripts/guards/no-banned-word-anywhere.mjs',
    occurrences: null,
    why: 'this guard: it has to spell the word it is looking for',
  },
  {
    file: 'supabase/seed/imagery-map.json',
    occurrences: 30,
    why: 'the seed imagery map keys mirror the STORAGE PATHS exactly. It cannot change until the objects do, and the objects are the separate job in docs/verification/BANNED-WORD-SWEEP-2026-08-26.md',
  },
  {
    file: 'supabase/seed/seed-cover-pool.json',
    occurrences: 1,
    why: 'same: a cover-pool key that names a storage folder. Changing it here without renaming the object serves a 404 instead of a photo',
  },
  {
    file: 'scripts/batch-11.1-d3-2-culture-parity.mjs',
    occurrences: 1,
    why: 'a one-off audit script from the taxonomy migration. Its FILENAME records the retired taxonomy it was written to check; two documents cite it by name, so renaming it breaks those citations for no gain',
  },
  {
    file: 'scripts/lh-batch-5-5-cultures.mjs',
    occurrences: 1,
    why: 'same: a one-off Lighthouse batch from the same migration, cited by name in two documents',
  },
  {
    file: 'scripts/copy-tell-gate.mjs',
    occurrences: null,
    why: 'the copy gate carries the same word in its own detector and in the reasons on its allowlist',
  },
  {
    file: 'scripts/guards/lib/proper-nouns.mjs',
    occurrences: null,
    why: 'the proper noun registry: every entry is the NAME of a real organisation, exempt from the ban by founder ruling of 3 September 2026, and each carries the source URL it was confirmed against. It has to spell the names it protects',
  },
  {
    file: 'scripts/guards/proper-nouns-intact.mjs',
    occurrences: null,
    why: 'the guard that holds those names in place: it has to spell both the real name and the corrupted form it hunts',
  },
]

/** Whole directories exempt as a class, with the reason. */
/*
 * NOTE, from this guard's own first run: scripts/sweep/walk.mjs was listed as a
 * FILE exemption while scripts/sweep was already a DIRECTORY exemption. The
 * directory is checked first, so the file exemption could never be marked used
 * and the staleness check reported it immediately. A redundant exemption is
 * indistinguishable from an expired one, which is the correct outcome.
 */
const EXEMPT_DIRS = [
  {
    prefix: 'supabase/migrations',
    why: 'an immutable record of what has already been applied. Rewriting one would rewrite history and change nothing in the database',
  },
  {
    prefix: 'scripts/verify',
    why: 'proofs and rehearsals that drive the retired slug on purpose to show the alias and the 301 still work',
  },
  {
    prefix: 'scripts/sweep',
    why: 'legacy-audit tooling whose whole subject is the retired paths',
  },
]

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (EXT.test(entry)) out.push(p)
  }
  return out
}

const files = []
for (const root of ROOTS) walk(root, files)

let scanned = 0
let exemptedFiles = 0
const hits = []
const exemptionUsed = new Set()
const overBudget = []

for (const file of files) {
  const rel = file.replaceAll(SEP, '/')

  const dirExemption = EXEMPT_DIRS.find((d) => rel.startsWith(d.prefix))
  if (dirExemption) {
    exemptedFiles += 1
    continue
  }

  const fileExemption = EXEMPT.find((e) => e.file === rel)
  const src = readFileSync(file, 'utf8')
  const lines = src.split(String.fromCharCode(10))
  const found = []
  for (let i = 0; i < lines.length; i += 1) {
    /*
     * PROPER NOUNS ARE EXEMPT, BY FOUNDER RULING OF 3 SEPTEMBER 2026.
     *
     * The registered name is REMOVED from the line before the line is tested,
     * so this excuses an exact STRING rather than a file or even a count. A
     * second, unregistered use of the banned word on the same line still fails,
     * which is the same principle as the count budget below, tightened.
     *
     * The registry, with a source URL for every name, is in
     * scripts/guards/lib/proper-nouns.mjs.
     */
    const scrubbed = withoutProperNouns(lines[i])
    if (!BANNED.test(scrubbed)) continue
    if (NOT_THE_WORD.test(scrubbed)) continue
    found.push({ line: i + 1, text: lines[i].trim().slice(0, 100) })
  }

  if (fileExemption) {
    exemptedFiles += 1
    if (found.length > 0) exemptionUsed.add(rel)
    /*
     * AN EXEMPTION EXCUSES A COUNT, NOT A FILE.
     *
     * WHY THIS WAS ADDED, 26 August 2026: src/lib/images/spine.ts was exempted
     * as a whole file for its one legitimate storage key. That exemption also
     * hid the fact that the SAME key was generating the retired path into every
     * homepage image URL, and it would have gone on hiding a second, third or
     * tenth occurrence for ever. Asked whether this guard would have caught the
     * defect it was written for, the honest answer was NO: the file was exempt,
     * so nothing in it was ever read.
     *
     * A budget of `null` means "this file is about the word, do not count".
     */
    if (fileExemption.occurrences !== null && found.length > fileExemption.occurrences) {
      overBudget.push({
        file: rel,
        allowed: fileExemption.occurrences,
        actual: found.length,
        extra: found.slice(fileExemption.occurrences),
      })
    }
    continue
  }

  scanned += 1
  for (const f of found) hits.push({ file: rel, ...f })
}

// A FILENAME can carry the word without any line of the file doing so.
const pathHits = files
  .map((f) => f.replaceAll(SEP, '/'))
  .filter((rel) => BANNED.test(rel) && !NOT_THE_WORD.test(rel))
  .filter((rel) => !EXEMPT_DIRS.some((d) => rel.startsWith(d.prefix)))
  .filter((rel) => !EXEMPT.some((e) => e.file === rel))

console.log(`no-banned-word-anywhere: ${files.length} file(s) under ${ROOTS.join(', ')}`)
console.log(`  ${scanned} scanned, ${exemptedFiles} exempt`)
console.log(`  looking for: identifiers, string comparisons, slugs, URLs, storage keys, filenames, config`)
console.log(`  proper nouns exempt by founder ruling (${PROPER_NOUNS.length}), each with a source:`)
for (const n of PROPER_NOUNS) console.log(`    ${n.name}${String.fromCharCode(10)}      ${n.source}`)
console.log(`  directory exemptions (${EXEMPT_DIRS.length}):`)
for (const d of EXEMPT_DIRS) console.log(`    ${d.prefix}${String.fromCharCode(10)}      ${d.why}`)
console.log(`  file exemptions (${EXEMPT.length}):`)
for (const e of EXEMPT) console.log(`    ${e.file}  (excuses ${e.occurrences === null ? 'any, it is about the word' : e.occurrences})${String.fromCharCode(10)}      ${e.why}`)

/*
 * STALENESS. An exemption whose file no longer contains the word is excusing
 * nothing, and an exemption nobody has re-read is how a justification that had
 * become false ("the live row still carries the slug") stayed in the tree.
 */
const stale = EXEMPT.filter((e) => existsSync(e.file) && !exemptionUsed.has(e.file))
const absent = EXEMPT.filter((e) => !existsSync(e.file))

if (stale.length > 0 || absent.length > 0) {
  console.error('')
  console.error('FAIL: exemption(s) that no longer excuse anything:')
  for (const e of stale) console.error(`  ${e.file}  no longer contains the word. Delete the entry.`)
  for (const e of absent) console.error(`  ${e.file}  file does not exist. Delete the entry.`)
  console.error('')
  console.error('An exemption whose reason has expired is the family this guard was')
  console.error('written for: copy-tell-gate.mjs excused captions.ts on the grounds that')
  console.error('the live database row still carried the slug, and it did not.')
  process.exit(1)
}

if (overBudget.length > 0) {
  console.error('')
  console.error(`FAIL: ${overBudget.length} exemption(s) now excuse MORE than they were reviewed for:`)
  for (const o of overBudget) {
    console.error(`  ${o.file}  reviewed for ${o.allowed}, found ${o.actual}`)
    for (const e of o.extra) console.error(`    line ${e.line}  ${e.text}`)
  }
  console.error('')
  console.error('An exemption excuses a COUNT, not a file. A whole-file exemption is how')
  console.error('spine.ts hid the retired storage key in every homepage image URL while')
  console.error('this guard reported PASS.')
  process.exit(1)
}

if (hits.length > 0 || pathHits.length > 0) {
  console.error('')
  console.error(`FAIL: the banned word appears in ${hits.length + pathHits.length} place(s) with no reviewed exemption:`)
  for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.text}`)
  for (const p of pathHits) console.error(`  ${p}  (the FILENAME carries it)`)
  console.error('')
  console.error('It is banned in every form: identifiers, comparisons, slugs, URLs,')
  console.error('storage keys, filenames and config, not only customer-facing copy.')
  console.error('Use "community". If this is a RETIRED name that must be spelled to')
  console.error('keep an old link working, add an exemption with the reason.')
  process.exit(1)
}

console.log('')
console.log('PASS: the banned word appears nowhere without a reviewed reason.')
