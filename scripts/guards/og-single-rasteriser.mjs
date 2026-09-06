/**
 * GUARD: one rasteriser draws every image this platform renders, and it is ours.
 *
 * Nothing under src may import `next/og`, construct an `ImageResponse`, or reach
 * satori or resvg by any route other than src/lib/broadcast/card-raster.ts.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS GUARD IS PAYING FOR, twice, both measured rather than argued.
 *
 * 29 AUGUST 2026. All eighteen Launch Kit artefacts answered HTTP 500 with a
 * zero-byte body. `next/og` rasterises by handing satori's SVG to sharp; its
 * getSharp() is unconditional and its resvg fallback is reached only when the
 * sharp IMPORT throws; sharp is a real dependency of the upload pipeline, so it
 * always imports; and inside the Next server runtime that sharp's libvips has no
 * librsvg and cannot decode SVG at all while reporting that it can. The cards
 * were moved onto this repository's own satori plus resvg-wasm rasteriser, which
 * has no native module and therefore behaves identically in every runtime.
 *
 * 6 SEPTEMBER 2026 (close-out C3). The metadata images were never moved, because
 * nothing had driven one. Driven, the per-event share card did not return a
 * broken picture, it DROPPED THE CONNECTION:
 *
 *     GET /events/<slug>/opengraph-image   code=000  bytes=0
 *     GET /api/og/event/<slug>             code=000  bytes=0
 *     server: Error: failed to pipe response
 *               [cause]: Error: Input buffer contains unsupported image format
 *
 * The same fault, in the same library, on the one artefact whose entire job is
 * to be seen, seven days after the fix that was supposed to have ended it. It
 * survived because the repair was applied to the routes somebody was looking at
 * rather than to the rule. This guard is the rule.
 *
 * ---------------------------------------------------------------------------
 * WHY IT BANS THE STATIC METADATA IMAGES TOO, which do currently work.
 *
 * app/icon, app/apple-icon, app/opengraph-image and app/twitter-image are
 * prerendered by the BUILD, in a worker process where sharp can decode SVG, and
 * served afterwards as files. They were green through both incidents. They are
 * still banned from next/og, because "green today, in this process, on this
 * machine" is exactly the property that hid this defect twice: the moment one of
 * them gains a dynamic segment, an on-demand revalidation or a runtime render,
 * it fails the way the event card failed, and it fails on the day somebody ships
 * something unrelated. An invariant with an exception list is an invariant that
 * decays into the exception list.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CANNOT SEE, said plainly. It reads imports and call expressions in
 * this repository's own source. It cannot see a transitive dependency that
 * imports next/og itself, and it does not try: that is what the driven proof and
 * the postbuild trace check (card-raster-traced --built) are for.
 */
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSource, sourceFiles, stripComments, stripNonCode, lineAt } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/**
 * The ONE module allowed to reach a rasterising library, and the one module
 * allowed to load the fonts it draws with.
 */
export const RASTERISER = 'src/lib/broadcast/card-raster.ts'

/**
 * Every rule says which stripping it needs, and the reason is a bug this guard
 * had for its first five minutes of life.
 *
 *   'code'      stripNonCode: comments AND string contents removed. Correct for
 *               a CALL EXPRESSION, which must never match a mention of that call
 *               inside a doc comment or a string.
 *   'specifier' stripComments: comments removed, STRING CONTENTS KEPT. Required
 *               for anything that matches a module path, because the path IS a
 *               string. Written first against stripNonCode, this guard reported
 *               a clean tree while `import { ImageResponse } from 'next/og'` sat
 *               in two routes: the specifier had been blanked out from under the
 *               pattern before it ever ran. A guard that is green for the wrong
 *               reason is worse than no guard, so both directions are drilled.
 */
