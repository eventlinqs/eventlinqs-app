/**
 * POINT STRIPE'S TEST-MODE WEBHOOK ENDPOINTS AT THE PREVIEW THAT IS CURRENT.
 *
 * WHAT WAS FOUND, 12 September 2026 (close-out D2). A real test-card purchase on
 * the READY preview of a90c085a confirmed within seven seconds, so a webhook
 * did arrive. It arrived at a DIFFERENT deployment: Vercel's runtime logs show
 * every POST /api/webhooks/stripe of the day landing on
 * eventlinqs-app-git-feat-walkthr-37f703-lawals-projects-c20c0be8.vercel.app,
 * the branch alias of feat/walkthrough-defects, built from f8d85e9f in July.
 * Stripe's TEST-mode endpoint was registered against that alias and never moved.
 *
 * So every webhook-driven side effect on the TEST database runs JULY code:
 * confirm_order happens (tickets are issued), and nothing that arrived since is
 * reached. The confirmed sale of EL-GPAN7F9T wrote no ledger row, because the
 * adapter that writes it did not exist in July; a refund reconciled by that
 * code would free the place and never reach the recovery engine's offer. The
 * two open legs of D2 cannot be driven on any current preview until the
 * endpoints point at one.
 *
 * WHAT THIS DOES. With a Stripe TEST secret key in the shell it lists the
 * account's webhook endpoints, finds every one whose URL is a Vercel preview
 * host with the platform's webhook path, and moves it to the target preview's
 * host, keeping the endpoint (and therefore its signing secret, which the
 * preview environment already holds in STRIPE_WEBHOOK_SECRETS) intact. An
 * endpoint on the production domain is never touched. A live key is refused
 * outright. --dry-run prints the plan and changes nothing.
 *
 * WHY IT IS A SCRIPT AND NOT A DASHBOARD NOTE (Law 10). Moving a URL is a
 * machine's job; only the key is the founder's. This laptop holds no working
 * Stripe TEST key (both CLI keys answer api_key_expired), so the founder runs
 * it once with his:
 *
 *   PowerShell:
 *     $env:STRIPE_SECRET_KEY = "sk_test_..."
 *     node scripts/ops/point-stripe-test-webhook.mjs --to https://eventlinqs-app-git-verify-l5-la-11db7d-lawals-projects-c20c0be8.vercel.app
 *     Remove-Item Env:STRIPE_SECRET_KEY
 *
 * It never prints the key. Add --dry-run first to see the plan.
 */
import Stripe from 'stripe'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[point-stripe-test-webhook]'
export const WEBHOOK_PATH = '/api/webhooks/stripe'
/*
 * WHAT COUNTS AS A PREVIEW. Only a *.vercel.app host is ever moved. The
 * production endpoint sits on the canonical host, which is declared once in
 * src/lib/site-url.ts and is not typed here: anything that is not a Vercel
 * preview host is left alone, so production and any custom domain are covered
 * without this script holding an opinion about what they are called.
 */
const PREVIEW_HOST = /\.vercel\.app$/

/** Only a TEST key may run this; a live key is refused before any request. */
export function judgeKey(key) {
  const k = String(key ?? '').trim()
  if (!k) return { ok: false, reason: 'STRIPE_SECRET_KEY is not in the shell. Supply the Stripe TEST secret key for this one run; it is never printed.' }
  if (/^sk_live_|^rk_live_/.test(k)) return { ok: false, reason: 'that is a LIVE key. This script moves TEST-mode endpoints only and will not run with a live key.' }
  if (!/^sk_test_|^rk_test_/.test(k)) return { ok: false, reason: 'STRIPE_SECRET_KEY does not look like a Stripe TEST secret key (sk_test_...).' }
  return { ok: true, reason: 'a Stripe TEST key' }
}

/**
 * Which endpoints move, which are left alone, and why. Pure, so it is tested
 * without Stripe.
 *
 * @param {Array<{ id: string, url: string, status?: string, enabled_events?: string[] }>} endpoints
 * @param {string} toBase the target preview origin, e.g. https://eventlinqs-app-git-...vercel.app
 */
