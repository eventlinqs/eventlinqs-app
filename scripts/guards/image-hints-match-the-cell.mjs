/**
 * THE `sizes` HINT A COMPONENT DECLARES IS THE WIDTH ITS CELL ACTUALLY IS
 * (close-out C8B.3, 18 September 2026).
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * `sizes` is a promise about layout that the markup makes to the browser before
 * any layout exists, and the browser believes it absolutely: it picks a srcset
 * candidate from the hint alone, at parse time. Nothing else in the toolchain
 * can notice when the promise stops being true. The markup stays well formed,
 * the types stay green, the image still renders, and the only symptom is a
 * bigger file than the page had room for, or a blurrier one than it needed.
 *
 * So the promise went stale and stayed stale. Driven on this tree's production
 * build at nine viewports (`C:\dev\EVIDENCE\C8B3-HINTS\before-sweep.txt`), THREE
 * hints were serving THIRTEEN layouts:
 *
 *     homepage 1440   278px slot   hint asked for 475   browser fetched 1080w
 *     homepage 1920   278px slot   hint asked for 634   browser fetched 1920w
 *     homepage 1440   338px slot   hint asked for 288   browser fetched  640w
 *                                  and 644 were needed, so the tile was BLURRY
 *     dashboard        56px slot   hint asked for 256   browser fetched  640w
 *
 * ============================================================================
 * WHAT IT CHECKS, AND WHY EACH CLAUSE IS HERE RATHER THAN IN A TEST
 * ============================================================================
 *
 * A unit test proves the rule holds for the values it was written with. These
 * clauses have to hold for values nobody has written yet, which is what a build
 * gate is for.
 *
 *   1. EVERY RAIL CELL SAYS THE SAME TWO NUMBERS TWICE. `src/lib/ui/rhythm.ts`
 *      declares each cell as a Tailwind class string AND a `{ base, sm }` pair,
 *      because neither can be generated from the other: Tailwind's scanner only
 *      keeps class names it can see as literals, and a browser needs the numbers
 *      in an attribute. This clause parses `w-[Npx]` and `sm:w-[Mpx]` out of the
 *      class and fails if they disagree with the pair.
 *
 *   2. EVERY RAIL HINT IS DERIVED FROM ITS CELL. `RAIL_CELL_HINTS` in
 *      `src/components/media/sizes.ts` pairs a hint key with a cell, and the
 *      hint literal must equal `railCellHint(cell)`. Widen a cell, forget the
 *      hint, and the build stops naming both lines.
 *
 *   3. NO CELL WIDTH IS WRITTEN ANYWHERE ELSE. A `w-[Npx] shrink-0 snap-start`
 *      outside `rhythm.ts` is a twelfth cell that no hint knows about, which is
 *      exactly how the platform reached thirteen layouts on three hints. It is
 *      caught at the moment somebody types it rather than at the next audit.
 *
 *   4. NO FEATURE CODE DECLARES A RAW `sizes` STRING. `docs/MEDIA-ARCHITECTURE.md`
 *      already forbade it in prose and two files did it anyway, both heroes, both
 *      with a different hint from the shared one. Prose does not run.
 *
 *   5. NO HINT IS DEAD AND NO VARIANT IS UNMAPPED. A `MEDIA_SIZES` key nothing
 *      reads is a hint somebody will reuse by name without checking what it
 *      describes, and a variant with no entry in the lookup is a runtime
 *      `undefined` that renders a full candidate list.
 *
 * ============================================================================
 * WHAT THIS GUARD CANNOT SEE, STATED SO IT IS NOT MISTAKEN FOR COVERAGE
 * ============================================================================
 *
 * It cannot check a GRID hint. A grid's rendered width comes from the column
 * count, the gaps, the page padding and the container cap, resolved by a browser
 * at a viewport, and deriving that statically would mean reimplementing CSS in a
 * guard and then trusting the reimplementation. Grid hints are proved by
 * `scripts/verify/image-hint-fidelity-drive.mjs`, which drives nine viewports and
 * fails on any under-fetch. This guard holds the half that is decidable from
 * source; the drive holds the half that is not.
 *
 * Exit 1 with every offending line, or exit 0 with the counts checked.
 * Drilled red and green in scripts/verify/guard-failure-drills.mjs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const RHYTHM = 'src/lib/ui/rhythm.ts'
const SIZES = 'src/components/media/sizes.ts'
/*
 * The cell-to-hint pairing lives in its own file rather than in sizes.ts, and
 * the reason is a measurement: putting it in sizes.ts gave the most widely
 * imported module in the media layer an import of the rhythm module and cost
 * 49,014 bytes of gzip across 61 routes. See that file's header.
 */
