/**
 * THE PROBE. Runs the REAL resolvers, once, under whatever environment its
 * parent handed it, and prints what they returned.
 *
 * It is deliberately tiny and deliberately dumb: it asserts nothing and knows no
 * expected values. All the judgement lives in
 * scripts/guards/canonical-host-runtime.mjs, which spawns one of these per
 * scenario with a different environment and compares the JSON below against what
 * that scenario must produce.
 *
 * WHY A SEPARATE PROCESS PER SCENARIO. The environment is read at call time
 * today, so one process could in principle mutate `process.env` between cases.
 * A fresh process is the honest simulation of a deployment: the module is loaded
 * from cold, exactly as it is on a real server, so the check keeps working if
 * anyone later adds module-level caching to the resolver. The cost is a few
 * hundred milliseconds per scenario, which is the cheapest insurance in the
 * build.
 *
 * The resolver is imported by RELATIVE PATH rather than the `@/` alias, because
 * this runs outside the Next.js compiler where that alias is resolved.
 *
 * stdout carries the JSON and nothing else. The production warning that
 * `site-url.ts` emits goes to stderr through console.warn, so the parent reads
 * the two apart without any parsing.
 */
import { getSiteUrl, getAppUrl, printableHost, canonicalHost } from '../../../src/lib/site-url'

process.stdout.write(
  JSON.stringify({
    getSiteUrl: getSiteUrl(),
    getAppUrl: getAppUrl(),
    printableHost: printableHost(),
    canonicalHost: canonicalHost(),
  }),
)
