/**
 * WHICH FILES ARE HEROES THAT PAINT TEXT ON A PHOTOGRAPH. Derived from the
 * source tree on every run, never listed.
 *
 * THE INCIDENT, 20 September 2026. `hero-text-over-a-photograph.mjs` opened
 * with the sentence "derived from the one thing they all must do rather than
 * listed, so a new one cannot be added without this guard noticing it", and
 * then listed five files by hand. Thirteen files on the platform carry a hero
 * that paints text on a photograph. Eight of them were not in the list, every
 * one of those eight carried its OWN hand-written navy gradient, and driving
 * them found 34 runs below their WCAG 2.2 SC 1.4.3 floor, including a gold
 * eyebrow at 1.01:1 with 100 per cent of its pixels failing. The guard had been
 * green the whole time and was right about everything it could see.
 *
 * A comment that claims a derivation does not perform one. This file performs
 * it.
 *
 * THE DERIVATION, and why these two marks and not a list of names.
 *
 *   1. The file carries the LOCKED HERO SCALE, `.hero-marketing` or
 *      `.hero-marketing-grow`. CLAUDE.md fixes one hero scale for the whole
 *      platform and `hero-scale-one-source.mjs` already refuses a hero that
 *      sizes itself any other way, so a hero cannot avoid this mark without
 *      failing a different registered guard first.
 *
 *   2. The file renders `<HeroMedia`, which is the only component permitted to
 *      paint a content photograph (media architecture law: no raw `<img>`, no
 *      `background-image` for content, no `next/image` in feature code), and
 *      `no-raw-img.mjs` and the media guards already hold that.
 *
 * So the derivation rests on two laws that are separately enforced rather than
 * on anybody remembering to append a path. A new hero has to carry both marks
 * to be a hero at all, and the moment it does, this function returns it and the
 * guard judges it.
 *
 * WHAT IT DELIBERATELY DOES NOT MATCH. `src/app/events/[slug]/loading.tsx`
 * carries the scale and no `HeroMedia`: it is the skeleton, it paints no
 * photograph and there is nothing for a wash to protect. It is excluded by the
 * second mark rather than by name.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

/** The locked hero scale token. One scale for the whole platform (CLAUDE.md). */
const HERO_SCALE = /\bhero-marketing(-grow)?\b/
/** The only component allowed to paint a content photograph. */
const HERO_PHOTOGRAPH = /<HeroMedia[\s/>]/

/**
 * Below this many derived heroes, something has been renamed and the guard
 * would be silently judging almost nothing. Loud failure beats quiet coverage:
 * the count on 20 September 2026 was 13.
 */
const IMPLAUSIBLY_FEW = 8

