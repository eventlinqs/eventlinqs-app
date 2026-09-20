/**
 * TILE LABEL OVER A PHOTOGRAPH. The city tiles, the community tiles and the
 * event bentos paint words on pictures nobody on this team chose, exactly as
 * the heroes do, and until 20 September 2026 thirteen of them each carried a
 * hand-written wash of their own.
 *
 * THE INCIDENT, and it is the SECOND time the same defect shipped. On
 * 19 September four hero templates were found painting their text over washes
 * whose every stop was a percentage of the BAND, while the text is
 * bottom-anchored and hugs its own content, so where the words landed on that
 * ramp moved with the copy and the viewport.
 * `scripts/guards/hero-text-over-a-photograph.mjs` was written, the four heroes
 * were converted onto one anchored wash, and the guard went green and stayed
 * green. One component family along, the identical mistake was live on:
 *
 *   /cities        86 runs below floor. Brisbane 1.00:1 on a white sky, with
 *                  100 per cent of its 464 core pixels below the floor
 *   /communities   49 runs. "Aboriginal & Torres Strait Islander" 1.01:1
 *   /waitlist      12 runs, all nine regional cities, at 390 only
 *   /city/sydney    2 runs, the community tile
 *
 * 149 measured runs, on four routes, while the hero guard was correct about
 * everything it could see. The lesson is not that the hero guard was wrong; it
 * is that a derivation keyed on the painters of a FULL-BLEED photograph cannot
 * see a TILE, and nothing about that blind spot looks different from coverage.
 *
 * FOUR OF THE THIRTEEN GOVERNED FILES RENDER ON NO ROUTE, and that is recorded
 * here rather than left for the next reader to rediscover while hunting for
 * evidence that cannot exist. `city-tile.tsx`, `city-rail-tile.tsx`,
 * `event-bento-tile.tsx` and `trending-events-bento.tsx` are imported by
 * nothing: the first two by no file at all, and the second two only for their
 * `BentoEvent` TYPE, never as components. They are converted and governed
 * exactly like the other nine, because the day one of them is rendered it must
 * already be right, but no driven measurement covers them and none can. What
 * holds them is clause 4's arithmetic and the suite, not a photograph. The nine
 * reachable files were driven on 20 September 2026 across 13 routes x 3
 * viewports, 879 checks, zero below floor.
 *
 * WHAT THIS GUARD CANNOT SEE, said plainly so it is not mistaken for coverage:
 * it does not look at a photograph and it does not compute a ratio against one.
 * It cannot; the pictures arrive from a licensed spine and a third-party API at
 * request time. It judges the MECHANISM: that one tile wash is declared once,
 * that its strength still covers the worst foreground any tile caption actually
 * paints, that the geometry which makes it independent of layout is intact, and
 * that every tile label uses it. The ratio against real pictures is the drive's
 * job, and the drive is what found this.
 *
 * CLAUSE 4 RECOMPUTES RATHER THAN COMPARES, and it recomputes from the CALL
 * SITES. The hero guard recomputes its requirement from the gold token, because
 * the constitution fixes the eyebrow's colour and the wash is the only free
 * variable. A tile caption has no such fixed colour: these thirteen paint white,
 * white at 85, 80 and 75 per cent and gold-400 between them. So the
 * requirement is derived from what the captions are actually written to paint,
 * every one of them, on every run. Lighten a label and the arithmetic is redone
 * from the new value and the build says so.
 */
import { existsSync, readFileSync } from 'node:fs'
import {
  TILE_LABELS_NOT_YET_ON_THE_SHARED_CAPTION,
  allTsxFiles,
  deriveTileLabelSurfaces,
  deriveTilePainters,
  paintsOwnTileWash,
  rendersTileCaption,
  tileBoxesOf,
  tileCaptionClassNames,
} from './lib/tile-files.mjs'
import { stripComments } from './lib/hero-files.mjs'

const FAILURES = []
const fail = (clause, message) => FAILURES.push(`${clause}: ${message}`)

const SCRIM_MODULE = 'src/components/media/tile-photo-scrim.ts'
const HERO_SCRIM_MODULE = 'src/components/media/hero-photo-scrim.ts'
const CAPTION_COMPONENT = 'src/components/media/tile-caption.tsx'
const GLOBALS = 'src/app/globals.css'

/** Missing is a FINDING here, not an exception to swallow. */
const read = f => (existsSync(f) ? readFileSync(f, 'utf8') : null)
const asCode = src => stripComments(src)

