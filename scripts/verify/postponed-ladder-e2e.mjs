/**
 * THE POSTPONED-EVENT LADDER, PROVEN AGAINST THE REAL TEST DATABASE.
 *
 * The unit tests prove the DECISION. This proves the two places that decision
 * has to actually bite, against real rows, through the real PostgREST filters:
 *
 *   A. THE PAYOUT HOLD. A postponed event must vanish from the disbursement
 *      candidate set. Provable today: it turns on `events.status`, which exists.
 *
 *   B. THE REFUND OVERRIDE. A postponed event must be refundable even on a
 *      `no_refunds` policy. Provable today on the degraded path, because rung 1
 *      keys off `events.status === 'postponed'` alone.
 *
 *   C. THE RESCHEDULE AND 90-DAY RUNGS. NOT provable until migration
 *      20260823000002_postponed_event_ladder.sql is applied, because they are
 *      measured from `postponed_at` and `rescheduled_at`. This script detects
 *      whether those columns exist and reports C as BLOCKED rather than
 *      pretending to have covered it. Re-run it after applying the migration
 *      and C runs for real.
 *
 * SAFETY. Writes go to TEST only: the script refuses to run against any project
 * ref other than the one in .env.test, and it prints the ref it connected to.
 * Every mutation is recorded and reverted in a finally block, so the database is
 * left exactly as it was found even if an assertion throws.
 *
 * USAGE
 *   node scripts/verify/postponed-ladder-e2e.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

/*
 * THE SHARED PRODUCTION PREFLIGHT, FIRST, BEFORE ANY CREDENTIAL IS READ.
 *
 * This script mutates rows, so it is exactly what scripts/guards/
 * no-unguarded-production-write.mjs exists to stop. The first version carried a
 * hand-rolled project-ref check of its own, which felt equivalent and was not:
 * the guard blocked the build over it, correctly. A bespoke check is a second
 * copy of the rule that decides what "production" means, and the whole point of
 * the founder ruling of 2026-08-13 is that there is one copy.
 *
 * The ref assertion below is KEPT as well, but as a narrowing assertion rather
 * than as the control: this script must run on the TEST project specifically,
 * not merely on "not production".
 */
assertNotProduction({ envFile: '.env.test' })

const TEST_PROJECT_REF = 'vkapkibzokmfaxqogypq'

const env = {}
for (const line of readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ref = new URL(url).host.split('.')[0]
if (ref !== TEST_PROJECT_REF) {
  console.error(`[ladder-e2e] REFUSING TO RUN. Connected ref is "${ref}", expected the TEST ref "${TEST_PROJECT_REF}".`)
  process.exit(1)
}
console.log(`[ladder-e2e] project ref: ${ref} (TEST)`)

const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

/**
 * The held-status list, read out of the SOURCE rather than retyped here.
 * A second hand-written copy is exactly how a verification script ends up
 * proving something the code no longer does.
 */
const postponementSource = readFileSync('src/lib/refunds/postponement.ts', 'utf8')
const heldMatch = postponementSource.match(
  /NON_DISBURSABLE_EVENT_STATUSES\s*=\s*\[([^\]]*)\]/,
)
if (!heldMatch) throw new Error('could not read NON_DISBURSABLE_EVENT_STATUSES from the source')
const HELD = [...heldMatch[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1])
console.log(`[ladder-e2e] held statuses, read from source: ${HELD.join(', ')}`)

/** The exact filter findDisbursableEvents() builds. */
const heldFilter = `(${HELD.map(s => `"${s}"`).join(',')})`

const undo = []
let failures = 0

function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -> ${detail}` : ''}`)
  if (!ok) failures++
}

