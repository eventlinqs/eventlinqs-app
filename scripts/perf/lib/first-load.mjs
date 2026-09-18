/**
 * THE INITIAL JAVASCRIPT BUNDLE, PER ROUTE, MEASURED FROM THE BUILD OUTPUT.
 *
 * ============================================================================
 * THE TARGET, AND WHERE THE NUMBER COMES FROM
 * ============================================================================
 *
 * Scope v5 section 10.3: "minimal JavaScript payloads (<200KB initial bundle)".
 * The section is titled Africa-Specific Build Requirements and the close-out
 * narrowed that deferral on 7 September 2026 rather than inheriting it whole:
 * the bundle target is PULLED FORWARD, "THE SCOPE'S OWN NUMBER IS THE C8
 * TARGET", because "Australians on a phone at a venue with bad reception are
 * the same problem as anyone else on a weak network".
 *
 * ============================================================================
 * WHY NEXT'S OWN DIAGNOSTIC IS THE EVIDENCE, AND NOT A GUESS AT THE HTML
 * ============================================================================
 *
 * `.next/diagnostics/route-bundle-stats.json` is written by
 * `next/dist/build/route-bundle-stats.js` at the end of every build. Read from
 * that source rather than assumed, its `firstLoadChunkPaths` is:
 *
 *     the union of the route's entryJSFiles across every segment (page AND
 *     layout, so layout code's contribution is included), taken from that
 *     route's client reference manifest, PLUS buildManifest.rootMainFiles,
 *     deduplicated, .js only.
 *
 * That is First Load JS as Next itself defines it, which is the number Next
 * prints in its own build table. It does NOT include the legacy polyfill
 * bundle, which is correct and was confirmed both ways: the emitter never adds
 * `polyfillFiles`, and the polyfill appears in zero of the 133 routes' path
 * lists. The polyfill ships as `<script noModule>` and no module-capable
 * browser fetches it, so counting its 39.5 KB against a budget would charge
 * every buyer for bytes none of them receives.
 *
 * ============================================================================
 * GZIP IS THE BUDGET, BROTLI IS REPORTED BESIDE IT
 * ============================================================================
 *
 * Vercel serves brotli to a client that accepts it and gzip to one that does
 * not, so gzip is what the WORST-OFF real buyer receives and it is the honest
 * side of the budget to judge. Both are reported on every row, because the gap
 * is large (the event route is 200.4 KB gzip and 174.1 KB brotli) and a report
 * that showed only the flattering one would be the rounding-up C8B.6 forbids.
 *
 * The uncompressed sum Next records is kept as a third column and never as the
 * verdict: a 945 KB uncompressed route is not 945 KB on the wire and saying so
 * would make the budget meaningless in the alarming direction.
 */

import { readFileSync, existsSync } from 'node:fs'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import { join, sep } from 'node:path'
import { attribute } from './chunk-attribution.mjs'

/** Scope v5 section 10.3, quoted above. 200 KB, in bytes, as one named constant. */
export const SCOPE_10_3_BUDGET_BYTES = 200 * 1024

export const STATS_FILE = join('.next', 'diagnostics', 'route-bundle-stats.json')
export const BUILD_MANIFEST_FILE = join('.next', 'build-manifest.json')

/**
 * Next writes these paths PROJECT-relative with the host separator, so on this
 * machine they arrive as `.next\static\chunks\x.js`. Normalising on both
 * separators rather than on the host's is deliberate: a build produced on Linux
 * and judged on Windows, or the reverse, must read identically.
 */
function normalisePath(p) {
  const BACKSLASH = String.fromCharCode(92)
  return p.split(BACKSLASH).join('/').split('/').join(sep)
}

function baseName(p) {
  const BACKSLASH = String.fromCharCode(92)
  const parts = p.split(BACKSLASH).join('/').split('/')
  return parts[parts.length - 1]
}

/**
 * Read the build output and measure every route.
 *
 * Throws rather than returning an empty answer when the diagnostic is missing.
 * A measurement of nothing must never be able to read as a pass: that is the
 * shape the SEO2 drive was corrected for on 14 September, where a check written
 * to replace a mistake could not fail at all.
 */
export function readFirstLoad(root = process.cwd()) {
  const statsPath = join(root, STATS_FILE)
  if (!existsSync(statsPath)) {
    throw new Error(
      `${STATS_FILE} is not present. It is written by every \`next build\`, so its ` +
        `absence means this ran without a build rather than that the platform has no routes.`,
    )
  }
  const stats = JSON.parse(readFileSync(statsPath, 'utf8'))
  if (!Array.isArray(stats) || stats.length === 0) {
    throw new Error(`${STATS_FILE} describes ${Array.isArray(stats) ? 0 : 'no'} routes.`)
  }

  const manifest = JSON.parse(readFileSync(join(root, BUILD_MANIFEST_FILE), 'utf8'))
  const shellFiles = (manifest.rootMainFiles || []).map(baseName)
  const polyfillFiles = (manifest.polyfillFiles || []).map(baseName)

  /** name -> { gzip, brotli, uncompressed, features, inShell } */
  const chunks = new Map()
  function measure(projectRelative) {
    const name = baseName(projectRelative)
    const cached = chunks.get(name)
    if (cached) return cached
    const body = readFileSync(join(root, normalisePath(projectRelative)))
    const text = body.toString('utf8')
    const known = polyfillFiles.includes(name) ? 'legacy polyfill bundle (noModule)' : undefined
    const entry = {
      name,
      gzip: gzipSync(body, { level: 9 }).length,
      brotli: brotliCompressSync(body).length,
      uncompressed: body.length,
      features: attribute(text, known),
      inShell: shellFiles.includes(name),
      body: text,
    }
    chunks.set(name, entry)
    return entry
  }

  const routes = stats.map((row) => {
    let gzip = 0
    let brotli = 0
    let uncompressed = 0
    const names = []
    for (const p of row.firstLoadChunkPaths) {
      const c = measure(p)
      gzip += c.gzip
      brotli += c.brotli
      uncompressed += c.uncompressed
      names.push(c.name)
    }
    return { route: row.route, gzip, brotli, uncompressed, chunks: names }
  })
  routes.sort((a, b) => b.gzip - a.gzip)

  // The polyfill is in no route's list, so measure it explicitly: it is real
  // weight on disk and the report must be able to say what it is and why it
  // is not counted, rather than leave a reader to wonder where it went.
  //
  // build-manifest.json states its paths DIST-relative (`static/chunks/x.js`)
  // while route-bundle-stats.json states its own PROJECT-relative
  // (`.next/static/chunks/x.js`). The two manifests are read by different parts
  // of Next and neither knows about the other, so the prefix is added here
  // rather than assumed to match.
  for (const p of manifest.polyfillFiles || []) measure(join('.next', p))

  const shell = shellFiles.map((n) => chunks.get(n)).filter(Boolean)

  return { routes, chunks, shell, shellFiles, polyfillFiles }
}

