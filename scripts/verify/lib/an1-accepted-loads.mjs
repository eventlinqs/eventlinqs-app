/**
 * WHAT THE CONSENT GATE ACTUALLY DID ONCE SOMEBODY AGREED, JUDGED FROM THE
 * BROWSER RATHER THAN FROM THE SHELL THE DRIVE HAPPENS TO RUN IN.
 *
 * Close-out AN1, acceptance 2's positive half. Written 19 September 2026 after
 * the check it replaces was found reporting PASS for something it had not
 * tested.
 *
 * ============================================================================
 * THE DEFECT THIS EXISTS TO MAKE IMPOSSIBLE
 * ============================================================================
 *
 * `an1-consent-drive.mjs` used to decide how many providers were configured by
 * reading its OWN environment:
 *
 *     const configured = [process.env.NEXT_PUBLIC_POSTHOG_KEY, ...].filter(Boolean).length
 *     check(..., configured === 0 ? afterAccept.length === 0 : afterAccept.length > 0, ...)
 *
 * A `NEXT_PUBLIC_*` value reaches the browser because the SERVER inlined it
 * when it compiled the client component. The drive is a different process, and
 * on this machine the two disagree: `.env.local` carries none of the four, and
 * the server is started by `scripts/dev/lane-b-serve-with-stripe.mjs`, which
 * has its own environment. So the line read one machine's answer to a question
 * about another.
 *
 * It failed in BOTH directions, which is why it is worth a module of its own.
 *
 *   PASSING WITHOUT PROVING. With nothing configured it asserted
 *   `afterAccept.length === 0`, which is character for character what the
 *   refusal check three lines above already asserts. Accepting and refusing
 *   produced the same assertion, under a name that claims the opposite was
 *   tested, and the run printed 36 of 36.
 *
 *   FAILING A WORKING PLATFORM. Export the four names in the drive's shell
 *   while the server has none and it demands `afterAccept.length > 0` from a
 *   browser that was correctly given nothing to load. The harness would have
 *   accused the product, which is the most expensive shape of fault in this
 *   repository.
 *
 * ============================================================================
 * WHAT IS OBSERVED INSTEAD
 * ============================================================================
 *
 * The gate's own output in the real browser: which of its script elements it
 * rendered. `gated-analytics.tsx` gives each one a stable id, and an element is
 * present only when BOTH of `mayLoad`'s conditions hold, so the set of ids in
 * the DOM is the honest answer to "what did the server give this browser, and
 * did the person agree to it". Nothing is inferred from an environment.
 *
 * ONE LOADER SERVES TWO PROVIDERS. `el-gtag-loader` is emitted when GA4 or
 * Google Ads is configured, because they are one script with two configured
 * ids; loading it twice would double every page view. So a script element maps
 * to a SET of provider ids, and its expected hosts are the union of theirs.
 *
 * ============================================================================
 * THE JUDGEMENT IS AN EQUALITY, NOT A COUNT
 * ============================================================================
 *
 * A count going up proves the gate opened; it does not prove the gate opened
 * for the right providers. Both directions are checked:
 *
 *   every script the gate emitted attempted at least one of its own hosts
 *     -> otherwise the gate rendered a tag that never ran, which is the silent
 *        failure the item's whole guard exists for;
 *   every provider host that was attempted belongs to a script the gate emitted
 *     -> otherwise something outside the gate reached a tracker, which is the
 *        defect AN1 is about.
 *
 * AND THE EMPTY CASE IS A REFUSAL, NOT A PASS. When the gate emitted nothing
 * there is no positive half to prove, so this returns `not-proven` and the
 * drive fails, naming the one command that makes the meaningful form runnable.
 * A verification that quietly downgrades what it proves is worse than one that
 * is missing, because the missing one is visible.
 *
 * `tests/unit/growth/an1-accepted-loads.test.ts` holds every branch.
 */

/**
 * The gate's script elements, each with the provider ids it serves.
 *
 * The ids are the literal `id` props in
 * `src/components/analytics/gated-analytics.tsx`; clause 6 of
 * `scripts/guards/no-analytics-before-consent.mjs` fails the build if this list
 * and that file stop naming the same ones, because a renamed script element
 * would leave this module observing an element that no longer exists and
 * reporting `not-proven` for ever.
 */
export const GATE_SCRIPTS = [
  {
    id: 'el-posthog',
    providers: ['posthog'],
    why: 'the PostHog snippet, which inserts its own loader from api_host',
  },
  {
    id: 'el-gtag-loader',
    providers: ['ga4', 'google-ads'],
    why: 'one gtag loader serves both Google providers, by design in the gate',
  },
  {
    id: 'el-gtag-config',
    providers: [],
    why: 'the inline gtag config: it pushes to dataLayer and fetches nothing of its own, so it has no host to watch for',
  },
  {
    id: 'el-meta-pixel',
    providers: ['meta-pixel'],
    why: 'the Meta snippet, which inserts fbevents.js from connect.facebook.net',
  },
]

/** The id of every script element this module knows how to judge. */
export const GATE_SCRIPT_IDS = GATE_SCRIPTS.map(s => s.id)

