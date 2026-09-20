/**
 * WHICH FILES PAINT A LABEL ON A TILE PHOTOGRAPH. Derived from the source tree
 * on every run, never listed.
 *
 * WHY THIS EXISTS BESIDE `hero-files.mjs` RATHER THAN INSIDE IT. That module
 * derives the surfaces that paint text on a FULL-BLEED photograph, and it does
 * so from the three painters that can produce one: `<HeroMedia>`,
 * `<MarketingMedia variant="band-full-bleed">` and an inline CSS
 * `background-image`. It was written on 20 September 2026, it was correct, and
 * it was green while thirteen TILE captions on the same platform carried
 * hand-written washes of their own and 149 measured runs sat below their WCAG
 * 2.2 SC 1.4.3 floor. A tile photograph is painted by a different set of media
 * components, so no amount of care inside the hero derivation could have
 * reached it. The defect is the same; the derivation has to ask a second
 * question.
 *
 * THE DERIVATION, and why the painter set is itself derived.
 *
 *   1. THE FILE PAINTS A TILE PHOTOGRAPH. `docs/MEDIA-ARCHITECTURE.md` makes
 *      `src/components/media/` the only place an image may be painted, and
 *      `no-raw-img.mjs` holds that, so the set of components that can paint one
 *      is the set of image-painting components in that directory. It is read
 *      out of the directory on every run rather than typed here, minus the two
 *      FULL-BLEED painters `hero-files.mjs` already owns, so a new media
 *      component is judged the day it lands instead of the day somebody
 *      remembers it.
 *
 *   2. SOMETHING IS PAINTED ON TOP OF IT. Read from the syntax tree: inside the
 *      photograph's own FLOW BOX, an element that renders words and is taken
 *      OUT OF FLOW to sit over the picture - `absolute`, `fixed`, or lifted on
 *      its own `z-` layer, which is the only way to paint on a picture that is
 *      itself in flow. A heading BELOW the image is in flow and is not matched,
 *      which is what separates a tile label from the separated-card pattern the
 *      design system actually prefers.
 *
 * AND ONE EXEMPTION THAT IS A CLAUSE RATHER THAN A LIST. A label that carries
 * its OWN background - a solid pill, a badge, a GlassCard - is not painted on
 * the photograph in any sense a reader experiences: what arrives at the eye is
 * the backing. `scripts/verify/hero-text-over-photograph-drive.mjs` already
 * encodes exactly that distinction in the browser (it measures a run against
 * whatever is genuinely behind it, pill or picture), and the first draft of this
 * module instead wrote four register entries saying "this one has a pill,
 * honestly". A register of those is a list nobody rereads, which is the mistake
 * `hero-files.mjs` records in its own header. So it is asked as a question.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { gradientWashAlphas, stripComments } from './hero-files.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')

/** Where the media architecture puts every component allowed to paint an image. */
const MEDIA_DIR = 'src/components/media'

/**
 * The two painters that make a FULL-BLEED photograph. They belong to
 * `hero-files.mjs`, and a file that uses one is judged by
 * `hero-text-over-a-photograph.mjs` instead of by this module. Named here so
 * the split between the two guards is stated in one place rather than implied
 * by two absences.
 */
const FULL_BLEED_PAINTERS = new Set(['HeroMedia', 'MarketingMedia'])

/**
 * An avatar is a photograph of a person at 32 to 96px with a name BESIDE it.
 * It is excluded by the out-of-flow rule below rather than by this set, which
 * exists only to keep the painter list honest about what it is: every entry
 * here would be matched by mark 1 and none can ever be matched by mark 2.
 */
const NEVER_A_TILE = new Set(['OrganiserAvatar', 'OrganiserLogoMark'])

/**
 * Below this many tile painters, the media directory has been moved or renamed
 * and this module would be judging nothing. The count on 20 September 2026 was
 * eight. Loud failure beats quiet coverage.
 */
const IMPLAUSIBLY_FEW_PAINTERS = 5

/** An element taken out of flow, or lifted onto its own layer, to sit over a picture. */
const OVER_THE_PICTURE = /\babsolute\b|\bfixed\b|(?:^|\s)z-\d+\b/
/** A wrapper that exists only to position the picture, not to occupy space. */
const ABSOLUTELY_POSITIONED = /\babsolute\b|\bfixed\b/
/**
 * A Tailwind background with its opacity, `bg-white`, `bg-ink-900/80`,
 * `bg-ink-900/[0.92]` or `bg-[var(--surface-0)]/95`. The alpha is what matters,
 * so it is captured rather than the token.
 */
