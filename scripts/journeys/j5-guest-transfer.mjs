/**
 * JOURNEY 5, GUEST HALF: A GUEST MOVES THE TICKET THEY PAID FOR.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A SEPARATE JOURNEY.
 *
 * Journey 5 passed for a SIGNED-IN buyer and had never passed for a guest, and
 * guest checkout is the default path: it creates no account, so
 * transfer_ticket() (which takes identity from auth.uid() and raises
 * not_authenticated when there is none) could never say yes to one. Worse, the
 * control was not even reachable, because the transfer form is rendered on
 * /tickets, which sits behind sign-in. The guest saw their QR on the
 * confirmation page and no way to move it.
 *
 * Migration 20260829000002 added transfer_ticket_for_order, a SECOND function
 * rather than a parameter on the first, granted to service_role ONLY. The code
 * shipped on 29 August (06c89115) and the migration was NOT applied, so the
 * feature had never once run end to end. This drives it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS PROVEN, AND WHERE THE PROOF COMES FROM.
 *
 * The DOM proves what the guest is offered. The DATABASE proves what actually
 * moved, and it is the only thing that can: a green message on screen is a
 * claim, and this platform has shipped several of those.
 *
 *   1. With the signed link, the control is offered.
 *   2. Pressing it through moves the ticket: holder_email and holder_name
 *      change, transferred_to_email records where it went, and THE SECRET
 *      ROTATES, which is what kills the old QR. A transfer that leaves the old
 *      secret alive means one code admits two people, so the rotation is
 *      checked explicitly rather than assumed from a success message.
 *   3. With NO token the control is absent.
 *   4. With a FORGED token the control is absent.
 *   5. THE ATTACK THAT MATTERS: a CORRECTLY SIGNED token for a DIFFERENT order
 *      must move nothing. A token is only worth anything if it is bound to the
 *      one order it was minted for, and that binding is the whole security
 *      model.
 *
 * The order used is a REAL confirmed guest order from a real card purchase on
 * TEST, not a staged row, because the question is whether a real buyer can move
 * a real ticket.
 *
 * Usage: node scripts/journeys/j5-guest-transfer.mjs
 */
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { chromium, BASE, makeJourney, note, attach, finish } from './harness.mjs'

assertNotProduction()

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const j = makeJourney('j5-guest-transfer', 'Journey 5, guest half: moving a ticket with no account')
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const results = []

function verdict(name, ok, detail) {
  results.push({ name, ok, detail })
  note(j, `${(ok ? 'PASS' : 'FAIL').padEnd(6)} ${name}`, detail)
  if (!ok) j.blockers.push(`${name}: ${detail}`)
}

/*
 * MINTED THE SAME WAY THE SERVER MINTS IT, from src/lib/orders/order-access.ts.
 * The purpose string is bound into the MAC so a secret shared with another
 * feature cannot cross over, and it has to match exactly or every probe below
 * would read as "the control is correctly hidden" when the truth is that the
 * script cannot sign.
 */
const SECRET = process.env.ORDER_ACCESS_SECRET || 'dev-order-access-secret-change-in-prod'
const mint = orderId =>
  crypto.createHmac('sha256', SECRET).update(`order-access-v1:${orderId}`).digest('hex').slice(0, 40)

/** A real confirmed guest order that still has a transferable ticket. */
async function guestOrderWithValidTicket() {
  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, guest_email, event_id')
    .eq('status', 'confirmed')
    .not('guest_email', 'is', null)
    .is('user_id', null)
    .order('created_at', { ascending: false })
    .limit(25)
  for (const o of orders ?? []) {
    const { data: tickets } = await db
      .from('tickets')
      .select('id, ticket_code, secret, holder_name, holder_email, status, transferred_to_email')
      .eq('order_id', o.id)
      .eq('status', 'valid')
      .limit(1)
    if (tickets?.length) return { order: o, ticket: tickets[0] }
  }
  return null
}

const browser = await chromium.launch()

