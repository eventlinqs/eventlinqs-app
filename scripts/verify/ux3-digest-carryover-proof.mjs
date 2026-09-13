/**
 * DRIVEN PROOF: THE DIGEST DOES NOT INHERIT ATTEMPTS IT NEVER MADE.
 *
 * THE DEFECT THIS PROVES FIXED, found on 13 September 2026 against the one rule
 * the digest fix of the same morning left standing. `sendHeldDigest` counts a
 * batch by its HIGHEST `attempts`, which is right while every attempt on a held
 * row was spent ON THE DIGEST. It was not. A row that fails as an INDIVIDUAL
 * email stays `pending` with its counter incremented, and when the day's ceiling
 * is crossed before the next tick reaches it, the dispatcher held it with that
 * counter intact. A batch could therefore arrive at PLATFORM_NOTIFY_MAX_EMAIL_
 * ATTEMPTS - 1 and give up on its FIRST refusal - escalating, or with no armed
 * push device writing every row `failed`, where nothing reads it again. That is
 * the same unrecoverable loss as before, reached through a different door, and
 * ONE such row poisons the whole batch it is held with: the digest is a single
 * email carrying up to two hundred paid orders.
 *
 * WHAT MAKES THIS A DRIVE AND NOT AN ASSERTION. The REAL cron route
 * /api/cron/platform-notify is called over HTTP, tick by tick, exactly as Vercel
 * calls it every minute, against a REAL server whose mail transport genuinely
 * cannot send (started with EMAIL_TRANSPORT unset and RESEND_API_KEY removed, so
 * getResend() throws before any network call). After every tick the rows are
 * READ BACK OUT OF THE DATABASE; the route's own summary is printed but never
 * trusted.
 *
 * THE OBSERVATION THAT CARRIES THE WHOLE PROOF. The carrier row enters the tick
 * with attempts = MAX - 1, spent on individual email. One tick later the
 * database shows it `held_for_digest` with attempts = 1. A counter cannot go
 * DOWN unless the hold reset it, and 1 rather than MAX is the difference between
 * a digest with its whole budget and a digest already dead. Against the shipped
 * code that same tick wrote the carrier AND the forty-nine orders held beside it
 * off on a single refusal.
 *
 * HOW IT KEEPS OFF ANOTHER LANE'S ROWS, which is why it seeds so many.
 * platform_notifications is shared on TEST, and this drive deliberately runs a
 * server whose mail cannot send: a foreign row caught in one of these ticks would
 * have its attempts spent by lane C. The dispatcher takes the OLDEST
 * DISPATCH_BATCH_LIMIT pending rows, so the drive seeds a full batch per tick,
 * every one dated BEFORE the oldest foreign row in the queue, and asserts the
 * composition of the batch out of the database before each tick rather than
 * assuming it. Nothing belonging to another lane is read into a tick, edited or
 * deleted.
 *
 * THE PHASES, sharing rows through --tag so each judges the state the previous
 * one really left in the database:
 *
 *   --phase carry     broken mail. Seed the day past the ceiling with a full
 *                     batch per tick, the first of them a carrier whose
 *                     individual attempts are already spent. One tick. The batch
 *                     must be HELD, counted from zero, and its history kept.
 *   --phase exhaust   broken mail. The digest must still get the FULL number of
 *                     its OWN attempts before anything terminal happens.
 *   --phase recover   working mail, on a second tag held the same way. The
 *                     digest must actually ARRIVE, which is the point: an order
 *                     that failed once as an individual email costs nothing.
 *   --phase render    the owner's screen at 390, 768 and 1440, with axe.
 *   --phase cleanup   delete this lane's rows and assert none are left.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3200 node --env-file=.env.local \
 *     scripts/verify/ux3-digest-carryover-proof.mjs --phase carry --tag lane-c-carry-1
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import {
  PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS,
  PLATFORM_ORDER_ALERTS_PER_DAY,
} from '@/lib/notifications/platform-policy'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/UX3-CARRYOVER'
let phase = 'carry'
let tag = null
/* One full dispatch batch per tick the tag will take, so no tick ever has to
 * reach past lane C's own rows into the shared queue. */