/* ── WCAG 2.2 SC 1.4.3, evaluated rather than quoted ───────────────────────
 * https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 */
const srgb = c => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const luminance = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const ratio = (a, b) => {
  const l1 = Math.max(luminance(a), luminance(b))
  const l2 = Math.min(luminance(a), luminance(b))
  return (l1 + 0.05) / (l2 + 0.05)
}
const over = (fg, alpha, bg) => [0, 1, 2].map(i => alpha * fg[i] + (1 - alpha) * bg[i])

const NORMAL_TEXT_FLOOR = 4.5
const NAVY = [10, 22, 40]
/**
 * The worst thing a photograph can be, under a label, is white. Every tile in
 * this family has one behind it somewhere: /cities measured Brisbane on
 * #FFFFFD and /communities measured a name on #FFFFF5.
 */
const WORST_PHOTOGRAPH = [255, 255, 255]

const scrim = read(SCRIM_MODULE)
const caption = read(CAPTION_COMPONENT)
const globals = read(GLOBALS)

if (!scrim) fail('1', `${SCRIM_MODULE} is missing: the one tile wash has no declaration`)
if (!caption) fail('3', `${CAPTION_COMPONENT} is missing: nothing renders the tile caption wash`)
if (!globals) fail('4', `${GLOBALS} is missing: the brand tokens cannot be read`)

const SURFACES = deriveTileLabelSurfaces()
const registered = new Map(TILE_LABELS_NOT_YET_ON_THE_SHARED_CAPTION.map(e => [e.file, e]))

/* ── CLAUSE 0. THE RATCHET ONLY EVER SHRINKS ───────────────────────────────
 * Judged BEFORE the conversion clauses, because an entry that has stopped being
 * true must fail loudly rather than go on excusing a file. It is EMPTY today,
 * and the loop is here so the first entry anybody adds is governed rather than
 * trusted.
 */
for (const entry of TILE_LABELS_NOT_YET_ON_THE_SHARED_CAPTION) {
  const src = read(entry.file)
  if (src === null) {
    fail('0', `the register still carries ${entry.file}, which does not exist. Delete the entry.`)
    continue
  }
  if (rendersTileCaption(entry.file) && !paintsOwnTileWash(entry.file)) {
    fail(
      '0',
      `${entry.file} is now on the shared tile caption, so its register entry is stale. Delete it: a debt ` +
        'register that keeps a paid debt is a list nobody rereads.',
    )
  }
  if (entry.stillTrue) {
    const verdict = entry.stillTrue()
    if (!verdict.ok) fail('0', `the register's reason for ${entry.file} has stopped being true: ${verdict.why}`)
  }
}

/* ── CLAUSE 1. EVERY LABEL PAINTED ON A TILE IS ON THE SHARED CAPTION ──────
 * `deriveTileLabelSurfaces()` returns a file only when it paints words of their
 * own, out of flow, over a tile photograph, outside `<TileCaption>`, with less
 * than the shared floor's worth of backing under them. There is no honest
 * reason for one of those to exist, so the derivation returning ANYTHING is the
 * failure.
 */
for (const { file, by, labels } of SURFACES) {
  if (registered.has(file)) continue
  for (const label of labels) {
    fail(
      '1',
      `${file} paints a label on a ${by.join('/')} photograph outside <TileCaption>, with ${label.backing} ` +
        `backing under it: "${label.className}". Move it into <TileCaption> (${CAPTION_COMPONENT}), which ` +
        'anchors the wash to the label instead of to the tile, or give the label its own backing.',
    )
  }
}

/* ── CLAUSE 2. NO FILE ON THE SHARED CAPTION MAY ALSO WRITE ITS OWN WASH ───
 * This is the clause that would have refused the ten hand-written gradients the
 * incident was made of. It is scoped to files that render `<TileCaption>`,
 * because a translucent dark gradient elsewhere in the tree is a different
 * question: `event-types-rail.tsx` and `sub-communities-rail.tsx` each paint one
 * over a picture with every word BELOW the image, where it is decoration and
 * protects nothing.
 */
for (const file of allTsxFiles()) {
  if (!rendersTileCaption(file)) continue
  if (paintsOwnTileWash(file)) {
    fail(
      '2',
      `${file} renders <TileCaption> and ALSO writes its own translucent dark gradient. Every tile wash ` +
        `comes from ${SCRIM_MODULE}; hand-written gradients disagreeing with each other is the defect this ` +
        'guard exists for.',
    )
  }
}

