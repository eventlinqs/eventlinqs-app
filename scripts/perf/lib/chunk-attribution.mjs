/**
 * WHAT A JAVASCRIPT CHUNK SERVES, DECIDED BY ITS OWN BYTES.
 *
 * ============================================================================
 * WHY THIS IS A MODULE OF ITS OWN
 * ============================================================================
 *
 * Close-out C8B.1: the cost table must record, for every chunk, "what feature
 * it serves". Two readers now need that answer and they must never disagree:
 * `scripts/perf/chunk-cost-table.mjs`, which DRIVES a route and reads the bytes
 * a browser actually fetched, and `scripts/perf/first-load-budget.mjs`, which
 * reads the build output on disk. One list, imported twice.
 *
 * ============================================================================
 * A MARKER THAT MATCHES NOTHING IS THE FAILURE MODE, NOT A HARMLESS EXTRA
 * ============================================================================
 *
 * The list this replaces carried three markers that matched NOTHING in the
 * build of 15 September 2026, measured across all 131 emitted chunks:
 *
 *     react-stack-bottom-frame   0 files
 *     prefetchReducer            0 files
 *     APP_ROUTER_ACTION          0 files
 *
 * and a fourth, `app-router`, that matched four chunks and none of the shell.
 * The visible consequence was that the 30.5 KB Next.js App Router runtime, the
 * fourth heaviest thing on the event page, read `unattributed` in the table
 * that the close-out says "decides the work order". A work order cannot rank a
 * chunk nobody can name, so the largest unnamed item sat at rank 4 for a week
 * with the document recording that "naming it is the next honest step".
 *
 * So a dead marker is not a tidy-up: it is the table quietly going blind while
 * still reading confidently. `deadMarkers()` below exists for exactly that, and
 * `scripts/guards/initial-bundle-budget.mjs` fails the build on it.
 *
 * ============================================================================
 * BUT ONLY FOR THE MARKERS THAT CANNOT LEGITIMATELY BE ABSENT
 * ============================================================================
 *
 * The first version of that clause would have failed every build on this
 * machine, and it would have been measuring the environment rather than the
 * product. `NEXT_PUBLIC_SENTRY_DSN` is empty in the founder's `.env.local`, and
 * `instrumentation-client.ts` refuses to load the SDK when it is empty, so a
 * local build ships no error-reporting bytes at all and both Sentry markers
 * correctly match nothing. That blindness is itself recorded in this repository
 * (docs/perf/CHUNK-COST-TABLE-2026-09-08.md) and the push gate answers it with
 * `PARITY_SENTRY_DSN`.
 *
 * A gate that goes red because of how a machine is configured is the gate the
 * Lighthouse advisory ruling of 25 August 2026 was written about. So every
 * marker declares `alwaysPresent`, and only a marker that claims the feature is
 * ALWAYS in the bundle can fail the build by matching nothing. The rest are
 * reported as absent, with the reason, and absence is sometimes the goal: the
 * Node Buffer polyfill is a defect, and the day its marker matches nothing is
 * the day that defect is fixed.
 *
 * ============================================================================
 * EVERY MARKER BELOW WAS CHOSEN BY MEASUREMENT, NOT BY LOOKING PLAUSIBLE
 * ============================================================================
 *
 * Each entry records how many of the build's chunks it matched when it was
 * added, because a marker's value is its SPECIFICITY and that is a number. A
 * marker matching one chunk names that chunk; a marker matching seventy names
 * nothing. `callServer` was rejected on exactly that ground: it identifies the
 * React Server Components runtime correctly and it also appears in 71 of 131
 * chunks, so it would have attributed most of the platform to the flight
 * reader.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The reviewed markers, most specific first.
 *
 * `counted` is the number of emitted chunks the marker matched on the build of
 * 15 September 2026 (Next 16.3.0, Turbopack, 131 chunks). It is documentation,
 * not a threshold: the build moves and so will these counts. What must stay
 * true is that the count is never ZERO, which is the clause the guard holds.
 */