/** Only files that could paint a full-bleed photograph are parsed. */
const PRE_FILTER = /<HeroMedia[\s/>]|band-full-bleed|url\(/
const URL_IN_STYLE = /url\(/
/**
 * A photograph pinned BEHIND THE PAGE, which is a different thing from a
 * photograph that is merely absolutely positioned.
 *
 * THE DISTINCTION COST ONE WRONG CONDITION BEFORE IT WAS RIGHT. The first
 * version asked "is it absolute", and every hero banner on the platform is:
 * the picture fills a box that is itself in flow with a declared height, and
 * the copy follows that box down the page. `organiser-profile-hero.tsx` is
 * exactly that and the condition accused it of painting words on its own
 * cover, which the drive had already measured it not doing.
 *
 * A backdrop says so explicitly, because it has to: it carries a NEGATIVE
 * z-index so the whole page paints on top of it. `/queue/[slug]` writes
 * `absolute inset-0 -z-10`. That is the signal, and it is the author's own.
 */
const BEHIND_THE_PAGE = /-z-\d|z-index:\s*-/
/** A wrapper that exists only to position the picture, not to occupy space. */
const ABSOLUTELY_POSITIONED = /\babsolute\b|\bfixed\b/

/**
 * The shared wash's own floor, READ FROM THE MODULE THAT DECLARES IT rather
 * than written again here. An entry that says "my wash is already as strong as
 * the shared one" has to mean the shared one as it is today, not as it was when
 * the entry was typed, or the register drifts in exactly the way it exists to
 * prevent.
 */
const SHARED_WASH_MIN_ALPHA = (() => {
  const src = readFileSync('src/components/media/hero-photo-scrim.ts', 'utf8')
  const m = src.match(/HERO_CAPTION_MIN_ALPHA\s*=\s*([0-9.]+)/)
  if (!m) {
    throw new Error(
      'hero-photo-scrim.ts no longer declares HERO_CAPTION_MIN_ALPHA, so no register entry can say what "as strong as the shared wash" means.',
    )
  }
  return Number(m[1])
})()
/** A translucent stop inside a hand-written gradient. */
const RGBA_STOP = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)/g

/**
 * THE BODY OF EVERY `linear-gradient(...)`, WITH ITS PARENTHESES BALANCED.
 *
 * WHY THIS IS NOT A REGULAR EXPRESSION, and the drill that proved it. The first
 * version was `/linear-gradient\(([^;]*?)\)/g`, which reads correctly and is
 * wrong for one reason: a gradient's stops are themselves function calls, so
 * the first `)` in `linear-gradient(180deg, rgba(10,22,40,0.36) 0%, ...)` closes
 * the RGBA, not the gradient. The non-greedy body came back as
 * `180deg, rgba(10,22,40,0.36` - with no complete `rgba(...)` in it - so the
 * clause built on it matched NOTHING, on any file, ever. It was written, it
 * read as a tightening of the rule, and the only thing that caught it was the
 * drill firing a violation at it and watching the guard pass.
 *
 * Nesting is a counting problem, so this counts.
 */
export function gradientBodies(src) {
  const bodies = []
  const NEEDLE = 'linear-gradient('
  let at = src.indexOf(NEEDLE)
  while (at !== -1) {
    let depth = 1
    let i = at + NEEDLE.length
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth += 1
      else if (src[i] === ')') depth -= 1
      i += 1
    }
    if (depth === 0) bodies.push(src.slice(at + NEEDLE.length, i - 1))
    at = src.indexOf(NEEDLE, at + NEEDLE.length)
  }
  return bodies
}

/**
 * The alphas of every WASH stop this source paints: a stop inside a gradient
 * that is both dark and translucent. Comments are stripped first, because every
 * conversion in this class quotes the gradient it deleted.
 */
export function gradientWashAlphas(src) {
  const alphas = []
  for (const body of gradientBodies(stripComments(src))) {
    for (const [, r, g, b, a] of body.matchAll(RGBA_STOP)) {
      if (Number(a) < 1 && Math.max(Number(r), Number(g), Number(b)) <= DARK_CHANNEL_CEILING) alphas.push(Number(a))
    }
  }
  return alphas
}

/** Does this source paint its own translucent dark wash over a photograph? */
export const paintsOwnWash = src => gradientWashAlphas(src).length > 0
/** Tailwind's `bg-ink-900/85`: the same decision, written shorter. */
const TAILWIND_ALPHA = /\bbg-(?:ink|navy)-9\d0\/(\d{2,3})\b/g
/**
 * How dark a gradient stop has to be before it counts as a WASH rather than as
 * decoration. Gold (232,183,56) is a brand hairline and an indicator ramp on
 * FeaturedHeroClient; navy (10,22,40) and the off-brand (10,14,26) the auth
 * panel used are washes. The brightest channel separates them cleanly at half.
 */
const DARK_CHANNEL_CEILING = 127

/**
 * Comments are not code, and a guard that reads them punishes the record.
 * Every conversion in this class documents the gradient it DELETED, quoting it
 * so the next reader can see what was wrong; `auth-shell.tsx` does exactly that.
 * Testing the raw source made the guard fail on its own paper trail.
 */
export const stripComments = src =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (entry.endsWith('.tsx')) out.push(path.replace(/\\/g, '/'))
  }
  return out
}

