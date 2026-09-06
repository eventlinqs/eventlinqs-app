/**
 * GUARD: every route that can reach the card rasteriser ships the resvg binary
 * and the brand fonts in its lambda trace. Proven on the BUILD OUTPUT, not on
 * the config.
 *
 * TWO MODES, because the thing that matters can only be seen after a build:
 *
 *   node scripts/guards/card-raster-traced.mjs           prebuild, registered in
 *       run-guards.mjs: derives every route that reaches the rasteriser from
 *       the runtime import graph, requires next.config.ts to pin the binary and
 *       the fonts for each of them (the stated contract, kept complete), and
 *       requires the binary and every font file to exist on disk.
 *
 *   node scripts/guards/card-raster-traced.mjs --built   postbuild, from
 *       package.json: opens the trace file Next wrote for each of those routes
 *       (.next/server/app/<entry>.js.nft.json, or <entry>/route.js.nft.json for
 *       a metadata image; the file list the lambda is
 *       packed from) and fails if the binary or any font is not in it. This is
 *       the proof; the pins are a promise.
 *
 * THE TRACE IS LOOKED FOR IN BOTH PLACES NEXT PUTS IT (6 September 2026, when
 * every metadata image moved onto this rasteriser). A page or route handler gets
 * <entry>.js.nft.json; a METADATA IMAGE is compiled into a route handler of its
 * own and gets <entry>/route.js.nft.json. Reading only the first shape made
 * seven real traces look like seven absences and nearly bought a pass for the
 * wrong reason. Every reaching route on this tree has a trace, so no trace is
 * always a fault, and the message names both places it looked.
 *
 * WHAT WAS MEASURED, so the reason for each mode is a fact and not a story
 * (close-out C3, 6 September 2026). next.config.ts had pinned the binary for
 * three routes with a comment saying that without the pin "the lambda ships
 * without the one file the rasteriser cannot work without". The import graph
 * says EIGHT routes reach the rasteriser: the two card routes, the three
 * dashboard event pages that host the cover composer's server action
 * (src/lib/upload.ts, a 'use server' module, dynamic-imports generated-cover),
 * the admin health page and the two health crons. Five of the eight had no pin.
 * Then the build output was read: every one of the eight already listed the
 * binary and all four fonts in its .nft.json, pin or no pin, and the cover
 * composer produced a cover inside the Vercel preview lambda of a tree with no
 * pin for its page. Next's tracer follows the resvg glue's own
 * `new URL('index_bg.wasm', ...)` reference and the font loader's
 * readFile(join(process.cwd(), ...)) as a directory wildcard. So the pins are
 * REDUNDANT TODAY. They are kept, and kept complete, because they are the only
 * guarantee this repository holds in its own hands: the tracer's two heuristics
 * belong to @vercel/nft and to the package's glue, and either can change in an
 * upgrade with nothing here going red. The --built mode is what goes red.
 *
 * WHAT IT DOES NOT NEED: git, the network, or a database. It reads the tree,
 * the build output, and two small pieces of Next (the app-path normaliser and
 * the picomatch build Next itself matches these keys with), and fails loudly
 * if either has moved, rather than degrading to a guess.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSource, sourceFiles, stripComments } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(HERE, '..', '..')

export const RASTER_MODULE = 'src/lib/broadcast/card-raster.ts'
export const FONTS_MODULE = 'src/lib/broadcast/card-fonts.ts'
export const NEXT_CONFIG = 'next.config.ts'
export const DIST_DIR = '.next'

/** The file names Next treats as route entries under src/app. */
export const ROUTE_ENTRIES = new Set([
  'page', 'route', 'layout', 'template', 'default',
  'opengraph-image', 'twitter-image', 'icon', 'apple-icon',
  'sitemap', 'robots', 'manifest',
])