export const FEATURE_MARKERS = [
  {
    feature: 'Session Replay (rrweb)',
    // replayIntegration's own option names, which appear nowhere else in the
    // tree, plus the vendored recorder's own identifier.
    test: /recordCrossOriginIframes|replayIntegration|rrweb/,
    why: "replayIntegration's own option names and the recorder's own identifier",
    counted: 2,
    alwaysPresent: false,
    /*
     * CORRECTED 18 September 2026, because the old sentence named a cause that
     * was not the cause and sent a reader looking for a missing DSN.
     *
     * This table reads FIRST-LOAD chunks only (see readFirstLoad: the map is
     * filled from each route's own chunk list plus the shell and the polyfill
     * bundle). The recorder is armed by a dynamic import on the visitor's first
     * interaction, so it is in NO route's first-load list and this marker matches
     * nothing, whatever the DSN says. Measured on the build of 18 September under
     * the gate's own environment with the DSN SET: 1 chunk on disk carries the
     * recorder's markers and 3 carry the SDK's, and this marker still reported
     * absent. That is sentry-off-the-paint-path.mjs working, not a missing SDK.
     */
    absentWhen: 'it is armed by a dynamic import on first interaction, so it is in no route first load; it is also absent from the build entirely when NEXT_PUBLIC_SENTRY_DSN is empty, and this table cannot tell those two apart',
  },
  {
    feature: 'error reporting SDK',
    // The SDK's global carrier. Checked AFTER Replay because the Replay chunk
    // carries it too and the more specific answer wins.
    test: /__SENTRY__|sentryWrapped/,
    why: "the SDK's own global carrier",
    counted: 2,
    alwaysPresent: false,
    // Same correction as the recorder above: the SDK boots by dynamic import off
    // the paint path, so it is never first-load. An empty DSN also removes it
    // from the build, and this table cannot see which of the two is true.
    absentWhen: 'it boots by dynamic import off the paint path, so it is in no route first load; an empty NEXT_PUBLIC_SENTRY_DSN also removes it from the build (see docs/perf/CHUNK-COST-TABLE-2026-09-08.md)',
  },
  {
    feature: 'React DOM',
    // __reactContainer is the property React DOM hangs on a host node, and
    // onRecoverableError is its own option name. Both matched exactly one
    // chunk. createPortal was NOT used: it matched nine, because application
    // code calls it too, and a marker that follows its callers names the
    // wrong chunk.
    test: /__reactContainer|onRecoverableError/,
    why: 'the property React DOM hangs on a host node, and its own option name',
    counted: 1,
    alwaysPresent: true,
  },
  {
    feature: 'Next.js App Router runtime',
    // The router's own request header and the name of one of its reducers.
    // This is the 30.5 KB chunk that read `unattributed` until 15 September
    // 2026; the three markers it was supposed to match had all gone dead.
    test: /next-router-state-tree|serverActionReducer|isNavigatingToNewRootLayout/,
    why: "the router's own request header and two of its reducer names",
    counted: 1,
    alwaysPresent: true,
  },
  {
    feature: 'React Server Components runtime',
    // The flight reader's internal row states. `callServer` identifies the
    // same runtime and matched 71 of 131 chunks, so it was rejected: every
    // module that can call a server action carries it.
    test: /resolved_model|resolved_module/,
    why: "the flight reader's own row states",
    counted: 1,
    alwaysPresent: true,
  },
  {
    feature: 'Next.js navigation and redirects',
    test: /NEXT_REDIRECT|normalizePathTrailingSlash/,
    why: "Next's own redirect digest prefix and path normaliser",
    counted: 2,
    alwaysPresent: true,
  },
  {
    feature: 'Next.js error boundaries',
    test: /NEXT_HTTP_ERROR_FALLBACK|isNextRouterError/,
    why: "Next's own not-found and forbidden fallback marker",
    counted: 1,
    alwaysPresent: true,
  },
  {
    feature: 'Turbopack chunk loader',
    test: /ChunkLoadError/,
    why: "the loader's own error class, emitted only into its runtime chunk",
    counted: 1,
    alwaysPresent: true,
  },
  {
    feature: 'Node Buffer polyfill',
    // The feross/buffer package shipped to the browser. Its own inspect symbol
    // and its own allocation message; neither can come from application code.
    test: /nodejs\.util\.inspect\.custom|Attempt to allocate Buffer larger than maximum size/,
    why: "the buffer package's own inspect symbol and allocation message",
    counted: 9,
    alwaysPresent: false,
    absentWhen: 'nothing on a client path references Buffer any more, which is the goal rather than a fault',
  },
  {
    feature: 'product analytics',
    // The measurement layer's own vendor key name and host. Added 21 September
    // 2026, when the driven cost table showed this as the only `unattributed`
    // row left on the homepage once the manifests were being read.
    test: /NEXT_PUBLIC_POSTHOG_KEY|posthog\.com/,
    why: "the analytics vendor's own key name and host",
    counted: 1,
    alwaysPresent: false,
    // It is loaded by dynamic import after the visitor consents (close-out
    // AQ1), so it is in no route's first load and first-load-budget correctly
    // never sees it. That is the arrangement working, not a missing feature.
    absentWhen: 'it is loaded by dynamic import only after consent, so it is in no route first load',
  },
  { feature: 'Supabase client', test: /GoTrueClient|PostgrestClient/, why: "the client classes' own names", counted: 4, alwaysPresent: false, absentWhen: 'no client component reaches the browser client' },
  { feature: 'Stripe elements', test: /StripeElement|js\.stripe\.com/, why: "Stripe's own class name and host", counted: 2, alwaysPresent: false, absentWhen: 'checkout is not in the build' },
  { feature: 'Google Maps', test: /google\.maps|maps\.googleapis\.com/, why: "the Maps API's own namespace and host", counted: 2, alwaysPresent: false, absentWhen: 'the venue map is not built' },
  { feature: 'Lucide icons', test: /lucide/, why: "the icon set's own identifier", counted: 8, alwaysPresent: false, absentWhen: 'the icon set is replaced' },
]