const BACKGROUND_CLASS = /\bbg-(?!transparent\b)(?:\[[^\]]+\]|[a-z0-9-]+)(?:\/(?:\[([0-9.]+)\]|(\d{1,3})))?/g

/**
 * How much of the photograph a stack of backings has to cover before the words
 * on top of it are reading a backing rather than a picture.
 *
 * IT IS THE SHARED WASH'S OWN FLOOR, read from the module that declares it, for
 * the reason the wash has that number at all: at this alpha the photograph
 * contributes at most the remainder, and the worst foreground the platform
 * paints still clears 4.5:1 over the worst picture it can carry. A solid pill is
 * alpha 1 and passes trivially; `bg-ink-900/80` over a `bg-ink-900/30` scrim
 * composites to 0.86 and passes on the arithmetic rather than on a judgement.
 *
 * AND THE HONEST LIMIT, said here rather than discovered later: this clause is
 * the RATCHET, not the detector. It reads declared alphas out of a class list;
 * `scripts/verify/hero-text-over-photograph-drive.mjs` reads the pixels a reader
 * actually receives, through a translucent pill and everything else, and is what
 * finds a backing that is dark enough in theory and wrong in practice.
 */
const BACKING_FLOOR = (() => {
  const src = readFileSync('src/components/media/hero-photo-scrim.ts', 'utf8')
  const m = src.match(/HERO_CAPTION_MIN_ALPHA\s*=\s*([0-9.]+)/)
  if (!m) {
    throw new Error(
      'hero-photo-scrim.ts no longer declares HERO_CAPTION_MIN_ALPHA, so no clause here can say how much ' +
        'backing makes a label self-backed.',
    )
  }
  return Number(m[1])
})()

/**
 * Components that ARE a backing. `<GlassCard variant="dark">` exists to be one,
 * and its alpha is read out of its own source so this cannot drift the day
 * somebody lightens it.
 */
const BACKED_COMPONENTS = (() => {
  const src = readFileSync('src/components/ui/glass-card.tsx', 'utf8')
  const alphas = [...src.matchAll(BACKGROUND_CLASS)].map(m => alphaOfMatch(m)).filter(a => a !== null)
  if (alphas.length === 0) {
    throw new Error('glass-card.tsx no longer declares a background, so nothing here can call it a backing.')
  }
  return new Map([['GlassCard', Math.min(...alphas)]])
})()

/** The alpha a `bg-` match declares: 1 when it names no opacity. */
function alphaOfMatch(m) {
  if (m[1] !== undefined) return Number(m[1])
  if (m[2] !== undefined) return Number(m[2]) / 100
  return 1
}

/** The strongest backing this class list declares, or null when it declares none. */
function backingAlphaOf(className) {
  const alphas = [...String(className).matchAll(BACKGROUND_CLASS)].map(alphaOfMatch)
  return alphas.length ? Math.max(...alphas) : null
}

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

const classOf = node => String(jsxAttr(node, 'className') || '')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (entry.endsWith('.tsx')) out.push(path.replace(/\\/g, '/'))
  }
  return out
}

/**
 * Every component that paints a TILE photograph, derived from the media
 * directory rather than listed. Exported so the guard can print what it judged
 * against instead of asking a reader to trust it.
 */
export function deriveTilePainters() {
  const painters = []
  for (const file of walk(MEDIA_DIR)) {
    const name = file.slice(file.lastIndexOf('/') + 1).replace(/\.tsx$/, '')
    if (FULL_BLEED_PAINTERS.has(name) || NEVER_A_TILE.has(name)) continue
    const src = readFileSync(file, 'utf8')
    /* It paints an image if it renders one. Both idioms are matched, including
     * the raw <img> the media surfaces use for local SVGs. */
    if (!/<Image[\s/>]|<img[\s/>]/.test(src)) continue
    if (!new RegExp(`export function ${name}\\b`).test(src)) continue
    painters.push(name)
  }
  painters.sort()
  if (painters.length < IMPLAUSIBLY_FEW_PAINTERS) {
    throw new Error(
      `tile-painter derivation found only ${painters.length} painter(s) under ${MEDIA_DIR} ` +
        `(expected at least ${IMPLAUSIBLY_FEW_PAINTERS}). The media directory has been moved or its ` +
        'components renamed. Fix the derivation in scripts/guards/lib/tile-files.mjs rather than lowering ' +
        'this floor: a guard that judges two painters while eight exist is how thirteen tile captions ' +
        'shipped a 1.00:1 label.',
    )
  }
  return painters
}

