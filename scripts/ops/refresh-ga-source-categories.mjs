/**
 * THE TABLE THAT SAYS WHICH REFERRING SITES ARE SEARCH ENGINES, TAKEN FROM THE
 * ONLY PARTY THAT PUBLISHES ONE, AND NEVER FROM MEMORY.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCRIPT EXISTS RATHER THAN A HAND-TYPED LIST (Law 7, and Law 10)
 * ---------------------------------------------------------------------------
 *
 * Close-out AQ3 asks for organic traffic to be reported SEPARATELY FROM DIRECT.
 * That sentence contains a third-party specification, because "organic" means
 * "the referring site is a search engine", and which sites those are is not
 * something this repository is entitled to assert from memory.
 *
 * Google publishes the list, as a categorised table of sources behind its
 * default channel group:
 *
 *   https://support.google.com/analytics/answer/9756891  (the channel rules)
 *   https://storage.googleapis.com/support-kms-prod/qn1xhBu8MVcZPIZ2WZMNdI40FtZXFPGYxj2K
 *                                                       (the source table, PDF)
 *   both fetched 2026-09-19.
 *
 * READING IT CHANGED THE DESIGN, WHICH IS THE WHOLE POINT OF THE LAW. The
 * obvious implementation matches a referring HOST against that list. It would
 * have been wrong in the worst possible way: the list carries the bare token
 * `google`, and carries NO entry for `google.com.au`, `google.com` or
 * `www.google.com`. A host match would therefore have reported every visit
 * Google sent us as a referral and the platform would have answered "is the SEO
 * working" with a flat no. The list is a SOURCE table, not a HOST table, and the
 * host has to be reduced to a source first. That reduction lives in
 * src/lib/growth/traffic-channel.ts and is ours; this table is Google's.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SCRIPT GUARANTEES
 * ---------------------------------------------------------------------------
 *
 *   REFUSES BEFORE IT ACTS.   A download that is not a PDF, or that yields
 *                             fewer rows than the floor below, or that yields
 *                             no search sources at all, is rejected and nothing
 *                             is written. A half-parsed table that silently
 *                             loses every search engine would turn all organic
 *                             traffic into referrals with no error anywhere.
 *   IDEMPOTENT.               Re-running when nothing upstream changed rewrites
 *                             nothing, so the fetch date in the file stays the
 *                             date the CONTENT was last true rather than the
 *                             date somebody last ran a script.
 *   PROVES ITSELF.            It re-reads the file it just wrote, re-derives the
 *                             digest from the parsed table, and fails if the two
 *                             disagree. The digest is what
 *                             scripts/guards/organic-is-not-direct.mjs checks,
 *                             so a hand edit to the table cannot pass as
 *                             Google's published answer.
 *   PRINTS NO SECRET.        There is nothing secret here: a public help page.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/ops/refresh-ga-source-categories.mjs            # check only
 *   node scripts/ops/refresh-ga-source-categories.mjs --write    # rewrite
 *
 * It needs `pdftotext` on PATH (poppler; it ships with Git for Windows' mingw64
 * and with every Linux distribution). Google publishes this table as a PDF and
 * nothing in this repository can read one. If it is missing the script says so
 * and stops rather than writing a table it could not read.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const OUT_FILE = path.join(ROOT, 'src', 'lib', 'growth', 'source-categories.generated.ts')

/** Google's own categorised source table. Cited in the header above. */
const TABLE_URL =
  'https://storage.googleapis.com/support-kms-prod/qn1xhBu8MVcZPIZ2WZMNdI40FtZXFPGYxj2K'
/** The page that publishes the table and the channel rules that consume it. */
const RULES_URL = 'https://support.google.com/analytics/answer/9756891'

/**
 * The floor a parse has to clear to be believed. The table held 819 rows on
 * 19 September 2026. The floor is deliberately far below that: it is here to
 * catch a parse that collapsed to nothing or to a handful, not to freeze the
 * table at a size Google never promised to keep.
 */
const MINIMUM_ROWS = 400
/** Same reasoning, for the one category the whole feature depends on. */
const MINIMUM_SEARCH_ROWS = 40

const CATEGORY_BY_TOKEN = {
  SOURCE_CATEGORY_SEARCH: 'search',
  SOURCE_CATEGORY_SOCIAL: 'social',
  SOURCE_CATEGORY_SHOPPING: 'shopping',
  SOURCE_CATEGORY_VIDEO: 'video',
}

function fail(message) {
  console.error(`[refresh-ga-source-categories] REFUSED: ${message}`)
  process.exit(1)
}