/**
 * The metadata image conventions that may carry a NUMBER SUFFIX.
 *
 * "You can set multiple icons by adding a number suffix to the file name. For
 * example, icon1.png, icon2.png, etc." - the installed Next documentation,
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md:64.
 *
 * Added 6 September 2026 (close-out C3) because this guard could not see
 * src/app/icon1.tsx, icon2.tsx or icon3.tsx at all: the exact-name set above
 * skipped them, so three real routes that reach the rasteriser were invisible to
 * a guard whose whole job is to enumerate every route that reaches it. icon3 is
 * the maskable Android icon the installed PWA uses.
 */
export const NUMBERED_ENTRIES = new Set([
  'opengraph-image', 'twitter-image', 'icon', 'apple-icon',
])

/** The entry name a route file declares, number suffix stripped, or null. */
export function routeEntryBase(base) {
  if (ROUTE_ENTRIES.has(base)) return base
  const m = /^(.*?)\d+$/.exec(base)
  if (m && NUMBERED_ENTRIES.has(m[1])) return base
  return null
}
const SUBTREE_ENTRIES = new Set(['layout', 'template'])

const COMPLETIONS = ['.ts', '.tsx', '.mjs', '.js']

/**
 * The runtime import specifiers of one file's comment-stripped source.
 *
 * Type-only imports are elided by the compiler and pull nothing into a lambda,
 * so `import type ... from`, `export type ... from`, and a braces list whose
 * every member is `type X` are all skipped. Everything else that names a module
 * is kept: static, side-effect, re-export, dynamic import() and require().
 */
export function runtimeImports(code) {
  const out = []
  const push = (s) => { if (s) out.push(s) }

  // import <clause> from '<x>'  and  export <clause> from '<x>'
  const withFrom = /\b(import|export)\s+([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g
  let m
  while ((m = withFrom.exec(code))) {
    const clause = m[2].trim()
    if (/^type\b/.test(clause)) continue
    const braces = /^\{([\s\S]*)\}$/.exec(clause)
    if (braces) {
      const members = braces[1].split(',').map((s) => s.trim()).filter(Boolean)
      if (members.length > 0 && members.every((s) => /^type\s/.test(s))) continue
    }
    push(m[3])
  }
  // import '<x>'  (side effect)
  const bare = /\bimport\s*['"]([^'"]+)['"]/g
  while ((m = bare.exec(code))) push(m[1])
  // import('<x>')  and  require('<x>')
  const dynamic = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = dynamic.exec(code))) push(m[1])
  return out
}

/**
 * Where a specifier points inside src/, as a repo-relative forward-slashed
 * path, or null for a bare package, a builtin, or anything outside src/.
 * `exists` is injected so the rule is testable without a filesystem.
 */
export function resolveSourceImport(specifier, fromFile, exists) {
  let base
  if (specifier.startsWith('@/')) base = `src/${specifier.slice(2)}`
  else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const dir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : ''
    const parts = (dir ? `${dir}/${specifier}` : specifier).split('/')
    const stack = []
    for (const p of parts) {
      if (p === '' || p === '.') continue
      if (p === '..') stack.pop()
      else stack.push(p)
    }
    base = stack.join('/')
  } else return null
  if (!base.startsWith('src/')) return null
  if (/\.[a-z]+$/.test(base) && exists(base)) return base
  for (const ext of COMPLETIONS) if (exists(base + ext)) return base + ext
  for (const ext of COMPLETIONS) if (exists(`${base}/index${ext}`)) return `${base}/index${ext}`
  return null
}

/** Every file that can reach `target` at runtime, by walking the reverse graph. */
export function reachers(edges, target) {
  const reverse = new Map()
  for (const [from, tos] of edges) {
    for (const to of tos) {
      if (!reverse.has(to)) reverse.set(to, new Set())
      reverse.get(to).add(from)
    }
  }
  const seen = new Set()
  const queue = [target]
  while (queue.length > 0) {
    const cur = queue.shift()
    for (const from of reverse.get(cur) ?? []) {
      if (seen.has(from)) continue
      seen.add(from)
      queue.push(from)
    }
  }
  return seen
}

