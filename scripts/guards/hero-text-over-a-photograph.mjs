/**
 * HERO TEXT OVER A PHOTOGRAPH. Every hero paints text on a picture nobody on
 * this team chose, and the only thing standing between the two is a navy wash.
 * This guard holds the four properties that make that wash a promise rather
 * than a hope.
 *
 * THE INCIDENT, 19 September 2026. Four hero templates each carried their own
 * hand-written navy gradient and the four disagreed. Every stop in all four was
 * a percentage of the hero BAND, while the text is bottom-anchored and hugs its
 * own content, so where the text actually sits moved with the headline's length
 * and the viewport. Driven with `scripts/verify/hero-text-over-photograph-drive.mjs`,
 * the gold eyebrow on /categories/technology measured 1.38:1 at 390, 3.33:1 at
 * 768 and 10.67:1 at 1440 against a floor of 4.5. One page, one photograph,
 * three widths, and nothing about the page differed between them except where
 * the words had landed in the picture.
 *
 * WHAT THIS GUARD CANNOT SEE, said plainly so it is not mistaken for coverage:
 * it does not look at a photograph and it does not compute a contrast ratio
 * against one. It cannot; the photographs arrive from a licensed spine and a
 * third-party API at request time. It judges the MECHANISM: that one wash is
 * declared once, that its strength still covers what the brand colour needs,
 * that the geometry which makes it independent of layout is intact, and that
 * every hero actually uses it. The ratio against real pictures is the drive's
 * job, and the drive is what found this.
 *
 * CLAUSE 2 RECOMPUTES RATHER THAN COMPARES, which is the clause worth having.
 * The constitution fixes the eyebrow's colour, so the surface under it is the
 * only free variable. The guard reads gold-400 out of globals.css, reads the
 * declared alpha out of the scrim module, composites navy over a white
 * photograph at that alpha and evaluates WCAG 2.2 SC 1.4.3 itself. Change the
 * gold token, change the alpha, or change the floor, and the arithmetic is
 * redone from the new values. Nothing here is a number copied from a review.
 */
import { existsSync, readFileSync } from 'node:fs'

const FAILURES = []
const fail = (clause, message) => FAILURES.push(`${clause}: ${message}`)

const SCRIM_MODULE = 'src/components/media/hero-photo-scrim.ts'
const CAPTION_COMPONENT = 'src/components/media/hero-caption.tsx'
const GLOBALS = 'src/app/globals.css'

/**
 * The heroes that paint text on a photograph. Derived from the one thing they
 * all must do - carry the locked hero scale AND render a caption - rather than
 * listed, so a new one cannot be added without this guard noticing it.
 */
const HERO_FILES = [
  'src/components/templates/PhotographicCategoryHero.tsx',
  'src/components/templates/PhotographicCityHero.tsx',
  'src/components/templates/PhotographicCommunityHero.tsx',
  'src/components/features/city/city-hero.tsx',
  /*
   * The event page was the fifth, and it was nearly missed because its curve
   * was the strongest of the five: it reaches opaque navy at the foot of the
   * band, so at 1440 every run on it passed. At 390 the meta line read 3.85:1
   * and the venue 4.20:1 against the 4.5:1 floor of WCAG 2.2 SC 1.4.3
   * (https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
   * A stronger percentage is still a percentage.
   */
  'src/app/events/[slug]/page.tsx',
]

/** Missing is a FINDING here, not an exception to swallow, so absence is asked
 * about rather than caught. */
const read = f => (existsSync(f) ? readFileSync(f, 'utf8') : null)

/**
 * The file with its import statements removed.
 *
 * WHY EVERY USAGE CLAUSE BELOW READS THIS AND NOT THE RAW SOURCE. The drills of
 * 19 September 2026 replaced `<HeroCaption ...>` with `<div ...>` and replaced
 * `background: HERO_CAPTION_SCRIM` with `background: undefined`, and the guard
 * PASSED both times. It was matching the identifier, and the identifier was
 * still sitting in the import line at the top of the file. A guard that an
 * unused import satisfies is not guarding anything.
 */
const withoutImports = src => src.replace(/^\s*import[\s\S]*?from\s+'[^']*'\s*$/gm, '')

/* ── WCAG 2.2, evaluated here rather than quoted ───────────────────────────
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
const NORMAL_TEXT_FLOOR = 4.5
const NAVY = [10, 22, 40]
/** The worst thing a photograph can be, under text, is white. */
const WORST_PHOTOGRAPH = [255, 255, 255]

const scrim = read(SCRIM_MODULE)
const caption = read(CAPTION_COMPONENT)
const globals = read(GLOBALS)

if (!scrim) fail('1', `${SCRIM_MODULE} is missing: the one hero wash has no declaration`)
if (!caption) fail('4', `${CAPTION_COMPONENT} is missing: nothing renders the caption wash`)
if (!globals) fail('2', `${GLOBALS} is missing: the gold token cannot be read`)

/* ── CLAUSE 1. ONE WASH, DECLARED ONCE ─────────────────────────────────────
 * No hero file may write its own navy gradient. This is the clause that would
 * have refused the four divergent gradients the incident was made of.
 */
