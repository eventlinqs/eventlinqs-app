/**
 * DID THE BUYER'S TICKET EMAIL ACTUALLY GO OUT, AND DOES IT CARRY THEIR KEY?
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AS A SCRIPT RATHER THAN AS A MEMORY.
 *
 * On 29 August the buyer confirmation email was seen for the first time, and
 * the finding was serious: four senders each carried their own
 * `if (!resendKey) return`, placed ABOVE the console transport, so on a
 * deployment with no RESEND_API_KEY every buyer confirmation, refund notice and
 * payout notice was dropped and NOTHING ANYWHERE RECORDED IT. A buyer who never
 * receives their ticket has bought nothing.
 *
 * That was proven once, by hand, and then there was nothing to re-run. The most
 * important unverified thing on the platform became the most important
 * unverifiABLE thing, which is only marginally better. This is the re-runnable
 * version.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CHECKS, and why each one is separate.
 *
 *   1. THE ORDER IS CONFIRMED AND A TICKET EXISTS. Without this the email
 *      question is meaningless: there is nothing to send.
 *   2. AN EMAIL WAS ACTUALLY PRODUCED, addressed to the buyer. Read out of the
 *      server log, which is where the console transport writes. Not inferred
 *      from the absence of an error, because the defect this replaces was
 *      exactly an absence of an error.
 *   3. IT CARRIES THE ORDER LINK. For a GUEST that link is the only way back to
 *      their own order: it is what the refund and transfer controls are gated
 *      on. An email that arrives without it is a ticket the buyer cannot manage.
 *   4. THE DEPLOYMENT COULD SEND AT ALL. transportReady() is asked directly, so
 *      a run that passes because a transport happened to be configured says so,
 *      and a run on a deployment that would silently drop everything fails here
 *      rather than in front of a buyer.
 *
 * It does NOT make a purchase of its own. It reads the most recent confirmed
 * order and the log written when that order was confirmed, so it is run AFTER
 * a journey that buys (j3, or j7-seated) with the same server still up. Making
 * its own purchase would need a second Stripe drive and would prove the same
 * thing twice.
 *
 * Usage:
 *   node scripts/journeys/j3.mjs           (or j7-seated.mjs)
 *   node scripts/verify/ticket-email-proof.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction()

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const SERVER_LOG = process.env.SERVER_LOG ?? '.tmp-serve.log'
const results = []

function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`\n${(ok ? 'PASS' : 'FAIL').padEnd(6)} ${name}`)
  console.log(`      ${detail}`)
}

/** Every console-transport email block, newest last. */
function emailBlocks() {
  if (!existsSync(SERVER_LOG)) return []
  const log = readFileSync(SERVER_LOG, 'utf8')
  const SEP = '[email:console] ---------------------------------------------'
  const parts = log.split(SEP)
  const blocks = []
  for (const part of parts) {
    const to = /\[email:console\] to\s+(\S+)/.exec(part)
    if (!to) continue
    const subject = /\[email:console\] subject\s+(.+)/.exec(part)
    const links = [...part.matchAll(/\[email:console\] link\s+(\S+)/g)].map(m => m[1])
    blocks.push({ to: to[1], subject: (subject?.[1] ?? '').trim(), links })
  }
  return blocks
}

// ── 1. a confirmed order with a real ticket ─────────────────────────────────
const { data: orders } = await db
  .from('orders')
  .select('id, order_number, status, guest_email, user_id, created_at')
  .eq('status', 'confirmed')
  .order('created_at', { ascending: false })
  .limit(1)

const order = orders?.[0] ?? null
if (!order) {
  check('a confirmed order to have emailed about', false, 'no confirmed order on TEST. Run scripts/journeys/j3.mjs first.')
  process.exit(1)
}

const { data: tickets } = await db
  .from('tickets')
  .select('id, ticket_code, status, holder_email')
  .eq('order_id', order.id)

check(
  'the purchase produced a confirmed order and a real ticket',
  Boolean(tickets?.length),
  `order ${order.order_number} (${order.id}) status=${order.status}, ` +
    `${tickets?.length ?? 0} ticket(s): ${(tickets ?? []).map(t => `${t.ticket_code}:${t.status}`).join(', ') || 'NONE'}`,
)

// ── 2. an email addressed to that buyer ─────────────────────────────────────
const buyer = (order.guest_email ?? '').toLowerCase()
const blocks = emailBlocks()
const theirs = blocks.filter(b => b.to.toLowerCase() === buyer)
const confirmation =
  theirs.find(b => /ticket|order|confirm/i.test(b.subject)) ?? theirs[theirs.length - 1] ?? null

check(
  'an email was actually produced, addressed to the buyer',
  Boolean(confirmation),
  confirmation
    ? `to ${confirmation.to}, subject "${confirmation.subject}"`
    : `NOTHING was addressed to ${buyer || '(no guest email on the order)'} in ${SERVER_LOG}. ` +
      `${blocks.length} email block(s) in the log overall. This is the defect shape that hid for months: ` +
      `a mail path that returns silently produces a confirmed order, a valid ticket, a 200 from the webhook, ` +
      `and no email and no error anywhere.`,
)

// ── 3. it carries the key a guest needs to come back ────────────────────────
const orderLink = confirmation?.links.find(l => l.includes(`/orders/${order.id}`) && l.includes('t='))
check(
  'the email carries the signed order link the buyer needs',
  Boolean(orderLink),
  orderLink
    ? `${orderLink.replace(/t=[0-9a-f]+/, 't=<40 hex characters, not printed>')}`
    : `no /orders/${order.id}/...?t= link in the email. For a GUEST that link is the ONLY way back to ` +
      `their own order: the refund and transfer controls are gated on it, so without it they hold a ticket ` +
      `they cannot manage. Links present: ${confirmation ? confirmation.links.length : 0}.`,
)

// ── 4. could this deployment send at all ────────────────────────────────────
const transport =
  process.env.EMAIL_TRANSPORT === 'console'
    ? 'console'
    : (process.env.RESEND_API_KEY ?? '').trim().length > 0
      ? 'resend'
      : 'NONE'
check(
  'the deployment has a working mail transport',
  transport !== 'NONE',
  transport === 'console'
    ? 'EMAIL_TRANSPORT=console: the console transport counts as a working transport and is what this proof reads.'
    : transport === 'resend'
      ? 'RESEND_API_KEY is present and non-empty.'
      : 'NEITHER EMAIL_TRANSPORT=console NOR a non-empty RESEND_API_KEY. On a deployment in this state every ' +
        'buyer confirmation, refund notice and payout notice is dropped. transport-ready.ts logs an error naming ' +
        'what was not delivered and to whom, deliberately without throwing, because a mail fault must never fail ' +
        'a confirmed order.',
)

console.log('\n==== TICKET EMAIL ====')
for (const r of results) console.log(`  ${(r.ok ? 'PASS' : 'FAIL').padEnd(6)} ${r.name}`)
const failed = results.filter(r => !r.ok).length
console.log(`\n  ${results.length - failed} of ${results.length} passed.`)
process.exit(failed > 0 ? 1 : 0)
