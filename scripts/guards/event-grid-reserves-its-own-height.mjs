/**
 * GUARD: a section that reserves its own height keeps reserving the RIGHT
 * height, because every number the reservation is built from is still true of
 * the markup it describes.
 *
 * ============================================================================
 * WHY THIS EXISTS, with the measurement that produced it
 * ============================================================================
 *
 * Close-out C8 EXECUTION METHOD clause C8B.3, 19 September 2026. Four "all
 * events" grids had NO below-fold treatment at all, because the 480px a rail
 * reserves is wrong by 1,789% on a 9,067px section and applying it anyway grew
 * /city/melbourne by 60% under the reader. They now declare their own height,
 * computed from the number of cards they are about to render:
 *
 *     /city/melbourne          390  predicted 9,066    measured 9,066.8
 *                              768  predicted 5,356    measured 5,356.4
 *                             1440  predicted 4,164    measured 4,164.3
 *
 * THAT ACCURACY IS THE PROBLEM THIS GUARD EXISTS FOR. An estimate that is
 * exact today is a CLAIM about eight separate pieces of markup - the column
 * counts, the gutter, the wrapper padding, the container cap, the card's media
 * aspect at two breakpoints, the card's border and the card body - and not one
 * of them announces itself when it changes. Change `gap-6` to `gap-8` in the
 * grid and nothing anywhere goes red: the page simply starts growing under the
 * reader again, which is the exact failure the first attempt was reverted for,
 * and it would be found by a person scrolling rather than by a gate.
 *
 * ============================================================================
 * WHAT IT CAN AND CANNOT SEE, STATED FIRST
 * ============================================================================
 *
 * IT CANNOT MEASURE A PAGE. No guard can. It cannot tell you that the card
 * body is 144.5px, only that the module still says so and that the class which
 * produced that number is still on the element. The measurement half is
 * scripts/verify/event-grid-intrinsic-drive.mjs, which serves a build and
 * compares the reservation with the rendered height at 390, 768 and 1440. A
 * green run here is not a substitute for that and must not be read as one.
 *
 * IT CANNOT SEE A CHANGE IN TAILWIND'S OWN SCALE from outside the theme block
 * it reads. Clause D covers the two overrides that would silently move every
 * number (`--spacing` and the `md`/`lg` breakpoints) by failing if either is
 * ever declared; a change in the upstream default, were one ever to happen,
 * would be invisible to it.
 *
 * ============================================================================
 * SEVEN CLAUSES
 * ============================================================================
 *
 *   A  EVERY GRID RESERVES ITS OWN HEIGHT. Every file rendering the event-grid
 *      class string hands its ContentSection an `intrinsicSize` built from a
 *      count, and none of them opts out with `skipOffscreen={false}`. This is
 *      what catches a revert and what catches a fifth grid being added without
 *      one.
 *
 *   B  THE COUNT IS THE COUNT THAT RENDERS. The identifier whose `.length`
 *      feeds the estimate is the identifier the grid maps. A section that
 *      reserves room for the array it was handed and renders a slice of it is
 *      wrong by exactly the part it did not render, and that is invisible in
 *      review: both lines read correctly on their own.
 *
 *   C  THE GEOMETRY IS STILL TRUE. Each number the module declares is checked
 *      against the class that produces it: the column counts, the gutter, the
 *      wrapper padding, the container cap, the card's two media aspects and
 *      its border.
 *
 *   D  THE SCALE HAS NOT MOVED UNDER IT. `gap-6` is 24px and `md:` is 48rem
 *      because Tailwind's defaults say so. If the theme ever overrides
 *      `--spacing` or those breakpoints, every constant here becomes a claim
 *      about a scale that no longer exists, so declaring one is a failure
 *      until the module is re-derived.
 *
 *   G  --built. THE STYLESHEET THE BUILD WROTE SAYS WHAT THE SOURCE SAYS.
 *      Source being right is not the same as shipped being right, and on
 *      19 September 2026 they differed: `next build` exited 0, the server
 *      chunks carried the component's new custom property and the one CSS
 *      chunk still carried the old one, so `contain-intrinsic-size` resolved
 *      to nothing and every reserving section on the platform reserved zero.
 *      Nothing in the gate could see it - guards read source, typecheck and
 *      the suite never open a stylesheet - and the drive that should have
 *      caught it skipped its own check instead of failing it. This clause runs
 *      in `postbuild` and reads what was written.
 *
 *   F  THE DRIVE COMPARES THE SAME BOX. `contain-intrinsic-size` sizes the
 *      CONTENT box and the browser adds the section's padding to it. The first
 *      version of this module folded that padding into its own constant and
 *      the first version of the drive compared the raw reservation with the
 *      section's BORDER box, so the two errors cancelled and the drive reported
 *      0.0% on a tree whose skipped sections were 128px too tall. It was found
 *      by a different measurement entirely - the page was 16,370px at first
 *      paint and 16,242px laid out. So the drive must add the padding before
 *      it compares, and a drive that stops doing that fails the build.
 *
 *   E  THE CSS EXISTS AND SWITCHES WHERE THE MODULE THINKS IT DOES.
 *      `.cv-measured` declares `content-visibility: auto`, reads the three
 *      custom properties, and changes at the same two breakpoints the column
 *      table changes at. A rule that reads `--cv-h-md` at 40rem would reserve
 *      a two-column height for a one-column grid across an entire band.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const TAG = '[event-grid-reserves-its-own-height]'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const MODULE = 'src/lib/ui/event-grid-intrinsic.ts'
/**
 * How many event grids the platform renders. Nine on 19 September 2026: the
 * city, category, suburb and community-by-city "all events" grids, the feed's
 * "more for you", the organiser and venue archives, the community page's live
 * grid and the category-events landing page. A FLOOR rather than an exact
 * count, because adding a tenth is ordinary work and it will be judged like
 * the other nine; losing one silently is not.
 */
