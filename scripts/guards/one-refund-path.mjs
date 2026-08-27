/**
 * ONE REFUND PATH, HOWEVER MANY TRIGGERS.
 *
 * A refund can now be started from four places: the organiser's order screen, the
 * organiser's refund-request queue, the admin console, and automatic approval
 * under an event's refund policy. All four must funnel into the SAME code, because
 * the thing that decides how much money goes back must exist exactly once.
 *
 * THE SHAPE OF THE DISASTER THIS PREVENTS. A second path does not announce itself
 * as a second path. It arrives as "the auto-approval only needs a simple refund,
 * it does not need all that", and it computes an amount from the order total
 * rather than from the selected tickets' face values, and it is right on every
 * whole-order refund and wrong on every partial one. Nothing fails. The money is
 * just quietly different depending on which button was pressed.
 *
 * WHAT IS CHECKED, and each one is a specific way the funnel could be bypassed:
 *
 *   1. `stripe.refunds.create` appears in exactly ONE module, src/lib/payments/refund.ts.
 *      That module is the only thing that may ask Stripe for a refund.
 *   2. `refundOrder` is called by exactly ONE module, src/lib/payments/refund-service.ts.
 *      That is the module that owns the atomic refund intent.
 *   3. Every caller that starts a refund calls `requestTicketRefund`, and nothing
 *      outside refund-service.ts calls the `create_refund_request` RPC directly.
 *   4. The auto-approval in src/lib/refunds/request-service.ts routes through
 *      requestTicketRefund and does NOT talk to Stripe itself.
 *
 * PRINTS WHAT IT SCANNED, because a guard that says only "PASS" is a guard nobody
 * can tell apart from a guard that scanned nothing.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

const REFUND_CORE = 'src/lib/payments/refund.ts'
const REFUND_SERVICE = 'src/lib/payments/refund-service.ts'

const failures = []
const notes = []
const note = (m) => notes.push(m)

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch (error) {
    console.warn('[scripts/guards/one-refund-path:46]', error instanceof Error ? error.message : error)
    return out }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) { walk(full, out); continue }
    if (/\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
  return out
}

if (!existsSync(SRC)) {
  console.error('[one-refund-path] src/ is missing')
  process.exit(1)
}

const files = walk(SRC)
note(`${files.length} TypeScript file(s) scanned under src/`)

/** Strip line and block comments so prose about a call is not read as the call. */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
}

const hits = { stripeRefundCreate: [], refundOrder: [], createRefundRequestRpc: [], requestTicketRefund: [] }

