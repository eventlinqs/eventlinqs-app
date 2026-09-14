/**
 * UX3.2 DRIVEN PROOF: THE DIGEST RETRIES BEFORE IT GIVES UP.
 *
 * THE DEFECT THIS PROVES FIXED. `sendHeldDigest` escalated to the second channel
 * on its FIRST email refusal, and where no admin device had armed push it wrote
 * every row `failed` on that single attempt. A `failed` row is neither `pending`
 * nor `held_for_digest`, so nothing in the module reads it again: one transient
 * refusal from the mail vendor and a digest carrying up to two hundred paid
 * orders was gone for good. Every other path in the same file tried three times
 * first. Close-out UX3.2 says "a failure is retried, and a PERSISTENT failure
 * raises through the second channel", and a first failure is not a persistent one.
 *
 * HOW IT IS DRIVEN, and it is driven rather than simulated. The REAL cron route
 * /api/cron/platform-notify is called over HTTP, tick by tick, exactly as Vercel
 * calls it every minute, against a REAL server whose mail transport genuinely
 * cannot send: it is started with EMAIL_TRANSPORT unset and RESEND_API_KEY
 * removed, so getResend() throws before any network call. Nothing is mocked and
 * nothing leaves the machine. After every tick the ROWS ARE READ BACK OUT OF THE
 * DATABASE; the route's own summary is reported but never trusted.
 *
 * THE PHASES, run against two configurations of the same port because the
 * transport is a property of the server and recovery is the point of the fix:
 *
 *   --phase hold      broken mail. Seed past the ceiling so a digest exists,
 *                     then tick. The rows must STAY held_for_digest with
 *                     attempts rising, and NOTHING may escalate.
 *   --phase exhaust   broken mail. Tick until the attempts are spent. Only then
 *                     may the batch leave held_for_digest.
 *   --phase recover   working mail, after a hold. The retried digest must
 *                     actually ARRIVE, which is the whole point: a transient
 *                     refusal costs a minute, not the digest.
 *   --phase render    the owner's screen at 390, 768 and 1440, with axe.
 *
 * The phases share rows through --tag, so the state under test is the state the
 * previous phase really left in the database.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3200 node --env-file=.env.local \
 *     scripts/verify/ux3-digest-retry-proof.mjs --phase hold --tag lane-c-digest-1
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
let out = 'C:/dev/EVIDENCE/UX3-DIGEST'
let phase = 'hold'
let tag = null
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--phase') phase = args[++i]
  else if (args[i] === '--tag') tag = args[++i]
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

/** One tick of the real worker, over HTTP, exactly as Vercel Cron calls it. */
async function tick() {
  const res = await fetch(`${BASE}/api/cron/platform-notify`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

/** The rows this proof owns, read back from the database after every tick. */
async function mine() {
  const { data, error } = await db
    .from('platform_notifications')
    .select('id, delivery_state, attempts, channel, last_error')
    .like('dedupe_key', `${tag}:%`)
    .order('dedupe_key', { ascending: true })
  if (error) throw new Error(`read back failed: ${error.message}`)
  return data ?? []
}

function seedRow(n, over = {}) {
  const when = new Date(Date.now() - (1000 - n) * 1000)
  return {
    id: randomUUID(),
    kind: 'order_paid',
    occurred_at: when.toISOString(),
    summary: `Paid order ${tag}-${String(n).padStart(3, '0')}: Lane C digest retry proof`,
    detail: { order_number: `${tag}-${n}`, total_cents: 3100 + n, currency: 'AUD' },
    admin_path: '/admin/notifications',
    dedupe_key: `${tag}:${n}`,
    delivery_state: 'pending',
    attempts: 0,
    sent_at: null,
    channel: null,
    ...over,
  }
}

/**
 * Put the platform past its daily ceiling so a digest genuinely exists.
 *
 * The ceiling's worth are seeded already SENT and dated now, so they count, and
 * `overflow` more are left pending for the worker to hold. The rows are dated a
 * few seconds apart and in the past so they sort to the front of the worker's
 * oldest-first queue and it reaches them in one tick.
 */
async function seedPastTheCeiling(overflow) {
  const stamp = new Date().toISOString()
  const rows = [
    ...Array.from({ length: PLATFORM_ORDER_ALERTS_PER_DAY }, (_, i) =>
      seedRow(i + 1, { delivery_state: 'sent', channel: 'email', sent_at: stamp, attempts: 1 }),
    ),
    ...Array.from({ length: overflow }, (_, i) => seedRow(100 + i)),
  ]
  const { error } = await db.from('platform_notifications').insert(rows)
  if (error) throw new Error(`seed insert failed: ${error.message}`)
}

const OVERFLOW = 3

if (phase === 'hold') {
  await db.from('platform_notifications').delete().like('dedupe_key', `${tag}:%`)
  await seedPastTheCeiling(OVERFLOW)

  const first = await tick()
  check(
    'ux3.2.hold.route-answers',
    first.status === 200 && first.body.ok === true,
    `tick 1: ${first.status} ${JSON.stringify(first.body.digest ?? {})}`,
  )
  const held = (await mine()).filter((r) => r.delivery_state === 'held_for_digest')
  check(
    'ux3.2.hold.overflow-was-held',
    held.length === OVERFLOW,
    `${held.length} of ${OVERFLOW} overflow rows are held_for_digest after the ceiling was reached`,
  )
  check(
    'ux3.2.hold.digest-refused-and-retried',
    held.length === OVERFLOW && held.every((r) => r.attempts === 1),
    `the digest email failed and the rows carry attempts ${[...new Set(held.map((r) => r.attempts))].join('/')}, still held for the next tick`,
  )
  check(
    'ux3.2.hold.nothing-escalated-on-the-first-refusal',
    (await mine()).every((r) => r.delivery_state !== 'escalated' && r.delivery_state !== 'failed'),
    'no row was escalated or failed by one refusal, which is what used to happen',
  )
  check(
    'ux3.2.hold.the-error-is-recorded',
    held.every((r) => (r.last_error ?? '').includes('digest attempt 1')),
    `the refusal is written on the row: ${JSON.stringify((held[0]?.last_error ?? '').slice(0, 90))}`,
  )
  finish()
}

if (phase === 'exhaust') {
  const before = await mine()
  check(
    'ux3.2.exhaust.starts-from-a-held-batch',
    before.some((r) => r.delivery_state === 'held_for_digest'),
    `${before.filter((r) => r.delivery_state === 'held_for_digest').length} row(s) carried over from the hold phase`,
  )
  const seen = []
  for (let t = 2; t <= PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS; t += 1) {
    await tick()
    const rows = await mine()
    const held = rows.filter((r) => r.delivery_state === 'held_for_digest')
    seen.push({ tick: t, held: held.length, attempts: [...new Set(held.map((r) => r.attempts))] })
    if (t < PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS) {
      check(
        `ux3.2.exhaust.tick${t}.still-held`,
        held.length === OVERFLOW && held.every((r) => r.attempts === t),
        `after tick ${t} the batch is still held with attempts ${held.map((r) => r.attempts).join(',')}`,
      )
    }
  }
  const after = await mine()
  const terminal = after.filter((r) => r.delivery_state === 'escalated' || r.delivery_state === 'failed')
  check(
    'ux3.2.exhaust.only-gives-up-after-the-attempts-are-spent',
    terminal.length === OVERFLOW,
    `after ${PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS} attempts the batch left held_for_digest as "${[...new Set(terminal.map((r) => r.delivery_state))].join('/')}" (${terminal.length} rows)`,
  )
  check(
    'ux3.2.exhaust.attempts-reached-the-bound',
    terminal.every((r) => r.attempts === PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS),
    `every row records attempts ${[...new Set(terminal.map((r) => r.attempts))].join('/')} against a bound of ${PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS}`,
  )
  writeFileSync(join(out, `${tag}-exhaust-ticks.json`), JSON.stringify(seen, null, 2))
  finish()
}

if (phase === 'recover') {
  const before = await mine()
  const held = before.filter((r) => r.delivery_state === 'held_for_digest')
  check(
    'ux3.2.recover.starts-from-a-retried-batch',
    held.length > 0 && held.every((r) => r.attempts >= 1),
    `${held.length} row(s) held with attempts ${[...new Set(held.map((r) => r.attempts))].join('/')}, carried over from a real refusal`,
  )
  const res = await tick()
  const after = await mine()
  const sent = after.filter((r) => r.delivery_state === 'sent' && r.channel === 'digest')
  check(
    'ux3.2.recover.the-retried-digest-actually-arrives',
    sent.length === held.length,
    `${sent.length} of ${held.length} retried row(s) went out in the digest once the transport came back: ${JSON.stringify(res.body.digest ?? {})}`,
  )
  check(
    'ux3.2.recover.nothing-was-lost',
    after.every((r) => r.delivery_state !== 'failed'),
    'no row was thrown away by the refusal that preceded this tick, which is the behaviour that changed',
  )
  finish()
}

if (phase === 'render') {
  const rows = await mine()
  check('ux3.2.render.rows-exist', rows.length > 0, `${rows.length} lane C row(s) for the feed to show`)

  const adminEmail = `ux3-digest-${Date.now().toString(36)}@eventlinqs.test`
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
      full_name: 'Lane C Digest Proof',
      display_name: 'Lane C Digest Proof',
      is_verified: true,
    })
    const { error: auErr } = await db
      .from('admin_users')
      .insert({ id: adminUserId, role: 'super_admin', display_name: 'Lane C Digest Proof' })
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
        check(`ux3.2.${vp.label}.login`, false, `admin sign-in refused: ${shown.join(' // ') || 'NOTHING SHOWN'}`)
        await ctx.close()
        continue
      }

      await page.goto(`${BASE}/admin/notifications`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
      await page.screenshot({ path: join(out, `admin-notifications-${vp.label}.png`), fullPage: true })

      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(
        `ux3.2.${vp.label}.feed-shows-the-batch`,
        text.includes(tag),
        `the retried rows are readable on the screen at ${vp.width}px`,
      )

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      writeFileSync(
        join(out, `axe-admin-notifications-${vp.label}.json`),
        JSON.stringify({ url: page.url(), violations: axe.violations }, null, 2),
      )
      check(
        `ux3.2.${vp.label}.axe`,
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
  check('ux3.2.cleanup', !error && (count ?? 0) === 0, error ? `cleanup failed: ${error.message}` : `${count ?? 0} lane C rows left behind`)
  finish()
}

console.error(`FAIL: unknown --phase ${phase}`)
process.exit(1)