/** Does this expression put WORDS on the page, as opposed to more markup? */
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

/**
 * THE TILE: the photograph's own FLOW BOX, climbing past any wrapper that
 * exists only to position the picture.
 *
 * The clause is `hero-files.mjs`'s and the reasoning is recorded there in full:
 * a wrapper that is absolutely positioned is packaging around the picture and
 * whatever is painted on top of it is further out; a wrapper that occupies flow
 * - `relative aspect-[4/5]`, `relative h-40` - is the picture's own space, and
 * anything after it in the document sits BELOW it rather than on it.
 */
function tileBox(painterNode) {
  let n = painterNode.parent
  while (n) {
    if (ts.isJsxElement(n)) {
      if (!ABSOLUTELY_POSITIONED.test(classOf(n))) return n
    }
    n = n.parent
  }
  return null
}

/**
 * How much backing sits between these words and the photograph, composited
 * across every layer that declares one.
 *
 * THE FIRST VERSION ASKED THE QUESTION AT THE WRONG ELEMENT and it is worth
 * recording, because it was green in the way that matters least. It stopped at
 * the OUTERMOST out-of-flow element that rendered any text, and on
 * `event-bento-tile.tsx` that is `relative z-10 flex items-start justify-between`,
 * a bare flex row with no background of its own whose every child is a solid
 * pill or a `<GlassCard>`. The guard accused a row of chips of painting words on
 * a photograph. The question belongs at the words.
 */
function backingUnder(el, box) {
  let covered = flatScrimUnder(el, box)
  for (let n = el; n && n !== box; n = n.parent) {
    if (!ts.isJsxElement(n) && !ts.isJsxSelfClosingElement(n)) continue
    const tag = jsxTag(n)
    let alpha = tag && BACKED_COMPONENTS.has(tag) ? BACKED_COMPONENTS.get(tag) : null
    if (alpha === null) alpha = backingAlphaOf(classOf(n))
    if (alpha === null) {
      const style = jsxAttr(n, 'style')
      /* An inline `background: 'rgb(...)'` is opaque by construction; an
       * `rgba()` declares its own alpha and is read rather than assumed. */
      if (style && /background(?:Color)?\s*:/.test(style)) {
        const rgba = style.match(/rgba\([^)]*?,\s*([0-9.]+)\s*\)/)
        alpha = rgba ? Number(rgba[1]) : 1
      }
    }
    if (alpha === null) continue
    /* Layers composite: what is left showing through two backings is the
     * product of what each leaves showing. */
    covered = 1 - (1 - covered) * (1 - alpha)
  }
  return covered
}

/**
 * A FLAT full-bleed scrim painted inside this tile, before the label, backs
 * every pixel of the photograph including the ones under the words.
 *
 * FLAT, AND THAT WORD IS DOING ALL THE WORK. `bg-ink-900/30` on `absolute
 * inset-0` covers the whole picture at one alpha, so it genuinely sits under
 * anything painted on top of it, wherever that lands. A full-bleed GRADIENT does
 * not and must never be counted here: a ramp is a different alpha at every
 * height, and "the wash is a percentage of the tile so the label may meet it
 * anywhere" is the entire defect this guard exists to stop. A gradient is
 * declared in `style`, never in a `bg-` class, so the two are separated by
 * construction rather than by a test that could be fooled.
 */
function flatScrimUnder(el, box) {
  let covered = 0
  const visit = n => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const cls = classOf(n)
      const alpha = backingAlphaOf(cls)
      const style = jsxAttr(n, 'style')
      if (
        alpha !== null &&
        /\babsolute\b/.test(cls) &&
        /\binset-0\b/.test(cls) &&
        !(style && /gradient/.test(style)) &&
        n.pos < el.pos
      ) {
        covered = 1 - (1 - covered) * (1 - alpha)
      }
    }
    ts.forEachChild(n, visit)
  }
  ts.forEachChild(box, visit)
  return covered
}

/** Does this element render words of its OWN, as opposed to containing markup that does? */
function hasOwnText(node) {
  for (const child of node.children || []) {
    if (ts.isJsxText(child) && child.text.trim()) return true
    if (ts.isJsxExpression(child) && yieldsText(child.expression)) return true
  }
  return false
}