/** Every `.tsx` under the tree, as repo-relative POSIX paths, sorted. */
export function allSourceFiles(root = 'src') {
  return walk(root).sort()
}

/**
 * ── THE RATCHET. Heroes NOT YET on the shared wash, each with the reason. ──
 *
 * It lives here rather than in the guard because the guard, the drive and the
 * suite all have to agree about it, and three copies of one list is the exact
 * mistake this file exists to end.
 *
 * This is not an exemption list and it cannot behave like one. It only ever
 * shrinks, and `hero-text-over-a-photograph.mjs` enforces all three rules:
 *
 *   - a hero off the shared wash that is NOT in here fails the build, so the
 *     debt can never grow;
 *   - an entry whose reason has STOPPED BEING TRUE fails the build, so the
 *     debt cannot rot into a list nobody rereads;
 *   - every entry is printed on every run, with its measurement, so it is read
 *     rather than trusted.
 *
 * `stillTrue` is what makes the second rule enforceable: an entry states the
 * condition that justifies it as code, and the guard re-evaluates it.
 */
export const NOT_YET_ON_THE_SHARED_WASH = [
  {
    file: 'src/components/templates/OrganisersLandingPage.tsx',
    lane: 'B (the organiser marketing surfaces)',
    measured: '13 runs below floor at 390/768/1440 on 20 September 2026: eyebrow 1.04:1, headline 1.49:1',
    record: 'REVIEW-QUEUE-C.md, BORDER line of 20 September 2026',
  },
  {
    file: 'src/app/launch/page.tsx',
    lane: 'B (the organiser marketing surfaces)',
    measured: '5 runs below floor on 20 September 2026: eyebrow 1.50:1 at 390, 100% of its pixels',
    record: 'REVIEW-QUEUE-C.md, BORDER line of 20 September 2026',
  },
  {
    file: 'src/app/forecast/page.tsx',
    lane: 'B (pricing configuration: the organiser payout forecast)',
    measured: 'PASSES at 390, 768 and 1440 on 20 September 2026. Consistency, not a live failure',
    record: 'REVIEW-QUEUE-C.md, BORDER line of 20 September 2026',
  },
  {
    /*
     * The shared empty state is the one entry here that is not a border. Its
     * photographic branch is UNREACHABLE: `onPhoto` is `!!coverImage` and not
     * one of its eleven call sites passes `coverImage`, so nothing on the
     * platform can render its text over a picture. Converting a branch no
     * caller can reach would be speculative work on dead code; leaving it
     * unguarded would mean that the day somebody passes a cover, a 0.42 navy
     * wash ships under a headline. So the condition IS the entry.
     */
    file: 'src/components/ui/CategoryHeroEmpty.tsx',
    lane: 'C (this lane)',
    measured: 'not measurable: the photographic branch has no caller',
    record: 'BUILD-LOG-C.md, 20 September 2026',
    stillTrue: () => {
      const withCover = []
      for (const f of allSourceFiles()) {
        if (f.endsWith('src/components/ui/CategoryHeroEmpty.tsx')) continue
        const src = readFileSync(f, 'utf8')
        for (const call of src.matchAll(/<CategoryHeroEmpty\b[^>]*>/g)) {
          if (/\bcoverImage\s*=/.test(call[0])) withCover.push(f)
        }
      }
      return withCover.length === 0
        ? { ok: true }
        : {
            ok: false,
            why: `${withCover.length} call site(s) now pass coverImage (${withCover.join(', ')}), so the photographic branch IS reachable and must move onto <HeroCaption>`,
          }
    },
  },
  /* ── The two the SECOND derivation added, 20 September 2026 ───────────────
   *
   * Neither is a hero and neither carries the hero scale token, which is why
   * nothing had ever judged them. Each states the condition that justifies it,
   * as code, and `hero-text-over-a-photograph.mjs` clause 0 re-evaluates both on
   * every build.
   *
   * THERE WERE FIVE HERE FOR AN HOUR. The other three - the organiser banner,
   * the squad cover card and the dead split-state hero - were false positives
   * of a climb that did not yet stop at a flow box, and the honest answer to a
   * false positive is to fix the derivation, not to write it an excuse. See
   * `enclosingJsxElement`.
   */
  {
    /*
     * A PAGE BACKDROP, NOT A CAPTION. The photograph is pinned behind
     * everything at `-z-10` and the whole room is painted on top of it, so it
     * genuinely IS text over a photograph and a caption wash is the wrong
     * shape: there is no caption, there is a page. What makes it safe is that
     * the room already paints a wash at least as strong as the shared one, and
     * that is the condition, re-read from the file every build.
     */
    file: 'src/app/queue/[slug]/queue-room.tsx',
    lane: 'C (this lane)',
    measured: 'its own overlay is bg-ink-900/85 plus a second gradient on top, against the shared wash floor',
    record: 'BUILD-LOG-C.md, 20 September 2026',
    stillTrue: () => washIsAtLeastAsStrongAsShared('src/app/queue/[slug]/queue-room.tsx'),
  },
  {
    /*
     * MEASURED GREEN, AND ITS WASH IS THE RIGHT SHAPE ALREADY. Unlike the four
     * heroes the incident was made of, this band's gradient does not decay
     * across the middle: it runs 0.86 / 0.82 / 0.90, which is flat and above
     * the shared wash's own floor. Driven over a real photograph at three
     * widths it passed every run. Converting a dual-state band, which renders
     * on a light surface as often as a dark one, to buy nothing measurable is
     * churn; letting it drift lighter is the actual risk, so that is what the
     * condition watches.
     */
    file: 'src/components/features/community/community-organiser-cta.tsx',
    lane: 'C (this lane)',
    measured: '56 of 56 checks PASS at 390/768/1440 on 20 September 2026, /community/aboriginal-torres-strait-islander',
    record: 'C:\\dev\\EVIDENCE\\PHOTO-TEXT\\drive-red-bands\\drive.json',
    stillTrue: () => washIsAtLeastAsStrongAsShared('src/components/features/community/community-organiser-cta.tsx'),
  },
]

