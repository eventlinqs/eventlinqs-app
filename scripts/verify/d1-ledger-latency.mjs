/**
 * THE REVERSAL CONDITION, MEASURED. Close-out D1:
 *
 *     "Measure checkout latency at the 95th percentile before and after. If the
 *      ledger write adds more than 50ms, move it off the request path to a
 *      queue. Never drop fields to make it cheaper."
 *
 * ----------------------------------------------------------------------------
 * WHAT IS MEASURED, AND WHY IT IS THIS AND NOT SOMETHING EASIER.
 *
 * "Before and after" needs two runs of the SAME path that differ by the ledger
 * write and by nothing else. Timing a whole browser checkout twice does not
 * give that: a real purchase is a different order every time, against different
 * inventory, through a page whose own render dominates the number. What it
 * would produce is a plausible figure that measures the wrong thing.
 *
 * The two arms here differ by EXACTLY the ledger write, with no code change and
 * no flag, because the running product already contains both:
 *
 *   ARM A (with the write)   POST /api/ledger/demand with a REAL published
 *                            event id. Rate limit, one `events` read, then
 *                            `recordDemand` -> the adapter -> the RPC.
 *   ARM B (without it)       the same endpoint, same shape, same rate limit,
 *                            same `events` read, with a well-formed id that is
 *                            not a published public event. The route answers
 *                            `{ok:true}` on the branch ABOVE the write.
 *
 * p95(A) - p95(B) is therefore the cost of the ledger write inside a real
 * request on a real server, with everything either side of it held constant.
 *
 * WHY THE DEMAND ROW IS THE RIGHT SUBJECT. It is the only ledger write on the
 * BUYER'S request path for a card purchase: `recordDemand('checkout_started')`
 * runs inside `processCheckout`, while the sale is recorded minutes later on a
 * Stripe webhook, on a machine nobody is waiting for. So the demand row is the
 * one that can make somebody's checkout slower, and it is the one the reversal
 * condition is actually about.
 *
 * EVERY REQUEST IN ARM A REALLY WRITES. The row is deduped per visitor per slot
 * per day, so a naive loop from one address would write once and then measure
 * 59 no-ops. Each iteration therefore presents a distinct forwarded address, so
 * each is a distinct visitor and each does the full work. That also keeps the
 * run under the 60-per-minute cap the policy declares.
 *
 * WHAT THIS NUMBER IS NOT. It is measured against a Supabase project reached
 * over a home connection, so it carries a network round trip that a Vercel
 * function co-located with the database does not. The floor is measured and
 * reported beside it rather than assumed away, and the verdict is stated
 * against the measured number, not against a friendlier estimate.
 *
 * Usage:
 *   BASE=http://localhost:3311 node --env-file=.env.local \
 *     scripts/verify/d1-ledger-latency.mjs --out C:/dev/EVIDENCE/D1 [--n 40]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const TAG = '[d1-latency]'
const BASE = process.env.BASE ?? 'http://localhost:3311'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/D1'
let N = 40
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  if (args[i] === '--n') N = Number(args[++i]) || N
}
mkdirSync(out, { recursive: true })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error(`${TAG} REFUSING: this is the PRODUCTION Supabase project and arm A writes rows.`)
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(`${TAG} NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.`)
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const lines = []
const say = (s) => {
  lines.push(s)
  console.log(s)
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0
function stats(samples) {
  const s = [...samples].sort((a, b) => a - b)
  return {
    n: s.length,
    min: +s[0].toFixed(1),
    p50: +quantile(s, 0.5).toFixed(1),
    p95: +quantile(s, 0.95).toFixed(1),
    max: +s[s.length - 1].toFixed(1),
  }
}

/** One measured POST. The address varies so every iteration is a new visitor. */
async function post(eventId, i) {
  const started = performance.now()
  const res = await fetch(`${BASE}/api/ledger/demand`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // 198.51.100.0/24 is TEST-NET-2 (RFC 5737), reserved for documentation
      // and examples, so no iteration can name a real address.
      'x-forwarded-for': `198.51.100.${i % 254}`,
      'user-agent': `d1-latency/${i}`,
    },
    body: JSON.stringify({ eventId, action: 'page_view' }),
  })
  await res.text()
  return { ms: performance.now() - started, status: res.status }
}

/* -------------------------------------------------------------------------
 * ENUMERATE. Never a typed id.
 * ---------------------------------------------------------------------- */
