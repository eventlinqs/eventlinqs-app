/**
 * THE HORIZON'S TWO COPIES AGREE (the engine plan of 28 October 2026, part A; window 4). public.listing_horizon
 * (20261028204001) and src/lib/listings/horizon.ts answer the same question in two places, so this asks both for 200
 * nights across both daylight saving changes and every horizon bound, and fails on any difference. Read only.
 *
 *   scripts\ops\with-supabase-token.ps1 node --import ./scripts/lib/src-alias-loader.mjs scripts/verify/horizon-twin-on-test.mjs
 *
 * TEST ONLY: the project ref is a constant, and the production ref is refused whatever it is edited to.
 */
import { horizonOf } from '../../src/lib/listings/horizon.ts'

const REF = 'vkapkibzokmfaxqogypq'
if (REF === 'gndnldyfudbytbboxesk') throw new Error('horizon-twin-on-test runs on TEST only')
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error('usage: scripts\\ops\\with-supabase-token.ps1 node --import ./scripts/lib/src-alias-loader.mjs scripts/verify/horizon-twin-on-test.mjs')
  process.exit(2)
}

const HOUR = 60 * 60 * 1000
/* Two "now"s: the evening of 28 October 2026 (daylight time), and the night before daylight saving ends, 3 April 2027. */
const nows = [new Date('2026-10-28T09:00:00Z'), new Date('2027-04-03T12:30:00Z')]
const cases = []
for (const now of nows) {
  for (let i = 0; i < 100; i += 1) {
    /* -2 to 97 days ahead, at a moving hour, so every bound is crossed near midnight and at noon. */
    cases.push({ now, at: new Date(now.getTime() + (i - 2) * 24 * HOUR + ((i * 7) % 24) * HOUR) })
  }
}
const values = cases.map((c, i) => `(${i}, timestamptz '${c.at.toISOString()}', timestamptz '${c.now.toISOString()}')`).join(',\n')
const query = `select i, public.listing_horizon(s, n) as h from (values ${values}) as v(i, s, n) order by i`

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query }),
})
if (!r.ok) {
  console.error(`TEST answered HTTP ${r.status}: ${(await r.text()).slice(0, 400)}`)
  process.exit(1)
}
const rows = await r.json()
let differ = 0
const seen = new Map()
for (const row of rows) {
  const c = cases[row.i]
  const ts = horizonOf(c.at, c.now)
  seen.set(ts, (seen.get(ts) ?? 0) + 1)
  if (ts !== row.h) {
    differ += 1
    console.log(`  DIFFER #${row.i}: night ${c.at.toISOString()} now ${c.now.toISOString()}: SQL ${row.h}, TS ${ts}`)
  }
}
console.log(`target TEST (${REF}), read only: ${rows.length} nights asked of both copies`)
console.log(`  horizons covered: ${[...seen].map(([h, n]) => `${h} ${n}`).join(', ')}`)
if (rows.length !== cases.length || differ > 0) {
  console.log(`TWIN FAILED: ${differ} differ, ${cases.length - rows.length} unanswered`)
  process.exitCode = 1
} else {
  console.log('TWIN PASSED: the SQL and TypeScript horizons agree on every night')
}