for (const abs of files) {
  const rel = relative(ROOT, abs).split('\\').join('/')
  const body = code(readFileSync(abs, 'utf8'))

  if (/stripe\s*\.\s*refunds\s*\.\s*create\s*\(/.test(body)) hits.stripeRefundCreate.push(rel)
  if (/\brefundOrder\s*\(/.test(body)) hits.refundOrder.push(rel)
  if (/rpc\(\s*['"]create_refund_request['"]/.test(body)) hits.createRefundRequestRpc.push(rel)
  if (/\brequestTicketRefund\s*\(/.test(body)) hits.requestTicketRefund.push(rel)
}

/*
 * REVIEWED BYPASSES, each named with the reason it is allowed and what it costs.
 *
 * These two predate this guard and were FOUND by it on its first run. They are
 * admitted rather than deleted because neither is a ticket refund, and neither is
 * silently wrong. They are listed here so that a THIRD one fails the build, which
 * is the whole point: an allowlist with reasons stays reviewable, an unbounded
 * pass does not.
 */
const REVIEWED_STRIPE_CALLERS = [
  {
    file: 'src/lib/admin/unfulfilled-orders.ts',
    why:
      'The admin settle path for an order that took money and issued NO ticket. There are no '
      + 'tickets to void and no seat to release, so the reconcile unwind does not apply. It carries '
      + 'an explicit idempotencyKey (`unfulfilled-settle:{orderId}`), so a retry cannot double '
      + 'refund, and the Stripe refund carries metadata identifying the order.',
  },
  /*
   * src/app/api/cron/squad-expire/route.ts WAS HERE AND IS NOT ANY MORE.
   *
   * It called stripe.refunds.create directly, with no idempotency key. It now
   * goes through requestTicketRefund like every other trigger, so it needs no
   * exemption. The entry was removed on 20 August 2026 because this guard's own
   * anti-rot check refused to let it stay: a reviewed bypass that no longer
   * bypasses anything is exactly how an allowlist becomes a list nobody reads.
   */
]
const reviewedFiles = new Set(REVIEWED_STRIPE_CALLERS.map((r) => r.file))

// ---- 1. Only one module may ask Stripe for a refund ------------------------
const stripeCallers = hits.stripeRefundCreate.filter((f) => f !== REFUND_CORE && !reviewedFiles.has(f))
note(`stripe.refunds.create found in ${hits.stripeRefundCreate.length} file(s)`)
note(`${REVIEWED_STRIPE_CALLERS.length} reviewed bypass(es), printed in full so they stay reviewed:`)
for (const r of REVIEWED_STRIPE_CALLERS) {
  const present = hits.stripeRefundCreate.includes(r.file)
  note(`    ${present ? 'still present' : 'GONE (remove this entry)'}  ${r.file}`)
  note(`        ${r.why}`)
  if (!present) {
    failures.push(
      `${r.file} is on the reviewed-bypass list but no longer calls stripe.refunds.create. `
      + 'Remove the entry so the list cannot rot into an unexamined allowlist.',
    )
  }
}
if (stripeCallers.length) {
  failures.push(
    `stripe.refunds.create is called outside ${REFUND_CORE}: ${stripeCallers.join(', ')}. `
    + 'Every Stripe refund must go through the one core so idempotency keys, reason mapping and '
    + 'metadata cannot diverge between callers.',
  )
}
if (!hits.stripeRefundCreate.includes(REFUND_CORE)) {
  failures.push(
    `${REFUND_CORE} no longer calls stripe.refunds.create. Either the core moved, in which case `
    + 'this guard must move with it, or refunds are being issued somewhere else entirely.',
  )
}

// ---- 2. Only the service may drive the core --------------------------------
const coreCallers = hits.refundOrder.filter((f) => f !== REFUND_CORE && f !== REFUND_SERVICE)
note(`refundOrder referenced in ${hits.refundOrder.length} file(s)`)
if (coreCallers.length) {
  failures.push(
    `refundOrder is called outside ${REFUND_SERVICE}: ${coreCallers.join(', ')}. `
    + 'A caller that skips the service skips create_refund_request, which is the atomic intent that '
    + 'locks the order and claims the tickets. Two refunds could then be issued for one ticket.',
  )
}

// ---- 3. Only the service may create the refund intent ----------------------
const rpcCallers = hits.createRefundRequestRpc.filter((f) => f !== REFUND_SERVICE)
note(`the create_refund_request RPC is called from ${hits.createRefundRequestRpc.length} file(s)`)
if (rpcCallers.length) {
  failures.push(
    `create_refund_request is called outside ${REFUND_SERVICE}: ${rpcCallers.join(', ')}. `
    + 'The intent and the Stripe call must be created together or a refund row can exist with no '
    + 'refund behind it.',
  )
}

// ---- 4. Auto-approval uses the funnel --------------------------------------
const AUTO = 'src/lib/refunds/request-service.ts'
if (!existsSync(join(ROOT, AUTO))) {
  failures.push(`${AUTO} is missing, so automatic approval cannot be checked`)
} else {
  const body = code(readFileSync(join(ROOT, AUTO), 'utf8'))
  if (!/\brequestTicketRefund\s*\(/.test(body)) {
    failures.push(
      `${AUTO} does not call requestTicketRefund. Automatic approval must reuse the same path as an `
      + 'organiser refund; if it has grown its own, there are now two definitions of how much money '
      + 'goes back.',
    )
  }
  if (/stripe\s*\.\s*refunds\s*\.\s*create\s*\(/.test(body) || /\brefundOrder\s*\(/.test(body)) {
    failures.push(
      `${AUTO} talks to the refund core or to Stripe directly. It must go through requestTicketRefund.`,
    )
  }
  note('automatic approval was checked for the funnel and for a direct Stripe call')
}

note(`requestTicketRefund is called from ${hits.requestTicketRefund.length} file(s): ${hits.requestTicketRefund.join(', ') || 'none'}`)

// ---------------------------------------------------------------------------
console.log('[one-refund-path] what this guard scanned:')
for (const n of notes) console.log(`    - ${n}`)

if (failures.length) {
  console.error('\n[one-refund-path] FAILED\n')
  for (const f of failures) console.error(`    ${f}\n`)
  console.error('    One refund path, however many triggers. A second path is a second answer to')
  console.error('    "how much money goes back", and the two only disagree on partial refunds.')
  process.exit(1)
}

console.log('[one-refund-path] OK: every refund trigger funnels through requestTicketRefund.')