let batches = 3
/*
 * How far before the oldest row this lane does not own the seed is dated.
 *
 * Two things pull in opposite directions and this is the dial between them. The
 * rows must be OLDER than any foreign pending row, or a tick would take one; and
 * they must be NEW enough to appear in the admin feed, which shows the newest
 * fifty rows in the table, or the render phase would photograph a screen its own
 * rows had fallen off the bottom of. A run with two tags therefore gives the one
 * being photographed the smaller offset.
 */
let minutesBefore = 60
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--phase') phase = args[++i]
  else if (args[i] === '--tag') tag = args[++i]
  else if (args[i] === '--batches') batches = Number(args[++i])
  else if (args[i] === '--minutes-before') minutesBefore = Number(args[++i])
}
mkdirSync(out, { recursive: true })
if (!tag) {
  console.error('FAIL: --tag is required, so the phases share the rows they created')
  process.exit(1)
}

const BASE = process.env.BASE ?? 'http://localhost:3200'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const CRON_SECRET = process.env.CRON_SECRET ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error('refusing to run against production')
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET are required')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const LEDGER = join(out, `${tag}-checks.json`)
const checks = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : []
const failures = []
function check(id, ok, detail) {
  checks.push({ phase, id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}
function finish() {
  writeFileSync(LEDGER, JSON.stringify(checks, null, 2))
  const mine = checks.filter((c) => c.phase === phase)
  console.log(`\n  phase ${phase}: ${mine.filter((c) => c.ok).length} of ${mine.length} checks pass`)
  if (failures.length > 0) {
    console.log('\n  FAILURES')
    for (const f of failures) console.log(`    ${f}`)
  }
  process.exit(failures.length === 0 ? 0 : 1)
}

/**
 * The dispatcher's own batch size, mirrored here because the safety of this
 * drive depends on it: dispatchPendingPlatformNotifications defaults to 50 and
 * the cron route calls it with the default.
 */
const DISPATCH_BATCH_LIMIT = 50
const SPENT = PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS - 1

/** One tick of the real worker, over HTTP, exactly as Vercel Cron calls it. */
async function tick() {
  const res = await fetch(`${BASE}/api/cron/platform-notify`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

const isMine = (row) => String(row.dedupe_key ?? '').startsWith(`${tag}:`)

/** The rows this proof owns, read back from the database after every tick. */
async function mine() {
  const { data, error } = await db
    .from('platform_notifications')
    .select('id, delivery_state, attempts, channel, last_error, dedupe_key, occurred_at')
    .like('dedupe_key', `${tag}:%`)
    .order('dedupe_key', { ascending: true })
  if (error) throw new Error(`read back failed: ${error.message}`)
  return data ?? []
}

/** The one row under test: the overflow order that arrives with attempts spent. */
function theCarrier(rows) {
  return rows.find((r) => r.dedupe_key === `${tag}:carrier`) ?? null
}

/** Everything queued, oldest first, whoever owns it. Read, never written. */
async function queue(state) {
  const { data, error } = await db
    .from('platform_notifications')
    .select('id, delivery_state, dedupe_key, occurred_at')
    .eq('delivery_state', state)
    .order('occurred_at', { ascending: true })
    .limit(400)
  if (error) throw new Error(`queue read failed: ${error.message}`)
  return data ?? []
}

/**
 * THE SAFETY CHECK, run before every tick rather than once at the start.
 *
 * It reads the exact batch the dispatcher is about to take - the oldest
 * DISPATCH_BATCH_LIMIT pending rows - and refuses if any of them belongs to
 * somebody else. It also refuses if a foreign row is held_for_digest, because
 * the digest reads every held row and would carry it into this drive's failures.
 */
async function assertTheTickCannotTouchAnotherLane(label) {
  const pending = await queue('pending')
  const batch = pending.slice(0, DISPATCH_BATCH_LIMIT)
  const foreignInBatch = batch.filter((r) => !isMine(r))
  const foreignHeld = (await queue('held_for_digest')).filter((r) => !isMine(r))
  check(
    `${label}.the-tick-cannot-touch-another-lane`,
    foreignInBatch.length === 0 && foreignHeld.length === 0,
    foreignInBatch.length === 0 && foreignHeld.length === 0
      ? `the ${batch.length} row(s) this tick will take are all lane C's, and no foreign row is held (${pending.length} pending in total, ${pending.length - batch.length} of them out of reach behind this batch)`
      : `${foreignInBatch.length} foreign row(s) in the batch and ${foreignHeld.length} foreign row(s) held, for example ${JSON.stringify([...foreignInBatch, ...foreignHeld].slice(0, 3).map((r) => r.dedupe_key))}`,
  )
  if (foreignInBatch.length > 0 || foreignHeld.length > 0) finish()
}

function seedRow(key, whenMs, over = {}) {
  return {
    id: randomUUID(),
    kind: 'order_paid',
    occurred_at: new Date(whenMs).toISOString(),
    summary: `Paid order ${tag}-${key}: Lane C digest carry-over proof`,
    detail: { order_number: `${tag}-${key}`, total_cents: 4100, currency: 'AUD' },
    admin_path: '/admin/notifications',
    dedupe_key: `${tag}:${key}`,
    delivery_state: 'pending',
    attempts: 0,
    sent_at: null,
    channel: null,
    ...over,
  }
}

/**
 * Seed a day that is already at its ceiling, with `ticks` full dispatch batches
 * of overflow waiting, the first row of the first batch being the carrier.
 *
 * None of this is contrived. A row reaches the hold with its individual attempts
 * already spent whenever a send is refused while the day is still under the
 * ceiling and the ceiling is crossed by later orders before the next tick comes
 * back to it. The only thing the drive arranges is the VOLUME, and it arranges
 * that to keep another lane's rows out of its own broken-transport ticks.
 */
async function seedPastTheCeiling(ticks) {
  const foreignPending = (await queue('pending')).filter((r) => !isMine(r))
  const oldestForeign = foreignPending.length
    ? Math.min(...foreignPending.map((r) => new Date(r.occurred_at).getTime()))
    : Date.now()
  // Every seeded row sits before the oldest row this drive does not own, so the
  // dispatcher reaches lane C's rows first and never reaches theirs.
  const base = Math.min(Date.now(), oldestForeign) - minutesBefore * 60 * 1000
  const stamp = new Date().toISOString()

  const rows = [
    ...Array.from({ length: PLATFORM_ORDER_ALERTS_PER_DAY }, (_, i) =>
      seedRow(`sent-${String(i + 1).padStart(3, '0')}`, base + i * 1000, {
        delivery_state: 'sent',
        channel: 'email',
        sent_at: stamp,
        attempts: 1,
      }),
    ),
    seedRow('carrier', base + 100 * 1000, {
      attempts: SPENT,
      last_error: `email attempt ${SPENT}: Resend refused the send`,
      last_attempt_at: stamp,
    }),
    ...Array.from({ length: ticks * DISPATCH_BATCH_LIMIT - 1 }, (_, i) =>
      seedRow(`overflow-${String(i + 1).padStart(3, '0')}`, base + (101 + i) * 1000),
    ),
  ]
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await db.from('platform_notifications').insert(rows.slice(i, i + 100))
    if (error) throw new Error(`seed insert failed: ${error.message}`)
  }
  return rows.length
}

if (phase === 'carry') {
  await db.from('platform_notifications').delete().like('dedupe_key', `${tag}:%`)
  // One batch per tick this tag will take: --batches 3 for a tag that goes on to
  // exhaust the attempts, 2 for one that is held and then recovered.
  const seeded = await seedPastTheCeiling(batches)
  check(
    'carry.seeded',
    seeded > 0,
    `${seeded} lane C row(s) seeded in ${batches} dispatch batch(es), all dated ${minutesBefore} minutes before any row this lane does not own`,
  )

  // Whose rows were already undeliverable before this drive touched anything, so
  // the cleanup phase can prove it spent nobody else's attempts rather than
  // asserting it. A foreign row that was already failed is not this drive's doing.
  const foreignFailedBefore = (await queue('failed')).filter((r) => !isMine(r)).map((r) => r.id)
  writeFileSync(join(out, `${tag}-foreign-failed-before.json`), JSON.stringify(foreignFailedBefore, null, 2))
  check(
    'carry.foreign-failures-recorded-before-the-drive',
    true,
    `${foreignFailedBefore.length} row(s) this lane does not own were already failed before the first tick`,
  )

  const before = theCarrier(await mine())
  check(
    'carry.arrives-with-its-attempts-spent',
    before !== null && before.delivery_state === 'pending' && before.attempts === SPENT,
    `the carrier is pending with ${before?.attempts} of ${PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS} individual attempts already spent`,
  )

  await assertTheTickCannotTouchAnotherLane('carry')
  const first = await tick()
  check(
    'carry.route-answers',
    first.status === 200 && first.body.ok === true,
    `tick 1: ${first.status} dispatched ${JSON.stringify(first.body.dispatched ?? {})} digest ${JSON.stringify(first.body.digest ?? {})}`,
  )

  const rows = await mine()
  const held = rows.filter((r) => r.delivery_state === 'held_for_digest')
  const after = theCarrier(rows)
  check(
    'carry.the-ceiling-held-the-batch',
    held.length === DISPATCH_BATCH_LIMIT && after?.delivery_state === 'held_for_digest',
    `${held.length} order(s) were held past the ceiling of ${PLATFORM_ORDER_ALERTS_PER_DAY}, the carrier among them`,
  )
  check(
    'carry.the-counter-was-reset-at-the-hold',
    after !== null && after.attempts === 1,
    `the carrier entered the tick carrying ${SPENT} attempts and left it carrying ${after?.attempts}: a counter cannot go DOWN unless the hold reset it, and 1 is the digest's FIRST refusal rather than its last`,
  )
  check(
    'carry.the-whole-batch-is-counted-from-zero',
    held.length > 0 && held.every((r) => r.attempts === 1),
    `all ${held.length} held row(s) carry attempts ${[...new Set(held.map((r) => r.attempts))].join('/')}: one poisoned row can no longer spend the batch's budget`,
  )
  check(
    'carry.the-digest-retried-rather-than-giving-up',
    (first.body.digest?.retried ?? 0) === DISPATCH_BATCH_LIMIT &&
      (first.body.digest?.failed ?? 0) === 0 &&
      (first.body.digest?.escalated ?? 0) === 0,
    `the digest reports ${JSON.stringify(first.body.digest ?? {})}: against the shipped code this same tick wrote all ${DISPATCH_BATCH_LIMIT} off on one refusal`,
  )
  check(
    'carry.the-history-is-kept-not-dropped',
    after !== null && /digest attempt 1/.test(after.last_error ?? ''),
    `the carrier records the digest's own refusal: ${JSON.stringify((after?.last_error ?? '').slice(0, 110))}`,
  )
  finish()
}

if (phase === 'exhaust') {
  const start = theCarrier(await mine())
  check(
    'exhaust.starts-from-a-held-carrier',
    start !== null && start.delivery_state === 'held_for_digest' && start.attempts === 1,
    `the carrier is "${start?.delivery_state}" with attempts ${start?.attempts}`,
  )

  const ticks = []
  for (let t = 2; t <= PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS; t += 1) {
    await assertTheTickCannotTouchAnotherLane(`exhaust.tick${t}`)
    await tick()
    const rows = await mine()
    const row = theCarrier(rows)
    ticks.push({
      tick: t,
      carrier: { state: row?.delivery_state, attempts: row?.attempts },
      held: rows.filter((r) => r.delivery_state === 'held_for_digest').length,
    })
    if (t < PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS) {
      check(
        `exhaust.tick${t}.still-held`,
        row !== null && row.delivery_state === 'held_for_digest' && row.attempts === t,
        `after digest attempt ${t} the carrier is still held, attempts ${row?.attempts}`,
      )
    }
  }

  const end = theCarrier(await mine())
  check(
    'exhaust.gives-up-only-once-the-digests-own-attempts-are-spent',
    end !== null && (end.delivery_state === 'failed' || end.delivery_state === 'escalated'),
    `it left held_for_digest as "${end?.delivery_state}" only after ${PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS} DIGEST attempts, not after one`,
  )
  check(
    'exhaust.the-bound-is-the-digests-own',
    end !== null && end.attempts === PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS,
    `the carrier records ${end?.attempts} attempts against a bound of ${PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS}, every one of them the digest's`,
  )
  writeFileSync(join(out, `${tag}-exhaust-ticks.json`), JSON.stringify(ticks, null, 2))
  finish()
}

if (phase === 'recover') {
  const before = await mine()
  const heldBefore = before.filter((r) => r.delivery_state === 'held_for_digest')
  const carrier = theCarrier(before)
  check(
    'recover.starts-from-a-batch-held-after-a-real-refusal',
    heldBefore.length > 0 && heldBefore.every((r) => r.attempts >= 1) && carrier?.delivery_state === 'held_for_digest',
    `${heldBefore.length} row(s) held with attempts ${[...new Set(heldBefore.map((r) => r.attempts))].join('/')}, the carrier among them`,
  )

  await assertTheTickCannotTouchAnotherLane('recover')
  const res = await tick()
  const after = await mine()
  const heldIds = new Set(heldBefore.map((r) => r.id))
  const recovered = after.filter((r) => heldIds.has(r.id) && r.delivery_state === 'sent' && r.channel === 'digest')
  check(
    'recover.the-retried-digest-actually-arrives',
    recovered.length === heldBefore.length,
    `${recovered.length} of ${heldBefore.length} retried row(s) went out as a digest once the transport came back: ${JSON.stringify(res.body.digest ?? {})}`,
  )
  check(
    'recover.the-carrier-reached-the-owner',
    theCarrier(after)?.delivery_state === 'sent' && theCarrier(after)?.channel === 'digest',
    `the order that had already failed once as an individual email arrived as "${theCarrier(after)?.delivery_state}" by "${theCarrier(after)?.channel}"`,
  )
  check(
    'recover.nothing-was-lost',
    after.every((r) => r.delivery_state !== 'failed'),
    'no row of this tag was thrown away by the refusal that preceded this tick, which is the behaviour that changed',
  )
  finish()
}

if (phase === 'render') {
  const rows = await mine()
  check('render.rows-exist', rows.length > 0, `${rows.length} lane C row(s) for the feed to show`)

  const adminEmail = `ux3-carry-${Date.now().toString(36)}@eventlinqs.test`
  const adminPassword = `${randomUUID()}Aa1`
  let adminUserId = null
  let browser = null
  try {
    const created = await db.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    })
    if (created.error) throw new Error(`create admin auth user: ${created.error.message}`)
    adminUserId = created.data.user.id
    await db.from('profiles').upsert({
      id: adminUserId,
      email: adminEmail,
      full_name: 'Lane C Carry Proof',
      display_name: 'Lane C Carry Proof',
      is_verified: true,
    })
    const { error: auErr } = await db
      .from('admin_users')
      .insert({ id: adminUserId, role: 'super_admin', display_name: 'Lane C Carry Proof' })
    if (auErr) throw new Error(`admin_users insert: ${auErr.message}`)

    browser = await chromium.launch()
    for (const vp of [
      { label: '390', width: 390, height: 844 },
      { label: '768', width: 768, height: 1024 },
      { label: '1440', width: 1440, height: 1000 },
    ]) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'en-AU',
        isMobile: vp.width < 768,
        hasTouch: vp.width < 1024,
      })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.locator('input[name="email"]').fill(adminEmail)
      await page.locator('input[name="password"]').fill(adminPassword)
      const submit = page.locator('button[type="submit"]')
      await submit.waitFor({ state: 'visible', timeout: 30000 })
      await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled, undefined, {
        timeout: 30000,
      })
      await submit.click()
      await Promise.race([
        page.waitForURL((u) => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
        page
          .waitForFunction(
            () =>
              [...document.querySelectorAll('[role=alert]')].some((e) => (e.textContent ?? '').trim().length > 0),
            undefined,
            { timeout: 60000 },
          )
          .catch(() => {}),
      ])
      if (new URL(page.url()).pathname.endsWith('/admin/login')) {
        const shown = await page.locator('[role=alert]').allInnerTexts().catch(() => [])
        check(`render.${vp.label}.login`, false, `admin sign-in refused: ${shown.join(' // ') || 'NOTHING SHOWN'}`)
        await ctx.close()
        continue
      }

      await page.goto(`${BASE}/admin/notifications`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
      await page.screenshot({ path: join(out, `admin-notifications-${vp.label}.png`), fullPage: true })

      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(
        `render.${vp.label}.feed-shows-the-batch`,
        text.includes(tag),
        `the orders that were held and then delivered are readable at ${vp.width}px`,
      )
      check(
        `render.${vp.label}.feed-says-how-they-arrived`,
        text.includes('Emailed in a digest'),
        'the screen says they arrived in a digest rather than leaving the owner to guess',
      )

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      writeFileSync(
        join(out, `axe-admin-notifications-${vp.label}.json`),
        JSON.stringify({ url: page.url(), violations: axe.violations }, null, 2),
      )
      check(
        `render.${vp.label}.axe`,
        axe.violations.length === 0,
        axe.violations.length === 0
          ? 'axe: 0 violations at every impact level'
          : `axe: ${axe.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(', ')}`,
      )
      await ctx.close()
    }
  } finally {
    if (browser) await browser.close()
    if (adminUserId) {
      await db.from('admin_users').delete().eq('id', adminUserId)
      await db.auth.admin.deleteUser(adminUserId).catch(() => {})
    }
  }
  finish()
}