const GRID_FLOOR = 9
const SECTION = 'src/components/layout/ContentSection.tsx'
const DRIVE = 'scripts/verify/event-grid-intrinsic-drive.mjs'
const CSS = 'src/app/globals.css'

const faults = []
const notes = []
let checks = 0
function check(ok, message) {
  checks += 1
  if (!ok) faults.push(message)
}

function read(rel) {
  try {
    return readFileSync(join(ROOT, rel), 'utf8')
  } catch (error) {
    // A file that is not there is an ANSWER: the clauses below report the
    // absence themselves, by name. Anything else is the machine failing and
    // has to say so, or this guard passes a tree it could not read.
    if (error && error.code === 'ENOENT') return null
    console.warn(`${TAG} could not read ${rel}: ${error.message}`)
    return null
  }
}

/** Every .ts/.tsx file under src/, so a fifth grid cannot be added unseen. */
function sourceFiles() {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${entry}`
      const st = statSync(join(ROOT, rel))
      if (st.isDirectory()) walk(rel)
      else if (/\.tsx?$/.test(entry)) out.push(rel)
    }
  }
  walk('src')
  return out
}

/**
 * Tailwind's spacing scale: `gap-6` is 6 x 0.25rem. Clause D refuses to let
 * `--spacing` be redefined, so this multiplication is safe to make here.
 */
const TAILWIND_STEP_PX = 4

const moduleText = read(MODULE)
if (moduleText === null) {
  console.error(`${TAG} FAIL - ${MODULE} is missing; nothing can reserve its own height without it`)
  process.exit(1)
}

/** Pull a `const NAME = <number>` out of the module, as the module's own claim. */
function num(name) {
  const m = moduleText.match(new RegExp(`const ${name}(?:\\s*:[^=]+)?\\s*=\\s*([0-9.]+)`))
  return m ? Number(m[1]) : null
}
/** Pull a `const NAME ... = { base: a, md: b, lg: c }` out of the module. */
function band(name) {
  const m = moduleText.match(new RegExp(`const ${name}(?:\\s*:[^=]+)?\\s*=\\s*\\{([^}]*)\\}`))
  if (!m) return null
  const out = {}
  for (const b of ['base', 'md', 'lg']) {
    const v = m[1].match(new RegExp(`${b}\\s*:\\s*([0-9./ ]+)`))
    if (!v) return null
    // `9 / 16` is a ratio written as a division, on purpose: a reader can see
    // the aspect in it. Evaluate the one shape rather than accepting any.
    const raw = v[1].trim().replace(/,$/, '')
    const div = raw.match(/^([0-9.]+)\s*\/\s*([0-9.]+)$/)
    out[b] = div ? Number(div[1]) / Number(div[2]) : Number(raw)
  }
  return out
}
/** Pull a `key: '...'` out of the exported geometry object. */
function str(key) {
  const m = moduleText.match(new RegExp(`${key}:\\s*'([^']*)'`))
  return m ? m[1] : null
}

