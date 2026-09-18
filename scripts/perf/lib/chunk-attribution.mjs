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
