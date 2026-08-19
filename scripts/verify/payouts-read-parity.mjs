/**
 * PAYOUTS-READ: THE LIMITER MOVED, AND NOTHING ELSE DID.
 *
 * The `payouts-read` limiter ran BEFORE resolveOrganiserScope and was keyed by the
 * forwarded IP while its rationale said "per user". Founder ruling 19 August 2026:
 * move it after the scope resolution and key it to the organiser.
 *
 * Moving a gate is exactly the kind of edit that looks free and is not. The three
 * routes answer 401, 403, 404 and 200 depending on who is asking about what, and
 * every one of those answers is produced AFTER the line that moved. So this captures
 * every response, on every route, in every case, and the same file is produced
 * before and after the change and compared byte for byte.
 *
 * WHAT A PASS MEANS, stated precisely so it is not read as more than it is: the
 * status and the body of all fifteen responses are identical across the change. The
 * bucket identity is NOT visible in a response and is not what this proves; the
 * key is proven by tests/unit/rate-limit/payouts-read-wiring.test.ts and by section
 * 3c of the rate-limit audit.
 *
 * The fixture is created once and REUSED by both runs, because two runs against two
 * different fixtures would differ in ids and prove nothing. Ids are written to a
 * state file and the same file is read on the second run.
 *
 * TEST ONLY, guarded.
 *
 * USAGE:
 *   node --env-file=.env.test scripts/verify/payouts-read-parity.mjs --label before --url http://localhost:3100
 *   ... apply the change, rebuild, restart ...
 *   node --env-file=.env.test scripts/verify/payouts-read-parity.mjs --label after  --url http://localhost:3100
 *   node --env-file=.env.test scripts/verify/payouts-read-parity.mjs --compare
 *   node --env-file=.env.test scripts/verify/payouts-read-parity.mjs --teardown
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction({ envFile: '.env.test' })

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const BASE = (arg('--url', 'http://localhost:3100')).replace(/\/+$/, '')
const LABEL = arg('--label')
const COMPARE = argv.includes('--compare')
const TEARDOWN = argv.includes('--teardown')

const OUT = path.resolve('docs/verification/payouts-read-parity-2026-08-19')
const STATE = path.join(OUT, 'fixture.json')
mkdirSync(OUT, { recursive: true })

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const ROUTES = ['/api/payouts/list', '/api/payouts/summary', '/api/payouts/refunds']

// ---------------------------------------------------------------- teardown
if (TEARDOWN) {
  if (!existsSync(STATE)) { console.log('  no fixture to remove'); process.exit(0) }
  const f = JSON.parse(readFileSync(STATE, 'utf8'))
  for (const orgId of f.orgIds) await db.from('organisations').delete().eq('id', orgId)
  for (const uid of [f.ownerId, f.orphanId]) {
    if (!uid) continue
    await db.from('profiles').delete().eq('id', uid)
    await db.auth.admin.deleteUser(uid).catch(() => {})
  }
  console.log(`  removed ${f.orgIds.length} organisation(s) and 2 user(s)`)
  process.exit(0)
}

// ---------------------------------------------------------------- compare
if (COMPARE) {
  const a = path.join(OUT, 'before.json')
  const b = path.join(OUT, 'after.json')
  if (!existsSync(a) || !existsSync(b)) {
    console.error('  need both before.json and after.json')
    process.exit(2)
  }
  const before = JSON.parse(readFileSync(a, 'utf8'))
  const after = JSON.parse(readFileSync(b, 'utf8'))
  console.log(`\n  comparing ${before.results.length} response(s) before against ${after.results.length} after\n`)
  let diffs = 0
  const key = r => `${r.route} ${r.scenario}`
  const beforeMap = new Map(before.results.map(r => [key(r), r]))
  for (const r of after.results) {
    const prior = beforeMap.get(key(r))
    if (!prior) { console.log(`  NEW      ${key(r)}`); diffs += 1; continue }
    const sameStatus = prior.status === r.status
    const sameBody = prior.body === r.body
    if (sameStatus && sameBody) {
      console.log(`  IDENTICAL  ${key(r).padEnd(46)} ${r.status}`)
    } else {
      diffs += 1
      console.log(`  CHANGED    ${key(r).padEnd(46)} ${prior.status} -> ${r.status}`)
      if (!sameBody) {
        console.log(`             before: ${prior.body.slice(0, 200)}`)
        console.log(`             after : ${r.body.slice(0, 200)}`)
      }
    }
  }
  for (const k of beforeMap.keys()) {
    if (!after.results.some(r => key(r) === k)) { console.log(`  MISSING  ${k}`); diffs += 1 }
  }
  console.log(`\n  ${diffs === 0 ? 'NO BEHAVIOUR CHANGE: every status and every body is identical.' : `${diffs} DIFFERENCE(S) - the move changed more than the key.`}`)
  process.exit(diffs === 0 ? 0 : 1)
}

if (!LABEL) { console.error('  --label before|after is required'); process.exit(2) }

// ---------------------------------------------------------------- fixture
let fixture
if (existsSync(STATE)) {
  fixture = JSON.parse(readFileSync(STATE, 'utf8'))
  console.log(`  reusing fixture ${fixture.stamp} (so both runs ask about the same rows)`)
} else {
  const stamp = Date.now().toString(36)
  const ownerEmail = `payouts-parity-${stamp}@eventlinqs.test`
  const orphanEmail = `payouts-orphan-${stamp}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`

  const owner = await db.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true })
  if (owner.error) throw new Error(`owner: ${owner.error.message}`)
  const ownerId = owner.data.user.id
  await db.from('profiles').upsert({ id: ownerId, email: ownerEmail, full_name: 'Payouts Parity', display_name: 'Payouts Parity', is_verified: true })

  const orphan = await db.auth.admin.createUser({ email: orphanEmail, password, email_confirm: true })
  if (orphan.error) throw new Error(`orphan: ${orphan.error.message}`)
  const orphanId = orphan.data.user.id
  await db.from('profiles').upsert({ id: orphanId, email: orphanEmail, full_name: 'Payouts Orphan', display_name: 'Payouts Orphan', is_verified: true })

  // TWO organisations, so the ?org= selection path is exercised and not just the default.
  const orgIds = []
  for (const n of [1, 2]) {
    const { data, error } = await db.from('organisations').insert({
      name: `Payouts Parity ${n} ${stamp}`, slug: `payouts-parity-${n}-${stamp}`,
      owner_id: ownerId, email: ownerEmail, status: 'active', payout_status: 'active',
      stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_account_country: 'AU',
    }).select('id').single()
    if (error) throw new Error(`organisation ${n}: ${error.message}`)
    orgIds.push(data.id)
  }

  // Somebody ELSE's organisation, for the 403. Never modified, only named.
  const { data: foreign } = await db.from('organisations').select('id')
    .neq('owner_id', ownerId).limit(1).single()

  fixture = { stamp, ownerEmail, orphanEmail, password, ownerId, orphanId, orgIds, foreignOrgId: foreign.id }
  writeFileSync(STATE, JSON.stringify(fixture, null, 2))
  console.log(`  built fixture ${stamp}: 2 organisations, 1 orphan user, foreign org ${foreign.id}`)
}

// ---------------------------------------------------------------- capture
const browser = await chromium.launch()

/*
 * WHY THIS REPORTS INSTEAD OF JUST TIMING OUT.
 *
 * The `after` run captured 12 of 15 responses and then died with a bare
 * "waitForURL: Timeout 60000ms exceeded" on the orphan account. That message says
 * only that navigation did not happen, which is the one thing already known. It
 * does not say whether the credentials were refused, the form never submitted, or
 * the app bounced the login for its own reason, and those need different fixes.
 *
 * scripts/verify/parity-orphan-check.mjs established that BOTH accounts sign in
 * cleanly through GoTrue directly, so the account is not the fault and the fault
 * is somewhere between the form and the redirect. This captures what the page
 * actually said so the next run does not have to guess.
 */
