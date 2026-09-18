/**
 * THE CONFIGURED WIDTH LADDER, AND THE SLOTS THAT HAVE TO CLIMB IT.
 *
 * ============================================================================
 * WHAT THIS DERIVES AND WHY IT IS A DERIVATION RATHER THAN A LIST
 * ============================================================================
 *
 * `images.deviceSizes` and `images.imageSizes` in `next.config.ts` are not
 * settings. They are a CLAIM about the widths this platform's layouts can ask
 * for, and every one of them is emitted into the `srcset` of every image that
 * can reach it. On the homepage that is 1,404 candidate URLs at about 230 bytes
 * each, so a rung nobody can select is not free: it is paid once per image, in
 * the document, on a mobile CPU Lighthouse throttles by four.
 *
 * The claim goes stale silently, because the slots live in three other files.
 * On 18 September 2026 the `sizes` rework replaced three shared hints with
 * twenty-two derived ones and moved the smallest fixed slot from 16 CSS pixels
 * to 24. Nothing in the toolchain could notice, and the ladder's own comment
 * went on naming 16 as a size in use for another day.
 *
 * So the rungs are not compared against a list somebody maintains. They are
 * compared against the slots the platform actually declares, re-derived from
 * source on every build.
 *
 * ============================================================================
 * THE SELECTION RULE, READ OUT OF THE FRAMEWORK RATHER THAN REMEMBERED
 * ============================================================================
 *
 * `getWidths` in `node_modules/next/dist/shared/lib/get-img-props.js` (Next
 * 16.3.0) decides what is emitted:
 *
 *     if (sizes) {
 *       ...collect every `Nvw` in the hint into percentSizes...
 *       if (percentSizes.length) {
 *         const smallestRatio = Math.min(...percentSizes) * 0.01
 *         return { widths: allSizes.filter(s => s >= deviceSizes[0] * smallestRatio), kind: 'w' }
 *       }
 *       return { widths: allSizes, kind: 'w' }      // a hint with no vw term
 *     }
 *
 * Two consequences this module depends on, both of them in that branch:
 *
 *   1. A hint expressed only in CSS pixels emits EVERY rung, unfiltered. That
 *      is where the whole cost lands, and it is why a dead rung is paid by the
 *      fixed-width images rather than by the responsive ones.
 *   2. A hint carrying a `vw` term can never emit a rung below
 *      `deviceSizes[0] * smallestRatio`. So a rung under that floor is
 *      reachable ONLY through a fixed-pixel slot, which makes "is it dead"
 *      decidable from source instead of a guess about viewports.
 *
 * And the browser's own rule, which is the other half: for `w` descriptors it
 * picks the SMALLEST candidate at least as wide as the slot times the device
 * pixel ratio, falling back to the largest when none is big enough.
 *
 * ============================================================================
 * WHAT THIS CANNOT SEE, STATED SO IT IS NOT MISTAKEN FOR COVERAGE
 * ============================================================================
 *
 * It does not model a VIEWPORT-RELATIVE slot's width. A `33vw` slot is a
 * different number of pixels at every viewport, and resolving it means
 * reimplementing CSS in a build script and then trusting the reimplementation.
 * `scripts/verify/image-hint-fidelity-drive.mjs` drives nine real viewports and
 * fails on any under-fetch; that is where a grid's rendered width is judged.
 *
 * What this module claims about a vw hint is only the ONE thing the framework
 * makes decidable: the floor below which it emits nothing. Everything else here
 * is about fixed-pixel slots, which are exact.
 */

/** The device pixel ratio the platform contracts at. */
export const CONTRACT_DPR = 2

/**
 * The widths a browser is offered, in ascending order: Next concatenates the
 * two lists and sorts them.
 */
export function ladderFrom({ deviceSizes, imageSizes }) {
  return [...new Set([...deviceSizes, ...imageSizes])].sort((a, b) => a - b)
}