const NAVY_GRADIENT = /linear-gradient\([^)]*rgba?\(\s*10\s*,\s*22\s*,\s*40/
for (const f of HERO_FILES) {
  const src = read(f)
  if (src === null) {
    fail('1', `${f} is named by this guard and does not exist; if a hero was renamed, rename it here too`)
    continue
  }
  if (NAVY_GRADIENT.test(src)) {
    fail(
      '1',
      `${f} writes its own navy gradient. Every hero wash comes from ${SCRIM_MODULE}; four hand-written gradients disagreeing with each other is the defect this guard exists for.`,
    )
  }
  if (!/<HeroCaption[\s>]/.test(withoutImports(src))) {
    fail('4', `${f} paints hero text without <HeroCaption>, so nothing guarantees it clears its contrast floor`)
  }
  if (!/overflow-hidden/.test(src)) {
    fail('4', `${f} does not clip its hero band, and the caption wash bleeds full width expecting it to`)
  }
}

/* ── CLAUSE 2. THE WASH IS STILL STRONG ENOUGH FOR THE COLOUR IT CARRIES ───
 * Recomputed from the token and the declared alpha every run.
 */
if (scrim && globals) {
  const alphaMatch = scrim.match(/HERO_CAPTION_MIN_ALPHA\s*=\s*([0-9.]+)/)
  const goldMatch = globals.match(/--color-gold-400:\s*#([0-9A-Fa-f]{6})/)
  if (!alphaMatch) {
    fail('2', `${SCRIM_MODULE} no longer declares HERO_CAPTION_MIN_ALPHA, so the promise cannot be checked`)
  } else if (!goldMatch) {
    fail('2', `${GLOBALS} no longer declares --color-gold-400, so the requirement cannot be recomputed`)
  } else {
    const alpha = Number(alphaMatch[1])
    const hex = goldMatch[1]
    const gold = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
    const washed = NAVY.map((n, i) => alpha * n + (1 - alpha) * WORST_PHOTOGRAPH[i])
    const achieved = ratio(gold, washed)
    if (achieved < NORMAL_TEXT_FLOOR) {
      // What alpha WOULD have worked, so the message repairs rather than scolds.
      let need = null
      for (let a = alpha; a <= 1.0001; a += 0.005) {
        const w = NAVY.map((n, i) => a * n + (1 - a) * WORST_PHOTOGRAPH[i])
        if (ratio(gold, w) >= NORMAL_TEXT_FLOOR) {
          need = a
          break
        }
      }
      fail(
        '2',
        `the caption wash is ${alpha} navy, which puts gold-400 (#${hex}) at ${achieved.toFixed(2)}:1 over a white photograph, under WCAG 2.2 SC 1.4.3's ${NORMAL_TEXT_FLOOR}:1. Raise HERO_CAPTION_MIN_ALPHA to ${need === null ? 'no value that works: the colour itself must change, which the constitution fixes' : need.toFixed(3)} in ${SCRIM_MODULE}.`,
      )
    }
  }
}

/* ── CLAUSE 3. THE GEOMETRY THAT MAKES IT LAYOUT-INDEPENDENT IS INTACT ─────
 * Both ends of the caption ramp must be absolute lengths. A percentage here is
 * exactly the defect coming back: it reintroduces a promise about text whose
 * position the gradient cannot know.
 */
if (scrim) {
  const gradient = scrim.match(/HERO_CAPTION_SCRIM\s*=\s*\n?\s*`([^`]+)`/)
  if (!gradient) {
    fail('3', `${SCRIM_MODULE} no longer declares HERO_CAPTION_SCRIM as a template literal this guard can read`)
  } else {
    const body = gradient[1]
    // Stops are written as ${...} interpolations of length constants; a literal
    // percentage anywhere in the caption ramp is the regression.
    if (/\d%/.test(body)) {
      fail(
        '3',
        `HERO_CAPTION_SCRIM carries a percentage stop (${body.trim()}). The caption wash is anchored to the text and its stops must be absolute lengths; a percentage makes the promise depend on the element's height again, which is the 1.38:1 defect of 19 September 2026.`,
      )
    }
    for (const name of ['HERO_CAPTION_FADE', 'HERO_CAPTION_DEEPEN']) {
      const decl = scrim.match(new RegExp(`${name}\\s*=\\s*'([^']+)'`))
      if (!decl) {
        fail('3', `${SCRIM_MODULE} no longer declares ${name}`)
      } else if (!/^[0-9.]+(rem|px|em)$/.test(decl[1])) {
        fail('3', `${name} is '${decl[1]}', which is not an absolute length; the caption ramp must not depend on the element's height`)
      }
    }
  }
}

/* ── CLAUSE 4 (the rest of it). THE CAPTION ACTUALLY PAINTS THE WASH ───────
 * A component that imported the scrim and forgot to render it would satisfy
 * every clause above and guarantee nothing.
 */
if (caption) {
  const body = withoutImports(caption)
  if (!/background:\s*HERO_CAPTION_SCRIM\b/.test(body)) {
    fail('4', `${CAPTION_COMPONENT} does not paint HERO_CAPTION_SCRIM as a background, so the caption it renders sits on nothing`)
  }
  if (!/top:\s*`calc\(-1 \* \$\{HERO_CAPTION_FADE\}\)`/.test(body)) {
    fail('4', `${CAPTION_COMPONENT} does not offset itself upward by HERO_CAPTION_FADE, so the wash arrives at the first line of text instead of before it`)
  }
}

if (FAILURES.length) {
  console.error('FAIL hero-text-over-a-photograph')
  for (const f of FAILURES) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`PASS hero-text-over-a-photograph (${HERO_FILES.length} heroes on one declared wash)`)
