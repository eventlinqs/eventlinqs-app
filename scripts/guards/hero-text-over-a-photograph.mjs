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
import {
  NOT_YET_ON_THE_SHARED_WASH,
  derivePhotographicTextSurfaces,
  paintsOwnWash,
  stripComments,
} from './lib/hero-files.mjs'

const FAILURES = []
const fail = (clause, message) => FAILURES.push(`${clause}: ${message}`)

const SCRIM_MODULE = 'src/components/media/hero-photo-scrim.ts'
const CAPTION_COMPONENT = 'src/components/media/hero-caption.tsx'
const GLOBALS = 'src/app/globals.css'

/**
 * The heroes that paint text on a photograph, DERIVED from the source tree by
 * `lib/hero-files.mjs` rather than listed here.
 *
 * THE SENTENCE THAT USED TO STAND IN THIS PLACE claimed the list was derived
 * "so a new one cannot be added without this guard noticing it", and then named
 * five files by hand. On 20 September 2026 the derivation was actually
 * performed and returned THIRTEEN. The eight the list had never held carried
 * eight more hand-written navy gradients between them, and driving them
 * measured 34 runs below their WCAG floor: a gold eyebrow at 1.01:1 on
 * /waitlist with 100 per cent of its pixels failing, a headline at 1.49:1 on
 * /organisers, an eyebrow at 1.01:1 on /about. The guard passed every one of
 * those builds and was correct about all five files it could see.
 *
 * AND ON 20 SEPTEMBER THAT DERIVATION WAS WIDENED AGAIN, for a reason worth
 * keeping because it is subtler than the first. Deriving from the LOCKED HERO
 * SCALE is a real derivation, and the constitution carves an exception out of
 * that very token in the paragraph that locks it: the two profile heroes keep
 * their own inline scale. So the mark had documented blind spots, and behind
 * them sat the auth brand panel, whose EVENTLINQS wordmark was painting
 * `text-ink-900` on a photograph at 1.00:1 with 100 per cent of its 586 core
 * pixels below floor, on every sign-in and sign-up page on the platform. The
 * subject list is now every file that paints text over a full-bleed photograph,
 * whatever it is called and whatever scale it uses: 22 files, against 13.
 */
const SURFACES = derivePhotographicTextSurfaces()
const HERO_FILES = SURFACES.map(s => s.file)

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

/**
 * The file as CODE: no imports, no comments.
 *
 * THE SECOND HALF OF THIS WAS ADDED ON 20 SEPTEMBER 2026 BY A DRILL. The
 * caption clause matched `<HeroCaption` anywhere in the source, and the
 * conversion of `auth-shell.tsx` carries a comment explaining what
 * `<HeroCaption>` now guarantees there. So the drill that tore the caption out
 * of the auth panel left that sentence behind, and the guard read its own
 * documentation and passed. It is the same hole as the unused import above,
 * one layer along: a guard that a COMMENT satisfies is not guarding either.
 */
const asCode = src => stripComments(withoutImports(src))

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
 * No file in this class may write its own wash. This is the clause that would
 * have refused the four divergent gradients the first incident was made of.
 *
 * IT USED TO MATCH ONE COLOUR, AND THAT WAS A HOLE. The pattern was
 * `rgba(10,22,40`, the brand navy, written out. `auth-shell.tsx` washed its
 * photograph in `rgba(10,14,26)`, which is not the brand navy at all and which
 * the design system's "no new colours" rule already forbids, so the one file on
 * the platform whose wordmark was measured at 1.00:1 would have walked past
 * this clause even if it had been in the subject list. A wash is not a
 * particular triple; it is a TRANSLUCENT DARK gradient, and that is now what is
 * matched. Gold stays legal: `FeaturedHeroClient` paints an indicator ramp in
 * rgba(232,183,56) and a brand hairline, and neither is a wash.
 */
const writesOwnWash = paintsOwnWash

const registered = new Map(NOT_YET_ON_THE_SHARED_WASH.map(e => [e.file, e]))

/* ── CLAUSE 0. THE RATCHET ONLY EVER SHRINKS ───────────────────────────────
 * Judged BEFORE the conversion clauses, because an entry that has stopped
 * being true must fail loudly rather than go on excusing a file.
 */
for (const entry of NOT_YET_ON_THE_SHARED_WASH) {
  if (!HERO_FILES.includes(entry.file)) {
    fail(
      '0',
      `the register still carries ${entry.file}, which is no longer a hero that paints text on a photograph (it was renamed, deleted, or stopped rendering <HeroMedia>). Delete the entry.`,
    )
    continue
  }
  const src = read(entry.file)
  const converted = src !== null && !writesOwnWash(src) && /<HeroCaption[\s>]/.test(asCode(src))
  if (converted) {
    fail(
      '0',
      `${entry.file} is now on the shared wash, so its register entry is stale. Delete it: a debt register that keeps a paid debt is a list nobody rereads.`,
    )
  }
  if (entry.stillTrue) {
    const verdict = entry.stillTrue()
    if (!verdict.ok) {
      fail('0', `the register's reason for ${entry.file} has stopped being true: ${verdict.why}`)
    }
  }
}