/** What a browser picks for `need` physical pixels: the first rung at or above it. */
export function rungFor(ladder, need) {
  return ladder.find(w => w >= need) ?? ladder[ladder.length - 1]
}

/**
 * `images: { deviceSizes: [...], imageSizes: [...] }` read out of next.config.ts
 * as TEXT. The config is TypeScript with a `satisfies` clause and importing it
 * from a build script would mean compiling it; the two arrays are literals and
 * reading them is exact.
 *
 * Returns null for a list that is absent or unparseable, so the caller can fail
 * loudly rather than proceed with an empty ladder that passes everything.
 */
export function readLadder(configSource) {
  const list = name => {
    const m = new RegExp(`^\\s*${name}:\\s*\\[([^\\]]*)\\]`, 'm').exec(configSource)
    if (!m) return null
    const nums = m[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number)
    return nums.some(Number.isNaN) ? null : nums
  }
  const deviceSizes = list('deviceSizes')
  const imageSizes = list('imageSizes')
  if (!deviceSizes || !imageSizes || deviceSizes.length === 0 || imageSizes.length === 0) {
    return null
  }
  return { deviceSizes, imageSizes, ladder: ladderFrom({ deviceSizes, imageSizes }) }
}

/**
 * Every FIXED slot the platform declares, with where it was declared so a
 * failure names a line somebody can open.
 *
 *   - a rail cell contributes both of its widths, because it renders at `base`
 *     below 640 CSS pixels and at `sm` above it and a browser meets both
 *   - a hint contributes every `Npx` term in it, which covers the avatars, the
 *     list thumbnail, the flat rail cell and the CAPPED term every grid hint
 *     ends with
 *
 * @param {Map<string, {base:number, sm:number}>} cellPx parsed from rhythm.ts
 * @param {Map<string, string>} hints parsed from MEDIA_SIZES
 */
export function fixedSlots(cellPx, hints) {
  /** @type {{ px:number, where:string }[]} */
  const slots = []
  for (const [name, px] of cellPx) {
    slots.push({ px: px.base, where: `${name}.base` })
    if (px.sm !== px.base) slots.push({ px: px.sm, where: `${name}.sm` })
  }
  for (const [key, literal] of hints) {
    for (const m of lengthTerms(literal).matchAll(/(\d+)px/g)) {
      slots.push({ px: Number(m[1]), where: `MEDIA_SIZES.${key}` })
    }
  }
  return slots
}

/**
 * A `sizes` entry is a media CONDITION followed by a LENGTH, and only the
 * length is a slot. Every condition in this grammar is parenthesised, so
 * removing the parenthesised groups leaves exactly the lengths.
 *
 * THIS IS NOT A TIDY-UP. Without it, `(max-width: 639px) 100vw, 320px` declares
 * THREE slots: 639, 1023 and 320. The two breakpoints then "select" rungs that
 * nothing renders at, and the dead-rung verdict goes quiet in the permissive
 * direction, which is the only direction that matters for a gate. On the real
 * table it invented 767, 1023, 1279 and 1399 as slots and made 828 look alive.
 * Caught by tests/unit/media/candidate-ladder.test.ts, not by reading it.
 */
function lengthTerms(sizes) {
  return sizes.replace(/\([^)]*\)/g, ' ')
}

/**
 * The smallest `vw` ratio declared anywhere in the hint table, as a fraction.
 * Returns null when no hint carries one, which is itself worth failing on: it
 * would mean every image on the platform emits the whole ladder.
 */
export function smallestVwRatio(hints) {
  let smallest = null
  for (const literal of hints.values()) {
    /* Conditions removed for the same reason as above: a `vw` cannot appear in
       one in this grammar, and reading only the lengths keeps the two halves of
       this module looking at the same thing. */
    for (const m of lengthTerms(literal).matchAll(/(^|\s)(1?\d?\d)vw/g)) {
      const ratio = Number(m[2]) * 0.01
      if (smallest === null || ratio < smallest) smallest = ratio
    }
  }
  return smallest
}