/** The label used when no reviewed marker matches. Never a guess. */
export const UNATTRIBUTED = 'unattributed'

/**
 * What a chunk serves, from its body.
 *
 * `known` lets a caller supply an attribution the BUILD ITSELF states rather
 * than one a string has to infer: `build-manifest.json` names the legacy
 * polyfill bundle outright, and a first-party fact always beats a regex.
 */
export function attribute(body, known) {
  if (known) return [known]
  if (typeof body !== 'string' || body.length === 0) return [UNATTRIBUTED]
  const found = []
  for (const { feature, test } of FEATURE_MARKERS) {
    if (test.test(body)) found.push(feature)
  }
  return found.length > 0 ? found : [UNATTRIBUTED]
}

/**
 * The markers that matched nothing in a whole build, split by whether that is
 * allowed to be true.
 *
 *   dead      a marker claiming the feature is ALWAYS in the bundle, matching
 *             nothing. This is the table going blind and the guard fails on it.
 *   absent    a marker for a feature that can legitimately not be built here,
 *             with the declared reason. Reported, never fatal.
 *
 * `bodies` is an iterable of chunk bodies.
 */
export function markerCoverage(bodies) {
  const all = [...bodies]
  const unmatched = FEATURE_MARKERS.filter(({ test }) => !all.some((b) => test.test(b)))
  return {
    dead: unmatched.filter((m) => m.alwaysPresent).map((m) => m.feature),
    absent: unmatched
      .filter((m) => !m.alwaysPresent)
      .map((m) => `${m.feature} (${m.absentWhen ?? 'declared conditional'})`),
  }
}

/* ==========================================================================
 * THE OTHER HALF: WHAT A CHUNK SERVES WHEN IT IS OURS AND NOT A LIBRARY.
 * Added 21 September 2026.
 * ==========================================================================
 *
 * THE MARKERS ABOVE CAN ONLY EVER NAME A DEPENDENCY, and that ceiling is a
 * number rather than an opinion: run `attribute()` over the build of that day
 * and 131 of its 154 chunks come back `unattributed`. Every one of those 131 is
 * OUR code, and no string marker will ever name it, because our chunks have no
 * vendor identifier in them to match.
 *
 * Driven on the same day, `scripts/perf/chunk-cost-table.mjs` reported, on all
 * thirteen gated routes:
 *
 *     | 2qonc2w2umx49.js | 9.4 KB | 32.8 KB | yes | unattributed |
 *
 * That is the fourth heaviest thing on the homepage, it is ours, and the table
 * close-out P0.5 says "decides the work order" could not say which component it
 * was. A work order cannot rank a chunk nobody can name; the same sentence is
 * already written at the top of this file about the App Router runtime, and the
 * answer there was a better marker. There is no marker for our own code.
 *
 * NEXT ALREADY KNOWS. It writes one `page_client-reference-manifest.js` per app
 * route, and each maps a client module's SOURCE PATH to the chunks it needs.
 * That is not a heuristic, it is the loader's own answer, and on that build it
 * named 126 of the 154 chunks. `2qonc2w2umx49.js` becomes
 * `src/components/features/home/FeaturedHeroClient.tsx +10 more`.
 *
 * AND IT ANSWERS A DIFFERENT QUESTION FROM A MARKER, which is why `nameChunk`
 * asks the marker first. A marker says what a chunk IS; a manifest says which
 * of our modules NEED it. For a chunk that is ours those coincide; for a shared
 * vendor chunk they do not, and the manifest label has to pick one consumer out
 * of a hundred and forty-six.
 *
 * WHAT IT CANNOT DO, so the caller can say so rather than degrade quietly:
 *   - it needs the BUILT TREE on disk, so a table driven against a deployed
 *     preview gets the markers alone
 *   - a chunk reached only by a lazy `import()` inside a client component is in
 *     no route's manifest. Six such chunks existed on that build, the largest
 *     32.3 KB (the seat selector), and none is requested on any gated route.
 */

/**
 * The JSON out of one `globalThis.__RSC_MANIFEST["/route"] = {...}` assignment.
 *
 * Pure and separate so it can be tested without a build on disk, and because it
 * is the one part a framework version can change underneath this file. An
 * unreadable manifest returns null and is SKIPPED by the caller rather than
 * throwing: one unreadable route must not take the whole table down. That it
 * returns null rather than throwing is what
 * `scripts/guards/the-cost-table-can-name-what-it-measures.mjs` counts.
 */