/**
 * Every label this tile paints ON its photograph: an element inside the tile
 * that renders words OF ITS OWN, sits over the picture because it or an
 * ancestor inside the tile is taken out of flow, is not already inside
 * `<TileCaption>`, and does not have `BACKING_FLOOR` worth of backing under it.
 */
function onPhotoLabels(box) {
  const labels = []
  const visit = (n, insideCaption, outOfFlow) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      if (jsxTag(n) === 'TileCaption') {
        /* Everything under the shared caption is held by the shared wash. */
        ts.forEachChild(n, c => visit(c, true, outOfFlow))
        return
      }
      const over = outOfFlow || OVER_THE_PICTURE.test(classOf(n))
      if (!insideCaption && over && ts.isJsxElement(n) && hasOwnText(n) && backingUnder(n, box) < BACKING_FLOOR) {
        labels.push({
          className: classOf(n).replace(/^["'{`]|["'}`]$/g, '').slice(0, 70),
          backing: Number(backingUnder(n, box).toFixed(2)),
        })
      }
      ts.forEachChild(n, c => visit(c, insideCaption, over))
      return
    }
    ts.forEachChild(n, c => visit(c, insideCaption, outOfFlow))
  }
  ts.forEachChild(box, c => visit(c, false, false))
  return labels
}

/** Does this file declare its own translucent dark gradient? */
export function paintsOwnTileWash(file) {
  return gradientWashAlphas(readFileSync(file, 'utf8')).length > 0
}

/** Does this file render the shared tile caption? */
export const rendersTileCaption = file => /<TileCaption[\s/>]/.test(stripComments(readFileSync(file, 'utf8')))

/**
 * Every file that paints a label on a tile photograph, as repo-relative POSIX
 * paths with the painters and the labels that found each, sorted.
 */
export function deriveTileLabelSurfaces(root = 'src') {
  const painters = new Set(deriveTilePainters())
  const found = []
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8')
    /* Cheap lexical pre-filter so the parser is only paid for files that could
     * possibly match. Every mark below is re-checked on the tree. */
    if (![...painters].some(p => src.includes(`<${p}`))) continue
    let sf
    try {
      sf = parseTsx(file)
    } catch {
      continue
    }
    const by = new Set()
    const labels = []
    const boxes = new Set()
    const visit = node => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = jsxTag(node)
        if (tag && painters.has(tag)) {
          const box = tileBox(node)
          if (box && !boxes.has(box)) {
            boxes.add(box)
            const painted = onPhotoLabels(box)
            if (painted.length) {
              by.add(tag)
              labels.push(...painted)
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(sf, visit)
    if (labels.length) found.push({ file, by: [...by].sort(), labels })
  }
  found.sort((a, b) => a.file.localeCompare(b.file))
  return found
}

/**
 * Every file that renders `<TileCaption>`, with the class list of the box each
 * of its photographs sits in, so the clip clause can ask whether that box still
 * trims the caption's deliberate bleed.
 */
export function tileBoxesOf(file) {
  const painters = new Set(deriveTilePainters())
  const sf = parseTsx(file)
  const out = []
  const seen = new Set()
  const visit = node => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTag(node)
      if (tag && painters.has(tag)) {
        const box = tileBox(node)
        if (box && !seen.has(box)) {
          seen.add(box)
          out.push({ painter: tag, className: classOf(box).replace(/^["'{`]|["'}`]$/g, '') })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
  return out
}

/** Every `<TileCaption className="...">` in this file, as written. */
export function tileCaptionClassNames(file) {
  const sf = parseTsx(file)
  const out = []
  const visit = node => {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && jsxTag(node) === 'TileCaption') {
      out.push(classOf(node).replace(/^["'{`]|["'}`]$/g, ''))
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
  return out
}

/** Every `.tsx` under the tree, as repo-relative POSIX paths, sorted. */
export function allTsxFiles(root = 'src') {
  return walk(root).sort()
}

/**
 * ── THE RATCHET. Tile labels NOT YET on the shared caption, each with a reason
 * that is re-evaluated on every build. ──
 *
 * It behaves exactly as `NOT_YET_ON_THE_SHARED_WASH` does in `hero-files.mjs`:
 * it only ever shrinks, an entry whose reason has stopped being true fails the
 * build, and every entry is printed on every run so it is read rather than
 * trusted. It is EMPTY today, and an empty ratchet is the whole point of one.
 */
export const TILE_LABELS_NOT_YET_ON_THE_SHARED_CAPTION = []