/* ── CLAUSE 3. THE CAPTION'S GEOMETRY, WHICH IS WHAT MAKES IT A PROMISE ────
 * Three properties, each of which silently un-does the fix if it is lost.
 */
if (caption) {
  const code = asCode(caption)
  if (!/top:\s*`calc\(-1 \* \$\{TILE_CAPTION_FADE\}\)`/.test(code)) {
    fail(
      '3',
      `${CAPTION_COMPONENT} no longer starts its wash TILE_CAPTION_FADE above the label. A wash that begins ` +
        'AT the first line arrives at full strength one line too late, which is the shape of the original defect.',
    )
  }
  if (!/absolute inset-x-0 bottom-0/.test(code)) {
    fail(
      '3',
      `${CAPTION_COMPONENT} no longer anchors itself to the foot of the tile. It owns its own anchoring so a ` +
        'caller cannot put a label somewhere the wash was not computed for.',
    )
  }
  if (!/left: '-100vw'/.test(code) || !/right: '-100vw'/.test(code) || !/bottom: '-100vh'/.test(code)) {
    fail(
      '3',
      `${CAPTION_COMPONENT} no longer bleeds past the tile's edges. A wash that stops at the label's own box ` +
        'draws a visible seam across the photograph.',
    )
  }
}

/* Every caller must keep the clip that trims that deliberate bleed, and must
 * not hand the caption positioning classes of its own. */
const POSITIONING = /\babsolute\b|\bfixed\b|\binset-|\bbottom-|\btop-\d|\bleft-\d|\bright-\d/
for (const file of allTsxFiles()) {
  if (!rendersTileCaption(file)) continue
  for (const box of tileBoxesOf(file)) {
    if (!/\boverflow-hidden\b/.test(box.className)) {
      fail(
        '3',
        `${file} renders <TileCaption> but the box holding its ${box.painter} photograph does not clip: ` +
          `"${box.className}". The caption's wash deliberately bleeds a viewport past all four edges and ` +
          'overflow-hidden is the only thing trimming it.',
      )
    }
  }
  for (const cls of tileCaptionClassNames(file)) {
    if (POSITIONING.test(cls)) {
      fail(
        '3',
        `${file} gives <TileCaption> positioning classes ("${cls}"). The caption anchors itself; a caller ` +
          'that repositions it moves the label away from the wash computed for it.',
      )
    }
  }
}

/* ── CLAUSE 4. THE WASH IS STRONG ENOUGH FOR WHAT THE CAPTIONS ACTUALLY PAINT
 *
 * Recomputed from the call sites on every run. Every foreground declared inside
 * a `<TileCaption>` is resolved to a colour and an alpha, composited over navy
 * at the declared wash strength over a WHITE photograph, and evaluated against
 * WCAG 2.2 SC 1.4.3. The NORMAL-text floor is applied to all of them
 * deliberately: a headline that qualifies as large text today stops qualifying
 * at 390, where every one of these tiles steps its type down, and taking the
 * stricter floor everywhere costs nothing and cannot be got wrong by reading a
 * size out of a class list.
 */
const declaredAlpha = scrim && globals ? (() => {
  const heroScrim = read(HERO_SCRIM_MODULE)
  const m = heroScrim && heroScrim.match(/HERO_CAPTION_MIN_ALPHA\s*=\s*([0-9.]+)/)
  if (!m) {
    fail('4', `${HERO_SCRIM_MODULE} no longer declares HERO_CAPTION_MIN_ALPHA, so the tile floor has no source`)
    return null
  }
  /* The tile module must IMPORT that number rather than restate it. Two copies
   * of one requirement is two things to drift, and the drift is invisible. */
  if (!/TILE_CAPTION_MIN_ALPHA\s*=\s*HERO_CAPTION_MIN_ALPHA/.test(asCode(scrim))) {
    fail(
      '4',
      `${SCRIM_MODULE} states its own floor instead of importing HERO_CAPTION_MIN_ALPHA from ` +
        `${HERO_SCRIM_MODULE}. The requirement is one piece of arithmetic about one pair of colours; a ` +
        'second copy of it is a second thing to drift.',
    )
    return null
  }
  return Number(m[1])
})() : null