export function parseClientReferenceManifest(source) {
  const at = source.indexOf('] = ')
  if (at === -1) return null
  try {
    return JSON.parse(source.slice(at + 4).trim().replace(/;\s*$/, ''))
  } catch {
    return null
  }
}

/**
 * EVERY CLIENT MODULE'S CHUNKS, out of Next's own per-route manifests.
 *
 * @param {string} nextDir the built `.next` directory
 * @returns {Map<string, Set<string>>} chunk file name -> module source paths
 */
export function readClientModuleChunks(nextDir) {
  const appDir = join(nextDir, 'server', 'app')
  const byChunk = new Map()
  if (!existsSync(appDir)) return byChunk

  const manifests = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'page_client-reference-manifest.js') manifests.push(full)
    }
  }
  walk(appDir)

  for (const file of manifests) {
    const parsed = parseClientReferenceManifest(readFileSync(file, 'utf8'))
    if (!parsed) continue
    for (const [module_, info] of Object.entries(parsed.clientModules ?? {})) {
      for (const chunk of info.chunks ?? []) {
        const name = chunk.split('/').pop()
        if (!byChunk.has(name)) byChunk.set(name, new Set())
        byChunk.get(name).add(module_)
      }
    }
  }
  return byChunk
}

/** Every `page_client-reference-manifest.js` in a build, parsed or not. */
export function listClientReferenceManifests(nextDir) {
  const appDir = join(nextDir, 'server', 'app')
  const out = []
  if (!existsSync(appDir)) return out
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'page_client-reference-manifest.js') out.push(full)
    }
  }
  walk(appDir)
  return out
}

/**
 * A SHORT LABEL FOR A SET OF MODULE PATHS, OURS FIRST.
 *
 * `[project]/src/...` is this platform's own code and is what a work order acts
 * on; `node_modules/...` is what it cannot. When a chunk holds both, the label
 * leads with ours, because "next/dist/client/app-dir/link.js" as the headline
 * for a chunk that also holds the event form sends the reader to the wrong file.
 */
export function summariseModules(modules) {
  const all = [...modules].map((m) => m.replace(/^\[project\]\//, ''))
  if (all.length === 0) return UNATTRIBUTED
  const ours = all.filter((m) => m.startsWith('src/'))
  const lead = (ours.length > 0 ? ours : all).sort()[0]
  const rest = all.length - 1
  return rest > 0 ? `${lead} +${rest} more` : lead
}

/**
 * NAME ONE CHUNK.
 *
 * THE ORDER IS MARKER BEFORE MANIFEST, AND IT WAS THE OTHER WAY ROUND FOR ONE
 * COMMIT, WHICH MISLABELLED THE EIGHT CHUNKS THAT MATTER MOST.
 *
 * The two sources answer different questions. A marker says what a chunk IS; a
 * manifest says which of our modules NEED it. For a chunk that is ours those
 * coincide, and for a shared vendor chunk they do not, because the manifest
 * lists every consumer and the label has to pick one of them.
 *
 * Measured on the build of 21 September 2026: eight chunks have both, and for
 * every one of the eight the marker is the true answer. `2-ib05yrjrspw.js` is
 * the Lucide icon runtime, 21.0 KB, needed by 146 client components, and
 * manifest-first labelled it `src/app/(dashboard)/dashboard/error.tsx +145
 * more` purely because that path sorts first. A reader working down the table
 * would have opened the dashboard error boundary to find out why the homepage
 * ships 8 KB. The 196.3 KB Supabase-and-Buffer chunk was labelled the same way.
 *
 * So: what it IS, then how far it reaches, then whose code it is.
 *
 * `how` is returned beside the label because an exact answer and a reviewed
 * guess must never read the same in a table somebody is about to act on.
 *
 * @param {{ file: string, body?: string, modules?: Set<string>, known?: string }} chunk
 * @returns {{ label: string, how: 'manifest'|'marker'|'build'|'none' }}
 */
export function nameChunk({ file, body, modules, known }) {
  if (known) return { label: known, how: 'build' }
  const found = attribute(body ?? '')
  if (found[0] !== UNATTRIBUTED) {
    const reach = modules && modules.size > 0 ? ` (needed by ${modules.size} client module(s))` : ''
    return { label: `${found.join(' + ')}${reach}`, how: 'marker' }
  }
  if (modules && modules.size > 0) return { label: summariseModules(modules), how: 'manifest' }
  // The bundler's own runtime names itself in the file name, and nothing else
  // in the build is called this. Last, because a naming convention belongs to
  // the bundler and can change without notice.
  if (/^turbopack-/.test(file ?? '')) return { label: 'Turbopack runtime', how: 'marker' }
  return { label: UNATTRIBUTED, how: 'none' }
}