const COLUMNS = band('COLUMNS')
const GAP_PX = num('GAP_PX')
const WRAPPER_PAD_PX = band('WRAPPER_PAD_PX')
const CONTAINER_MAX_PX = num('CONTAINER_MAX_PX')
const MEDIA_RATIO = band('MEDIA_RATIO')
const CARD_BORDER_PX = num('CARD_BORDER_PX')
const CARD_BODY_PX = num('CARD_BODY_PX')
const SECTION_CHROME_PX = band('SECTION_CHROME_PX')
const GRID_CLASS = str('gridClass')
const WRAPPER_CLASS = str('wrapperClass')
const MEDIA_CLASS = str('mediaClass')
const MEDIA_CLASS_MD = str('mediaClassMd')

for (const [name, value] of Object.entries({
  COLUMNS, GAP_PX, WRAPPER_PAD_PX, CONTAINER_MAX_PX, MEDIA_RATIO, CARD_BORDER_PX, CARD_BODY_PX, SECTION_CHROME_PX,
  GRID_CLASS, WRAPPER_CLASS, MEDIA_CLASS, MEDIA_CLASS_MD,
})) {
  check(value !== null && value !== undefined, `${MODULE} still declares ${name} in the shape this guard reads`)
}
if (faults.length) {
  console.error(`${TAG} FAIL - the module's constants could not be read, so nothing below could be judged:`)
  for (const f of faults) console.error(`${TAG}   ${f}`)
  process.exit(1)
}

console.log(`${TAG} the geometry the reservation is built from, printed every run on purpose:`)
console.log(`${TAG}   columns ${JSON.stringify(COLUMNS)}, gap ${GAP_PX}px, wrapper padding ${JSON.stringify(WRAPPER_PAD_PX)}`)
console.log(`${TAG}   container cap ${CONTAINER_MAX_PX}px, media ratio ${JSON.stringify(MEDIA_RATIO)}, card border ${CARD_BORDER_PX}px, card body ${CARD_BODY_PX}px, section chrome ${JSON.stringify(SECTION_CHROME_PX)}`)
console.log(`${TAG}   grid class "${GRID_CLASS}"`)


/**
 * The module's `eventGridIntrinsicCss(band)`, rebuilt here from the constants
 * this guard already read out of it.
 *
 * WHY IT IS REBUILT RATHER THAN IMPORTED. The module is TypeScript and the
 * guards in this repository read source as text rather than loading it; that
 * is the house pattern and it keeps `prebuild` free of a loader. The price is
 * that this function must stay in step with the one it mirrors, and the drill
 * `reserved height: the stylesheet formula is edited by hand` is what proves
 * the pair still agree: change either side and the build refuses.
 */
/**
 * The module's `eventGridIntrinsicCss(band)`, rebuilt here from the constants
 * this guard already read out of it.
 *
 * WHY IT IS REBUILT RATHER THAN IMPORTED. The module is TypeScript and the
 * guards in this repository read source as text rather than loading it; that
 * is the house pattern and it keeps `prebuild` free of a loader. The price is
 * that this function must stay in step with the one it mirrors, and the drill
 * `reserved height: the stylesheet formula is edited by hand` is what proves
 * the pair still agree: change either side and the build refuses.
 */
function cssFor(band) {
  const columns = COLUMNS[band]
  const inset = 2 * WRAPPER_PAD_PX[band] + (columns - 1) * GAP_PX
  const trim = (n) => String(Math.round(n * 1e6) / 1e6)
  const columnWidth =
    columns === 1
      ? `(min(100vw, ${CONTAINER_MAX_PX}px) - ${inset + CARD_BORDER_PX}px)`
      : `((min(100vw, ${CONTAINER_MAX_PX}px) - ${inset}px) / ${columns} - ${CARD_BORDER_PX}px)`
  const rowPlusGap = `(${columnWidth} * ${trim(MEDIA_RATIO[band])} + ${CARD_BODY_PX + GAP_PX}px)`
  return `calc(var(--cv-r-${band}, 1) * ${rowPlusGap} + ${SECTION_CHROME_PX[band] - GAP_PX}px)`
}

