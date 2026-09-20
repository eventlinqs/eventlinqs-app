/**
 * THE INSTRUMENT THAT DECIDES THE C8 WORK ORDER READS ONE LIST, AND THE BUILD'S
 * OWN ANSWER.
 *
 * ============================================================================
 * TWO LISTS, AND ONLY ONE OF THEM WAS BEING REVIEWED
 * ============================================================================
 *
 * `scripts/perf/lib/chunk-attribution.mjs` says in its own opening paragraph
 * why it exists: "Two readers now need that answer and they must never
 * disagree: scripts/perf/chunk-cost-table.mjs, which DRIVES a route, and
 * scripts/perf/first-load-budget.mjs, which reads the build output on disk. One
 * list, imported twice."
 *
 * ONE of those two was importing it. On 21 September 2026
 * `scripts/perf/chunk-cost-table.mjs` still carried its own private copy, made
 * before the shared module existed, and that copy still held the three markers
 * the shared module documents as having gone DEAD on 15 September:
 * `react-stack-bottom-frame`, `prefetchReducer` and `APP_ROUTER_ACTION`. The
 * visible consequence, driven that morning on all thirteen gated routes, was
 * the table's SECOND ROW:
 *
 *     | 1khqh8u91m-_x.js | 29.9 KB | 110.9 KB | yes | unattributed |
 *
 * The shared list names that chunk correctly, and has since 15 September. The
 * table was blind because it was reading the other list. Close-out P0.5 says of
 * that table: "Order by cost. That table decides the work order."
 *
 * ============================================================================
 * AND A SECOND BLINDNESS NO MARKER CAN EVER CLOSE
 * ============================================================================
 *
 * A string marker can only ever name a DEPENDENCY. Run the shared list over the
 * whole build of that day and 131 of the 154 chunks come back `unattributed`,
 * and every one of those 131 is OUR code, which carries no vendor identifier to
 * match. The fourth heaviest thing on the homepage was one of them.
 *
 * Next already knows: it writes one `page_client-reference-manifest.js` per app
 * route mapping a client module's SOURCE PATH to the chunks it needs. That is
 * the loader's own answer, not a heuristic, and it named 126 of the 154. The
 * reader lives in the shared module beside the markers.
 *
 * ============================================================================
 * WHAT THIS GUARD HOLDS, AND WHAT IT LEAVES TO THE GUARD THAT ALREADY HOLDS IT
 * ============================================================================
 *
 * `scripts/guards/initial-bundle-budget.mjs` already fails the build on a DEAD
 * marker, which is the markers' own failure mode, and this guard does not
 * repeat it. What nothing held is the two faults above:
 *
 * CONTRACT MODE (no build; registered in run-guards.mjs, blocking on prebuild):
 *   1. the cost table reads the shared library
 *   2. the cost table declares no private marker list of its own
 *   3. no two markers claim one feature name
 *   4. no marker matches the empty string, which would claim every chunk
 *
 * BUILT MODE (--built, run from postbuild against the real .next):
 *   5. every page_client-reference-manifest.js parses
 *   6. the manifests name at least 60% of the chunks in the build
 *
 * Clause 6 is a PERCENTAGE and not a count, and the floor is far below the
 * measurement on purpose. The failure worth a gate is not "one more chunk is
 * lazily imported", which is ordinary and which a count would fire on; it is
 * the derivation COLLAPSING because a framework version changed the manifest's
 * shape, while the table carries on printing confident rows. Measured on the
 * build of 21 September 2026: 126 of 154, which is 81.8%.
 *
 * Run standalone:  node scripts/guards/the-cost-table-can-name-what-it-measures.mjs
 *                  node scripts/guards/the-cost-table-can-name-what-it-measures.mjs --built
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { stripComments } from '../lib/js-source.mjs'
import {
  FEATURE_MARKERS,
  listClientReferenceManifests,
  nameChunk,
  parseClientReferenceManifest,
  readClientModuleChunks,
} from '../perf/lib/chunk-attribution.mjs'

const TAG = '[cost-table-can-name-what-it-measures]'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const LIBRARY = 'scripts/perf/lib/chunk-attribution.mjs'
const TABLE = 'scripts/perf/chunk-cost-table.mjs'

/* Measured 21 September 2026: 126 of 154 chunks named by a manifest, 81.8%. */
const MANIFEST_SHARE_FLOOR = 0.6

/** Clauses 1 to 4. Pure: the two sources in, findings out. */
export function judgeContract(markers, tableSource) {
  const findings = []
  const table = stripComments(tableSource)

  if (!table.includes('chunk-attribution.mjs')) {
    findings.push(
      `${TABLE} does not read ${LIBRARY}. Its \`serves\` column is the C8 work order, and the private copy it ` +
        'carried until 21 September 2026 had three dead markers in it while the shared list had none.',
    )
  }
  if (/const\s+FEATURE_MARKERS\s*=/.test(table)) {
    findings.push(
      `${TABLE} declares its own FEATURE_MARKERS. The list lives in ${LIBRARY}, once, because two copies of a ` +
        'reviewed list is two lists and only one of them stays reviewed.',
    )
  }

  if (!Array.isArray(markers) || markers.length === 0) {
    findings.push(`${LIBRARY} exports no markers, so every chunk a manifest cannot name falls through to unattributed.`)
    return findings
  }

  const seen = new Set()
  for (const marker of markers) {
    if (!(marker.test instanceof RegExp)) {
      findings.push(`the marker "${marker.feature ?? '(unnamed)'}" has no regular expression, so it can never name anything.`)
      continue
    }
    if (marker.test.test('')) {
      findings.push(
        `the marker "${marker.feature}" matches the EMPTY STRING, so it would claim every chunk in the build. ` +
          'A marker that names everything names nothing.',
      )
    }
    if (seen.has(marker.feature)) {
      findings.push(`two markers both claim the feature "${marker.feature}", so one of them can never be the answer.`)
    }
    seen.add(marker.feature)
  }

  return findings
}