/**
 * The canonical serialisation the digest is taken over.
 *
 * Sorted, one `name=category` per line, so the digest depends on the CONTENT of
 * the table and not on the order it happened to be written in, and so a reviewer
 * can recompute it by hand from the exported object.
 */
export function canonicalise(table) {
  return Object.keys(table)
    .sort()
    .map(name => `${name}=${table[name]}`)
    .join('\n')
}

function digestOf(table) {
  return createHash('sha256').update(canonicalise(table), 'utf8').digest('hex')
}

async function download() {
  const response = await fetch(TABLE_URL)
  if (!response.ok) fail(`the source table answered HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.subarray(0, 4).toString('latin1') !== '%PDF') {
    fail(`the source table did not come back as a PDF (first bytes: ${bytes.subarray(0, 8).toString('latin1')})`)
  }
  return bytes
}

function extract(pdfBytes) {
  let dir
  try {
    dir = mkdtempSync(path.join(tmpdir(), 'ga-sources-'))
    const pdfPath = path.join(dir, 'sources.pdf')
    const txtPath = path.join(dir, 'sources.txt')
    writeFileSync(pdfPath, pdfBytes)
    try {
      execFileSync('pdftotext', ['-layout', pdfPath, txtPath], { stdio: 'pipe' })
    } catch (error) {
      fail(
        'pdftotext is not on PATH, so the published table cannot be read. Install poppler ' +
          `(Git for Windows ships it in mingw64) and run this again. Underlying error: ${error.message}`,
      )
    }
    return readFileSync(txtPath, 'utf8')
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * One row per line: a source name, whitespace, then its SOURCE_CATEGORY_* token.
 *
 * THE SEPARATOR IS ONE SPACE OR MORE, NOT TWO, AND THAT IS NOT A DETAIL. The
 * first version of this required two, because `pdftotext -layout` pads the name
 * column out to a fixed width. Exactly one row on the published table fills that
 * column completely:
 *
 *     aax-us-east.amazon-adsystem.com SOURCE_CATEGORY_SHOPPING
 *
 * so it arrived with a single space and was dropped. Nothing complained: 818
 * rows parsed out of 819 and every floor below was cleared comfortably. A
 * measurement that loses a row per release and never says so is the shape of
 * defect this whole file exists to prevent, which is why `unparsed` below is a
 * REFUSAL and not a warning.
 */
export function parseTable(text) {
  const table = {}
  const duplicates = []
  const unparsed = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (!line.includes('SOURCE_CATEGORY_')) continue
    const match = /^(.+?)\s+(SOURCE_CATEGORY_[A-Z]+)$/.exec(line)
    if (!match) {
      unparsed.push(line)
      continue
    }
    const name = match[1].trim().toLowerCase()
    const category = CATEGORY_BY_TOKEN[match[2]]
    // A category Google adds later is reported rather than guessed at, by the
    // same route as a line that would not parse at all.
    if (!name || !category) {
      unparsed.push(line)
      continue
    }
    if (table[name] && table[name] !== category) duplicates.push(`${name}: ${table[name]} and ${category}`)
    table[name] = category
  }
  return { table, duplicates, unparsed }
}

function countsOf(table) {
  const counts = { search: 0, social: 0, shopping: 0, video: 0 }
  for (const category of Object.values(table)) counts[category] += 1
  return counts
}

function render({ table, counts, digest, fetchedOn }) {
  const rows = Object.keys(table)
    .sort()
    .map(name => `  ${JSON.stringify(name)}: '${table[name]}',`)
    .join('\n')

  return `/**
 * GENERATED FILE. DO NOT EDIT BY HAND.
 *
 * Google's published table of traffic sources and the category each belongs to,
 * which is the evidence behind every "organic search" figure on this platform.
 * Written by scripts/ops/refresh-ga-source-categories.mjs; read the header of
 * that script for why the table is fetched rather than typed, and for the trap
 * it exists to avoid.
 *
 * SOURCE:  ${RULES_URL}
 * TABLE:   ${TABLE_URL}
 * FETCHED: ${fetchedOn}
 *
 * A HAND EDIT HERE CANNOT PASS AS GOOGLE'S ANSWER. SOURCE_CATEGORY_DIGEST is a
 * sha256 over the sorted "name=category" lines of the table below, and
 * scripts/guards/organic-is-not-direct.mjs recomputes it on every build. Adding,
 * removing or re-categorising one row fails the build until the script is run
 * again against the published table.
 */

/** The four categories Google's table carries. */
export type SourceCategory = 'search' | 'social' | 'shopping' | 'video'

/** Source name, exactly as Google publishes it, lowercased. */
export const SOURCE_CATEGORY: Readonly<Record<string, SourceCategory>> = {
${rows}
}

/** sha256 over the sorted "name=category" lines of SOURCE_CATEGORY. */
export const SOURCE_CATEGORY_DIGEST = '${digest}'

/** What the table held when it was last fetched. Recomputed by the guard. */
export const SOURCE_CATEGORY_COUNTS: Readonly<Record<SourceCategory, number>> = {
  search: ${counts.search},
  social: ${counts.social},
  shopping: ${counts.shopping},
  video: ${counts.video},
}

/** The date the table above was last confirmed against the published source. */
export const SOURCE_CATEGORY_FETCHED_ON = '${fetchedOn}'

/** Where it came from, beside the data rather than in a note somewhere else. */
export const SOURCE_CATEGORY_PROVENANCE = {
  rules: '${RULES_URL}',
  table: '${TABLE_URL}',
} as const
`
}

/**
 * The date recorded in the file as it stands, or null when there is no file.
 *
 * `existsSync` rather than a catch. The one thing this has to tell apart is
 * "never fetched" from "fetched on a date", and a bare catch would fold a
 * permission error into "never fetched" and print it as a fact.
 */
function existingFetchDate() {
  if (!existsSync(OUT_FILE)) return null
  const match = /SOURCE_CATEGORY_FETCHED_ON = '([^']+)'/.exec(readFileSync(OUT_FILE, 'utf8'))
  return match ? match[1] : null
}

async function main() {
  const write = process.argv.includes('--write')

  const pdfBytes = await download()
  const { table, duplicates, unparsed } = parseTable(extract(pdfBytes))
  const counts = countsOf(table)
  const total = Object.keys(table).length

  if (unparsed.length > 0) {
    fail(
      `${unparsed.length} line(s) of the published table name a SOURCE_CATEGORY and were not read. ` +
        `A table that loses rows quietly is worse than one that is missing: ${unparsed.slice(0, 5).join(' | ')}`,
    )
  }
  if (duplicates.length > 0) {
    fail(`the published table categorises the same source two ways: ${duplicates.join('; ')}`)
  }
  if (total < MINIMUM_ROWS) fail(`only ${total} rows parsed, below the floor of ${MINIMUM_ROWS}`)
  if (counts.search < MINIMUM_SEARCH_ROWS) {
    fail(`only ${counts.search} search sources parsed, below the floor of ${MINIMUM_SEARCH_ROWS}`)
  }

  const digest = digestOf(table)
  console.log(`[refresh-ga-source-categories] parsed ${total} sources from the published table`)
  console.log(
    `[refresh-ga-source-categories]   search ${counts.search}, social ${counts.social}, ` +
      `shopping ${counts.shopping}, video ${counts.video}`,
  )
  console.log(`[refresh-ga-source-categories] digest ${digest}`)

  const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : ''
  const currentDigest = /SOURCE_CATEGORY_DIGEST = '([^']+)'/.exec(current)?.[1] ?? null

  if (currentDigest === digest) {
    // IDEMPOTENT. The content is unchanged, so the fetch date is left alone: it
    // records when the table was last DIFFERENT, which is the useful fact.
    console.log('[refresh-ga-source-categories] unchanged: the file already carries this exact table')
    return
  }

  if (!write) {
    console.error(
      `[refresh-ga-source-categories] the published table has CHANGED (file ${currentDigest ?? 'absent'}, ` +
        `published ${digest}). Re-run with --write to take it.`,
    )
    process.exit(1)
  }

  const fetchedOn = new Date().toISOString().slice(0, 10)
  writeFileSync(OUT_FILE, render({ table, counts, digest, fetchedOn }), 'utf8')

  // PROVES ITSELF by observing the result rather than trusting the write: the
  // file is read back from disk, its table re-parsed out of the rendered source,
  // and the digest recomputed from THAT.
  const written = readFileSync(OUT_FILE, 'utf8')
  const readBack = {}
  for (const [, name, category] of written.matchAll(/^ {2}"(.+)": '(search|social|shopping|video)',$/gm)) {
    readBack[name] = category
  }
  const readBackDigest = digestOf(readBack)
  if (readBackDigest !== digest) {
    fail(
      `the file written back does not hold the table that was parsed ` +
        `(wrote ${digest}, read back ${readBackDigest} over ${Object.keys(readBack).length} rows)`,
    )
  }

  const was = existingFetchDate()
  console.log(
    `[refresh-ga-source-categories] wrote ${path.relative(ROOT, OUT_FILE)} ` +
      `(${total} sources, previously fetched ${was ?? 'never'})`,
  )
}

main().catch(error => {
  console.error(`[refresh-ga-source-categories] FAILED: ${error.stack || error.message}`)
  process.exit(1)
})
