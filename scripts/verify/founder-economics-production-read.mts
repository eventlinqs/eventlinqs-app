/**
 * THE FOUNDER DASHBOARD'S ECONOMICS, READ ON PRODUCTION, READ ONLY (the PROJECT MANAGER's 08:16 of 30 October 2026, window
 * 5: "the founder dashboard economics read on production once car 11 is live").
 *
 * /admin/today needs Lawal's own sign-in and its 2FA code, and no production service key is held on this machine, so the
 * page cannot be opened or its reader run against production. This reads the SAME rows the reader reads for that section
 * (src/lib/growth/weekly.ts readGrowthRows: AUD orders before the end of last week; AUD refunds over the two weeks) through
 * the Management API with read_only, and passes them through the page's own pure math: weekly-math.ts figuresFor (the
 * other row sets empty, since economics reads orders alone) and founder-dashboard-math.ts economicsFigures. Writes nothing.
 *
 *   scripts\ops\with-supabase-token.ps1 node node_modules/tsx/dist/cli.mjs scripts/verify/founder-economics-production-read.mts
 *       [--ref gndnldyfudbytbboxesk]
 *
 * Prints each economics figure as the page shows it, the order count by status behind it, and the verdict: READ, or
 * FAILED with the error.
 */
import type { OrderRow, RefundRow } from '../../src/lib/growth/weekly-math'
import type * as WeeklyMath from '../../src/lib/growth/weekly-math'
import type * as DashMath from '../../src/lib/admin/founder-dashboard-math'

// tsx loads these TypeScript modules as CommonJS, so a static named import fails at run time ('does not provide an export
// named economicsFigures', 30 October 09:42); the import is dynamic and unwrapped, as founder-dashboard-read.mts does.
const unwrap = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const { figuresFor, lastWeeks } = unwrap((await import('../../src/lib/growth/weekly-math')) as typeof WeeklyMath & { default?: typeof WeeklyMath })
const { economicsFigures } = unwrap((await import('../../src/lib/admin/founder-dashboard-math')) as typeof DashMath & { default?: typeof DashMath })

const args = process.argv.slice(2)
const refAt = args.indexOf('--ref')
const ref = refAt === -1 ? 'gndnldyfudbytbboxesk' : args[refAt + 1] ?? ''
const token = process.env.SUPABASE_ACCESS_TOKEN ?? ''
if (!/^[a-z]{20}$/.test(ref) || !token) {
  console.error('run through scripts\\ops\\with-supabase-token.ps1; --ref must be a project ref')
  process.exit(2)
}

async function read<T>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: true }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`management query ${res.status}: ${body.slice(0, 300)}`)
  return JSON.parse(body) as T[]
}
const quote = (v: string) => `'${v.replace(/'/g, "''")}'`

try {
  const { last, before } = lastWeeks(new Date())
  console.log(`project ${ref}; last week ${last.from} to ${last.to}`)
  const orders = await read<{
    total_cents: number
    platform_fee_cents: number
    status: string
    created_at: string
    organisation_id: string
    event_id: string | null
    platform_fee_retained_cents: number | null
    stripe_processing_estimate_cents: number | null
  }>(
    `select total_cents, platform_fee_cents, status, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at, organisation_id, event_id, platform_fee_retained_cents, stripe_processing_estimate_cents from public.orders where currency = 'AUD' and created_at < ${quote(last.to)}::timestamptz order by id`,
  )
  const refunds = await read<{ amount_cents: number; status: string; created_at: string }>(
    `select amount_cents, status, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at from public.refunds where currency = 'AUD' and created_at >= ${quote(before.from)}::timestamptz and created_at < ${quote(last.to)}::timestamptz order by id`,
  )
  const orderRows: OrderRow[] = orders.map((o) => ({
    totalCents: o.total_cents,
    platformFeeCents: o.platform_fee_cents,
    status: o.status,
    createdAt: o.created_at,
    organisationId: o.organisation_id,
    eventId: o.event_id,
    retainedCents: o.platform_fee_retained_cents,
    processingCents: o.stripe_processing_estimate_cents,
  }))
  const refundRows: RefundRow[] = refunds.map((r) => ({ amountCents: r.amount_cents, status: r.status, at: r.created_at }))
  const week = figuresFor({ listings: [], visits: [], demand: [], saves: [], subscribers: [], orders: orderRows, refunds: refundRows }, last)

  const inLast = orderRows.filter((o) => o.createdAt >= last.from && o.createdAt < last.to)
  const byStatus = new Map<string, number>()
  for (const o of inLast) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1)
  console.log(`orders created last week, by status: ${inLast.length === 0 ? 'none' : [...byStatus].map(([s, n]) => `${s} ${n}`).join(', ')}; sold (as the page counts them): ${week.conversion.orders}`)
  console.log('Economics')
  for (const f of economicsFigures({ orderValueCents: week.conversion.orderValueCents, ...week.health })) {
    console.log(`  ${f.label}: ${f.display ?? (f.value === null ? 'NOT COUNTED' : f.value)}${f.note ? ` (${f.note})` : ''}`)
  }
  console.log('READ')
} catch (err) {
  console.log(`FAILED ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
}