/** Clauses 5 and 6, against a real build. Returns findings plus the numbers. */
export function judgeBuilt(nextDir) {
  const findings = []
  const chunkDir = join(nextDir, 'static', 'chunks')
  const manifests = listClientReferenceManifests(nextDir)

  if (manifests.length === 0 || !existsSync(chunkDir)) {
    return { findings, skipped: `no build on disk under ${relative(ROOT, nextDir) || nextDir}`, counts: null }
  }

  let unparsed = 0
  for (const file of manifests) {
    if (!parseClientReferenceManifest(readFileSync(file, 'utf8'))) {
      unparsed += 1
      findings.push(
        `${relative(ROOT, file).split(/[\\/]/).join('/')} did not parse. Next's client-reference manifest has ` +
          'changed shape, and the cost table has silently stopped deriving anything from the build.',
      )
    }
  }

  const byChunk = readClientModuleChunks(nextDir)
  const files = readdirSync(chunkDir).filter((f) => f.endsWith('.js'))
  const namedByManifest = files.filter((f) => byChunk.has(f)).length
  const share = files.length === 0 ? 0 : namedByManifest / files.length

  if (files.length === 0) {
    findings.push(`${relative(ROOT, chunkDir).split(/[\\/]/).join('/')} holds no chunk, which is not a build this table can read.`)
  } else if (share < MANIFEST_SHARE_FLOOR) {
    findings.push(
      `only ${namedByManifest} of ${files.length} chunk(s) are named by a client-reference manifest ` +
        `(${(share * 100).toFixed(1)}%, floor ${(MANIFEST_SHARE_FLOOR * 100).toFixed(0)}%, measured 81.8% on ` +
        '21 September 2026). The derivation has collapsed and the cost table is back to guessing.',
    )
  }

  const blind = []
  for (const file of files) {
    const body = readFileSync(join(chunkDir, file), 'utf8')
    if (nameChunk({ file, body, modules: byChunk.get(file) }).how === 'none') blind.push({ file, kb: body.length / 1024 })
  }

  return {
    findings,
    skipped: null,
    counts: { manifests: manifests.length, unparsed, namedByManifest, files: files.length, share, blind },
  }
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  /the-cost-table-can-name-what-it-measures\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))

if (invokedDirectly) {
  const failures = judgeContract(FEATURE_MARKERS, readFileSync(join(ROOT, TABLE), 'utf8'))
  console.log(`${TAG} ${FEATURE_MARKERS.length} reviewed marker(s) in ${LIBRARY}, and ${TABLE} reads that one list.`)

  if (process.argv.includes('--built')) {
    const { findings, skipped, counts } = judgeBuilt(join(ROOT, '.next'))
    failures.push(...findings)
    if (skipped) {
      console.log(`${TAG} BUILT MODE SKIPPED: ${skipped}. The contract clauses above still ran.`)
    } else {
      console.log(
        `${TAG} ${counts.manifests} client-reference manifest(s), ${counts.unparsed} unparsed; ` +
          `${counts.namedByManifest} of ${counts.files} chunk(s) named by one ` +
          `(${(counts.share * 100).toFixed(1)}%, floor ${(MANIFEST_SHARE_FLOOR * 100).toFixed(0)}%).`,
      )
      /*
       * REPORTED, NEVER FAILED, and not characterised beyond what was checked.
       * Most are reached only by a lazy `import()` inside a client component, so
       * no route manifest references them and no reviewed marker claims them
       * because they are ours. The largest is the legacy polyfill bundle, which
       * IS in every document and which no module-capable browser ever fetches;
       * `scripts/perf/lib/first-load.mjs` names it from build-manifest.json
       * rather than from its bytes, and this guard does not. Printed with their
       * sizes so the number stays visible, which is the treatment the admin
       * table drive gives its own unenforced clauses.
       */
      console.log(`${TAG} ${counts.blind.length} chunk(s) named by neither a manifest nor a marker, largest first:`)
      for (const chunk of counts.blind.sort((a, b) => b.kb - a.kb).slice(0, 8)) {
        console.log(`${TAG}   ${chunk.file}  ${chunk.kb.toFixed(1)} KB`)
      }
    }
  } else {
    console.log(`${TAG} contract mode: pass --built to judge a real .next, as postbuild does.`)
  }

  if (failures.length > 0) {
    console.error(`${TAG} FAIL - ${failures.length} problem(s):`)
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }
  console.log(`${TAG} PASS - the instrument that decides the C8 work order reads one list and the build's own answer.`)
}