/**
 * WHERE THE INVENTORY QUESTION IS ANSWERED, because it is not answered here.
 *
 * The first version of this module had the drive collect every script element
 * whose id began `el-`, so that a fifth provider added to the gate would arrive
 * as an id this module does not know and be refused. It was run, and it was
 * wrong: `el-` is not the gate's prefix. `src/app/layout.tsx` renders
 * `el-headless-flag` and `el-real-user-bootstrap` with it, and the drive
 * refused all three viewports on the first run, naming both.
 *
 * Which is the right outcome from the wrong mechanism, so the mechanism moved.
 * The drive filters to the ids below, and "the gate rendered a script nobody
 * judges" is answered by clause 7 of
 * `scripts/guards/no-analytics-before-consent.mjs`, which compares this list to
 * the `id=` props in the gate file itself and FAILS THE BUILD either way round.
 * That is strictly stronger than the drive noticing: it fires on every build
 * rather than on the runs somebody remembers to do, and it fires before the
 * script could ever reach a person. Drills 7 and 8 prove both directions.
 *
 * The `mismatch` branch for an unknown id stays, because it costs a line and it
 * is the honest answer for any other caller that hands this an id it has never
 * heard of.
 */
export const GATE_SCRIPT_INVENTORY_GUARD = 'scripts/guards/no-analytics-before-consent.mjs clause 7'

/**
 * The one command that turns the empty case into the meaningful one. Named here
 * rather than in the drive so the refusal message and the flag cannot drift.
 */
export const THE_COMMAND = 'node scripts/dev/lane-b-serve-with-stripe.mjs --measurement-ids'

function hostsOf(providers, registry) {
  const wanted = new Set(providers)
  return registry.filter(p => wanted.has(p.id)).flatMap(p => p.hosts)
}

function matches(url, hosts) {
  const lower = String(url).toLowerCase()
  return hosts.some(host => lower.includes(host.toLowerCase()))
}

/**
 * Judges the positive half of AN1 acceptance 2 from what the browser did.
 *
 * @param {object} input
 * @param {string[]} input.emitted   ids of the gate's script elements present in
 *                                   the DOM after the person accepted
 * @param {string[]} input.requested every URL requested after accepting that
 *                                   reached a provider host (the drive's `hits`)
 * @param {Array<{id: string, hosts: string[]}>} input.registry
 *                                   ANALYTICS_PROVIDERS, passed in so the
 *                                   registry stays the single list
 * @returns {{verdict: 'proven'|'not-proven'|'mismatch', detail: string}}
 */
export function judgeAcceptedLoads({ emitted, requested, registry }) {
  if (!Array.isArray(emitted) || !Array.isArray(requested) || !Array.isArray(registry)) {
    throw new TypeError(
      'judgeAcceptedLoads needs emitted, requested and registry as arrays. ' +
        'A caller that hands it undefined would otherwise be told its gate emitted nothing, ' +
        'which is a harness fault wearing the shape of a product one.',
    )
  }

  const unknown = emitted.filter(id => !GATE_SCRIPT_IDS.includes(id))
  if (unknown.length > 0) {
    return {
      verdict: 'mismatch',
      detail:
        `the page carried script element(s) ${JSON.stringify(unknown)} that this module does not know how to judge. ` +
        'Add them to GATE_SCRIPTS with the hosts they reach, or the drive is watching a gate it cannot read.',
    }
  }

  // Only a script that FETCHES something can prove the gate opened. The inline
  // gtag config renders beside the loader and asks for nothing, so a run in
  // which it were the only thing present would still have proved nothing.
  const expected = GATE_SCRIPTS.filter(s => emitted.includes(s.id) && s.providers.length > 0)

  if (expected.length === 0) {
    return {
      verdict: 'not-proven',
      detail:
        'the gate rendered no provider script, so accepting could not change what loads and this check ' +
        'would assert exactly what the refusal check already asserts. Nothing about the positive half of ' +
        `acceptance 2 was tested. Start the server with \`${THE_COMMAND}\` and run again.`,
    }
  }

  const silent = expected.filter(s => !requested.some(url => matches(url, hostsOf(s.providers, registry))))
  if (silent.length > 0) {
    return {
      verdict: 'mismatch',
      detail:
        `the gate rendered ${JSON.stringify(silent.map(s => s.id))} and the browser never asked for ` +
        'a single one of their hosts, so the tag was emitted and never ran.',
    }
  }

  const allExpectedHosts = expected.flatMap(s => hostsOf(s.providers, registry))
  const stray = requested.filter(url => !matches(url, allExpectedHosts))
  if (stray.length > 0) {
    return {
      verdict: 'mismatch',
      detail:
        `${stray.length} request(s) reached a provider host belonging to no script the gate emitted: ` +
        `${JSON.stringify([...new Set(stray)].slice(0, 5))}. Something outside the gate is loading a tracker.`,
    }
  }

  const hosts = [...new Set(requested.map(u => { try { return new URL(u).host } catch { return u } }))]
  return {
    verdict: 'proven',
    detail:
      `the gate emitted ${JSON.stringify(emitted)} and the browser attempted ${requested.length} request(s) ` +
      `to ${JSON.stringify(hosts)}, every one of them aborted at the route layer so nothing left this machine. ` +
      'No host of any provider the gate did not emit was touched.',
  }
}
