/**
 * THE MARKETPLACE NOTIFICATION ROUTER, DRIVEN AGAINST THE REAL DATABASE.
 *
 * ============================================================================
 * WHAT THIS PROVES THAT THE UNIT TESTS CANNOT
 * ============================================================================
 *
 * tests/unit/notifications/a-blink-is-not-a-fact-about-a-performer.test.ts
 * drives every decision this module makes, and each of its cases was proven
 * RED against the code as it stood before the fix. What it drives is a STUB:
 * a chainable object that answers whatever the plan says. A stub can be wrong
 * about PostgREST in two ways that matter here, and both were introduced by
 * this change:
 *
 *   1. the devices read is now PAGED. `.eq().order().range()` against the real
 *      PostgREST either returns rows in a stable order or it does not, and a
 *      pager without a total order returns the same row twice and drops
 *      another. No stub can tell you which.
 *   2. the reads now bind `error`. A stub hands back the error object the test
 *      wrote; the real client hands back PostgREST's, and the branch is only
 *      correct if it recognises the real one.
 *
 * So this runs the module itself, unmodified, against TEST, three times:
 *
 *   RUN ONE    every read answers. The alert is delivered and recorded.
 *   RUN TWO    the identical alert. The dedupe read finds run one's row and
 *              the result is `duplicate`, delivering nothing.
 *   RUN THREE  the same alert for a fresh subject, through a client holding a
 *              REVOKED key, so every read really fails at the real PostgREST.
 *              The result must be `read_failed` and NOTHING may be sent.
 *
 * RUN THREE WAS DRIVEN AGAINST THE PRE-FIX MODULE AND IT ANSWERED `no_email`.
 * That is the measured result and it is written here because the first draft of
 * this header claimed something stronger, that the old code would SEND, and the
 * run did not show that. It could not: with EVERY read refused, the old code
 * reached the address read, got null, and stopped. What it did instead is the
 * defect in its quieter form. It told the caller that this performer has no
 * email address, about an account that has one, from a query that never
 * answered. `no_email` is then a fact about a person, recorded and counted.
 *
 * The louder form, a failed dedupe read sending a second copy, needs the dedupe
 * read to fail while the others answer, and no real client can be made to fail
 * exactly one table. That one is proven in the unit test, where the stub can,
 * and that test was driven RED against the pre-fix code.
 *
 * ============================================================================
 * WHY THERE IS NO SCREENSHOT AT 390, 768 AND 1440
 * ============================================================================
 *
 * Stated rather than quietly omitted. This module has no surface: it is the
 * router between a marketplace event and a person's push or email. The journey
 * that would exercise it end to end is posting a gig, and every gig action is
 * gated on the `gig_board` flag, which is OFF by a dated founder decision
 * recorded in src/lib/flags/broadcast.ts, on a TEST database three build lanes
 * share. Flipping a founder-decided switch to produce a screenshot is not a
 * build lane's call. The delivered EMAIL is captured here instead, which is
 * the artefact a person would actually receive.
 *
 * TEST ONLY, checked twice. Every row it creates carries `lane-c` and is
 * removed at the end.
 *
 * Usage:
 *   env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *     node --import ./scripts/lib/src-alias-loader.mjs --env-file=.env.local \
 *       scripts/verify/marketplace-notify-proof.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'

import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { tearDownAccountOrFailTheRun } from './lib/teardown-account.mjs'

assertNotProduction()

// The console transport prints what would have been sent rather than sending
// it, and it refuses a production project. Set before the module is imported.
process.env.EMAIL_TRANSPORT = 'console'

const TAG = '[marketplace-notify-proof]'
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'C8', 'marketplace-notify')

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!/vkapkibzokmfaxqogypq/.test(URL_)) throw new Error(`refusing to write to ${URL_}: this proof runs against TEST only`)

const { dispatchMarketplaceAlert } = await import('@/lib/marketplace/notify')

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

/*
 * THE BROKEN CLIENT. Same URL, same library, a key that is the right SHAPE and
 * is not the key. Every read through it fails at the real PostgREST with a real
 * error, which is the only way to drive the failure branch without editing the
 * module to pretend.
 */
const revoked = createClient(URL_, `${SERVICE.slice(0, -6)}revoke`, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const stamp = Date.now().toString(36)
const created = { userId: null }
const results = []
let failures = 0
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures += 1
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}
function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

mkdirSync(OUT, { recursive: true })

/*
 * EVERYTHING THE CONSOLE TRANSPORT PRINTS, captured rather than scrolled past.
 *
 * THIS DRIVE'S OWN LINES ARE EXCLUDED, and the first version of it did not
 * exclude them: `check()` logs through the same console, so every assertion
 * added a line to the very counter that was asserting nothing had been sent.
 * Runs two and three were reported as having sent one message each, and both
 * were this harness counting itself. The product was right and the instrument
 * was wrong, which is the failure mode this lane has now recorded three times
 * in one day.
 */
const printed = []
const realLog = console.log
console.log = (...args) => {
  const first = typeof args[0] === 'string' ? args[0] : ''
  if (!first.startsWith(TAG)) {
    printed.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  }
  realLog(...args)
}