/** Every chunk body in the measured set, for the dead-marker check. */
export function bodies(chunks) {
  return [...chunks.values()].map((c) => c.body)
}

export const kb = (bytes) => (bytes / 1024).toFixed(1)

/**
 * ============================================================================
 * WHAT A MARK IS A FACT ABOUT, AND WHAT IT IS NOT
 * ============================================================================
 *
 * A mark in perf-budget.json is a GZIP BYTE COUNT of files a particular
 * toolchain emitted. The ratchet in scripts/guards/initial-bundle-budget.mjs
 * compares this build against that number and fails on any increase, which is
 * exactly right when both sides came off the same toolchain and is a category
 * error when they did not.
 *
 * THE FAILURE THAT PUT THIS HERE, 17 September 2026. The `--built` half was
 * added on 16 September with a baseline written mid-session, and the same commit
 * carried later edits the baseline predates. The next build measured 4 to 16
 * bytes MORE on 132 of 133 routes and the gate reported all 132 as "grew ...
 * (+0.0 KB)", which is a growth message that names no growth. The push lane was
 * blocked by a number that had never been measured against the tree it judged.
 *
 * PROVEN DETERMINISTIC FIRST, because the fix depends on which it is: two full
 * builds of the SAME source on this machine measured byte-identical on all 133
 * routes (C:\dev\EVIDENCE\MONEY\bundle-determinism.txt). So the bytes are a
 * stable fact about a toolchain, and the only question is whether the mark and
 * the build came off the same one.
 *
 * AND THE ONE THAT HAD NOT HAPPENED YET, which is the reason this is a fix and
 * not a baseline rewrite. `postbuild` runs this guard with `--built`, and npm
 * runs `postbuild` after `build`, which is the command Vercel runs. No Vercel
 * build had ever executed it, because the guard arrived unpushed. A mark written
 * on win32 and judged against a Linux build would have failed the PRODUCTION
 * DEPLOYMENT, and the remedy anyone reaches for under that pressure is
 * `--write-baseline`, which is how a ratchet quietly becomes a rubber stamp.
 * Whether a Next build is byte-identical across operating systems is UNSOURCED
 * and was not assumed in either direction: the mark simply records the
 * conditions it was taken under, and says so when they differ.
 *
 * So the ratchet is authoritative where the comparison is sound and REPORTS
 * where it is not. Nothing else relaxes: the absolute Scope v5 10.3 budget, the
 * unmarked-route clause and the stale-mark clause block on every host.
 */
export function measurementIdentity(root = process.cwd()) {
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    next: installedNextVersion(root),
  }
}

/**
 * The version on disk, never the range in package.json.
 *
 * "A lockfile entry is an intention, the installed tree is the fact" is already
 * law here for a dependency on a user-content path (CLAUDE.md, dependency bumps),
 * and it is the same distinction: what emitted these bytes is the package that
 * ran, not the one that was asked for.
 */
function installedNextVersion(root) {
  try {
    return JSON.parse(readFileSync(join(root, 'node_modules', 'next', 'package.json'), 'utf8')).version ?? null
  } catch (error) {
    /*
     * SPOKEN, because null here is not a neutral value. A recorded identity with
     * a null `next` matches no host for ever, so the ratchet would report rather
     * than judge on every machine including the one that wrote the mark, and it
     * would do so in a line about platforms that never mentions the real cause.
     */
    console.warn(
      `[first-load] the installed next version could not be read, so the measuring identity records it as ` +
        `null and will match no host: ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

/**
 * Why this host cannot be judged against that recorded identity, or null when
 * it can.
 *
 * A missing identity is NOT treated as "comparable". A mark with no conditions
 * recorded is a mark whose conditions are unknown, and reading unknown as
 * matching is the assumption this whole module exists to stop.
 */
export function identityMismatch(recorded, root = process.cwd()) {
  if (!recorded || typeof recorded !== 'object') {
    return 'the baseline records no measuring identity at all, so there is nothing to compare this host against'
  }
  const here = measurementIdentity(root)
  const differing = Object.keys(here).filter((k) => recorded[k] !== here[k])
  if (differing.length === 0) return null
  return differing
    .map((k) => `${k}: the mark was taken on ${JSON.stringify(recorded[k] ?? null)}, this build ran on ${JSON.stringify(here[k])}`)
    .join('; ')
}