async function signIn(email, password) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })

  /*
   * WAIT FOR THE HYDRATION GATE TO OPEN BEFORE CLICKING.
   *
   * src/components/auth/login-form.tsx renders the submit as
   * `disabled={loading || !hydrated}`, which is deliberate: the platform refuses
   * to accept a credential before the handler exists, enforced by the
   * no-unguarded-credential-form guard. Playwright's click on a DISABLED button
   * does nothing and reports success, so the run then sat on /login for sixty
   * seconds and died with a bare timeout, showing a login page with no error on
   * it. That is what "the page says: ... Email | Password | Forgot password?"
   * with no error line was telling us.
   *
   * The owner sign-in in the same run passed by luck of timing, which is the
   * worst possible version of this bug: it works often enough to look fine.
   */
  const submit = page.getByRole('button', { name: /sign in|log in/i }).first()
  await submit.waitFor({ state: 'visible', timeout: 60_000 })
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('button')]
        .find(x => /sign in|log in/i.test(x.textContent ?? ''))
      return Boolean(b) && !b.disabled
    },
    undefined,
    { timeout: 60_000 },
  )

  await page.getByLabel(/email/i).first().fill(email)
  await page.getByLabel(/password/i).first().fill(password)
  await submit.click()

  try {
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60_000 })
  } catch {
    // Still on /login. Say what the page is showing rather than dying silently.
    const url = page.url()
    const visible = (await page.locator('body').innerText().catch(() => '')) || ''
    const shown = visible.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 12).join(' | ')
    await ctx.close()
    throw new Error(
      `sign-in for ${email} did not leave /login.\n`
      + `      url now: ${url}\n`
      + `      page says: ${shown.slice(0, 400)}\n`
      + '      NOTE: parity-orphan-check.mjs proves this account signs in through GoTrue,\n'
      + '      so this is the app login flow, not the credentials.',
    )
  }

  const state = await ctx.storageState()
  await ctx.close()
  return state
}