if (phase === 'cleanup') {
  const { error } = await db.from('platform_notifications').delete().like('dedupe_key', `${tag}:%`)
  const { count } = await db
    .from('platform_notifications')
    .select('id', { count: 'exact', head: true })
    .like('dedupe_key', `${tag}:%`)
  check(
    'cleanup',
    !error && (count ?? 0) === 0,
    error ? `cleanup failed: ${error.message}` : `${count ?? 0} lane C rows left behind`,
  )
  const beforeFile = join(out, `${tag}-foreign-failed-before.json`)
  const knownFailed = new Set(existsSync(beforeFile) ? JSON.parse(readFileSync(beforeFile, 'utf8')) : [])
  const newlyFailed = (await queue('failed')).filter((r) => !isMine(r) && !knownFailed.has(r.id))
  check(
    'cleanup.no-foreign-row-was-spent',
    newlyFailed.length === 0,
    newlyFailed.length === 0
      ? `no row this lane does not own was left failed by any tick of this drive (${knownFailed.size} were already failed before it started)`
      : `${newlyFailed.length} foreign row(s) became failed during this drive: ${JSON.stringify(newlyFailed.slice(0, 3).map((r) => r.dedupe_key))}`,
  )
  finish()
}

console.error(`FAIL: unknown --phase ${phase}`)
process.exit(1)