const PAIRS = 'src/components/media/rail-cell-hints.ts'
const BARREL = 'src/components/media/index.ts'
const MEDIA_DIR = 'src/components/media/'

const failures = []
function fail(where, message) {
  failures.push(`${where}\n    ${message}`)
}

/**
 * Read a file, or say out loud that it could not be read. The silent version of
 * this was written first and `no-silent-catch` was right to refuse it: a guard
 * whose reads fail quietly reports PASS about a tree it never opened, which is
 * the one failure mode a gate must not have.
 */
function read(rel, expectedToExist = true) {
  try {
    return readFileSync(join(ROOT, rel), 'utf8')
  } catch (err) {
    if (!expectedToExist) return null
    console.error(
      `image-hints-match-the-cell: could not read ${rel}: ${err instanceof Error ? err.message : String(err)}`,
    )
    return null
  }
}

/** Every .ts/.tsx under src/, as repo-relative POSIX paths. */
function sourceFiles(dir = SRC, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(relative(ROOT, full).split(sep).join('/'))
  }
  return out
}

/*
 * Comments are stripped before any clause reads a file. The first version of a
 * sibling guard matched its own subject inside a doc comment and PASSED its
 * first drill when it should have failed (close-out C8B.1, clause 5). Every
 * clause below reads code.
 */
function stripComments(code) {
  /* Comment bodies are replaced with their own newlines rather than deleted, so
     every line number this guard reports is the line number in the file the
     reader will open. A guard that names the wrong line is a guard somebody
     stops believing. */
  return code
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, '$1')
}

const rhythmRaw = read(RHYTHM)
const sizesRaw = read(SIZES)
const pairsRaw = read(PAIRS)
if (rhythmRaw === null) fail(RHYTHM, 'the cell geometry file is missing; this guard has nothing to compare')
if (sizesRaw === null) fail(SIZES, 'the hint table is missing; this guard has nothing to compare')
if (pairsRaw === null) fail(PAIRS, 'the cell-to-hint pairing is missing; clause 2 would check nothing')

/*
 * sizes.ts is a LEAF and stays one. It is reached by every card, tile and avatar
 * on the platform, so anything it imports, everything imports: one import edge
 * added here cost 49,014 bytes of gzip across 61 routes before it was measured
 * and moved out.
 */
if (sizesRaw !== null && /^\s*import\s/m.test(stripComments(sizesRaw))) {
  fail(
    SIZES,
    'sizes.ts has gained an import. It is the most widely reached module in the media layer, so ' +
      'whatever it imports reaches every route that renders any image. Keep the finished strings ' +
      'here and put anything that needs another module beside rail-cell-hints.ts.',
  )
}

let cellsChecked = 0
let hintsChecked = 0
let hintsInTable = 0
let variantsChecked = 0
let filesScanned = 0

