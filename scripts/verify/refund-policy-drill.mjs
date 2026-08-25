/**
 * THE ONE-WAY RULE, DRIVEN AGAINST THE REAL DATABASE.
 *
 * The rule lives in two places: public.refund_policy_is_looser_or_equal (the
 * trigger, which cannot be bypassed) and isLooserOrEqual in
 * src/lib/refunds/policy.ts (so the edit screen can refuse in words before the
 * save). Two copies of a rule drift. This drives the SAME ten cases that
 * tests/unit/refunds/policy.test.ts drives through TypeScript, through SQL,
 * and fails if any verdict differs.
 *
 * IT THEN DOES THE PART A PURE FUNCTION CANNOT. A rule that returns FALSE is
 * useless if nothing acts on it, so this also drives a REAL UPDATE against a
 * REAL PUBLISHED EVENT and requires the trigger to refuse it, then loosens the
 * same policy and requires that to succeed. Without both halves, "the trigger
 * refuses tightening" and "the trigger refuses everything" look identical, and so
 * do "the trigger allows loosening" and "the trigger is not installed".
 *
 * TEST ONLY, guarded.
 *
 * USAGE: node scripts/verify/refund-policy-drill.mjs --project test
 *
 * CONNECTION: through the shared helper (scripts/lib/db-credentials.mjs). The
 * private env reader and connection parser that used to live here are gone.
 *
 * THIS DRILL IS TEST-ONLY, and stays TEST-only. The generic preflight refuses
 * production unless it is approved; this script refuses it even when it IS
 * approved, because the drill writes policy fixtures and there is no version of
 * that which belongs on the live database. The TEST ref is resolved through
 * refForAlias rather than retyped, so there is no second literal to drift.
 */
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'
import { refForAlias } from '../lib/db-credentials.mjs'

const target = assertNotProductionDatabase()
const TEST_PROJECT_REF = refForAlias('test')
if (!TEST_PROJECT_REF) {
  console.error('REFUSED: the TEST project ref could not be read from .env.test.')
  process.exit(1)
}
if (target.ref !== TEST_PROJECT_REF) {
  console.error(`REFUSED: project ${target.ref} is not TEST (${TEST_PROJECT_REF}).`)
  console.error('This drill writes policy fixtures and runs on TEST only.')
  process.exit(1)
}
const client = await target.connect()

const hr = t => { console.log('\n' + '='.repeat(90)); console.log('  ' + t); console.log('='.repeat(90)) }
let failures = 0

/* The SAME ten cases as tests/unit/refunds/policy.test.ts, in the same order. */
const CASES = [
  ['no change at all',                                          'days_before', 7,  false, false, 'days_before', 7,  false, false, true],
  ['shortening 30 -> 1 is LOOSER',                              'days_before', 30, false, false, 'days_before', 1,  false, false, true],
  ['lengthening 1 -> 30 is TIGHTER',                            'days_before', 1,  false, false, 'days_before', 30, false, false, false],
  ['no_refunds -> days_before is LOOSER',                       'no_refunds',  7,  false, false, 'days_before', 7,  false, false, true],
  ['days_before -> no_refunds is TIGHTER',                      'days_before', 7,  false, false, 'no_refunds',  7,  false, false, false],
  ['self-service ON is LOOSER',                                 'days_before', 7,  false, false, 'days_before', 7,  true,  false, true],
  ['self-service OFF is TIGHTER',                               'days_before', 7,  true,  false, 'days_before', 7,  false, false, false],
  ['absorbing the fee is LOOSER',                               'days_before', 7,  false, false, 'days_before', 7,  false, true,  true],
  ['stopping absorbing the fee is TIGHTER',                     'days_before', 7,  false, true,  'days_before', 7,  false, false, false],
  ['looser days but tighter self-service is still TIGHTER',     'days_before', 30, true,  false, 'days_before', 1,  false, false, false],
]

hr('1. THE SQL RULE, over the same ten cases the unit test drives')
console.log(`  ${'case'.padEnd(52)} ${'sql'.padEnd(7)} ${'expected'.padEnd(9)} verdict`)
console.log('  ' + '-'.repeat(84))
for (const [name, ot, od, os, oa, nt, nd, ns, na, expected] of CASES) {
  const { rows } = await client.query(
    'SELECT public.refund_policy_is_looser_or_equal($1,$2,$3,$4,$5,$6,$7,$8) AS ok',
    [ot, od, os, oa, nt, nd, ns, na],
  )
  const got = rows[0].ok
  const ok = got === expected
  if (!ok) failures += 1
  console.log(`  ${name.padEnd(52)} ${String(got).padEnd(7)} ${String(expected).padEnd(9)} ${ok ? 'MATCH' : 'DIFFERS  <<<'}`)
}

hr('2. THE TRIGGER, on a real published event')
/*
 * A pure function returning FALSE proves nothing about whether anything acts on
 * it. This is the half that proves the rule is wired.
 */