const results = []
async function capture(scenario, requestCtx, url) {
  for (const route of ROUTES) {
    const full = `${BASE}${route}${url ?? ''}`
    const res = await requestCtx.get(full)
    const body = (await res.text()).trim()
    results.push({ route, scenario, status: res.status(), body })
    console.log(`  ${String(res.status()).padEnd(4)} ${scenario.padEnd(24)} ${route}`)
  }
}

try {
  console.log(`\n  capturing "${LABEL}" against ${BASE}\n`)

  // 1. no session at all
  const anon = await browser.newContext()
  await capture('unauthenticated', anon.request, '')
  await anon.close()

  // 2, 3, 4. the owner
  const ownerState = await signIn(fixture.ownerEmail, fixture.password)
  const ownerCtx = await browser.newContext({ storageState: ownerState })
  await capture('owner-default-org', ownerCtx.request, '')
  await capture('owner-explicit-org', ownerCtx.request, `?org=${fixture.orgIds[1]}`)
  await capture('owner-foreign-org', ownerCtx.request, `?org=${fixture.foreignOrgId}`)
  await ownerCtx.close()

  // 5. an authenticated user who owns nothing
  const orphanState = await signIn(fixture.orphanEmail, fixture.password)
  const orphanCtx = await browser.newContext({ storageState: orphanState })
  await capture('authed-no-organisation', orphanCtx.request, '')
  await orphanCtx.close()

  writeFileSync(path.join(OUT, `${LABEL}.json`), JSON.stringify({ label: LABEL, base: BASE, results }, null, 2))
  console.log(`\n  ${results.length} response(s) captured to ${LABEL}.json`)
  const statuses = [...new Set(results.map(r => r.status))].sort()
  console.log(`  statuses seen: ${statuses.join(', ')}`)
  if (!statuses.includes(200) || !statuses.includes(401) || !statuses.includes(403) || !statuses.includes(404)) {
    console.log('  WARNING: not every intended status was produced, so this capture covers less than it claims.')
  }
} finally {
  await browser.close().catch(() => {})
}
