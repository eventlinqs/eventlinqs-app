/**
 * GUARD: no client component may reach the Redis client through a value
 * import.
 *
 * ============================================================================
 * WHY THIS EXISTS, WITH THE MEASUREMENT
 * ============================================================================
 *
 * `src/lib/redis/client.ts` statically imports `@upstash/redis`, which drags a
 * 16.0 KB Node `Buffer` polyfill with it. None of that can do anything in a
 * browser. All of it was being sent to one.
 *
 * The edge was a single import, and every module on the chain looked innocent:
 *
 *     src/components/checkout/ticket-selector.tsx     (a client component)
 *       -> src/lib/payments/sale-status.ts            for describeSaleRefusal,
 *                                                     a pure copy function
 *       -> src/lib/payments/application-fee.ts        for getCurrencyForCountry
 *       -> src/lib/payments/pricing-rules.ts
 *       -> src/lib/redis/client.ts
 *       -> @upstash/redis + the Buffer polyfill
 *
 * 17.5 KB gzip of server-only code, on /events/[slug], /events/[slug]/holder
 * and /e/[code]: the event page and the checkout, which are the two surfaces
 * that sell tickets. It put all three over the Scope v5 10.3 budget of 200 KB
 * by 372 bytes, so the overage was 48 times smaller than its own cause, and a
 * reader of the budget report would have gone looking for 372 bytes.
 *
 * The fix was to lift the one thing `sale-status.ts` wanted, the Connect
 * country-to-currency map, into `src/lib/payments/connect-currency.ts`, a
 * module that imports nothing. `application-fee.ts` re-exports it, so no other
 * caller changed.
 *
 * ============================================================================
 * AND WHY IT IS A GATE RATHER THAN A COMMENT
 * ============================================================================
 *
 * Because the comment was already there and it did not hold. `pricing-rules.ts`
 * is the fee resolver: it is the correct place for a Redis-backed cache, and it
 * will keep being imported by payments code forever. The defect is not that
 * anybody did something careless, it is that ONE import from a client component
 * into a payments module is enough, the bundler follows it silently, and the
 * only visible symptom is a budget report 372 bytes over on a route nobody
 * associates with Redis. That is precisely the shape that comes back.
 *
 * Registered in `run-guards.mjs`, so it blocks on `prebuild`, beside
 * `no-client-sentry-import.mjs`, which is the same rule about a different
 * server-only dependency and now shares this one's graph.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE, STATED RATHER THAN IMPLIED
 * ============================================================================
 *
 * It follows relative and `@/` imports inside `src/` only, reads `import type`
 * as erased (which is what tsc does), and stops at `'use server'` boundaries
 * because those are bundle boundaries rather than edges. A dynamic
 * `await import()` is not followed, deliberately: that is the fix for this
 * class of problem rather than an instance of it. See
 * `scripts/guards/lib/import-graph.mjs`, which owns all of those rules and
 * explains the resolver bug that extracting it fixed.
 */
import { buildImportGraph, pathToTarget } from './lib/import-graph.mjs'

const TARGET = 'src/lib/redis/client'
const SEAM = 'src/lib/payments/connect-currency'

const graph = buildImportGraph()

const violations = []
for (const mod of graph.isClient) {
  const memo = new Map()
  const path = pathToTarget(graph, mod, TARGET, memo)
  if (path) violations.push(path)
}

console.log(
  `no-client-redis-import: ${graph.files.length} modules read, ${graph.edgeCount} value imports, ` +
    `${graph.isClient.size} client components, ${graph.isServerAction.size} 'use server' boundaries`,
)
console.log(`  target: ${TARGET} (statically imports @upstash/redis and a 16.0 KB Buffer polyfill)`)
console.log(`  the leaf the checkout copy path reads instead: ${SEAM}`)

if (violations.length > 0) {
  console.error(`\nFAIL: ${violations.length} client component(s) reach the Redis client:`)
  for (const path of violations) console.error(`  ${path.join('\n    -> ')}`)
  console.error(
    `\nRedis is server-only. Lift the value the client actually needs into a leaf module that\n` +
      `imports nothing (${SEAM} is the worked example) and re-export it from the server module\n` +
      `so no other caller changes.`,
  )
  process.exit(1)
}

console.log('  0 client components reach it. PASS')