export const BANNED = [
  {
    id: 'next-og-import',
    scan: 'specifier',
    re: /\bfrom\s*['"]next\/og['"]/g,
    what: "imports from 'next/og'",
    fix: "render through renderOgResponse from '@/lib/broadcast/og-response' instead",
  },
  {
    id: 'next-og-require',
    scan: 'specifier',
    re: /\b(?:require|import)\s*\(\s*['"]next\/og['"]\s*\)/g,
    what: "loads 'next/og' at run time",
    fix: "render through renderOgResponse from '@/lib/broadcast/og-response' instead",
  },
  {
    id: 'image-response',
    scan: 'code',
    re: /\bnew\s+ImageResponse\s*\(/g,
    what: 'constructs an ImageResponse',
    fix: 'return renderOgResponse(element, { width, height, where }) instead',
  },
  {
    id: 'compiled-og',
    scan: 'specifier',
    re: /['"]next\/dist\/compiled\/@vercel\/og[^'"]*['"]/g,
    what: "reaches into next's compiled @vercel/og",
    fix: "render through renderOgResponse from '@/lib/broadcast/og-response' instead",
  },
  {
    id: 'satori-direct',
    scan: 'specifier',
    re: /\bfrom\s*['"]satori['"]/g,
    what: 'imports satori directly',
    fix: `only ${RASTERISER} may import satori; call renderCardPng`,
    onlyIn: RASTERISER,
  },
  {
    id: 'resvg-direct',
    scan: 'specifier',
    re: /\bfrom\s*['"]@resvg\/resvg-wasm['"]/g,
    what: 'imports resvg-wasm directly',
    fix: `only ${RASTERISER} may import resvg-wasm; call renderCardPng`,
    onlyIn: RASTERISER,
  },
]

/**
 * The specifiers that mean "this file draws through satori".
 *
 * A file that imports the rasteriser or the response wrapper is authoring an
 * element satori will lay out, so the CSS satori actually supports applies to it.
 * Derived rather than listed, so a new share surface comes into scope by the act
 * of importing the renderer.
 */
export const DRAWS_THROUGH = [
  '@/lib/broadcast/og-response',
  '@/lib/broadcast/card-raster',
  './og-response',
  './card-raster',
]

/**
 * CSS that satori silently ignores, checked ONLY in the files that draw through
 * it. Real CSS supports all of this, so it is perfectly correct everywhere else
 * in the application, which is exactly why it needs a scoped guard rather than a
 * global ban.
 *
 * `inset` is here because it cost the platform every scrim it thought it had.
 * Measured 6 September 2026 with two identical scrims through this exact path:
 * `inset: 0` painted nothing, `top/right/bottom/left: 0` painted. All ten
 * absolutely positioned scrims and gradient layers on the share cards and the
 * Launch Kit cards used `inset`, so none of them had ever drawn, on production
 * or anywhere else, and white type sat straight on the organiser's photograph.
 * Nothing threw and nothing logged. The full note is in card-raster.ts.
 */
export const UNSUPPORTED_CSS = [
  {
    id: 'satori-inset',
    re: /(?<![\w-])inset\s*:/g,
    what: 'uses the `inset` shorthand, which satori ignores',
    fix: 'write top, right, bottom and left in full: an ignored inset collapses the element to nothing',
  },
]

/** True when this file hands elements to satori, and so is bound by the CSS rules. */
export function drawsThroughRasteriser(source) {
  const withStrings = stripComments(source)
  return DRAWS_THROUGH.some(spec => withStrings.includes(`'${spec}'`) || withStrings.includes(`"${spec}"`))
}

/**
 * Judge the CSS of one satori-authoring file. Separate from judgeSource because
 * its scope is different: judgeSource binds all of src, this binds only the
 * files that draw.
 */
export function judgeSatoriCss(relPath, source) {
  if (!drawsThroughRasteriser(source)) return []
  const code = stripNonCode(source)
  const faults = []
  for (const rule of UNSUPPORTED_CSS) {
    rule.re.lastIndex = 0
    let m
    while ((m = rule.re.exec(code)) !== null) {
      faults.push({ rule: rule.id, what: rule.what, fix: rule.fix, line: lineAt(code, m.index) })
    }
  }
  return faults
}

/**
 * Judge one file. Exported so the tests can drive the judgement on fixtures
 * rather than on the tree, and so a new banned pattern is testable without a
 * file on disk.
 *
 * Takes the RAW text and does its own stripping, rather than the views object
 * readSource returns. That is deliberate and it is the second bug this guard
 * had at birth: handed readSource's `{ raw, withStrings, code }` object where it
 * expected a string, it stripped an object, matched nothing, and reported a
 * clean tree over two routes that both imported next/og on line 1. A signature
 * that cannot be got wrong quietly is worth one extra pass over 900 small files.
 *
 * @param {string} relPath  repository-relative path, forward slashes
 * @param {string} source   the file's raw text
 * @returns {{ rule: string, what: string, fix: string, line: number }[]}
 */
export function judgeSource(relPath, source) {
  if (typeof source !== 'string') {
    throw new TypeError(
      `[og-single-rasteriser] judgeSource needs the raw source text for ${relPath}, got ${typeof source}. ` +
        'Pass readSource(file).raw, never the views object.',
    )
  }
  // Both strippings preserve byte offsets and newlines, so a line number taken
  // from either is a true line number in the original file.
  const scanned = { code: stripNonCode(source), specifier: stripComments(source) }
  const faults = []
  for (const rule of BANNED) {
    if (rule.onlyIn && rule.onlyIn === relPath) continue
    const text = scanned[rule.scan]
    if (text === undefined) {
      throw new Error(`[og-single-rasteriser] rule ${rule.id} names an unknown scan mode ${rule.scan}`)
    }
    rule.re.lastIndex = 0
    let m
    while ((m = rule.re.exec(text)) !== null) {
      faults.push({
        rule: rule.id,
        what: rule.what,
        fix: rule.fix,
        line: lineAt(text, m.index),
      })
    }
  }
  return faults
}

function main() {
  const files = sourceFiles(ROOT)
  const offenders = []
  let scanned = 0

  let drawing = 0
  for (const file of files) {
    const rel = relative(ROOT, file).split('\\').join('/')
    const source = readSource(file).raw
    scanned += 1
    if (drawsThroughRasteriser(source)) drawing += 1
    for (const fault of judgeSource(rel, source)) {
      offenders.push({ file: rel, ...fault })
    }
    for (const fault of judgeSatoriCss(rel, source)) {
      offenders.push({ file: rel, ...fault })
    }
  }

  declareWork('og-single-rasteriser', {
    did: {
      'source file scanned': scanned,
      'banned pattern checked': BANNED.length,
      'satori-drawing file found': drawing,
      'unsupported CSS rule checked': UNSUPPORTED_CSS.length,
    },
    found: { 'rasteriser fault': offenders.length },
    exitOnZero: false,
  })

  if (offenders.length > 0) {
    console.error(`\n[og-single-rasteriser] FAIL - ${offenders.length} rasteriser fault(s).\n`)
    for (const o of offenders) {
      console.error(`  ${o.file}:${o.line}  ${o.what}`)
      console.error(`      ${o.fix}`)
    }
    // The right explanation for the fault that actually fired. One footer for
    // both would explain a dropped connection to somebody who wrote `inset`.
    const cssIds = new Set(UNSUPPORTED_CSS.map(r => r.id))
    if (offenders.some(o => !cssIds.has(o.rule))) {
      console.error(
        `\nnext/og hands satori's SVG to sharp, and inside the Next server runtime that\n` +
          `sharp cannot decode SVG. It cost eighteen Launch Kit artefacts on 29 August\n` +
          `2026 and the per-event share card on 6 September, the second time as a\n` +
          `DROPPED CONNECTION rather than an error anybody could read.\n` +
          `The full account is in src/lib/broadcast/og-response.ts.\n`,
      )
    }
    if (offenders.some(o => cssIds.has(o.rule))) {
      console.error(
        `\nsatori supports a subset of CSS and IGNORES the rest in silence, so an\n` +
          `unsupported property is not an error, it is an element that quietly does not\n` +
          `draw. Every scrim on every share card used \`inset\` and none of them had ever\n` +
          `drawn. The measurement is in src/lib/broadcast/card-raster.ts.\n`,
      )
    }
    process.exit(1)
  }

  console.log(
    `[og-single-rasteriser] PASS - every image renders through ${RASTERISER}; next/og appears nowhere under src.`,
  )
}

// Only scan when run as a command. Importing this module (the tests do) must not
// scan the tree, and must never call process.exit out from under a test runner.
const invokedDirectly = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === join(process.argv[1])
if (invokedDirectly) main()