/* ------------------------------------------------------------------ A + B */

/**
 * Where every event grid on the platform is, found by what it IS.
 *
 * THE CLASS STRING ALONE IS NOT ENOUGH, and the first run of this guard proved
 * it: `/help` renders the same three-column grid holding topic tiles, which
 * have nothing to do with a card's media aspect or its 144.5px body. An event
 * grid is that class string with an `<EventCard` inside it.
 *
 * EVERY OCCURRENCE IS JUDGED, not the first one in each file. A page with two
 * grids that fixed one of them would otherwise pass.
 */
const GRID_WINDOW = 400
function eventGrids() {
  const found = []
  for (const file of sourceFiles()) {
    if (file === MODULE) continue // it DECLARES the class string; it renders nothing
    const text = read(file) ?? ''
    let at = text.indexOf(GRID_CLASS)
    while (at !== -1) {
      const window = text.slice(at, at + GRID_WINDOW)
      if (window.includes('<EventCard')) found.push({ file, at, text, window })
      at = text.indexOf(GRID_CLASS, at + 1)
    }
  }
  return found
}

/**
 * The `<ContentSection ...>` opening tag this grid sits inside, or null when
 * the grid is not in one. Scans back to the nearest opening tag and refuses it
 * if that section has already closed before the grid, so a grid that follows a
 * sibling section is not attributed to it.
 */
function enclosingSectionTag(text, at) {
  const open = text.lastIndexOf('<ContentSection', at)
  if (open === -1) return null
  if (text.slice(open, at).includes('</ContentSection>')) return null
  let depth = 0
  for (let i = open; i < at; i += 1) {
    const c = text[i]
    if (c === '{') depth += 1
    else if (c === '}') depth -= 1
    else if (c === '>' && depth === 0) return text.slice(open, i + 1)
  }
  return null
}

const grids = eventGrids()
check(
  grids.length >= GRID_FLOOR,
  `${grids.length} event grid(s) found and ${GRID_FLOOR} is the floor. Nine carried a reservation on 19 September 2026; ` +
    `a count below that means one stopped using the shared class string, and its section is now reserving a height for ` +
    `markup it no longer renders.`,
)
for (const g of grids) notes.push(`grid: ${g.file}`)