/**
 * The Next entry name of a route file ('app/(dashboard)/dashboard/events/create/page'),
 * or null when the file is not a route entry.
 */
export function routeEntryName(file) {
  const m = /^src\/app\/(.*?)([^/]+)\.(?:tsx?|mjs|js)$/.exec(file)
  if (!m) return null
  const base = routeEntryBase(m[2])
  if (base === null) return null
  return `app/${m[1]}${base}`
}

/** True when the route file governs a subtree rather than one route. */
export function isSubtreeEntry(file) {
  const m = /([^/]+)\.(?:tsx?|mjs|js)$/.exec(file)
  return Boolean(m && SUBTREE_ENTRIES.has(m[1]))
}

/**
 * './node_modules/x' and 'node_modules\\x' both read as 'node_modules/x'. A
 * backslash in the config SOURCE is written escaped, so a run of them is one
 * separator, exactly as Next's own `include.replace(/\\/g, '/')` sees it.
 */
export function normalisePattern(p) {
  return p.replace(/\\+/g, '/').replace(/^\.\//, '')
}

/**
 * The outputFileTracingIncludes map, read out of next.config.ts as text.
 * Comments are stripped first; keys and values are the quoted strings Next
 * would read. A config that cannot be parsed is an error, not an empty map.
 */
export function parseTracingIncludes(configText) {
  const code = stripComments(configText)
  const at = code.indexOf('outputFileTracingIncludes')
  if (at === -1) throw new Error(`${NEXT_CONFIG} declares no outputFileTracingIncludes`)
  const open = code.indexOf('{', at)
  if (open === -1) throw new Error('outputFileTracingIncludes is not an object literal')
  let depth = 0
  let close = -1
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1
    else if (code[i] === '}') {
      depth -= 1
      if (depth === 0) {
        close = i
        break
      }
    }
  }
  if (close === -1) throw new Error('outputFileTracingIncludes is not closed')
  const body = code.slice(open + 1, close)
  const map = new Map()
  const entry = /(['"])([^'"]+)\1\s*:\s*\[([^\]]*)\]/g
  let m
  while ((m = entry.exec(body))) {
    const values = [...m[3].matchAll(/(['"])([^'"]+)\1/g)].map((v) => normalisePattern(v[2]))
    map.set(m[2], values)
  }
  return map
}

/** The wasm path card-raster.ts itself joins, read out of its source. */
export function wasmPathFrom(rasterSource) {
  const m = /WASM_RELATIVE\s*=\s*join\(([^)]*)\)/.exec(stripComments(rasterSource))
  if (!m) throw new Error(`${RASTER_MODULE} no longer declares WASM_RELATIVE = join(...); update this guard`)
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]).join('/')
}

/** The font directory and files card-fonts.ts itself names. */
export function fontsFrom(fontsSource) {
  const code = stripComments(fontsSource)
  const dir = /FONT_DIR\s*=\s*join\(\s*process\.cwd\(\)\s*,([^)]*)\)/.exec(code)
  if (!dir) throw new Error(`${FONTS_MODULE} no longer declares FONT_DIR = join(process.cwd(), ...); update this guard`)
  const dirPath = [...dir[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]).join('/')
  const files = [...code.matchAll(/file:\s*['"]([^'"]+)['"]/g)].map((x) => x[1])
  if (files.length === 0) throw new Error(`${FONTS_MODULE} lists no font files; update this guard`)
  return { dir: dirPath, files }
}

/** Does a pattern list cover the font directory (a glob under it, or every file by name)? */
export function coversFonts(values, fonts) {
  const under = values.filter((v) => v.startsWith(`${fonts.dir}/`))
  if (under.some((v) => /\*/.test(v))) return true
  return fonts.files.every((f) => under.includes(`${fonts.dir}/${f}`))
}

/**
 * PREBUILD: the verdict on the pins, for every reaching route, given Next's matcher.
 *
 * @param routes    [{ file, entry, subtree, needsFonts }]
 * @param includes  Map<key, values[]>
 * @param match     (key, route) => boolean, Next's own picomatch call
 * @param normalise (entry) => route string, Next's own normaliser
 */
export function judgeRoutes(routes, includes, match, normalise, wasm, fonts) {
  const faults = []
  const passes = []
  for (const r of routes) {
    if (r.subtree) {
      faults.push(
        `${r.file} is a ${r.entry.split('/').pop()} and reaches the rasteriser: it governs every route beneath it, so give each of those routes its own entry, or move the import`,
      )
      continue
    }
    const route = normalise(r.entry)
    const applied = new Set()
    const keys = []
    for (const [key, values] of includes) {
      if (!match(key, route)) continue
      keys.push(key)
      for (const v of values) applied.add(v)
    }
    const missing = []
    if (!applied.has(wasm)) missing.push(`'./${wasm}'`)
    if (r.needsFonts && !coversFonts([...applied], fonts)) missing.push(`'./${fonts.dir}/*.ttf'`)
    if (missing.length > 0) {
      faults.push(
        `${route} (${r.file}) reaches the rasteriser${r.needsFonts ? ' and the fonts' : ''} and its pin lacks ${missing.join(' and ')}` +
          (keys.length ? ` (keys applied: ${keys.join(', ')})` : ' (no outputFileTracingIncludes key matches it)'),
      )
    } else {
      passes.push(`${route} via ${keys.join(', ')}`)
    }
  }
  return { faults, passes }
}

/** The trace file Next writes for a route entry, relative to the repository. */
export function traceFileFor(entry) {
  return `${DIST_DIR}/server/${entry}.js.nft.json`
}

/**
 * EVERY PLACE NEXT MIGHT HAVE PUT THE TRACE, in the order they are tried.
 *
 * A page or a route handler gets `<entry>.js.nft.json`. A METADATA IMAGE gets
 * `<entry>/route.js.nft.json`, because Next compiles it into a route handler in
 * a directory of its own. Measured from the build output on 6 September 2026
 * (close-out C3): .next/server/app/icon/route.js.nft.json,
 * .next/server/app/events/[slug]/opengraph-image/route.js.nft.json, and so on
 * for all eight image entries.
 *
 * This is written down because getting it wrong was nearly a silent pass. With
 * only the first shape tried, seven metadata images reported "no trace" and were
 * waved through by the prerendered branch, while the trace that does exist, and
 * is the stronger evidence, went unread. An absence that is really a lookup in
 * the wrong place is the most expensive kind of green.
 */
export function traceFileCandidates(entry) {
  return [traceFileFor(entry), `${DIST_DIR}/server/${entry}/route.js.nft.json`]
}

/**
 * POSTBUILD: the verdict on the traces Next actually wrote.
 *
 * A trace lists the files the lambda is packed from, as paths relative to the
 * trace file itself, so each is normalised to its final segments and compared
 * by suffix: `../../../node_modules/@resvg/resvg-wasm/index_bg.wasm` carries
 * the binary if it ends with the binary's path.
 *
 * @param routes    [{ file, entry, subtree, needsFonts }]
 * @param readTrace (traceFile) => string[] | null   the trace's file list, null when absent
 */
export function judgeTraces(routes, readTrace, wasm, fonts) {
  const faults = []
  const passes = []
  const endsWith = (list, rel) => list.some((f) => f.replace(/\\/g, '/').endsWith(`/${rel}`) || f.replace(/\\/g, '/') === rel)
  for (const r of routes) {
    if (r.subtree) continue // judged on the routes beneath it, which are in the list themselves
    let traceFile = null
    let files = null
    for (const candidate of traceFileCandidates(r.entry)) {
      const found = readTrace(candidate)
      if (found) {
        traceFile = candidate
        files = found
        break
      }
    }
    if (!files) {
      /*
       * NO TRACE IS ALWAYS A FAULT, and the message names every place that was
       * looked, because the one time this guard nearly passed for the wrong
       * reason it was a lookup in the wrong place (6 September 2026, close-out
       * C3): metadata images are compiled into a route handler of their own, so
       * their trace is <entry>/route.js.nft.json, and reading only <entry>.js
       * .nft.json made seven real traces look like seven absences.
       *
       * A "prerendered instead of traced" pass was written here and then taken
       * out again, because once the lookup was right EVERY reaching route had a
       * trace, and a guard must not carry a pass-path that nothing on the tree
       * exercises. If a genuinely lambda-less route ever appears, this fails and
       * a person reads the build output, which is the right way round.
       */
      const looked = traceFileCandidates(r.entry).join(' or ')
      faults.push(`no trace was written for ${r.entry}: looked for ${looked}. Nothing carries the rasteriser into that route's lambda`)
      continue
    }
    const missing = []
    if (!endsWith(files, wasm)) missing.push(wasm)
    if (r.needsFonts) for (const f of fonts.files) if (!endsWith(files, `${fonts.dir}/${f}`)) missing.push(`${fonts.dir}/${f}`)
    if (missing.length > 0) faults.push(`${traceFile} (${files.length} files) lacks ${missing.join(', ')}: the deployed lambda for ${r.entry} would answer 500 on every card`)
    else passes.push(`${r.entry}: ${files.length} traced files carry the binary${r.needsFonts ? ` and ${fonts.files.length} fonts` : ''}`)
  }
  return { faults, passes }
}

/** Next's own normaliser and matcher, or a loud failure naming what moved. */
export function nextTools(root = ROOT) {
  const require = createRequire(join(root, 'package.json'))
  let normalizeAppPath
  let picomatch
  try {
    ;({ normalizeAppPath } = require('next/dist/shared/lib/router/utils/app-paths'))
  } catch (error) {
    throw new Error(`could not load Next's app-path normaliser (next/dist/shared/lib/router/utils/app-paths): ${error.message}`)
  }
  try {
    picomatch = require('next/dist/compiled/picomatch')
  } catch (error) {
    throw new Error(`could not load the picomatch Next bundles (next/dist/compiled/picomatch): ${error.message}`)
  }
  // Exactly the call in next/dist/build/collect-build-traces.js: contains: true is
  // what lets a '/api/x' key match the '/app/api/x' string the normaliser yields.
  const match = (key, route) => picomatch(key, { dot: true, contains: true })(route)
  return { normalise: normalizeAppPath, match }
}

/** The reaching routes, derived from the tree. Shared by both modes. */
export function reachingRoutes(root = ROOT) {
  const exists = (rel) => existsSync(join(root, rel))
  const files = sourceFiles(root, { extensions: ['.ts', '.tsx', '.mjs', '.js'] })
  const edges = new Map()
  let specifiers = 0
  for (const file of files) {
    const { withStrings } = readSource(join(root, file))
    const targets = new Set()
    for (const spec of runtimeImports(withStrings)) {
      specifiers += 1
      const to = resolveSourceImport(spec, file, exists)
      if (to) targets.add(to)
    }
    edges.set(file, targets)
  }
  if (!edges.has(RASTER_MODULE)) throw new Error(`${RASTER_MODULE} is not in the tree; the rasteriser moved and this guard must follow it`)
  if (!edges.has(FONTS_MODULE)) throw new Error(`${FONTS_MODULE} is not in the tree; the font loader moved and this guard must follow it`)
  const reachRaster = reachers(edges, RASTER_MODULE)
  const reachFonts = reachers(edges, FONTS_MODULE)
  const routes = []
  for (const file of reachRaster) {
    const entry = routeEntryName(file)
    if (!entry) continue
    routes.push({ file, entry, subtree: isSubtreeEntry(file), needsFonts: reachFonts.has(file) })
  }
  routes.sort((a, b) => a.file.localeCompare(b.file))
  return { routes, files: files.length, specifiers, reachRaster: reachRaster.size, reachFonts: reachFonts.size }
}

function main() {
  const built = process.argv.includes('--built')
  const label = built ? 'card-raster-traced --built' : 'card-raster-traced'
  const exists = (rel) => existsSync(join(ROOT, rel))

  const { routes, files, specifiers, reachRaster, reachFonts } = reachingRoutes()
  const wasm = wasmPathFrom(readFileSync(join(ROOT, RASTER_MODULE), 'utf8'))
  const fonts = fontsFrom(readFileSync(join(ROOT, FONTS_MODULE), 'utf8'))

  console.log(`[${label}] ${files} source file(s), ${specifiers} import specifier(s), ${reachRaster} module(s) reach ${RASTER_MODULE}, ${reachFonts} reach ${FONTS_MODULE}`)
  console.log(`[${label}] binary: ${wasm}; fonts: ${fonts.dir}/ (${fonts.files.join(', ')})`)
  console.log(`[${label}] ${routes.length} route entr${routes.length === 1 ? 'y' : 'ies'} reach the rasteriser:`)
  for (const r of routes) console.log(`    ${r.entry}${r.needsFonts ? '  (fonts too)' : ''}`)

  let faults
  let passes
  let did
  if (built) {
    if (!exists(`${DIST_DIR}/server`)) {
      console.error(`[${label}] FAIL - ${DIST_DIR}/server does not exist; this mode runs after next build (npm's postbuild), never before it.`)
      process.exit(1)
    }
    const readTrace = (traceFile) => {
      const p = join(ROOT, traceFile)
      if (!existsSync(p)) return null
      const parsed = JSON.parse(readFileSync(p, 'utf8'))
      if (!Array.isArray(parsed.files)) throw new Error(`${traceFile} carries no files array`)
      return parsed.files
    }
    ;({ faults, passes } = judgeTraces(routes, readTrace, wasm, fonts))
    did = { 'source file read': files, 'route trace judged': routes.filter((r) => !r.subtree).length }
  } else {
    const includes = parseTracingIncludes(readFileSync(join(ROOT, NEXT_CONFIG), 'utf8'))
    const { normalise, match } = nextTools()
    ;({ faults, passes } = judgeRoutes(routes, includes, match, normalise, wasm, fonts))
    if (!exists(wasm)) faults.push(`the pinned binary is not on disk: ${wasm} (is @resvg/resvg-wasm installed?)`)
    for (const f of fonts.files) if (!exists(`${fonts.dir}/${f}`)) faults.push(`${FONTS_MODULE} lists ${f} but ${fonts.dir}/${f} is not on disk`)
    did = { 'source file read': files, 'reaching route judged': routes.length, 'tracing key read': includes.size }
  }
  for (const p of passes) console.log(`    ok  ${p}`)

  declareWork(label, { did, found: { 'trace fault': faults.length } })

  if (faults.length > 0) {
    console.error('')
    console.error(`[${label}] FAIL - ${faults.length} lambda trace fault(s):`)
    for (const f of faults) console.error(`    ${f}`)
    console.error('')
    if (built) {
      console.error('  The build wrote a server trace without the rasteriser\'s files, so the deployed')
      console.error(`  lambda cannot render a card. Pin them for that route in outputFileTracingIncludes`)
      console.error(`  in ${NEXT_CONFIG} ('./${wasm}' and './${fonts.dir}/*.ttf') and rebuild.`)
    } else {
      console.error('  Every route that reaches the rasteriser is pinned the same way, so the promise')
      console.error(`  the build is checked against is complete. Add the route's key to`)
      console.error(`  outputFileTracingIncludes in ${NEXT_CONFIG} with './${wasm}' and, where the`)
      console.error(`  route draws type, './${fonts.dir}/*.ttf'.`)
    }
    process.exit(1)
  }
  console.log(
    built
      ? `[${label}] PASS - every route that reaches the rasteriser has the binary and the fonts in the trace the build wrote.`
      : `[${label}] PASS - every route that reaches the rasteriser is pinned with the binary${routes.some((r) => r.needsFonts) ? ' and the fonts' : ''}, and both are on disk.`,
  )
}

const invokedDirectly = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === join(process.argv[1])
if (invokedDirectly) main()