export function planEndpointMoves(endpoints, toBase) {
  const target = new URL(WEBHOOK_PATH, toBase.replace(/\/+$/, '') + '/').toString()
  const targetHost = new URL(target).host
  if (!PREVIEW_HOST.test(targetHost)) {
    throw new Error(`the target ${toBase} is not a Vercel preview host; this script points TEST endpoints at previews only`)
  }
  const moves = []
  const untouched = []
  for (const e of endpoints) {
    let url
    try {
      url = new URL(e.url)
    } catch {
      untouched.push({ id: e.id, url: e.url, why: 'not a URL this script understands' })
      continue
    }
    if (!PREVIEW_HOST.test(url.host)) {
      untouched.push({ id: e.id, url: e.url, why: 'not a Vercel preview host, so production or a custom domain; never touched by this script' })
      continue
    }
    if (url.pathname !== WEBHOOK_PATH) {
      untouched.push({ id: e.id, url: e.url, why: `not the platform's webhook path (${WEBHOOK_PATH})` })
      continue
    }
    if (url.host === targetHost) {
      untouched.push({ id: e.id, url: e.url, why: 'already at the target' })
      continue
    }
    moves.push({ id: e.id, from: e.url, to: target, events: (e.enabled_events ?? []).length, status: e.status ?? 'unknown' })
  }
  return { target, moves, untouched }
}

const invokedDirectly = process.argv[1] && /point-stripe-test-webhook\.mjs$/.test(process.argv[1])

if (invokedDirectly) {
  const argv = process.argv.slice(2)
  const DRY_RUN = argv.includes('--dry-run')
  const toAt = argv.indexOf('--to')
  const TO = toAt >= 0 ? String(argv[toAt + 1] ?? '').trim() : ''
  if (!TO) {
    console.error(`${TAG} REFUSED: --to <preview origin> is required, for example --to https://eventlinqs-app-git-verify-l5-la-11db7d-lawals-projects-c20c0be8.vercel.app`)
    process.exit(1)
  }
  const key = judgeKey(process.env.STRIPE_SECRET_KEY)
  if (!key.ok) {
    console.error(`${TAG} REFUSED: ${key.reason}`)
    process.exit(1)
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim())
  const endpoints = []
  for await (const e of stripe.webhookEndpoints.list({ limit: 100 })) endpoints.push(e)
  console.log(`${TAG} ${endpoints.length} webhook endpoint(s) on the TEST account`)

  const plan = planEndpointMoves(endpoints, TO)
  for (const u of plan.untouched) console.log(`${TAG}   leave   ${u.id}  ${u.url}  (${u.why})`)
  for (const m of plan.moves) console.log(`${TAG}   ${DRY_RUN ? 'WOULD MOVE' : 'MOVE'}  ${m.id}  ${m.from}  ->  ${m.to}  (${m.events} event type(s), ${m.status})`)

  let moved = 0
  const failed = []
  if (!DRY_RUN) {
    for (const m of plan.moves) {
      try {
        const updated = await stripe.webhookEndpoints.update(m.id, { url: m.to })
        if (updated.url !== m.to) failed.push(`${m.id} reads back as ${updated.url}, not ${m.to}`)
        else moved += 1
      } catch (error) {
        failed.push(`${m.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    // Observe, do not trust: list again and check each moved endpoint by id.
    const after = []
    for await (const e of stripe.webhookEndpoints.list({ limit: 100 })) after.push(e)
    for (const m of plan.moves) {
      const now = after.find((e) => e.id === m.id)
      if (!now || now.url !== m.to) failed.push(`${m.id} is not at ${m.to} on the second read`)
    }
  }

  declareWork('point-stripe-test-webhook', {
    did: { 'endpoint read': endpoints.length, 'endpoint judged': plan.moves.length + plan.untouched.length, 'endpoint moved': DRY_RUN ? 0 : moved },
    found: { 'endpoint not where it should be after the move': failed.length },
    zeroIsFine: { 'endpoint moved': DRY_RUN ? 'a dry run moves nothing' : 'every preview endpoint was already at the target' },
    exitOnZero: false,
  })
  for (const f of failed) console.error(`${TAG} FAIL: ${f}`)
  if (failed.length > 0) process.exit(1)
  console.log(`${TAG} ${DRY_RUN ? 'DRY RUN: nothing moved' : `PASS: ${moved} endpoint(s) now at ${plan.target}`}`)
}