try {
  const found = await guestOrderWithValidTicket()
  if (!found) {
    verdict(
      'a real guest order to move',
      false,
      'no confirmed guest order on TEST still holds a valid ticket. Run scripts/journeys/j3.mjs (a stranger buys with a real card) first; this journey deliberately does not stage one, because the question is whether a REAL buyer can move a REAL ticket.',
    )
    throw new Error('no order')
  }
  const { order, ticket } = found
  verdict(
    'a real guest order to move',
    true,
    `order ${order.order_number} (${order.id}) bought by guest ${order.guest_email}, ticket ${ticket.ticket_code} held by ${ticket.holder_email}`,
  )

  // A DIFFERENT real order, to sign a token for. Signing one for an id that
  // does not exist would prove less: the interesting attack is a token that is
  // perfectly valid, just not for this order.
  const { data: others } = await db
    .from('orders')
    .select('id')
    .neq('id', order.id)
    .eq('status', 'confirmed')
    .limit(1)
  const otherOrderId = others?.[0]?.id ?? null

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
  const p = await ctx.newPage()
  await attach(j, p)

  const confirmation = t =>
    `${BASE}/orders/${order.id}/confirmation${t === null ? '' : `?t=${t}`}`

  const offers = async url => {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await p.waitForTimeout(3000)
    return p.evaluate(() => {
      const texts = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim())
      return {
        transfer: texts.some(t => /Transfer or gift this ticket/i.test(t)),
        refund: texts.some(t => /Request a refund/i.test(t)),
      }
    })
  }

  // ── 1. WITH THE SIGNED LINK, THE CONTROL IS THERE ────────────────────────
  const withToken = await offers(confirmation(mint(order.id)))
  verdict(
    'the signed link offers the transfer control',
    withToken.transfer,
    `transfer=${withToken.transfer} refund=${withToken.refund} on the confirmation page as a signed-out stranger`,
  )

  // ── 2. AND PRESSING IT THROUGH ACTUALLY MOVES THE TICKET ─────────────────
  if (withToken.transfer) {
    const NEW_EMAIL = `newholder.${stamp}@example.com`
    const NEW_NAME = `New Holder ${stamp}`

    for (const el of await p.$$('button')) {
      const t = ((await el.innerText().catch(() => '')) || '').trim()
      if (/Transfer or gift this ticket/i.test(t)) {
        await el.click()
        break
      }
    }
    await p.waitForSelector('input[aria-label="New holder email"]', { timeout: 15000 }).catch(() => {})
    await p.fill('input[aria-label="New holder name"]', NEW_NAME).catch(() => {})
    await p.fill('input[aria-label="New holder email"]', NEW_EMAIL).catch(() => {})
    for (const el of await p.$$('button')) {
      const t = ((await el.innerText().catch(() => '')) || '').trim()
      if (/^Send ticket$/i.test(t)) {
        await el.click()
        break
      }
    }
    await p.waitForTimeout(9000)

    const shown = await p.evaluate(() =>
      [...document.querySelectorAll('[role=status],[role=alert]')].map(e => (e.textContent || '').trim()).join(' // '),
    )

    const { data: after } = await db
      .from('tickets')
      .select('holder_name, holder_email, secret, status, transferred_to_email')
      .eq('id', ticket.id)
      .single()

    const moved = after?.holder_email === NEW_EMAIL
    const rotated = after?.secret !== ticket.secret
    const recorded = after?.transferred_to_email === NEW_EMAIL

    verdict(
      'the ticket actually moved, in the database',
      moved && recorded,
      after
        ? `holder_email ${ticket.holder_email} -> ${after.holder_email}, holder_name -> ${after.holder_name}, ` +
          `transferred_to_email=${after.transferred_to_email}, status=${after.status}. On screen: "${shown.slice(0, 120)}"`
        : `the ticket row could not be read back. On screen: "${shown.slice(0, 120)}"`,
    )

    verdict(
      'the old QR is dead: the secret rotated',
      rotated,
      rotated
        ? 'the ticket secret changed, so the code the original buyer is holding no longer scans'
        : 'THE SECRET DID NOT CHANGE. The previous holder still has a working QR, so one ticket now admits two people.',
    )
  } else {
    verdict('the ticket actually moved, in the database', false, 'the control was never offered, so nothing could be pressed')
  }

  // ── 3, 4, 5. THE THREE WAYS IT MUST SAY NO ───────────────────────────────
  const noToken = await offers(confirmation(null))
  verdict(
    'no token offers no transfer',
    !noToken.transfer,
    `transfer=${noToken.transfer} with no ?t= at all`,
  )

  const forged = await offers(confirmation('f'.repeat(40)))
  verdict(
    'a forged token offers no transfer',
    !forged.transfer,
    `transfer=${forged.transfer} with a 40-character token that was never signed`,
  )

  if (otherOrderId) {
    const crossed = await offers(confirmation(mint(otherOrderId)))
    verdict(
      'a VALID token for a DIFFERENT order opens nothing here',
      !crossed.transfer,
      `transfer=${crossed.transfer} using a correctly signed token minted for order ${otherOrderId}. ` +
        'This is the attack that matters: the token is genuine, it is simply not for this order.',
    )
  } else {
    verdict('a VALID token for a DIFFERENT order opens nothing here', false, 'no second confirmed order on TEST to sign a token for')
  }

  await ctx.close()
} catch (err) {
  note(j, 'ABORTED', String(err?.message ?? err))
} finally {
  await browser.close()
}

console.log('\n== JOURNEY 5, GUEST HALF ==')
for (const r of results) console.log(`  ${(r.ok ? 'PASS' : 'FAIL').padEnd(6)} ${r.name}\n         ${r.detail}`)
const failed = results.filter(r => !r.ok).length
console.log(`\n  ${results.length - failed} of ${results.length} passed.`)
await finish(j)
process.exit(failed > 0 ? 1 : 0)
