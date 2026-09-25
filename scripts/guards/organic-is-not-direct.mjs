/**
 * THE ORGANIC FIGURE MUST BE SOMEBODY ELSE'S DEFINITION, MUST NOT SHIP TO A
 * BROWSER, AND MUST NEVER APPEAR WITHOUT THE DIRECT FIGURE BESIDE IT.
 *
 * ===========================================================================
 * WHAT CLOSE-OUT AQ3 ASKS FOR, AND WHY EACH HALF NEEDS A GATE
 * ===========================================================================
 *
 * AQ3's acceptance line is "organic attributed orders reported separately from
 * direct". Three different ways of losing that were live in this tree or one
 * edit away from it, and each clause below closes one of them.
 *
 * CLAUSE 1, THE TABLE IS GOOGLE'S AND STAYS GOOGLE'S. Which sites count as
 * search engines is a third-party specification, and Law 7 forbids stating one
 * from memory. `src/lib/growth/source-categories.generated.ts` is fetched from
 * Google's own published table by
 * `scripts/ops/refresh-ga-source-categories.mjs` and sealed with a sha256 over
 * its sorted rows. This clause recomputes that seal from the file's own
 * contents. Adding `brave` by hand because it looked missing, which is exactly
 * the edit somebody will want to make, fails the build and says why.
 *
 * WHY A SEAL RATHER THAN A REVIEW NOTE. The tree already carries the receipt
 * for what a written rationale is worth: a guard written after the third lost
 * deployment accepted a WRITTEN RATIONALE that a script coped without `docs/`,
 * the rationale was wrong, nothing had executed it, and the fourth deployment
 * was lost anyway. Prose does not run. A digest does.
 *
 * CLAUSE 2, 819 ROWS OF SOMEBODY ELSE'S TABLE NEVER REACH A PHONE. The table is
 * about 26 KB of source. Lane A measured, on 19 September, every dashboard
 * route carrying a 21,005 byte chunk of image hints in order to draw one 32px
 * circle, because one shared component imported one object literal. This is the
 * same shape, larger, and the only thing standing between it and a browser is
 * that nobody has yet imported `channelForVisit` into a client component.
 *
 * CLAUSE 3, THE ACCEPTANCE LINE ITSELF. A surface that reports the organic
 * figure and not the direct one is the precise failure AQ3 was written against:
 * a platform can grow its direct traffic for a year and read it as search
 * compounding. So any file that names `organicSearch` must name `direct` too.
 * It is a crude check and it is exactly as crude as the sentence it enforces.
 *
 * ===========================================================================
 * WHAT IT CANNOT SEE, STATED RATHER THAN IMPLIED
 * ===========================================================================
 *
 * It cannot tell whether the numbers are RIGHT; that is
 * `tests/unit/growth/organic-is-not-direct.test.ts`, which is blocking through
 * the suite. It cannot tell a correct reduction from a broken one. It cannot
 * see a surface that renders the two figures in different components, and it
 * says so rather than pretending: clause 3 judges one file at a time.
 *
 * The import traversal is `scripts/guards/lib/import-graph.mjs` and inherits
 * every limit written in its header: `import type` is erased, `'use server'` is
 * a boundary and not an edge, and a dynamic `await import()` is not followed.
 *
 * ===========================================================================
 * CALIBRATION
 * ===========================================================================
 *
 * Every clause here is a matcher over source, and a matcher that has gone blind
 * reports a confident pass. So each one is run against a synthetic positive
 * first, and the guard REFUSES rather than passing if its own probe comes back
 * clean.
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildImportGraph, norm, pathToTarget } from './lib/import-graph.mjs'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
export const TAG = '[organic-is-not-direct]'

const GENERATED = 'src/lib/growth/source-categories.generated.ts'
const CLASSIFIER = 'src/lib/growth/traffic-channel'
const REFRESH_SCRIPT = 'scripts/ops/refresh-ga-source-categories.mjs'

/** The banner the generated file must keep, so a hand edit is a decision. */
const BANNER = 'GENERATED FILE. DO NOT EDIT BY HAND.'

/**
 * One row of the generated table, exactly as it is rendered.
 *
 * Spelled to match the renderer in the refresh script rather than loosely, so a
 * change to one without the other is a calibration failure rather than a silent
 * drop of every row.
 */
const ROW = /^ {2}"(.+)": '(search|social|shopping|video)',$/gm