/**
 * The verdict on every rung, and on every slot.
 *
 * A rung is REACHABLE when some fixed slot selects it at a device pixel ratio
 * of 1 or `CONTRACT_DPR`, or when a viewport-relative hint could emit it at all
 * (that is, when it sits at or above the emission floor, where this module
 * stops claiming and the drive takes over).
 *
 * A slot is UNCOVERED when the top of the ladder is below what it needs at the
 * contract ratio, which is an under-fetch caused by the ladder rather than by
 * the hint, and no hint change can fix it.
 */
export function judge({ ladder, deviceSizes, cellPx, hints }) {
  const slots = fixedSlots(cellPx, hints)
  const ratio = smallestVwRatio(hints)
  const emissionFloor = ratio === null ? null : deviceSizes[0] * ratio
  const top = ladder[ladder.length - 1]

  /** rung -> the first slot that selects it, or null */
  const selectedBy = new Map(ladder.map(w => [w, null]))
  for (const slot of slots) {
    for (const dpr of [1, CONTRACT_DPR]) {
      const rung = rungFor(ladder, slot.px * dpr)
      if (selectedBy.get(rung) === null) {
        selectedBy.set(rung, { ...slot, dpr })
      }
    }
  }

  const dead = ladder
    .filter(w => selectedBy.get(w) === null)
    .filter(w => emissionFloor !== null && w < emissionFloor)

  const uncovered = slots.filter(s => s.px * CONTRACT_DPR > top)

  return { slots, ratio, emissionFloor, top, selectedBy, dead, uncovered }
}

/* ==========================================================================
 * THE TWO PARSERS, HERE RATHER THAN IN EACH GUARD
 * ==========================================================================
 *
 * `image-hints-match-the-cell.mjs` and `candidate-ladder-has-no-dead-rung.mjs`
 * both have to read the same two files, and two guards with private copies of
 * one parsing rule is the drift this whole family exists to stop. Both take
 * source that has ALREADY had its comments stripped: a doc comment naming a
 * width is prose, and a guard that matches inside one passes its first drill
 * when it should fail (close-out C8B.1, clause 5).
 */

/** `EVENT_CARD_PX = { cell: EVENT_CARD_CELL, base: 240, sm: 280 }` -> the pair. */
export function parseCellPx(rhythmStripped) {
  const cellPx = new Map()
  for (const m of rhythmStripped.matchAll(
    /export const (\w+_PX) = \{ cell: (\w+), base: (\d+), sm: (\d+) \}/g,
  )) {
    cellPx.set(m[1], { cell: m[2], base: Number(m[3]), sm: Number(m[4]) })
  }
  return cellPx
}

/**
 * The MEDIA_SIZES object literal -> key to hint literal. Bounded at the closing
 * `} as const` so a later object in the same file cannot leak in, and it reads
 * a literal that wrapped onto its own line as well as one that did not.
 *
 * Returns null when the literal cannot be located at all, which the caller must
 * fail on rather than treat as an empty table.
 */
export function parseHints(sizesStripped) {
  const start = sizesStripped.indexOf('export const MEDIA_SIZES = {')
  const end = sizesStripped.indexOf('\n} as const', start)
  if (start === -1 || end === -1) return null
  const table = sizesStripped.slice(start, end)
  const hints = new Map()
  for (const m of table.matchAll(
    /^\s{2}'?([A-Za-z][\w-]*)'?:\s*$|^\s{2}'?([A-Za-z][\w-]*)'?:\s*'([^']*)',/gm,
  )) {
    if (m[3] !== undefined) hints.set(m[2], m[3])
  }
  for (const m of table.matchAll(/^\s{2}'?([A-Za-z][\w-]*)'?:\s*\n\s*'([^']*)',/gm)) {
    hints.set(m[1], m[2])
  }
  return hints
}