const { data: live } = await db
  .from('events')
  .select('id, title, slug, status, visibility')
  .eq('status', 'published')
  .eq('visibility', 'public')
  .order('created_at', { ascending: false })
  .limit(1)
const real = (live ?? [])[0]
if (!real) {
  console.error(`${TAG} no published public event on this database to measure against.`)
  process.exit(1)
}

/*
 * ARM B's id must be well formed and must not be a published public event, so
 * the route takes the branch above the write. It is drawn from the database
 * (an event that is not public) rather than invented, and only if none exists
 * is a random uuid used, which is reported.
 */
const { data: notPublic } = await db
  .from('events')
  .select('id, status, visibility')
  .or('status.neq.published,visibility.neq.public')
  .limit(1)
const controlId = (notPublic ?? [])[0]?.id ?? crypto.randomUUID()
const controlSource = (notPublic ?? [])[0]?.id ? 'a real event that is not published and public' : 'a random uuid'

say(`${TAG} against ${BASE}, project ${SUPABASE_URL.replace(/https:\/\/([a-z0-9]+)\..*/, '$1')} (TEST)`)
say(`${TAG} arm A id ${real.id} ("${real.title}")`)
say(`${TAG} arm B id ${controlId} (${controlSource})`)
say(`${TAG} ${N} iteration(s) per arm, interleaved so drift hits both equally`)

/* Warm both paths so the first compile is not counted as latency. */
for (let i = 0; i < 3; i += 1) {
  await post(real.id, 200 + i)
  await post(controlId, 210 + i)
}

const { count: before } = await db.from('ledger_entries').select('id', { count: 'exact', head: true }).eq('kind', 'demand')

const withWrite = []
const without = []
let badStatus = 0
for (let i = 0; i < N; i += 1) {
  // Interleaved: any slowdown in the machine lands on both arms, not one.
  const a = await post(real.id, i)
  const b = await post(controlId, i)
  if (a.status !== 200 || b.status !== 200) badStatus += 1
  withWrite.push(a.ms)
  without.push(b.ms)
}

const { count: after } = await db.from('ledger_entries').select('id', { count: 'exact', head: true }).eq('kind', 'demand')

const A = stats(withWrite)
const B = stats(without)
const addedP95 = +(A.p95 - B.p95).toFixed(1)
const addedP50 = +(A.p50 - B.p50).toFixed(1)

say('')
say(`${TAG} demand rows platform-wide: ${before} -> ${after} (+${(after ?? 0) - (before ?? 0)})`)
say(`${TAG} non-200 iteration pairs: ${badStatus}`)
say('')
say(`${TAG} ARM A, with the ledger write     n=${A.n}  min ${A.min}ms  p50 ${A.p50}ms  p95 ${A.p95}ms  max ${A.max}ms`)
say(`${TAG} ARM B, same request, no write    n=${B.n}  min ${B.min}ms  p50 ${B.p50}ms  p95 ${B.p95}ms  max ${B.max}ms`)
say('')
say(`${TAG} THE LEDGER WRITE ADDS: p50 ${addedP50}ms, p95 ${addedP95}ms`)
say(`${TAG} the close-out's threshold is 50ms at the 95th percentile`)

const verdict = addedP95 > 50 ? 'OVER' : 'UNDER'
say(`${TAG} VERDICT: ${verdict} the threshold (${addedP95}ms against 50ms)`)

writeFileSync(
  join(out, 'latency.txt'),
  lines.join('\n') + '\n',
  'utf8',
)
writeFileSync(
  join(out, 'latency.json'),
  JSON.stringify(
    { base: BASE, n: N, eventId: real.id, controlId, controlSource, withWrite: A, without: B, addedP50, addedP95, threshold: 50, verdict },
    null,
    2,
  ),
  'utf8',
)

/*
 * THE EXIT CODE SAYS WHAT WAS MEASURED, NOT WHETHER IT WAS CONVENIENT. A run
 * that wrote no rows measured nothing and must never read as a pass.
 */
if ((after ?? 0) <= (before ?? 0)) {
  console.error(`${TAG} FAIL: arm A wrote no rows, so nothing was measured.`)
  process.exit(1)
}
if (badStatus > 0) {
  console.error(`${TAG} FAIL: ${badStatus} iteration pair(s) did not answer 200.`)
  process.exit(1)
}
console.log(`${TAG} measured. Verdict ${verdict}.`)