for (const { file: f, bands } of SURFACES) {
  const src = read(f)
  if (src === null) {
    fail('1', `${f} was derived as a hero and cannot be read`)
    continue
  }
  /* A registered hero is still REPORTED, never silently skipped, so the debt
   * is visible on every run rather than only in this file's source. */
  if (registered.has(f)) continue
  if (writesOwnWash(src)) {
    fail(
      '1',
      `${f} writes its own navy gradient. Every hero wash comes from ${SCRIM_MODULE}; hand-written gradients disagreeing with each other is the defect this guard exists for.`,
    )
  }
  /*
   * ONE CAPTION PER BAND, NOT ONE PER FILE.
   *
   * THIS CLAUSE USED TO ASK "does this file contain a <HeroCaption> anywhere",
   * and a drill on 20 September 2026 showed what that is worth. `/about` paints
   * TWO photographic bands - the hero and the story band - so tearing the
   * caption out of the hero left the story band's behind and the guard passed
   * on a tree with an unprotected hero in it. Files with more than one band are
   * not exotic: /about and the organisers landing page both have two.
   *
   * The count comes from the derivation, which counts BANDS rather than
   * painters, so a carousel that renders five slides from one map body still
   * needs exactly one.
   */
  const captions = (asCode(src).match(/<HeroCaption[\s>]/g) ?? []).length
  if (captions < bands) {
    fail(
      '4',
      `${f} paints hero text without <HeroCaption>, so nothing guarantees it clears its contrast floor` +
        (bands > 1 ? ` (${bands} photographic bands in this file, ${captions} caption(s))` : ''),
    )
  }
  if (!/overflow-hidden/.test(asCode(src))) {
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
/* ── CLAUSE 5. A CHILD STAGGER MUST PARENT THE TEXT, NOT THE WASH ──────────
 *
 * `.hero-enter` staggers its DIRECT children (globals.css:
 * `html[data-motion="1"] .hero-enter > *`). <HeroCaption> puts two elements
 * between its own className and the text, so `hero-enter` written on
 * `className` animates the wash as item one and the entire text block as item
 * two: the eyebrow, headline, meta and CTA arrive together instead of 70ms
 * apart. That is the Motion law's hero entrance quietly deleted, and it would
 * look ALMOST right.
 *
 * NO DRIVE CAN EVER CATCH THIS. The stagger is armed only under
 * `html[data-motion="1"]`, which is deliberately withheld from headless agents
 * so audits see the settled state, so every screenshot and every contrast sweep
 * shows the correct final frame. It is checkable only here, which is exactly
 * why it is here: this mistake was made while converting the five heroes on
 * 20 September 2026 and was caught by reading the stylesheet rather than by any
 * measurement.
 */
const STAGGER_CLASSES = ['hero-enter', 'hero-slide-content']
for (const f of HERO_FILES) {
  const src = read(f)
  if (src === null || registered.has(f)) continue
  for (const tag of withoutImports(src).matchAll(/<HeroCaption\b[\s\S]*?>/g)) {
    const outer = tag[0].match(/(?<!content)className=(?:"([^"]*)"|\{`([^`]*)`\})/)
    if (!outer) continue
    const value = outer[1] ?? outer[2] ?? ''
    for (const cls of STAGGER_CLASSES) {
      if (new RegExp(`\\b${cls}\\b`).test(value)) {
        fail(
          '5',
          `${f} puts "${cls}" on <HeroCaption className=...>, which is two elements above the text. ` +
            'A child stagger there animates the wash and the whole block instead of the eyebrow, headline, ' +
            'meta and CTA in turn. Move it to contentClassName, which parents the text directly.',
        )
      }
    }
  }
}

if (caption) {
  const body = withoutImports(caption)
  /* The prop that makes clause 5 possible has to actually reach the element
   * that parents the text, or the instruction the failure gives is a lie. */
  if (!/<div className=\{`relative \$\{contentClassName\}`\}>\{children\}<\/div>/.test(body)) {
    fail(
      '5',
      `${CAPTION_COMPONENT} no longer applies contentClassName to the element that directly parents the caption text, so a child stagger moved there would animate nothing`,
    )
  }
  if (!/background:\s*HERO_CAPTION_SCRIM\b/.test(body)) {
    fail('4', `${CAPTION_COMPONENT} does not paint HERO_CAPTION_SCRIM as a background, so the caption it renders sits on nothing`)
  }
  if (!/top:\s*`calc\(-1 \* \$\{HERO_CAPTION_FADE\}\)`/.test(body)) {
    fail('4', `${CAPTION_COMPONENT} does not offset itself upward by HERO_CAPTION_FADE, so the wash arrives at the first line of text instead of before it`)
  }
}

/* THE REGISTER IS PRINTED, ALWAYS, PASS OR FAIL. A debt that is only visible
 * by opening this file is a debt nobody sees. */
if (NOT_YET_ON_THE_SHARED_WASH.length) {
  console.log(`  ${NOT_YET_ON_THE_SHARED_WASH.length} hero(es) not yet on the shared wash, each with its reason:`)
  for (const e of NOT_YET_ON_THE_SHARED_WASH) {
    console.log(`    ${e.file}`)
    console.log(`      lane ${e.lane} | ${e.measured}`)
    console.log(`      record: ${e.record}`)
  }
}

if (FAILURES.length) {
  console.error('FAIL hero-text-over-a-photograph')
  for (const f of FAILURES) console.error(`  ${f}`)
  process.exit(1)
}
console.log(
  `PASS hero-text-over-a-photograph (${HERO_FILES.length} heroes derived, ` +
    `${HERO_FILES.length - NOT_YET_ON_THE_SHARED_WASH.length} on one declared wash)`,
)