/** "Its own wash is already at least as strong as the shared one." */
function washIsAtLeastAsStrongAsShared(file) {
  const weakest = weakestOwnWashAlpha(file)
  if (weakest === null) {
    return { ok: false, why: `${file} no longer paints any navy over its photograph, so nothing holds its text at all` }
  }
  return weakest >= SHARED_WASH_MIN_ALPHA
    ? { ok: true }
    : {
        ok: false,
        why: `${file} paints its weakest navy at alpha ${weakest}, below the shared wash's ${SHARED_WASH_MIN_ALPHA}. Either restore it or move onto <HeroCaption>`,
      }
}

/* ══ THE SECOND DERIVATION, 20 September 2026 ═══════════════════════════════
 *
 * THE INCIDENT. `deriveHeroFiles` above is a real derivation and it is still
 * wrong, in a way worth writing down because it looks exactly like the thing it
 * replaced. It derives from the LOCKED HERO SCALE, and the same paragraph of the
 * constitution that locks that scale carves an exception out of it: "The two
 * profile heroes (venue, organiser) keep their own inline scale". A derivation
 * whose mark the law itself excepts has those exceptions as blind spots, and
 * nothing about a blind spot looks different from a clean bill of health.
 *
 * WHAT IT COULD NOT SEE, found by asking the DOM instead
 * (`scripts/verify/hero-text-over-photograph-drive.mjs`):
 *
 *   the auth brand panel   the EVENTLINQS wordmark painted `text-ink-900` on a
 *                          photograph: 1.00:1, 100 per cent of 586 core pixels
 *                          below floor, on EVERY sign-in, sign-up,
 *                          password-reset and verification page. Plus the
 *                          strapline at 4.32:1 and the footer line at 4.27:1.
 *   the /about story band  a gold eyebrow at 3.80:1 at 1440, 35.8 per cent of
 *                          its core pixels below floor.
 *
 * Neither file carries the scale token, because neither is a hero. Both paint
 * text on a photograph, which is the thing that actually matters.
 *
 * SO THIS DERIVATION ASKS WHAT A FILE DOES, NOT WHAT IT IS CALLED. Two marks,
 * and the second is structural rather than lexical, because a list of component
 * names is how the first one got its blind spot.
 *
 *   1. THE FILE PAINTS A FULL-BLEED CONTENT PHOTOGRAPH. Three idioms exist on
 *      the platform and all three are matched, including the one the media
 *      architecture law forbids, because a guard that only sees the lawful
 *      idioms cannot see the unlawful one.
 *
 *   2. THE PHOTOGRAPH'S OWN CONTAINER ALSO RENDERS TEXT. Read from the syntax
 *      tree, not from a regular expression: the element that directly holds the
 *      photograph is found, and its subtree is asked whether anything in it
 *      renders words. That is what separates the /about band, which paints an
 *      eyebrow over its picture, from the organiser banner, which paints its
 *      cover and puts every word BELOW it on the page canvas.
 *
 * WHAT THIS DERIVATION CANNOT SEE, said here rather than left to be discovered.
 * A photograph painted as a PAGE BACKDROP, positioned behind everything at
 * `-z-10`, holds no text in its own container and is not matched:
 * `src/app/queue/[slug]/queue-room.tsx` is that shape. The DOM drive measures it
 * correctly, because the browser knows what is behind what and a syntax tree
 * does not. This guard is the ratchet; the drive is the detector.
 */