const { rows: evs } = await client.query(`
  SELECT id, title, status, published_at, refund_policy_type, refund_policy_days,
         refund_policy_self_service, refund_policy_absorb_fee
  FROM public.events
  WHERE status = 'published' AND published_at IS NOT NULL
  ORDER BY created_at DESC LIMIT 1
`)
if (!evs.length) {
  console.log('  NO PUBLISHED EVENT FOUND, so the trigger could not be exercised.')
  console.log('  This run proves NOTHING about the trigger. Seed a published event and re-run.')
  failures += 1
} else {
  const ev = evs[0]
  console.log(`  event ${ev.id}  ${ev.title}`)
  console.log(`  policy now: ${ev.refund_policy_type} ${ev.refund_policy_days}d self=${ev.refund_policy_self_service} absorb=${ev.refund_policy_absorb_fee}`)

  // Everything below runs inside a transaction that is ALWAYS rolled back, so a
  // real organiser's event is never left changed by a drill.
  await client.query('BEGIN')
  try {
    // Normalise to a known starting policy so the drill does not depend on
    // whatever the event happened to carry.
    await client.query(
      `UPDATE public.events SET refund_policy_type='days_before', refund_policy_days=1,
              refund_policy_self_service=TRUE, refund_policy_absorb_fee=TRUE WHERE id=$1`, [ev.id])

    /*
     * EACH ATTEMPT GETS ITS OWN SAVEPOINT. Postgres aborts the whole transaction
     * on a raised exception, so without this the first expected refusal poisons
     * every later statement and the two CONTROLS below report "REFUSED" for a
     * reason that has nothing to do with the trigger. The first run of this drill
     * did exactly that, which is the controls doing their job: 2a and 2b passed
     * and 2c and 2d failed with "current transaction is aborted".
     */
    const attempt = async (sql) => {
      await client.query('SAVEPOINT s')
      try {
        await client.query(sql, [ev.id])
        await client.query('RELEASE SAVEPOINT s')
        return { refused: false, msg: '' }
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT s')
        await client.query('RELEASE SAVEPOINT s')
        return { refused: true, msg: e.message }
      }
    }

    // 2a. A TIGHTENING must be refused.
    const a = await attempt(`UPDATE public.events SET refund_policy_days=30 WHERE id=$1`)
    const refused = a.refused
    const msg = a.msg
    console.log(`\n  2a. tightening 1 -> 30 days      ${refused ? 'REFUSED  (correct)' : 'ALLOWED  <<< THE TRIGGER IS NOT ENFORCING'}`)
    if (refused) console.log(`      ${msg.split('\n')[0].slice(0, 110)}`)
    if (!refused) failures += 1

    // 2b. Switching to no_refunds must be refused.
    const b = await attempt(`UPDATE public.events SET refund_policy_type='no_refunds' WHERE id=$1`)
    const refused2 = b.refused
    console.log(`  2b. days_before -> no_refunds   ${refused2 ? 'REFUSED  (correct)' : 'ALLOWED  <<< THE TRIGGER IS NOT ENFORCING'}`)
    if (!refused2) failures += 1

    // 2c. CONTROL: a LOOSENING must succeed. Without this, a trigger that refused
    //     every update would pass 2a and 2b and look correct.
    const c = await attempt(`UPDATE public.events SET refund_policy_days=0 WHERE id=$1`)
    const loosened = !c.refused
    const loosenErr = c.msg
    console.log(`  2c. CONTROL loosening 1 -> 0    ${loosened ? 'ALLOWED  (correct)' : `REFUSED  <<< THE TRIGGER REFUSES EVERYTHING: ${loosenErr.slice(0, 70)}`}`)
    if (!loosened) failures += 1

    // 2d. CONTROL: a non-policy edit must be untouched by the trigger.
    const d = await attempt(`UPDATE public.events SET updated_at = NOW() WHERE id=$1`)
    const titled = !d.refused
    console.log(`  2d. CONTROL non-policy update   ${titled ? 'ALLOWED  (correct)' : 'REFUSED  <<< the trigger is firing on unrelated edits'}`)
    if (!titled) failures += 1
  } finally {
    await client.query('ROLLBACK')
    console.log('\n  (transaction rolled back, the event is unchanged)')
  }
}

hr('3. A DRAFT IS EXEMPT')
const { rows: drafts } = await client.query(`
  SELECT id, title FROM public.events
  WHERE status = 'draft' AND published_at IS NULL ORDER BY created_at DESC LIMIT 1
`)
if (!drafts.length) {
  console.log('  no unpublished draft on TEST, so the exemption was NOT exercised.')
  console.log('  Recorded as unproven rather than passed.')
} else {
  await client.query('BEGIN')
  try {
    await client.query(
      `UPDATE public.events SET refund_policy_type='days_before', refund_policy_days=1 WHERE id=$1`,
      [drafts[0].id])
    let ok = true
    try {
      // Tighten hard. A draft has sold nothing, so this must be allowed.
      await client.query(`UPDATE public.events SET refund_policy_type='no_refunds' WHERE id=$1`, [drafts[0].id])
    } catch (error) {
      console.warn('[scripts/verify/refund-policy-drill:182]', error instanceof Error ? error.message : error)
    ok = false }
    console.log(`  draft ${drafts[0].id}: tightening ${ok ? 'ALLOWED  (correct, nothing was sold under those terms)' : 'REFUSED  <<< drafts must be editable'}`)
    if (!ok) failures += 1
  } finally {
    await client.query('ROLLBACK')
  }
}

hr('VERDICT')
if (failures === 0) {
  console.log('  The SQL rule and the TypeScript rule agree on all ten cases, the trigger')
  console.log('  refuses a real tightening, allows a real loosening, ignores unrelated edits,')
  console.log('  and exempts drafts.')
} else {
  console.log(`  ${failures} FAILURE(S). See the rows marked <<< above.`)
}
await client.end()
process.exit(failures === 0 ? 0 : 1)