if (rhythmRaw !== null && sizesRaw !== null && pairsRaw !== null) {
  const rhythm = stripComments(rhythmRaw)
  const sizes = stripComments(sizesRaw)
  const pairsSource = stripComments(pairsRaw)

  /* ---------------- clause 1: the class string and the pair agree ---------- */

  /** name -> the Tailwind class literal */
  const cellClass = new Map()
  for (const m of rhythm.matchAll(/export const (\w+_CELL) = '([^']*)' as const/g)) {
    cellClass.set(m[1], m[2])
  }
  /** name -> { cell, base, sm } */
  const cellPx = new Map()
  for (const m of rhythm.matchAll(
    /export const (\w+_PX) = \{ cell: (\w+), base: (\d+), sm: (\d+) \}/g,
  )) {
    cellPx.set(m[1], { cell: m[2], base: Number(m[3]), sm: Number(m[4]) })
  }

  if (cellPx.size === 0) {
    fail(RHYTHM, 'no `*_PX` cell declarations were found at all, so clauses 1 and 2 would pass vacuously')
  }

  for (const [pxName, px] of cellPx) {
    const klass = cellClass.get(px.cell)
    if (klass === undefined) {
      fail(RHYTHM, `${pxName} names the cell ${px.cell}, and no such class constant is declared`)
      continue
    }
    /*
     * `w-[Npx]` must not match `min-w-[Npx]` or `max-w-[Npx]`, so the base width
     * is required to start the class or follow whitespace.
     */
    const base = /(?:^|\s)w-\[(\d+)px\]/.exec(klass)
    const sm = /(?:^|\s)sm:w-\[(\d+)px\]/.exec(klass)
    if (!base) {
      fail(RHYTHM, `${px.cell} declares no base width: expected a \`w-[Npx]\` in "${klass}"`)
      continue
    }
    const declaredBase = Number(base[1])
    const declaredSm = sm ? Number(sm[1]) : declaredBase
    if (declaredBase !== px.base || declaredSm !== px.sm) {
      fail(
        RHYTHM,
        `${px.cell} renders at ${declaredBase}/${declaredSm} and ${pxName} says ${px.base}/${px.sm}. ` +
          'The class string is what a browser lays out with and the pair is what it downloads with; ' +
          'they must be the same two numbers.',
      )
    }
    cellsChecked += 1
  }

  /* ---------------- clause 2: each rail hint is derived from its cell ------- */

  /** The MEDIA_SIZES object literal, bounded so a later object cannot leak in. */
  const tableStart = sizes.indexOf('export const MEDIA_SIZES = {')
  const tableEnd = sizes.indexOf('\n} as const', tableStart)
  if (tableStart === -1 || tableEnd === -1) {
    fail(SIZES, 'the MEDIA_SIZES object literal could not be located, so no hint can be checked')
  }
  const table = tableStart === -1 ? '' : sizes.slice(tableStart, tableEnd)
  /** key -> literal */
  const hint = new Map()
  for (const m of table.matchAll(/^\s{2}'?([A-Za-z][\w-]*)'?:\s*$|^\s{2}'?([A-Za-z][\w-]*)'?:\s*'([^']*)',/gm)) {
    if (m[3] !== undefined) hint.set(m[2], m[3])
  }
  /* A hint whose literal wrapped onto its own line. */
  for (const m of table.matchAll(/^\s{2}'?([A-Za-z][\w-]*)'?:\s*\n\s*'([^']*)',/gm)) {
    hint.set(m[1], m[2])
  }

  hintsInTable = hint.size
  if (hint.size === 0) {
    fail(SIZES, 'no hints were parsed out of MEDIA_SIZES, so clause 2 would pass vacuously')
  }

  const pairs = [...pairsSource.matchAll(/\{ key: '(\w+)', px: (\w+), name: '(\w+)' \}/g)]
  if (pairs.length === 0) {
    fail(PAIRS, 'RAIL_CELL_HINTS is empty or unparseable, so no rail hint would ever be checked')
  }
  for (const [, key, pxRef, pxName] of pairs) {
    if (pxRef !== pxName) {
      fail(PAIRS, `RAIL_CELL_HINTS entry '${key}' imports ${pxRef} but labels it ${pxName}`)
    }
    const px = cellPx.get(pxRef)
    if (!px) {
      fail(PAIRS, `RAIL_CELL_HINTS entry '${key}' names ${pxRef}, which ${RHYTHM} does not declare`)
      continue
    }
    const declared = hint.get(key)
    if (declared === undefined) {
      fail(PAIRS, `RAIL_CELL_HINTS names the hint '${key}', and MEDIA_SIZES has no such key`)
      continue
    }
    /* The same rule the runtime uses, restated here so the guard does not have to
       import TypeScript: one number when the cell does not step at `sm`. */
    const expected =
      px.base === px.sm ? `${px.base}px` : `(min-width: 640px) ${px.sm}px, ${px.base}px`
    if (declared !== expected) {
      fail(
        SIZES,
        `MEDIA_SIZES.${key} is "${declared}" and the cell ${pxRef} (${px.base}/${px.sm}) requires ` +
          `"${expected}". A hint that is SMALLER than its cell renders blurry on a 2x screen, ` +
          'which is the worse of the two ways to be wrong.',
      )
    }
    hintsChecked += 1
  }

  /* ---------------- clause 5: no dead hint, no unmapped variant ------------- */

  const files = sourceFiles()
  const allCode = files
    .filter(f => f !== SIZES)
    .map(f => stripComments(read(f) ?? ''))
    .join('\n')
  for (const key of hint.keys()) {
    if (!allCode.includes(`MEDIA_SIZES.${key}`)) {
      fail(
        SIZES,
        `MEDIA_SIZES.${key} is declared and nothing reads it. A hint nobody uses is one somebody ` +
          'reuses by name later without checking what layout it describes.',
      )
    }
  }

  const mediaRaw = read('src/components/media/EventCardMedia.tsx')
  if (mediaRaw === null) {
    fail('src/components/media/EventCardMedia.tsx', 'the variant component is missing')
  } else {
    const media = stripComments(mediaRaw)
    const unionStart = media.indexOf('export type EventCardMediaVariant')
    const unionEnd = media.indexOf('interface Props', unionStart)
    const union = unionStart === -1 ? '' : media.slice(unionStart, unionEnd)
    const variants = [...union.matchAll(/\|\s*'([\w-]+)'/g)].map(m => m[1])
    if (variants.length === 0) {
      fail('src/components/media/EventCardMedia.tsx', 'no variants were parsed, so clause 5 would pass vacuously')
    }
    const lookupStart = media.indexOf('const SIZES_BY_VARIANT')
    const lookup = lookupStart === -1 ? '' : media.slice(lookupStart, media.indexOf('\n}', lookupStart))
    variantsChecked = variants.length
    for (const v of variants) {
      const mapped = new RegExp(`(?:^|\\s)'?${v}'?:\\s*MEDIA_SIZES\\.`, 'm').test(lookup)
      if (!mapped) {
        fail(
          'src/components/media/EventCardMedia.tsx',
          `the variant '${v}' has no entry in SIZES_BY_VARIANT, so it renders sizes={undefined} and ` +
            'next/image emits every candidate width it has',
        )
      }
    }
  }

  /* ---------------- clause 6: the media layer has no barrel --------------- */

  /*
   * A barrel re-exports every surface, and a bundler that cannot prove a module
   * is side-effect free keeps all of them. `src/components/media/index.ts`
   * existed until 18 September 2026 and one import of `OrganiserAvatar` in the
   * dashboard topbar, or of `HeroMedia` in the auth shell, carried the WHOLE
   * media library into the first load: 63 of 133 routes were shipping
   * EventCardMedia and this hint table, including /login and /forgot-password,
   * which render no cards at all. Removing it and importing each surface from
   * its own module moved 133 routes by -74,193 bytes gzip in aggregate.
   *
   * So the barrel does not come back quietly.
   */
  if (read(BARREL, false) !== null) {
    fail(
      BARREL,
      'the media layer has a barrel again. Every surface it re-exports lands in the first load of ' +
        'every route that imports ANY of them, because the bundler cannot prove the rest are ' +
        'unused. Import each surface from its own module instead.',
    )
  }
  for (const file of files) {
    const code = stripComments(read(file) ?? '')
    if (/from '@\/components\/media'/.test(code)) {
      fail(file, "imports from the media barrel, which does not exist. Import the surface's own module.")
    }
  }

  /* ---------------- clauses 3 and 4: nothing declares its own ------------- */

  for (const file of files) {
    if (file === RHYTHM) continue
    const code = stripComments(read(file) ?? '')
    filesScanned += 1

    /*
     * The width may OPEN the class string, so a quote counts as a boundary as
     * well as whitespace. The first version required whitespace and its own
     * drill DID NOT FAIL: `className="w-[152px] shrink-0 snap-start"` walked
     * straight past a guard written to catch exactly that. A leading hyphen is
     * still excluded, which is what keeps `min-w-[200px]` and `max-w-[240px]` out.
     */
    const cell = /(?:^|[\s"'`])w-\[\d+px\][^'"`]*shrink-0[^'"`]*snap-start/.exec(code)
    if (cell) {
      const line = code.slice(0, cell.index).split('\n').length
      fail(
        `${file}:${line}`,
        'a rail cell width is written here rather than imported from src/lib/ui/rhythm.ts. ' +
          'A cell that is not in that file has no `sizes` hint tied to it, which is how the ' +
          'platform reached thirteen layouts sharing three hints.',
      )
    }

    if (file.startsWith(MEDIA_DIR)) continue
    const raw = /(?:^|\s)sizes=(?:"[^"]*"|\{\s*'[^']*'\s*\}|\{\s*`[^`]*`\s*\})/.exec(code)
    if (raw) {
      const line = code.slice(0, raw.index).split('\n').length
      fail(
        `${file}:${line}`,
        `a raw sizes string (${raw[0].trim()}) is declared outside src/components/media/. ` +
          'Feature code picks a variant; only the media layer names a hint.',
      )
    }
  }
}

declareWork('image-hints-match-the-cell', {
  did: {
    'rail cell compared with its pixel pair': cellsChecked,
    'rail hint derived from a cell': hintsChecked,
    'hint read out of MEDIA_SIZES': hintsInTable,
    'media variant checked for a hint': variantsChecked,
    'source file swept for a stray cell or a raw sizes string': filesScanned,
  },
  found: { 'hint that does not match its layout': failures.length },
})

if (failures.length) {
  console.error('image-hints-match-the-cell: FAIL')
  for (const f of failures) console.error(`  ${f}`)
  console.error('')
  console.error('  A hint may be LARGER than its slot and never smaller: over-fetching costs bytes')
  console.error('  and is measured, under-fetching costs sharpness and is a defect.')
  process.exit(1)
}

console.log(
  `image-hints-match-the-cell: PASS - ${cellsChecked} rail cells agree with their pixel pairs, ` +
    `${hintsChecked} rail hints are derived from a cell, no cell width or raw sizes string is ` +
    'declared outside its own file, no hint is dead and every variant is mapped.',
)