/** The three idioms that paint a full-bleed content photograph on this platform. */
const FULL_BLEED_PAINTERS = [
  { tag: 'HeroMedia', what: '<HeroMedia>' },
  { tag: 'MarketingMedia', attr: ['variant', 'band-full-bleed'], what: '<MarketingMedia variant="band-full-bleed">' },
  { style: true, what: 'an inline CSS background-image (which docs/MEDIA-ARCHITECTURE.md forbids for content)' },
]

const parseTsx = file =>
  ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

const jsxTag = node => {
  const opening = ts.isJsxElement(node) ? node.openingElement : node
  return opening && opening.tagName ? opening.tagName.getText() : null
}

const jsxAttr = (node, name) => {
  const opening = ts.isJsxElement(node) ? node.openingElement : node
  const props = opening && opening.attributes ? opening.attributes.properties : []
  for (const a of props) {
    if (ts.isJsxAttribute(a) && a.name.getText() === name) return a.initializer ? a.initializer.getText() : ''
  }
  return null
}

/**
 * Does this expression put WORDS on the page, as opposed to more markup?
 * Answered by walking the expression rather than by matching its text, so
 * `{cond ? <A /> : <B />}` is markup and `{venueName}` is words.
 */
function yieldsText(expr) {
  if (!expr) return false
  if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) return false
  if (ts.isParenthesizedExpression(expr)) return yieldsText(expr.expression)
  if (ts.isConditionalExpression(expr)) return yieldsText(expr.whenTrue) || yieldsText(expr.whenFalse)
  if (ts.isBinaryExpression(expr)) return yieldsText(expr.right)
  if (ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) return true
  if (ts.isTemplateExpression(expr) || ts.isNoSubstitutionTemplateLiteral(expr) || ts.isStringLiteral(expr)) return true
  if (ts.isCallExpression(expr)) return true
  return false
}

/** Does anything inside this subtree render words, ignoring `skip`? */
function rendersText(root, skip) {
  let found = false
  const visit = n => {
    if (found || n === skip) return
    if (ts.isJsxText(n) && n.text.trim()) {
      found = true
      return
    }
    if (
      ts.isJsxExpression(n) &&
      n.parent &&
      (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent)) &&
      yieldsText(n.expression)
    ) {
      found = true
      return
    }
    ts.forEachChild(n, visit)
  }
  ts.forEachChild(root, visit)
  return found
}