/** `text-white/85`, `text-gold-400`, `text-[var(--brand-accent)]`, resolved to sRGB plus alpha. */
function resolveForeground(token, css) {
  const m = token.match(/^text-(\[var\(--[a-z0-9-]+\)\]|[a-z0-9-]+)(?:\/(\d{1,3}))?$/)
  if (!m) return null
  const alpha = m[2] === undefined ? 1 : Number(m[2]) / 100
  let name = m[1]
  const varName = name.match(/^\[var\((--[a-z0-9-]+)\)\]$/)
  if (varName) {
    const declared = css.match(new RegExp(`${varName[1]}:\\s*([^;]+);`))
    if (!declared) return null
    name = declared[1].trim().replace(/^var\((--[a-z0-9-]+)\)$/, '$1')
    if (name.startsWith('--')) {
      const nested = css.match(new RegExp(`${name}:\\s*#([0-9A-Fa-f]{6})`))
      return nested ? { rgb: hexToRgb(nested[1]), alpha, token } : null
    }
    if (/^#[0-9A-Fa-f]{6}$/.test(name)) return { rgb: hexToRgb(name.slice(1)), alpha, token }
    return null
  }
  if (name === 'white') return { rgb: [255, 255, 255], alpha, token }
  const swatch = css.match(new RegExp(`--color-${name}:\\s*#([0-9A-Fa-f]{6})`))
  return swatch ? { rgb: hexToRgb(swatch[1]), alpha, token } : null
}
const hexToRgb = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))

/** The navy alpha this foreground needs to clear the floor over a white photograph. */
function requiredAlphaFor(fg) {
  for (let a = 0; a <= 1.0001; a += 0.001) {
    const bg = over(NAVY, a, WORST_PHOTOGRAPH)
    if (ratio(over(fg.rgb, fg.alpha, bg), bg) >= NORMAL_TEXT_FLOOR) return a
  }
  return null
}

/**
 * EVERY `text-*` UTILITY IN THE BODY, not the first one per class list.
 *
 * THE FIRST VERSION ANCHORED ON `className=` and took one token from each,
 * which meant it recomputed the requirement from TWO foregrounds while the
 * thirteen captions paint seven between them, and the two it happened to find
 * were not the demanding ones. A clause that recomputes from an arbitrary
 * subset is worse than one that compares against a constant, because it reads
 * as though it checked everything. Non-colour utilities - `text-xs`,
 * `text-center` - resolve to nothing and fall out on their own.
 */
const FOREGROUND_IN_CAPTION = /\b(text-(?:\[var\(--[a-z0-9-]+\)\]|[a-z0-9-]+)(?:\/\d{1,3})?)/g
/**
 * A `text-*` utility that is NOT a colour: a size, or one of Tailwind's static
 * keywords. Anything else has to resolve to a colour, or this clause says so.
 *
 * IT IS NOT A CONVENIENCE, IT IS THE CLAUSE FINDING A BUG. Tailwind v4 builds
 * `text-<name>` from `--color-<name>` in the `@theme` block, so a class naming a
 * token that block does not declare produces NO CSS AT ALL and the element
 * silently inherits. `city-tile.tsx` painted its arrow `text-gold-300` and
 * globals.css declares gold-100, 400, 500, 600, 700 and 800 and no 300. A
 * foreground this clause cannot resolve used to be dropped silently, which
 * would have meant recomputing the requirement from a subset and calling it
 * every colour.
 */