try {
  const email = `lane-c-notify-${stamp}@eventlinqs.test`
  const password = randomBytes(12).toString('base64url') + '-Aa1'
  const user = must(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    'create the recipient',
  ).user
  created.userId = user.id

  // Email only: a push send would need a real VAPID endpoint, and what is being
  // proven here is the ROUTING and the reads, not the push transport, which has
  // its own driven proof.
  must(
    await admin
      .from('notification_prefs')
      .upsert({ user_id: user.id, push_enabled: false, email_enabled: true }, { onConflict: 'user_id' })
      .select('user_id'),
    'set the notification preferences',
  )

  const subjectOne = randomUUID()
  const subjectTwo = randomUUID()
  const alert = (subjectId) => ({
    admin,
    userId: user.id,
    type: 'gig_posted',
    subjectId,
    title: `Lane C proof ${stamp}`,
    body: 'A gig is open for applications.',
    url: `/gigs/${subjectId}`,
    ctaLabel: 'View the gig',
  })

  /* ---------------- RUN ONE: every read answers ---------------------- */
  const one = await dispatchMarketplaceAlert(alert(subjectOne))
  check('run one delivers the alert', one.status === 'sent' && one.channel === 'email', JSON.stringify(one))

  const recorded = must(
    await admin
      .from('notifications')
      .select('id, channel, subject_id')
      .eq('user_id', user.id)
      .eq('subject_id', subjectOne),
    'read back the recorded notification',
  )
  check('run one writes the record that stops the second copy', recorded.length === 1, `${recorded.length} row(s)`)
  check(
    'run one actually produced the email a person receives',
    printed.some((line) => line.includes(`Lane C proof ${stamp}`)),
    `${printed.length} transport line(s), ${printed.filter((l) => l.includes(`Lane C proof ${stamp}`)).length} naming this alert`,
  )

  /* ---------------- RUN TWO: the identical alert ---------------------- */
  const before = printed.length
  const two = await dispatchMarketplaceAlert(alert(subjectOne))
  check('run two is refused as a duplicate', two.status === 'skipped' && two.reason === 'duplicate', JSON.stringify(two))
  check('run two sends nothing at all', printed.length === before, `${printed.length - before} new transport line(s)`)

  /* ---------------- RUN THREE: every read really fails ---------------- */
  const beforeThree = printed.length
  const three = await dispatchMarketplaceAlert({ ...alert(subjectTwo), admin: revoked })
  check(
    'run three refuses rather than guessing, when the real PostgREST refuses every read',
    three.status === 'skipped' && three.reason === 'read_failed',
    JSON.stringify(three),
  )
  check('run three sends nothing', printed.length === beforeThree, `${printed.length - beforeThree} new transport line(s)`)

  const afterThree = must(
    await admin.from('notifications').select('id').eq('user_id', user.id).eq('subject_id', subjectTwo),
    'confirm run three wrote nothing',
  )
  check('run three writes no record either', afterThree.length === 0, `${afterThree.length} row(s)`)

  /* ---------------- THE PAGED READ, AGAINST REAL POSTGREST ------------ */
  const endpoints = []
  for (let i = 0; i < 3; i += 1) {
    const endpoint = `https://push.eventlinqs.test/lane-c-${stamp}-${i}`
    endpoints.push(endpoint)
    must(
      await admin
        .from('push_subscriptions')
        .insert({ user_id: user.id, endpoint, p256dh: `k${i}`, auth: `a${i}` })
        .select('endpoint'),
      'register a device',
    )
  }
  const paged = must(
    await admin
      .from('push_subscriptions')
      .select('endpoint')
      .eq('user_id', user.id)
      .order('endpoint', { ascending: true })
      .range(0, 1),
    'read the first window the module now asks for',
  )
  const pagedTwo = must(
    await admin
      .from('push_subscriptions')
      .select('endpoint')
      .eq('user_id', user.id)
      .order('endpoint', { ascending: true })
      .range(2, 3),
    'read the second window',
  )
  const seen = [...paged, ...pagedTwo].map((r) => r.endpoint)
  check(
    'the paged devices read has a total order, so no device is seen twice or missed',
    seen.length === 3 && new Set(seen).size === 3 && seen.join() === [...endpoints].sort().join(),
    seen.join(', '),
  )

  writeFileSync(
    join(OUT, `marketplace-notify-${stamp}.json`),
    JSON.stringify({ project: URL_, stamp, runs: { one, two, three }, results, transport: printed.slice(-40) }, null, 2),
  )
} finally {
  console.log = realLog
  try {
    if (created.userId) {
      await admin.from('notifications').delete().eq('user_id', created.userId)
      await admin.from('push_subscriptions').delete().eq('user_id', created.userId)
      await admin.from('notification_prefs').delete().eq('user_id', created.userId)
      await tearDownAccountOrFailTheRun(admin, created.userId)
    }
  } catch (error) {
    console.error(`${TAG} cleanup failed: ${error.message}`)
  }
}

if (failures) {
  console.error(`${TAG} FAIL - ${failures} of ${results.length}`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${results.length} of ${results.length}`)