/**
 * THE BAND THE PHOTOGRAPH SITS IN: the nearest enclosing JSX element that
 * renders words, climbing past any PURE WRAPPER on the way.
 *
 * WHY IT CLIMBS, and it is the difference between a derivation and a list.
 * Taking the nearest enclosing element alone lost `src/app/events/[slug]/page.tsx`,
 * which is a hero this platform has already had to fix once: its `<HeroMedia>`
 * sits in a bare `<div className="absolute inset-0">` that holds the photograph
 * and nothing else, and the caption is that div's SIBLING. So the element that
 * directly holds the photograph renders no words, and a test that stopped there
 * declared the event page clean. A wrapper whose whole subtree renders nothing
 * is not the band; it is packaging around the picture.
 *
 * AND IT ONLY CLIMBS PAST A POSITIONING WRAPPER, which is the clause that keeps
 * it from becoming a list of false positives.
 *
 * THE FIRST VERSION CLIMBED UNCONDITIONALLY, and it matched four files where
 * nothing is painted over anything: a photograph in one grid column with the
 * copy in the other, a cover card with its title underneath, an organiser
 * banner whose name sits below it on the canvas. Each needed a register entry
 * to say so, and a register full of "this one is fine, honestly" is the shape
 * of a list nobody rereads.
 *
 * The distinction is in the markup and it is not a heuristic. A wrapper that
 * exists only to POSITION the picture is absolutely positioned - `absolute
 * inset-0` - and whatever is painted on top of it is a sibling further out, so
 * the band is further out too. A wrapper that occupies FLOW - `relative
 * aspect-video`, `relative h-[50vh]` - is the picture's own box, and anything
 * after it in the document sits BELOW it rather than on it. So: climb out of a
 * positioning wrapper, stop at a flow box. That single clause removed three
 * register entries and no coverage.
 */
function enclosingJsxElement(node, photo) {
  let n = node.parent
  while (n) {
    if (ts.isJsxElement(n)) {
      if (rendersText(n, photo)) return n
      /* A flow box is the photograph's own space. Nothing beyond it is over it. */
      if (!ABSOLUTELY_POSITIONED.test(String(jsxAttr(n, 'className') || ''))) return null
    }
    n = n.parent
  }
  return null
}

/**
 * HOW EACH PHOTOGRAPH IN A FILE IS PLACED, so a register entry can state a
 * condition instead of an opinion.
 *
 * Two facts per photograph, and between them they separate the two honest
 * reasons a matched file may not need the shared wash.
 *
 *   `holderRendersText`  does the element that DIRECTLY holds the photograph
 *                        render any words of its own? This is the question the
 *                        derivation asks BEFORE it climbs, and it is what
 *                        distinguishes a caption painted on a picture from a
 *                        picture with a heading underneath it.
 *   `outOfFlow`          is that holder absolutely positioned? A photograph in
 *                        FLOW pushes the words below it; a photograph taken out
 *                        of flow has the whole page painted on top of it, which
 *                        is what `/queue/[slug]` does at `-z-10`.
 *
 * So "the words are below the picture, not on it" is checkable as
 * `!holderRendersText && !outOfFlow`, and it stops being true the moment
 * somebody drops a caption into that container.
 */