const STATIC_TEXT_UTILITIES = new Set([
  'left', 'center', 'right', 'justify', 'start', 'end',
  'wrap', 'nowrap', 'balance', 'pretty', 'ellipsis', 'clip',
])
const TAILWIND_TEXT_SIZES = new Set([
  'xs', 'sm', 'base', 'lg', 'xl',
  '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
])
const isNotAColour = (token, css) => {
  const name = token.slice('text-'.length)
  if (STATIC_TEXT_UTILITIES.has(name) || TAILWIND_TEXT_SIZES.has(name)) return true
  /*
   * An arbitrary SIZE, written in square brackets: a length or a bare number.
   * An arbitrary COLOUR is a bracketed CSS variable or a hex, and those are
   * resolved above rather than skipped here.
   *
   * AND THIS COMMENT MAY NOT CONTAIN AN EXAMPLE OF EITHER, which cost a
   * deployment's worth of confusion on 20 September 2026 and is worth the
   * sentence. Tailwind v4 scans this directory for class names, and the first
   * draft of this comment spelled an arbitrary-value class with an ellipsis
   * inside the brackets as a stand-in. Tailwind read it as a real utility,
   * emitted `color: var(--...)` into globals.css, and every page on the platform
   * answered 500 with "Parsing CSS source code failed". A running drive then
   * reported five community tiles as unmeasurable and the fault looked exactly
   * like the product.
   */
  if (/^\[(?!var\(|#)[^\]]*\]$/.test(name)) return true
  /* An arbitrary value is never a `--text-*` theme key, and feeding one to a
   * RegExp constructor is how this line threw "Range out of order in character
   * class" on `text-[var(--brand-accent)]` the first time it ran. */
  if (name.startsWith('[')) return false
  return new RegExp(`--text-${name}:`).test(css)
}

const foregrounds = new Map()
if (globals) {
  for (const file of allTsxFiles()) {
    if (!rendersTileCaption(file)) continue
    const code = asCode(read(file))
    /* Only what is INSIDE a caption: the body of the card below the image is on
     * canvas and is a different pair of colours entirely. */
    for (const block of code.split('<TileCaption').slice(1)) {
      const body = block.split('</TileCaption>')[0]
      for (const [, token] of body.matchAll(FOREGROUND_IN_CAPTION)) {
        if (isNotAColour(token, globals)) continue
        const fg = resolveForeground(token, globals)
        if (!fg) {
          fail(
            '4',
            `${file} paints "${token}" inside a <TileCaption> and ${GLOBALS} declares no such colour token, ` +
              'so Tailwind emits nothing for it and the label silently inherits whatever is above it. The ' +
              'requirement cannot be recomputed for a colour that does not exist.',
          )
          continue
        }
        if (!foregrounds.has(token)) foregrounds.set(token, { fg, file })
      }
    }
  }
}

if (declaredAlpha !== null && foregrounds.size === 0) {
  fail(
    '4',
    'no foreground colour was found inside any <TileCaption>, so the requirement was recomputed from ' +
      'nothing. Either every caption stopped declaring a text colour or this clause stopped being able to ' +
      'read one, and both are defects.',
  )
}
for (const [token, { fg, file }] of foregrounds) {
  if (declaredAlpha === null) break
  const bg = over(NAVY, declaredAlpha, WORST_PHOTOGRAPH)
  const achieved = ratio(over(fg.rgb, fg.alpha, bg), bg)
  if (achieved < NORMAL_TEXT_FLOOR) {
    const need = requiredAlphaFor(fg)
    fail(
      '4',
      `the tile caption wash is ${declaredAlpha} navy, which puts ${token} (used in ${file}) at ` +
        `${achieved.toFixed(2)}:1 over a white photograph, under WCAG 2.2 SC 1.4.3's ${NORMAL_TEXT_FLOOR}:1. ` +
        `Either raise the shared floor to ${need === null ? 'no value that works: the colour itself must change' : need.toFixed(3)} or stop painting that colour on a picture.`,
    )
  }
}

/* ── THE REPORT. Printed on every run, green or red, because a derivation
 * nobody can see is a list wearing a derivation's clothes. ───────────────── */
const painters = deriveTilePainters()
console.log(
  `[tile-label-over-a-photograph] ${painters.length} tile painter(s) derived from src/components/media: ${painters.join(', ')}`,
)
console.log(
  `[tile-label-over-a-photograph] ${allTsxFiles().filter(rendersTileCaption).length} file(s) render <TileCaption>; ` +
    `${SURFACES.length} paint an unbacked label outside it; register holds ${TILE_LABELS_NOT_YET_ON_THE_SHARED_CAPTION.length} entr(ies)`,
)
if (declaredAlpha !== null) {
  const worst = [...foregrounds.entries()]
    .map(([token, { fg }]) => ({ token, need: requiredAlphaFor(fg) }))
    .sort((a, b) => (b.need ?? 1) - (a.need ?? 1))[0]
  console.log(
    `[tile-label-over-a-photograph] wash ${declaredAlpha} navy; ${foregrounds.size} foreground(s) recomputed; ` +
      `worst is ${worst ? `${worst.token} needing ${worst.need === null ? 'more than 1' : worst.need.toFixed(3)}` : 'none'}`,
  )
}
for (const entry of TILE_LABELS_NOT_YET_ON_THE_SHARED_CAPTION) {
  console.log(`[tile-label-over-a-photograph] REGISTERED: ${entry.file} - ${entry.measured}`)
}

if (FAILURES.length) {
  console.error('\n[tile-label-over-a-photograph] FAILED')
  for (const f of FAILURES) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log('[tile-label-over-a-photograph] PASS')