/** The sealed values the file declares about itself. */
function declared(source) {
  return {
    digest: /SOURCE_CATEGORY_DIGEST = '([0-9a-f]{64})'/.exec(source)?.[1] ?? null,
    counts: {
      search: Number(/search: (\d+),/.exec(source)?.[1] ?? NaN),
      social: Number(/social: (\d+),/.exec(source)?.[1] ?? NaN),
      shopping: Number(/shopping: (\d+),/.exec(source)?.[1] ?? NaN),
      video: Number(/video: (\d+),/.exec(source)?.[1] ?? NaN),
    },
    rules: /rules: '([^']+)'/.exec(source)?.[1] ?? null,
    table: /table: '([^']+)'/.exec(source)?.[1] ?? null,
    fetchedOn: /SOURCE_CATEGORY_FETCHED_ON = '(\d{4}-\d{2}-\d{2})'/.exec(source)?.[1] ?? null,
  }
}

/** Every row the file actually carries, read back out of its own source. */
export function rowsOf(source) {
  const table = {}
  for (const match of source.matchAll(ROW)) table[match[1]] = match[2]
  return table
}

export function sealOf(table) {
  const canonical = Object.keys(table)
    .sort()
    .map(name => `${name}=${table[name]}`)
    .join('\n')
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

function countsOf(table) {
  const counts = { search: 0, social: 0, shopping: 0, video: 0 }
  for (const category of Object.values(table)) counts[category] += 1
  return counts
}

/** Reading the organic figure off the summary, in either spelling. */
const NAMES_ORGANIC = /(?:\.organicSearch\b|[{,]\s*organicSearch\s*[,}:])/

/**
 * Reading the DIRECT figure off the summary, in either spelling.
 *
 * `\bdirect\b` WAS NOT ENOUGH, and this clause's own drill is what said so.
 * Planting `const direct = summary.organicSearch` into the page leaves the word
 * `direct` in the file, so the guard passed on a tree where the page showed the
 * organic number twice and the direct number nowhere: the exact defect, wearing
 * the exact variable name. The word is not the evidence. Reading the field is.
 */
const READS_DIRECT = /(?:\.direct\b|[{,]\s*direct\s*[,}:])/

/**
 * Files that name the organic figure, and whether they READ the direct one.
 *
 * TAKES SOURCE RATHER THAN PATHS, so the calibration below can put a synthetic
 * offender in front of the same function the real scan uses. It THROWS on a
 * caller that hands it anything else, because the first version took paths, the
 * probe was converted carelessly, and the probe then sailed through testing the
 * string "undefined" against both matchers and finding nothing. A calibration
 * probe that cannot fail is worse than none: it reports that the guard can see.
 */
export function organicWithoutDirect(entries) {
  const offenders = []
  let naming = 0
  for (const { file, source } of entries) {
    if (typeof source !== 'string') {
      throw new TypeError(`organicWithoutDirect needs the source of ${file}, and was handed ${typeof source}`)
    }
    if (!NAMES_ORGANIC.test(source)) continue
    naming += 1
    if (!READS_DIRECT.test(source)) offenders.push(file)
  }
  return { offenders, naming }
}

function main() {
  const failures = []
  const sealFailures = []

  // ---------------------------------------------------------------- clause 1
  const generatedPath = join(ROOT, GENERATED)
  if (!existsSync(generatedPath)) {
    console.error(`${TAG} FAIL: ${GENERATED} is missing. Rebuild it with: node ${REFRESH_SCRIPT} --write`)
    process.exit(1)
  }
  const generated = readFileSync(generatedPath, 'utf8')
  const table = rowsOf(generated)
  const seal = sealOf(table)
  const counts = countsOf(table)
  const said = declared(generated)
  const rowCount = Object.keys(table).length

  if (!generated.includes(BANNER)) {
    sealFailures.push(`${GENERATED} has lost its "${BANNER}" banner, which is the only warning a reader gets`)
  }
  if (!said.rules || !said.table || !said.fetchedOn) {
    sealFailures.push(
      `${GENERATED} no longer carries its provenance (rules ${said.rules ?? 'absent'}, ` +
        `table ${said.table ?? 'absent'}, fetched ${said.fetchedOn ?? 'absent'}). ` +
        'A third-party specification with no source is exactly what Law 7 forbids.',
    )
  }
  if (said.digest !== seal) {
    sealFailures.push(
      `${GENERATED} holds ${rowCount} rows that seal to ${seal}, and declares ${said.digest ?? 'no digest'}. ` +
        `The table has been edited by hand. It is Google's published answer, not ours: ` +
        `re-fetch it with "node ${REFRESH_SCRIPT} --write" and commit what comes back.`,
    )
  }
  for (const key of ['search', 'social', 'shopping', 'video']) {
    if (counts[key] !== said.counts[key]) {
      sealFailures.push(
        `${GENERATED} carries ${counts[key]} ${key} source(s) and declares ${said.counts[key]}`,
      )
    }
  }

  // ---------------------------------------------------------------- clause 2
  const graph = buildImportGraph(ROOT)
  const reachers = []
  for (const mod of graph.isClient) {
    const path = pathToTarget(graph, mod, CLASSIFIER, new Map())
    if (path) reachers.push(path)
  }
  if (reachers.length > 0) {
    failures.push(
      `${reachers.length} client component(s) reach ${CLASSIFIER}, which statically imports ` +
        `${rowCount} rows of Google's source table:\n${TAG}     ` +
        reachers.map(path => path.join('\n' + TAG + '       -> ')).join('\n' + TAG + '     ') +
        `\n${TAG}   The classification is a server decision. Pass the ANSWER to the client, never the table.`,
    )
  }

  // ---------------------------------------------------------------- clause 3
  // NORMALISED FIRST. `graph.files` carries platform separators, so a filter
  // written with forward slashes matched nothing on Windows and the guard
  // reported "0 surfaces scanned" with total confidence. declareWork refused it,
  // which is the whole reason that helper exists.
  const surfaces = [...graph.files]
    .map(norm)
    .filter(file => (file.startsWith('src/app/') || file.startsWith('src/components/')) && /\.tsx?$/.test(file))
  const { offenders, naming } = organicWithoutDirect(
    surfaces.map(file => ({ file, source: readFileSync(join(ROOT, file), 'utf8') })),
  )
  if (offenders.length > 0) {
    failures.push(
      `${offenders.length} surface(s) report the organic search figure and never name direct: ` +
        `${offenders.join(', ')}. AQ3 asks for organic reported SEPARATELY FROM DIRECT, and a page ` +
        'that shows one without the other is how a platform reads its own direct traffic as search growth.',
    )
  }

  // --------------------------------------------------------------- calibrate
  const probes = []
  const tamperedTable = { ...table, 'a-site-nobody-published.example': 'search' }
  if (sealOf(tamperedTable) === seal) probes.push('the seal does not change when a row is added')
  if (Object.keys(rowsOf(generated)).length === 0) probes.push('the row matcher reads no rows at all')
  if (graph.isClient.size === 0) probes.push('the import graph sees no client components at all')
  // TWO SIDED, THROUGH THE SAME FUNCTION THE REAL SCAN USES. A synthetic file
  // that names the organic figure alone must be caught; one that reads both must
  // not be; a destructured read counts; and a local merely NAMED direct does not.
  const probe = (name, source) => organicWithoutDirect([{ file: `probe/${name}.tsx`, source }])
  const alone = probe('organic-alone', 'const a = summary.organicSearch\n')
  const both = probe('organic-and-direct', 'const a = summary.organicSearch\nconst b = summary.direct\n')
  const destructured = probe('destructured', 'const { organicSearch, direct } = summary\n')
  const namedNotRead = probe('named-not-read', 'const direct = summary.organicSearch\n')
  if (alone.offenders.length !== 1) probes.push('a surface naming organic alone is not caught')
  if (alone.naming !== 1) probes.push('the organic matcher does not see the figure at all')
  if (both.offenders.length !== 0) probes.push('a surface reading organic and direct is reported anyway')
  if (destructured.offenders.length !== 0) probes.push('a destructured read of direct is not recognised')
  if (namedNotRead.offenders.length !== 1) {
    probes.push('a local merely named direct, reading the organic figure, is accepted')
  }
  if (probes.length > 0) {
    console.error(`${TAG} REFUSING: the calibration probe came back clean, so this guard has gone blind:`)
    for (const probe of probes) console.error(`${TAG}   ${probe}`)
    process.exit(1)
  }

  failures.unshift(...sealFailures)

  if (failures.length > 0) {
    console.error(`${TAG} the organic figure is not being kept honest:`)
    for (const failure of failures) console.error(`${TAG}   ${failure}`)
  }

  declareWork('organic-is-not-direct', {
    did: {
      'published source row sealed': rowCount,
      'module read for the import graph': graph.files.length,
      'surface scanned for the organic figure': surfaces.length,
      'surface that names the organic figure': naming,
    },
    found: {
      'published table fault': sealFailures.length,
      'client component reaching the source table': reachers.length,
      'surface naming organic without direct': offenders.length,
    },
  })

  if (failures.length > 0) process.exit(1)

  console.log(
    `${TAG} PASS: ${rowCount} published source(s) sealed to ${seal.slice(0, 12)} and last fetched ` +
      `${said.fetchedOn}, 0 client components reach the table, ${naming} surface(s) name the organic ` +
      'figure and every one names direct beside it',
  )
}

if (process.argv[1] && process.argv[1].endsWith('organic-is-not-direct.mjs')) main()