for (const g of grids) {
  const tag = enclosingSectionTag(g.text, g.at)
  check(
    tag !== null,
    `${g.file} renders an event grid outside any ContentSection, so nothing can reserve its height. Put it in one, or ` +
      `this guard cannot tell a deliberate exception from an oversight.`,
  )
  if (tag === null) continue

  check(
    !tag.includes('skipOffscreen={false}'),
    `${g.file} wraps an event grid in a ContentSection that passes skipOffscreen={false}. That is the state this item ` +
      `removed: the section lays out in full before first paint, which on /city/melbourne was 9,067px of it.`,
  )
  const fed = [...tag.matchAll(/intrinsicSize=\{eventGridIntrinsicSize\(\s*([A-Za-z_$][\w$]*)\.length\s*\)\}/g)].map(m => m[1])
  check(
    fed.length === 1,
    `${g.file} wraps an event grid in a ContentSection with no intrinsicSize={eventGridIntrinsicSize(<array>.length)}, ` +
      `so it reserves a rail's 480px for a grid of cards. Its opening tag is: ${tag.replace(/\s+/g, ' ').slice(0, 140)}`,
  )

  // Clause B. The array whose length was reserved is the array that renders.
  const mapped = [...g.window.matchAll(/\{\s*([A-Za-z_$][\w$]*)\.map\(/g)].map(m => m[1])
  check(
    mapped.length > 0,
    `${g.file}: this guard could not find the array the event grid maps within ${GRID_WINDOW} characters of the class string`,
  )
  if (fed.length === 1 && mapped.length > 0) {
    check(
      fed[0] === mapped[0],
      `${g.file} reserves room for ${fed[0]}.length and renders ${mapped[0]}.map(...). A section that reserves the height ` +
        `of the array it was HANDED and renders a slice of it is wrong by exactly the part it did not render, and both ` +
        `lines read correctly on their own.`,
    )
  }
}

/* ---------------------------------------------------------------------- C */

// The column counts, the gutter: all four live in the one class string.
for (const [b, cols] of Object.entries(COLUMNS)) {
  const token = b === 'base' ? `grid-cols-${cols}` : `${b}:grid-cols-${cols}`
  check(
    GRID_CLASS.split(/\s+/).includes(token),
    `the module says ${b} is ${cols} column(s) and the grid class string "${GRID_CLASS}" does not say "${token}"`,
  )
}
check(
  GRID_CLASS.split(/\s+/).includes(`gap-${GAP_PX / TAILWIND_STEP_PX}`),
  `the module says the gutter is ${GAP_PX}px, which is gap-${GAP_PX / TAILWIND_STEP_PX}, and the grid class string does not say it`,
)

const sectionText = read(SECTION)
check(sectionText !== null, `${SECTION} exists`)
if (sectionText) {
  check(
    sectionText.includes(WRAPPER_CLASS),
    `${SECTION} no longer carries "${WRAPPER_CLASS}", which is where the module's wrapper padding ${JSON.stringify(WRAPPER_PAD_PX)} comes from`,
  )
  for (const [b, px] of Object.entries(WRAPPER_PAD_PX)) {
    const token = b === 'base' ? `px-${px / TAILWIND_STEP_PX}` : `${b}:px-${px / TAILWIND_STEP_PX}`
    check(
      WRAPPER_CLASS.split(/\s+/).includes(token),
      `the module says ${b} padding is ${px}px, which is ${token}, and the wrapper class "${WRAPPER_CLASS}" does not say it`,
    )
  }
  // The four grids all ask for `width="wide"`, which is max-w-7xl.
  check(
    /wide:\s*'max-w-7xl'/.test(sectionText),
    `${SECTION} no longer maps width="wide" to max-w-7xl, so the module's ${CONTAINER_MAX_PX}px cap describes nothing`,
  )
  check(
    sectionText.includes("intrinsicSize ? 'cv-measured '"),
    `${SECTION} no longer puts .cv-measured on a section that declares an intrinsic size, so the reservation is written and never read`,
  )
  for (const prop of ['--cv-r-base', '--cv-r-md', '--cv-r-lg']) {
    check(sectionText.includes(prop), `${SECTION} no longer writes ${prop}`)
  }
}

const cssText = read(CSS)
check(cssText !== null, `${CSS} exists`)
if (cssText) {
  const rem = CONTAINER_MAX_PX / 16
  check(
    new RegExp(`--container-7xl:\\s*${rem}rem`).test(cssText),
    `the module caps the container at ${CONTAINER_MAX_PX}px (${rem}rem) and ${CSS} does not declare --container-7xl: ${rem}rem`,
  )
  // The card's media box and its border, which the row height is built from.
  const media = cssText.match(/@utility event-card-media \{([^}]*)\}/)
  check(media !== null, `${CSS} still declares the event-card-media utility the row height is measured from`)
  if (media) {
    check(
      media[1].includes(MEDIA_CLASS),
      `the module says the base media aspect is "${MEDIA_CLASS}" (ratio ${MEDIA_RATIO.base}) and event-card-media does not say it`,
    )
    check(
      media[1].includes(MEDIA_CLASS_MD),
      `the module says the md media aspect is "${MEDIA_CLASS_MD}" (ratio ${MEDIA_RATIO.md}) and event-card-media does not say it`,
    )
  }
  const surface = cssText.match(/@utility event-card-surface \{([^}]*)\}/)
  check(surface !== null, `${CSS} still declares the event-card-surface utility`)
  if (surface) {
    check(
      /\bborder\b/.test(surface[1]),
      `the module takes ${CARD_BORDER_PX}px off the column width for the card's border and event-card-surface no longer has one`,
    )
  }

  /* -------------------------------------------------------------------- D */

  /*
   * THE WHOLE STYLESHEET IS SCANNED, NOT THE @theme BLOCK, and the first
   * version of this clause got that wrong: it read @theme only, and its drill
   * - `--spacing` added to the `:root` block above it - passed.
   *
   * It should not have. Tailwind v4 does not bake the number in. The built CSS
   * says `.gap-6{gap:calc(var(--spacing) * 6)}` and
   * `.px-4{padding-inline:calc(var(--spacing) * 4)}`, read out of
   * .next/static/chunks on the build of 19 September 2026, so the variable is
   * resolved by the CASCADE at render time and a declaration anywhere that
   * reaches these elements moves every gutter and every pad on the platform
   * while the reservation goes on claiming the old ones.
   *
   * Tailwind emits its own `--spacing: .25rem`, so this file declaring one at
   * all is an override by definition.
   */
  for (const override of ['--spacing:', '--breakpoint-md:', '--breakpoint-lg:']) {
    check(
      !cssText.includes(override),
      `${CSS} declares ${override} The module's pixel constants are Tailwind's defaults read as pixels ` +
        `(4px per step, md 48rem, lg 64rem). Overriding one moves every number in it, silently. Re-derive with ` +
        `scripts/verify/event-grid-intrinsic-drive.mjs --derive and delete this clause's entry only with the new numbers.`,
    )
  }

  /* -------------------------------------------------------------------- E */

  const measured = cssText.match(/\.cv-measured \{([^}]*)\}/)
  check(measured !== null, `${CSS} declares .cv-measured, the rule that reads the reservation`)
  if (measured) {
    check(
      /content-visibility:\s*auto/.test(measured[1]),
      `.cv-measured does not declare content-visibility: auto, so the section reserves a height and lays out anyway`,
    )
  }

  /*
   * THE FORMULA IS REGENERATED AND COMPARED, not pattern-matched.
   *
   * The page sends three integers and the stylesheet holds the arithmetic they
   * are multiplied by, which is 78 bytes per document instead of 470. The cost
   * of that is a second place the geometry is written down, so it is not
   * trusted: every expression below is rebuilt here from the SAME constants the
   * module uses and must appear in globals.css character for character. When it
   * does not, the guard prints what it expected, so the fix is a paste rather
   * than a derivation.
   */
  const expected = { base: cssFor('base'), md: cssFor('md'), lg: cssFor('lg') }
  console.log(`${TAG} the stylesheet formula, regenerated from the module's constants:`)
  for (const [b, value] of Object.entries(expected)) console.log(`${TAG}   ${b}: contain-intrinsic-size: auto ${value}`)

  check(
    cssText.includes(`contain-intrinsic-size: auto ${expected.base}`),
    `${CSS} does not declare the base reservation the module generates. Expected: ` +
      `contain-intrinsic-size: auto ${expected.base}`,
  )
  for (const [b, rem] of [['md', 48], ['lg', 64]]) {
    /* Found by INDEX rather than by a regular expression. The expected value
     * is full of parentheses, asterisks and plus signs, so comparing it as a
     * pattern means escaping it first, and the first attempt at that escape
     * was itself wrong in a way that quietly matched nothing. Looking in the
     * window after the media query cannot be wrong in that way. */
    const at = cssText.indexOf(`@media (width >= ${rem}rem)`)
    const window = at === -1 ? '' : cssText.slice(at, at + 400)
    check(
      window.includes('.cv-measured') && window.includes(`contain-intrinsic-size: auto ${expected[b]}`),
      `${CSS} does not declare the ${b} reservation on .cv-measured at ${rem}rem. The column count changes there ` +
        `(${JSON.stringify(COLUMNS)}), so a rule that switches anywhere else reserves the wrong number of rows ` +
        `across a whole band. Expected inside @media (width >= ${rem}rem): ` +
        `contain-intrinsic-size: auto ${expected[b]}`,
    )
  }

}

