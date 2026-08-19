/**
 * THE ORDER CONFIRMATION PAGE TELLS THE TRUTH IN EVERY ORDER STATE.
 *
 * Until 19 August 2026 this page had two states: `confirmed`, and everything else.
 * Everything else read "Your spot is locked in. Your ticket is being issued now and
 * lands in your email within a few minutes."
 *
 * A `cancelled` or `refunded` order fell into "everything else". So the buyer whose
 * money an operator had just handed back on /admin/orders/unfulfilled was told a
 * ticket was on its way. It never was. They wait, then they ring up, and the refund
 * they already have is not what they are ringing about. It was found by driving the
 * refund end to end and READING the buyer's own page, which is the only way it could
 * have been found: every test on that page asserted the confirmed state.
 *
 * So each state is fetched and read back. A state with no example order on TEST is
 * reported as SKIPPED and counted, never silently passed: "3 passed" out of four
 * states is a different result from "4 passed" and must not print the same.
 *
 * Read-only. No writes, no Stripe, no email.
 * USAGE: node --env-file=.env.test scripts/verify/order-confirmation-states.mjs [--url http://localhost:3100]
 */
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction({ envFile: '.env.test' })

const argv = process.argv.slice(2)
const i = argv.indexOf('--url')
const BASE = (i === -1 ? 'http://localhost:3100' : argv[i + 1]).replace(/\/+$/, '')

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const CASES = [
  { status: 'confirmed', mustSay: /You're going|Payment confirmed/, mustNotSay: /This order did not complete|This order was refunded/ },
  { status: 'refunded', mustSay: /This order was refunded|Order closed/, mustNotSay: /is being issued now|is locked in/ },
  { status: 'cancelled', mustSay: /This order did not complete|Order closed/, mustNotSay: /is being issued now|is locked in/ },
  { status: 'pending', mustSay: /Order received/, mustNotSay: /This order did not complete|This order was refunded/ },
]

let fails = 0
let skipped = 0
let checked = 0
console.log(`\n  order confirmation page, every state, against ${BASE}\n`)
for (const c of CASES) {
  const { data } = await db.from('orders').select('id, order_number, status').eq('status', c.status).limit(1).maybeSingle()
  if (!data) {
    skipped += 1
    console.log(`  SKIPPED  ${c.status.padEnd(10)} no order in this state on TEST, so this state is UNCHECKED`)
    continue
  }
  const res = await fetch(`${BASE}/orders/${data.id}/confirmation`)
  const text = (await res.text()).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
  const said = c.mustSay.test(text)
  const avoided = !c.mustNotSay.test(text)
  const ok = res.status === 200 && said && avoided
  checked += 1
  if (!ok) fails += 1
  console.log(`  ${ok ? 'PASS   ' : 'FAIL   '}  ${c.status.padEnd(10)} ${data.order_number}  HTTP ${res.status}  says-the-right-thing=${said}  avoids-the-wrong-thing=${avoided}`)
  if (!ok) console.log(`           excerpt: ${text.slice(0, 400)}`)
}
console.log(`\n  ${checked} state(s) checked, ${skipped} UNCHECKED for want of an example order, ${fails} failed`)
process.exit(fails ? 1 : 0)