export function photographPlacement(file) {
  const sf = parseTsx(file)
  const out = []
  const visit = node => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTag(node)
      const style = jsxAttr(node, 'style')
      const isPainter =
        tag === 'HeroMedia' ||
        (tag === 'MarketingMedia' && String(jsxAttr(node, 'variant') || '').includes('band-full-bleed')) ||
        Boolean(style && URL_IN_STYLE.test(style))
      if (isPainter) {
        let holder = node.parent
        while (holder && !ts.isJsxElement(holder)) holder = holder.parent
        const holderClass = holder ? String(jsxAttr(holder, 'className') || '') : ''
        out.push({
          tag,
          holderRendersText: holder ? rendersText(holder, node) : false,
          /* Read from whichever of the two carries it: the painter when it
           * fills its holder, the holder when it is the layer pinned behind. */
          behindThePage:
            BEHIND_THE_PAGE.test(holderClass) || BEHIND_THE_PAGE.test(String(jsxAttr(node, 'className') || '')),
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
  return out
}

/**
 * The weakest navy a file paints over its own photograph, as an alpha, or null
 * when it paints none. Read from the file so a register entry that rests on
 * "its wash is already at least as strong as the shared one" fails the day
 * somebody lightens it.
 */
export function weakestOwnWashAlpha(file) {
  const src = readFileSync(file, 'utf8')
  /* Gradient stops, plus Tailwind's `bg-ink-900/85` shorthand, which is the
   * same decision written shorter and is what /queue/[slug] uses. */
  const alphas = gradientWashAlphas(src)
  for (const m of stripComments(src).matchAll(TAILWIND_ALPHA)) alphas.push(Number(m[1]) / 100)
  return alphas.length ? Math.min(...alphas) : null
}

/**
 * Every file that paints text over a full-bleed photograph, as repo-relative
 * POSIX paths with the idiom that found each, sorted. Throws rather than
 * returns a short list, for the same reason `deriveHeroFiles` does.
 */
export function derivePhotographicTextSurfaces(root = 'src') {
  const found = []
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8')
    /* Cheap lexical pre-filter so the parser is only paid for files that could
     * possibly match. Every mark below is re-checked on the tree. */
    if (!PRE_FILTER.test(src)) continue
    let sf
    try {
      sf = parseTsx(file)
    } catch {
      continue
    }
    const hits = new Set()
    const holders = new Set()
    const visit = node => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = jsxTag(node)
        for (const painter of FULL_BLEED_PAINTERS) {
          let matched = false
          if (painter.tag && tag === painter.tag) {
            matched = !painter.attr || String(jsxAttr(node, painter.attr[0]) || '').includes(painter.attr[1])
          } else if (painter.style) {
            const style = jsxAttr(node, 'style')
            matched = Boolean(style && URL_IN_STYLE.test(style))
          }
          if (!matched) continue
          const holder = enclosingJsxElement(node, node)
          if (holder) {
            hits.add(painter.what)
            /* The BAND, not the painter. A carousel writes one <HeroMedia> in a
             * map body and renders five slides from it; that is one band in
             * source and needs one caption. Two separate bands in one file -
             * /about has a hero AND a story band - are two, and need two. */
            holders.add(holder)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(sf, visit)
    /* `walk` already returns POSIX paths, so nothing needs converting here. */
    if (hits.size) found.push({ file, by: [...hits].sort(), bands: holders.size })
  }
  found.sort((a, b) => a.file.localeCompare(b.file))
  if (found.length < IMPLAUSIBLY_FEW) {
    throw new Error(
      `photographic-text derivation found only ${found.length} surface(s) under ${root} (expected at least ${IMPLAUSIBLY_FEW}). ` +
        'A painter component or the media architecture has been renamed. Fix the derivation in ' +
        'scripts/guards/lib/hero-files.mjs rather than lowering this floor: a guard that judges two files ' +
        'while fifteen exist is how a wordmark shipped at 1.00:1 on every auth page.',
    )
  }
  return found
}

/**
 * Every hero on the platform that paints text on a photograph, as repo-relative
 * POSIX paths, sorted. Throws rather than returns a short list, because a
 * derivation that quietly finds three files is worse than no derivation.
 */
export function deriveHeroFiles(root = 'src') {
  const heroes = walk(root)
    .filter(f => {
      const src = readFileSync(f, 'utf8')
      return HERO_SCALE.test(src) && HERO_PHOTOGRAPH.test(src)
    })
    .sort()
  if (heroes.length < IMPLAUSIBLY_FEW) {
    throw new Error(
      `hero derivation found only ${heroes.length} hero file(s) under ${root} (expected at least ${IMPLAUSIBLY_FEW}). ` +
        'Either the locked hero scale token or <HeroMedia> has been renamed. Fix the derivation in ' +
        'scripts/guards/lib/hero-files.mjs rather than lowering this floor: a guard that judges three ' +
        'files while thirteen exist is how eight heroes shipped a 1.01:1 eyebrow.',
    )
  }
  return heroes
}