/* -------------------------------------------------------------------- F */

const driveText = read(DRIVE)
check(driveText !== null, `${DRIVE} exists; without it nothing measures the reservation against a real page`)
if (driveText) {
  /* The whole expression, not two words that happen to be present: renaming
   * the binding to `reservedBorderBoxRenamed` left both substrings in the file
   * and the first version of this clause passed the drill. */
  const addsThePadding = new RegExp('const\\s+reservedBorderBox\\s*=\\s*estimate\\s*\\+[^\\n]*sectionPadTop[^\\n]*sectionPadBottom')
  check(
    addsThePadding.test(driveText),
    `${DRIVE} no longer adds the section's padding to the reservation before comparing it with the section's box. ` +
      `contain-intrinsic-size sizes the CONTENT box. A drive that compares the raw reservation with the BORDER box ` +
      `reports 0.0% on a tree whose skipped sections are a whole padding too tall, which is exactly what happened on ` +
      `19 September 2026.`,
  )
}

/**
 * The same CSS as the minifier would write it: no whitespace, no leading zero
 * on a decimal. The built stylesheet says `var(--cv-r-base,1)` and `.5625`
 * where the source says `var(--cv-r-base, 1)` and `0.5625`, and comparing the
 * two literally reported a stale build on a fresh one.
 *
 * WHAT THIS GIVES UP, said rather than hidden: whitespace around `+` and `-`
 * is SIGNIFICANT in a CSS calc, and squashing it away means this clause can no
 * longer see a missing space. Clause E compares the source text exactly and
 * can, so the pair still covers it; and a calc that lost a space would not
 * parse, so the build's own stylesheet would carry nothing rather than
 * something subtly wrong.
 */
