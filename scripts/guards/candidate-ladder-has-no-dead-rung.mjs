/**
 * EVERY WIDTH THE CONFIG OFFERS IS A WIDTH SOME SLOT CAN ASK FOR
 * (close-out C8 EXECUTION METHOD, clause C8B.3, 19 September 2026).
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * `images.deviceSizes` and `images.imageSizes` in `next.config.ts` read like
 * settings and behave like a claim. Every width in them is emitted into the
 * `srcset` of every fixed-width image on the page, so the list is paid once per
 * image, in the document, before anything is painted.
 *
 * MEASURED on this tree's production build, 19 September 2026, across the
 * fifteen pinned gate routes (`C:\dev\EVIDENCE\C8B3-CANDIDATES\before.json`):
 *
 *     homepage        1,039,112 B of HTML, of which 316,996 B (30.5%) is
 *                     candidate URLs: 1,404 of them across 124 images
 *     one candidate   242 B, of which 201 B (83.1%) is the percent-encoded
 *                     storage URL, repeated identically twelve times per image
 *
 * THE CLAIM HAD ALREADY GONE STALE, and that is the whole reason for a gate
 * rather than a one-off edit. The comment above those two arrays said the fixed
 * sizes in use were "16, 32, 192, 256, 288, 320 and 512". On 18 September the
 * `sizes` rework replaced three shared hints with twenty-two derived ones and
 * moved the smallest fixed slot to 24 CSS pixels. Every number in that sentence
 * became wrong at once, nothing could notice, and 16 went on being emitted 142
 * times across the pinned routes for a slot that no longer existed.
 *
 * Next.js removed 16 from its OWN default in version 16 for the same reason:
 * "very few projects ever serve 16 pixels width images ... Removing this
 * setting reduces the size of the srcset attribute shipped to the browser"
 * (node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md).
 *
 * ============================================================================
 * WHAT IT CHECKS
 * ============================================================================
 *
 *   1. NO DEAD RUNG. A width is dead when no fixed slot on the platform selects
 *      it at a device pixel ratio of 1 or 2, AND it sits below the floor under
 *      which a viewport-relative hint cannot emit it at all. Both halves are
 *      derived: the slots out of `rhythm.ts` and `MEDIA_SIZES`, the floor out of
 *      the framework's own filter. A rung that fails both is one no browser on
 *      any viewport can request, and it is charged to every fixed-width image.
 *
 *   2. NO SLOT ABOVE THE LADDER. A slot needing more at the contract ratio than
 *      the top rung can give is an under-fetch that NO hint can fix, because the
 *      width simply is not offered. This is the failure that would otherwise be
 *      diagnosed as a wrong hint and "fixed" by editing the hint, forever.
 *
 *   3. NO VACUOUS PASS. The ladder, the cells and the hint table are each
 *      required to parse and to be non-empty, and the hint table is required to
 *      carry at least one `vw` term. Without one, clause 1's floor does not
 *      exist, every image on the platform emits the whole ladder, and a guard
 *      that reported PASS on that would be reporting on nothing.
 *
 * ============================================================================
 * WHAT THIS GUARD CANNOT SEE
 * ============================================================================
 *
 * It cannot judge a viewport-relative slot's WIDTH. That needs a browser at a
 * viewport, and `scripts/verify/image-hint-fidelity-drive.mjs` is where it is
 * judged: nine viewports, failing on any under-fetch. The one thing this guard
 * claims about a vw hint is the framework's emission floor, which is arithmetic
 * rather than layout.
 *
 * It also cannot see the candidate COUNT in a served document. That is measured
 * by `scripts/perf/srcset-weight.mjs` against a running build.
 *
 * Exit 1 naming the rung and the arithmetic, or exit 0 with the counts checked.
 * Drilled red and green in scripts/verify/guard-failure-drills.mjs.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import {
  CONTRACT_DPR,
  judge,
  parseCellPx,
  parseHints,
  readLadder,
  rungFor,
} from './lib/candidate-ladder.mjs'

const ROOT = process.cwd()
const CONFIG = 'next.config.ts'
const RHYTHM = 'src/lib/ui/rhythm.ts'
const SIZES = 'src/components/media/sizes.ts'

const failures = []
function fail(where, message) {
  failures.push(`${where}: ${message}`)
}

function read(rel) {
  try {
    return readFileSync(join(ROOT, rel), 'utf8')
  } catch (error) {
    /* Named rather than swallowed: a missing file here is the difference
       between "no offences" and "nothing was looked at", and the caller turns
       the null into a failure rather than a pass. */
    console.warn(
      `[candidate-ladder] could not read ${rel}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

/*
 * Comments are stripped before anything is parsed. Both of these files carry
 * long doc comments full of the very numbers being matched, and a guard that
 * matches inside prose passes its first drill when it should fail: that exact
 * mistake is on the record in close-out C8B.1, clause 5.
 */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')
}

const configRaw = read(CONFIG)
const rhythmRaw = read(RHYTHM)
const sizesRaw = read(SIZES)

if (configRaw === null) fail(CONFIG, 'the image configuration is missing; there is no ladder to judge')
if (rhythmRaw === null) fail(RHYTHM, 'the cell geometry file is missing; the slots cannot be derived')
if (sizesRaw === null) fail(SIZES, 'the hint table is missing; the slots cannot be derived')

let rungsChecked = 0
let slotsChecked = 0
let deadRungs = 0
let uncoveredSlots = 0

if (configRaw !== null && rhythmRaw !== null && sizesRaw !== null) {
  const config = readLadder(stripComments(configRaw))
  const cellPx = parseCellPx(stripComments(rhythmRaw))
  const hints = parseHints(stripComments(sizesRaw))

  /* ---------------- clause 3: refuse a vacuous pass ----------------------- */

  if (config === null) {
    fail(
      CONFIG,
      'deviceSizes and imageSizes could not both be read as number lists. Every clause below ' +
        'would pass on an empty ladder, which is worse than no guard at all.',
    )
  }
  if (cellPx.size === 0) {
    fail(RHYTHM, 'no `*_PX` cell declarations were found, so the rail slots would be missing entirely')
  }
  if (hints === null) {
    fail(SIZES, 'the MEDIA_SIZES object literal could not be located, so no slot could be derived from it')
  } else if (hints.size === 0) {
    fail(SIZES, 'MEDIA_SIZES parsed as empty, so every clause below would pass vacuously')
  }

  if (config !== null && cellPx.size > 0 && hints !== null && hints.size > 0) {
    const verdict = judge({
      ladder: config.ladder,
      deviceSizes: config.deviceSizes,
      cellPx,
      hints,
    })

    if (verdict.ratio === null) {
      fail(
        SIZES,
        'not one hint in MEDIA_SIZES carries a `vw` term. next/image emits the ENTIRE width list ' +
          'for a hint with no viewport-relative term, so every image on the platform would ship ' +
          `all ${config.ladder.length} candidate URLs, and clause 1 would have no floor to judge against.`,
      )
    }

    /* ---------------- clause 1: no dead rung -------------------------------- */

    rungsChecked = config.ladder.length
    deadRungs = verdict.dead.length
    for (const rung of verdict.dead) {
      fail(
        CONFIG,
        `the width ${rung} is offered and nothing can select it. The smallest fixed slot on the ` +
          `platform is ${Math.min(...verdict.slots.map(s => s.px))} CSS pixels, so the smallest ` +
          `rung any image can reach is ${rungFor(config.ladder, Math.min(...verdict.slots.map(s => s.px)))}; ` +
          `and next/image will not emit a rung below ${Math.round(verdict.emissionFloor)} for any ` +
          `hint carrying a \`vw\` term (deviceSizes[0] ${config.deviceSizes[0]} x the smallest ratio ` +
          `${verdict.ratio}). It is still written into the srcset of every fixed-width image, at ` +
          'about 230 bytes each. Remove it from imageSizes, or declare the slot that needs it.',
      )
    }

    /* ---------------- clause 2: no slot above the ladder -------------------- */

    slotsChecked = verdict.slots.length
    uncoveredSlots = verdict.uncovered.length
    for (const slot of verdict.uncovered) {
      fail(
        CONFIG,
        `${slot.where} renders at ${slot.px} CSS pixels and needs ${slot.px * CONTRACT_DPR} at the ` +
          `contract ratio of ${CONTRACT_DPR}x, and the widest width offered is ${verdict.top}. ` +
          'No `sizes` hint can fix this: the width is not on offer, so the browser takes the ' +
          'largest there is and the tile renders soft. Raise the top of deviceSizes, or narrow ' +
          'the slot.',
      )
    }
  }
}

/*
 * The counts are declared BEFORE the verdict, and they are the reason a missing
 * file above is a failure rather than a quiet zero: a guard that parsed nothing
 * would otherwise print no offences and exit 0, which is the shape of a gate
 * that has silently stopped looking.
 */
declareWork('candidate-ladder', {
  did: { 'configured width': rungsChecked, 'fixed slot': slotsChecked },
  found: { 'dead rung': deadRungs, 'uncovered slot': uncoveredSlots },
  exitOnZero: false,
})

if (failures.length > 0) {
  console.error('[candidate-ladder] FAIL')
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}

if (rungsChecked === 0 || slotsChecked === 0) {
  console.error('[candidate-ladder] FAIL: nothing was judged, so this is not a pass.')
  process.exit(1)
}

console.log(
  `[candidate-ladder] OK: ${rungsChecked} configured widths, ` +
    `${slotsChecked} declared fixed slots, every rung reachable and every slot covered at ${CONTRACT_DPR}x`,
)