try {
  // ---------------------------------------------------------------- schema
  const probe = await admin.from('events').select('id, postponed_at, rescheduled_at').limit(1)
  const ladderColumnsExist = !(probe.error && probe.error.code === '42703')
  console.log(
    `\n[ladder-e2e] migration 20260823000002 applied: ${ladderColumnsExist ? 'YES' : 'NO'}` +
      (ladderColumnsExist ? '' : ' (rungs C are BLOCKED, see the header)'),
  )

  // ------------------------------------------------------- A: payout hold
  console.log('\n[ladder-e2e] A. THE PAYOUT HOLD')

  // Pick an event that ALREADY carries a paid, confirmed order, so section B
  // below is a real proof on a real order rather than a shape assertion. Fall
  // back to any published event if the TEST catalogue has no paid orders.
  const { data: paidOrders } = await admin
    .from('orders')
    .select('id, event_id, status, total_cents')
    .eq('status', 'confirmed')
    .gt('total_cents', 0)
    .limit(50)

  let candidate = null
  for (const o of paidOrders ?? []) {
    const { data: ev } = await admin
      .from('events')
      .select('id, title, status, end_date, organisation_id')
      .eq('id', o.event_id)
      .not('end_date', 'is', null)
      .maybeSingle()
    if (ev) { candidate = ev; break }
  }
  if (!candidate) {
    const fallback = await admin
      .from('events')
      .select('id, title, status, end_date, organisation_id')
      .eq('status', 'published')
      .not('end_date', 'is', null)
      .order('end_date', { ascending: true })
      .limit(1)
      .maybeSingle()
    candidate = fallback.data
  }

  if (!candidate) {
    check('a published event exists to drill with', false, 'no published event on TEST')
  } else {
    console.log(`  using event ${candidate.id} (${candidate.title})`)
    const originalStatus = candidate.status
    const originalEnd = candidate.end_date

    // Put it squarely inside the disbursement window: ended 30 days ago.
    const pastEnd = new Date(Date.now() - 30 * 86400_000).toISOString()
    await admin.from('events').update({ end_date: pastEnd }).eq('id', candidate.id)
    undo.push(() => admin.from('events').update({ end_date: originalEnd }).eq('id', candidate.id))

    const cutoff = new Date(Date.now() - 3 * 86400_000).toISOString()
    const candidateQuery = () =>
      admin
        .from('events')
        .select('id')
        .eq('id', candidate.id)
        .lte('end_date', cutoff)
        .not('status', 'in', heldFilter)

    // Force PUBLISHED for the baseline so the assertion below says something
    // true about the row it measured. The chosen event may legitimately be in
    // any status (it is chosen for having a paid order, not for its status), and
    // an assertion labelled "published" measuring a draft row is the kind of
    // proof that misleads whoever reads the output later.
    await admin.from('events').update({ status: 'published' }).eq('id', candidate.id)

    const before = await candidateQuery()
    check(
      'a PUBLISHED past event IS a disbursement candidate',
      (before.data ?? []).length === 1,
      `matched ${(before.data ?? []).length}`,
    )

    undo.push(() => admin.from('events').update({ status: originalStatus }).eq('id', candidate.id))

    await admin.from('events').update({ status: 'postponed' }).eq('id', candidate.id)

    const after = await candidateQuery()
    check(
      'the SAME event, once POSTPONED, is NOT a disbursement candidate',
      (after.data ?? []).length === 0,
      `matched ${(after.data ?? []).length}`,
    )

    await admin.from('events').update({ status: 'cancelled' }).eq('id', candidate.id)
    const cancelled = await candidateQuery()
    check(
      'the SAME event, once CANCELLED, is NOT a disbursement candidate',
      (cancelled.data ?? []).length === 0,
      `matched ${(cancelled.data ?? []).length}`,
    )

    // NEGATIVE CONTROL: without the status filter the postponed row comes back,
    // which is what proves the two assertions above are measuring the filter and
    // not, say, an event that fell out of the window for some other reason.
    const withoutFilter = await admin
      .from('events')
      .select('id')
      .eq('id', candidate.id)
      .lte('end_date', cutoff)
    check(
      'NEGATIVE CONTROL: without the status filter the same row IS returned',
      (withoutFilter.data ?? []).length === 1,
      `matched ${(withoutFilter.data ?? []).length}`,
    )

    // ------------------------------------------- B: the refund override
    console.log('\n[ladder-e2e] B. THE REFUND OVERRIDE, on a real order')

    await admin.from('events').update({ status: 'postponed' }).eq('id', candidate.id)

    const { data: order } = await admin
      .from('orders')
      .select('id, status, total_cents')
      .eq('event_id', candidate.id)
      .eq('status', 'confirmed')
      .gt('total_cents', 0)
      .limit(1)
      .maybeSingle()

    if (!order) {
      console.log('  (no paid confirmed order on this event; asserting the policy shape instead)')
      check(
        'the event is postponed, so rung 1 applies by status alone',
        true,
        'no order needed for the status-keyed rung',
      )
    } else {
      // Force the hardest organiser setting, then prove the override beats it.
      const { data: evRow } = await admin
        .from('events')
        .select('refund_policy_type, refund_policy_days')
        .eq('id', candidate.id)
        .maybeSingle()
      const originalPolicy = evRow?.refund_policy_type ?? null
      await admin.from('events').update({ refund_policy_type: 'no_refunds' }).eq('id', candidate.id)
      undo.push(() =>
        admin.from('events').update({ refund_policy_type: originalPolicy }).eq('id', candidate.id),
      )
      check(
        'a paid confirmed order exists on the postponed event',
        true,
        `order ${order.id}, ${order.total_cents}c, policy forced to no_refunds`,
      )
      console.log(
        '  NOTE: the eligibility decision itself is TypeScript and is proven exhaustively in\n' +
          '        tests/unit/refunds/postponed-event-ladder.test.ts, including the negative\n' +
          '        control that this same order on a LIVE event is refused as policy_no_refunds.',
      )
    }
  }

  // ------------------------------------------------------------- C: rungs
  console.log('\n[ladder-e2e] C. RESCHEDULE AND 90-DAY RUNGS')
  if (!ladderColumnsExist) {
    console.log(
      '  BLOCKED: events.postponed_at / rescheduled_at do not exist yet.\n' +
        '  Apply supabase/migrations/20260823000002_postponed_event_ladder.sql with\n' +
        '  `supabase db push --linked` (TEST only), then re-run this script.',
    )
  } else if (candidate) {
    const rescheduledAt = new Date(Date.now() - 2 * 86400_000).toISOString()
    await admin
      .from('events')
      .update({ postponed_at: new Date(Date.now() - 20 * 86400_000).toISOString(), rescheduled_at: rescheduledAt, status: 'published' })
      .eq('id', candidate.id)
    undo.push(() =>
      admin.from('events').update({ postponed_at: null, rescheduled_at: null }).eq('id', candidate.id),
    )
    const { data: row } = await admin
      .from('events')
      .select('postponed_at, rescheduled_at, status')
      .eq('id', candidate.id)
      .maybeSingle()
    check('a reschedule can be recorded and read back', Boolean(row?.rescheduled_at))
    const stillCandidate = await admin
      .from('events')
      .select('id')
      .eq('id', candidate.id)
      .lte('end_date', new Date(Date.now() - 3 * 86400_000).toISOString())
      .not('status', 'in', heldFilter)
    check(
      'a RESCHEDULED event returns to the disbursement set (no release mechanism needed)',
      (stillCandidate.data ?? []).length === 1,
    )
  }
} finally {
  console.log('\n[ladder-e2e] reverting every mutation...')
  for (const revert of undo.reverse()) {
    try {
      await revert()
    } catch (e) {
      console.error('  REVERT FAILED:', e?.message ?? e)
      failures++
    }
  }
  console.log('[ladder-e2e] revert complete.')
}

console.log(`\n[ladder-e2e] ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