function squash(text) {
  return text.replace(/\s+/g, '').replace(/([^0-9])0\./g, '$1.')
}

/* -------------------------------------------------------------------- G */

/*
 * WHERE THE BUILD WRITES ITS STYLESHEETS DEPENDS ON THE HOST, and reading one
 * place only failed the Vercel preview of a44c30e2 (pull request 159) with
 * "0 stylesheet(s) read from .next/static/chunks" on a build whose pages link
 *
 *     /_next/static/immutable/chunks/13u-t1bzcl6_7.css
 *
 * Next 16.3 moves Turbopack's chunks under static/immutable/ when the config
 * carries supportsImmutableAssets, and the deployment adapter sets that in its
 * modifyConfig ("In the real world, this is done by the adapter's modifyConfig",
 * finalizeConfig in node_modules/next/dist/server/config.js). A local
 * `next build` has no adapter and writes static/chunks. The build is the same;
 * only the directory differs, so both are read and the count names each.
 */
const STYLESHEET_DIRS = ['.next/static/chunks', '.next/static/immutable/chunks']

if (process.argv.includes('--built')) {
  const perDir = STYLESHEET_DIRS.map(dir => ({
    dir,
    files: existsSync(join(ROOT, dir))
      ? readdirSync(join(ROOT, dir)).filter(f => f.endsWith('.css')).map(f => `${dir}/${f}`)
      : [],
  }))
  const files = perDir.flatMap(d => d.files)
  const dir = perDir.map(d => `${d.dir} (${d.files.length})`).join(' and ')
  check(files.length > 0, `--built: neither ${STYLESHEET_DIRS.join(' nor ')} holds a stylesheet, so there is nothing to judge and this clause cannot pass quietly`)
  const css = files.map(f => read(f) ?? '').join('\\n')
  const rule = css.includes('.cv-measured')
  check(rule, `--built: no stylesheet the build wrote declares .cv-measured, so nothing reserves anything`)
  if (rule) {
    for (const b of ['base', 'md', 'lg']) {
      const want = cssFor(b)
      check(
        squash(css).includes(squash(want)),
        `--built: the stylesheet the build wrote does not carry the ${b} reservation. This is the shape of the ` +
          `19 September 2026 incident: the source was correct and the built CSS was a cache older than it. ` +
          `Expected to find: ${want}. ` +
          `Found instead: ${(css.match(/contain-intrinsic-size:[^;}]*/g) || ['nothing']).join(' | ')}`,
      )
    }
    // The other half of the same failure: a rule that reads a property nothing
    // writes. Both files are read, so the pair can be checked rather than one
    // side assumed.
    const writers = sourceFiles().filter(f => (read(f) ?? '').includes('--cv-r-base'))
    check(
      writers.length > 0,
      `--built: .cv-measured reads --cv-r-base and no file in src/ writes it, so the reservation resolves to nothing`,
    )
  }
  console.log(`${TAG} --built: ${files.length} stylesheet(s) read from ${dir}`)
}

const usesMeasured = sourceFiles().filter(f => (read(f) ?? '').includes('cv-measured'))
check(
  usesMeasured.length > 0,
  `nothing in src/ puts .cv-measured on anything, so the rule in ${CSS} is dead CSS`,
)

console.log(`${TAG} did ${sourceFiles().length} source file(s) read, ${grids.length} event grid(s) judged, ${checks} check(s) made`)
for (const n of notes) console.log(`${TAG} note: ${n}`)
if (faults.length) {
  console.error(`${TAG} FAIL - ${faults.length} of ${checks} check(s)`)
  for (const f of faults) console.error(`${TAG}   ${f}`)
  process.exit(1)
}
console.log(
  `${TAG} PASS - ${grids.length} event grid(s) reserve a height built from the count they render, ` +
    `and every number that height is built from still describes the markup it names.`,
)
