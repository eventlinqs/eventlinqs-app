/**
 * THE DRIFT DRIVE: does a stored figure follow the rows it claims to summarise?
 *
 * ============================================================================
 * THE SHAPE BEING HUNTED
 * ============================================================================
 *
 * A second place holding a copy of something a primary table owns, where the two
 * can diverge. The platform has already been bitten twice by it in one week:
 *
 *   - cached event ROWS outliving the rows they copied, so /events rendered a
 *     header count of 2 beside a rail of EIGHT deleted events;
 *   - a sitemap baked at build time advertising 48 URLs whose rows were gone.
 *
 * Both were invisible to every test, because in both cases the code was correct.
 * What was wrong was that a number was written down in a second place and
 * nothing kept it in step. The only way to see that is to CHANGE THE UNDERLYING
 * ROWS AND LOOK.
 *
 * ============================================================================
 * WHAT IS DRIVEN, AND WHY EACH ONE IS MONEY
 * ============================================================================
 *
 *   ticket_tiers.reserved_count      seats held for a buyer mid-checkout. Too
 *                                    high and capacity is silently lost; too low
 *                                    and two buyers get the same seat.
 *   ticket_tiers.sold_count          the oversell figure. It has already caused
 *                                    an oversell and a seat that stayed sold
 *                                    after a refund.
 *   organisations.total_volume_cents lifetime money moved, shown in admin and
 *                                    used to reason about an organiser's tier.
 *   organisations.total_event_count  lifetime events, same.
 *
 * EVERY SCENARIO CARRIES A POSITIVE CONTROL. A drive that only shows a figure
 * failing to move proves nothing on its own: the figure might be unreachable, or
 * the measurement might be broken. So each figure is first moved THROUGH ITS REAL
 * MAINTAINER (create_reservation, the cancellation trigger, reconcile_refund) to
 * prove the measurement can see movement, and only then is the underlying data
 * changed some other way.
 *
 * ============================================================================
 * SAFETY
 * ============================================================================
 *
 * TEST ONLY, refused against production by assertNotProductionDatabase(). The
 * whole run is wrapped in BEGIN ... ROLLBACK, so nothing persists: the fixture
 * is built, driven, measured and discarded. Every id is a fresh UUID, so even an
 * interrupted run cannot touch a pre-existing row.
 *
 * The census at the end is READ ONLY and reports the divergence already present
 * in the live TEST data, which is the same measurement worth taking on
 * production by hand.
 *
 * RUN
 *   node --env-file=.env.test scripts/verify/aggregate-drift-drive.mjs
 */
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'
import { randomUUID } from 'node:crypto'

const target = assertNotProductionDatabase()
const client = await target.connect()

const q = (text, params) => client.query(text, params)
const one = async (text, params) => (await q(text, params)).rows[0]
const num = v => Number(v)

const findings = []
/**
 * @param {'FOLLOWS'|'DRIFTS'} verdict
 */
function record(figure, scenario, verdict, before, after, expected) {
  findings.push({ figure, scenario, verdict, before, after, expected })
  const tag = verdict === 'FOLLOWS' ? 'FOLLOWS ' : 'DRIFTS  '
  console.log(`  ${tag} ${figure}  ${scenario}`)
  console.log(`           before ${before}, after ${after}, truth says ${expected}`)
}

const sfx = Date.now().toString(36)
const ownerUser = randomUUID()
const orgId = randomUUID()
const eventId = randomUUID()
const tierId = randomUUID()
const orderId = randomUUID()
const oiId = randomUUID()
const tickets = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]
const holdId = randomUUID()

const soldCount = async () => num((await one('SELECT sold_count s FROM public.ticket_tiers WHERE id=$1', [tierId])).s)
const reservedCount = async () => num((await one('SELECT reserved_count r FROM public.ticket_tiers WHERE id=$1', [tierId])).r)
const orgVolume = async () => num((await one('SELECT total_volume_cents v FROM public.organisations WHERE id=$1', [orgId])).v)
const orgEvents = async () => num((await one('SELECT total_event_count c FROM public.organisations WHERE id=$1', [orgId])).c)
const orgHold = async () => num((await one('SELECT hold_amount_cents h FROM public.organisations WHERE id=$1', [orgId])).h)
const isFree = async () => (await one('SELECT is_free f FROM public.events WHERE id=$1', [eventId])).f
const liveTickets = async () =>
  num((await one("SELECT count(*) c FROM public.tickets WHERE ticket_tier_id=$1 AND status IN ('valid','scanned')", [tierId])).c)

try {
  await q('BEGIN')

  console.log('=== FIXTURE ===')
  await q('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [ownerUser, `drift_${sfx}@test.invalid`])
  await q(
    'INSERT INTO public.profiles (id, email) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email',
    [ownerUser, `drift_${sfx}@test.invalid`],
  )
  await q(
    `INSERT INTO public.organisations (id, name, slug, owner_id, stripe_account_country, hold_amount_cents, total_volume_cents, total_event_count)
     VALUES ($1,$2,$3,$4,'AU',0,0,0)`,
    [orgId, `Drift Org ${sfx}`, `drift-org-${sfx}`, ownerUser],
  )
  await q(
    `INSERT INTO public.events (id, title, slug, organisation_id, created_by, start_date, end_date, status)
     VALUES ($1,$2,$3,$4,$5, now() + interval '30 days', now() + interval '31 days', 'draft')`,
    [eventId, `Drift Event ${sfx}`, `drift-event-${sfx}`, orgId, ownerUser],
  )
  await q(
    `INSERT INTO public.ticket_tiers (id, event_id, name, total_capacity, sold_count, reserved_count, price)
     VALUES ($1,$2,'General',100,0,0,3000)`,
    [tierId, eventId],
  )
  console.log(`  org ${orgId}`)
  console.log(`  event ${eventId}`)
  console.log(`  tier ${tierId}  capacity 100, sold 0, reserved 0`)

  /* ==================================================================== *
   * FIGURE 1: ticket_tiers.reserved_count
   * ==================================================================== */
  console.log('\n=== FIGURE 1: ticket_tiers.reserved_count ===')

  // POSITIVE CONTROL A: the real reservation RPC must move it.
  const beforeReserve = await reservedCount()
  // create_reservation returns JSONB, not a row: { success, expires_at,
  // reservation_id }. Reading `.id` off the row silently yields undefined, the
  // UPDATE below then matches nothing, and the control reports DRIFTS for a
  // reason that has nothing to do with the trigger. That happened on the first
  // run of this script and is exactly why every control is asserted.
  const res1 = (await one(
    'SELECT public.create_reservation($1,$2,$3,$4,$5) AS out',
    [eventId, ownerUser, `sess_${sfx}_a`, JSON.stringify([{ ticket_tier_id: tierId, quantity: 4 }]), 15],
  )).out
  if (!res1?.reservation_id) throw new Error(`create_reservation returned no reservation_id: ${JSON.stringify(res1)}`)
  const afterReserve = await reservedCount()
  record(
    'reserved_count',
    'POSITIVE CONTROL: create_reservation(4) through the real RPC',
    afterReserve === beforeReserve + 4 ? 'FOLLOWS' : 'DRIFTS',
    beforeReserve,
    afterReserve,
    beforeReserve + 4,
  )

  // POSITIVE CONTROL B: the cancellation trigger must return them.
  const beforeCancel = await reservedCount()
  const cancelled = await q("UPDATE public.reservations SET status='cancelled' WHERE id=$1 AND status='active'", [res1.reservation_id])
  if (cancelled.rowCount !== 1) throw new Error(`the cancel control updated ${cancelled.rowCount} row(s), not 1`)
  const afterCancel = await reservedCount()
  record(
    'reserved_count',
    'POSITIVE CONTROL: reservation cancelled, the AFTER UPDATE trigger returns them',
    afterCancel === beforeCancel - 4 ? 'FOLLOWS' : 'DRIFTS',
    beforeCancel,
    afterCancel,
    beforeCancel - 4,
  )

  // THE DRIVE: the reservation row is DELETED rather than cancelled.
  const res2 = (await one(
    'SELECT public.create_reservation($1,$2,$3,$4,$5) AS out',
    [eventId, ownerUser, `sess_${sfx}_b`, JSON.stringify([{ ticket_tier_id: tierId, quantity: 4 }]), 15],
  )).out
  const res2Id = res2?.reservation_id
  if (!res2Id) throw new Error(`create_reservation returned no reservation_id: ${JSON.stringify(res2)}`)
  const beforeDelete = await reservedCount()
  await q('DELETE FROM public.reservations WHERE id=$1', [res2Id])
  const afterDelete = await reservedCount()
  const liveReservations = num(
    (await one("SELECT COALESCE(SUM((i->>'quantity')::int),0) s FROM public.reservations r, jsonb_array_elements(r.items) i WHERE r.status='active' AND (i->>'ticket_tier_id')::uuid = $1", [tierId])).s,
  )
  record(
    'reserved_count',
    'DRIVE: the active reservation row is DELETED (fixed 25 Aug 2026 by migration 20260825000001; the old trigger was AFTER UPDATE only)',
    afterDelete === liveReservations ? 'FOLLOWS' : 'DRIFTS',
    beforeDelete,
    afterDelete,
    liveReservations,
  )

  // Put the tier back to a clean base for the sold_count work.
  await q('UPDATE public.ticket_tiers SET reserved_count = 0 WHERE id=$1', [tierId])

  /* ==================================================================== *
   * FIGURE 2: ticket_tiers.sold_count
   * ==================================================================== */
  console.log('\n=== FIGURE 2: ticket_tiers.sold_count ===')

  const total = 24000
  const platform = 1200
  const processing = 0
  const share = total - platform - processing
  const reserve = Math.floor((share * 20) / 100)

  await q(
    `INSERT INTO public.orders (id, order_number, event_id, organisation_id, status, subtotal_cents,
       platform_fee_cents, processing_fee_cents, total_cents, currency, guest_email, guest_name)
     VALUES ($1,$2,$3,$4,'confirmed',$5,$6,$7,$8,'AUD',$9,'Drift Buyer')`,
    [orderId, `DRIFT${sfx}`, eventId, orgId, total, platform, processing, total, `drift_${sfx}@test.invalid`],
  )
  await q(
    `INSERT INTO public.order_items (id, order_id, item_type, item_name, ticket_tier_id, quantity, unit_price_cents)
     VALUES ($1,$2,'ticket','General',$3,$4,$5)`,
    [oiId, orderId, tierId, tickets.length, 3000],
  )
  for (let i = 0; i < tickets.length; i += 1) {
    await q(
      `INSERT INTO public.tickets (id, order_id, order_item_id, event_id, ticket_tier_id, idx_in_item, ticket_code, holder_email, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'valid')`,
      [tickets[i], orderId, oiId, eventId, tierId, i, `EL-DRIFT-${sfx}-${i}`, `drift_${sfx}@test.invalid`],
    )
  }
  await q(
    `INSERT INTO public.payments (id, order_id, amount_cents, currency, gateway, idempotency_key, gateway_payment_id)
     VALUES ($1,$2,$3,'AUD','stripe',$4,$5)`,
    [randomUUID(), orderId, total, `idem_drift_${sfx}`, `pi_drift_${sfx}`],
  )
  await q(
    `INSERT INTO public.organiser_balance_ledger (organisation_id, delta_cents, currency, reason, reference_type, reference_id)
     VALUES ($1,$2,'AUD','order_confirmed','order',$3)`,
    [orgId, share, orderId],
  )
  await q(
    `INSERT INTO public.payout_holds (id, organisation_id, event_id, hold_type, amount_cents, currency, release_at, metadata)
     VALUES ($1,$2,$3,'reserve',$4,'AUD', now() + interval '33 days', jsonb_build_object('order_id',$5::text))`,
    [holdId, orgId, eventId, reserve, orderId],
  )
  // The counters as connect-ledger writes them on a confirmed order: this is the
  // exact arithmetic of recordOrderConfirmedLedger, applied here because that
  // function is server-only TypeScript and cannot be called from a script. The
  // DRIVE below is the change to the underlying rows, not this setup.
  // total_event_count is NOT staged here any more. connect-ledger stopped
  // incrementing it on 25 August 2026 and a recompute trigger on public.events
  // owns it (migration 20260825000003), so staging a write the application no
  // longer makes would be testing a path that does not exist.
  await q(
    `UPDATE public.organisations
       SET hold_amount_cents = hold_amount_cents + $2,
           total_volume_cents = total_volume_cents + $3
     WHERE id = $1`,
    [orgId, reserve, total],
  )
  await q('UPDATE public.ticket_tiers SET sold_count = sold_count + $2 WHERE id=$1', [tierId, tickets.length])

  console.log(`  8 valid tickets, sold_count ${await soldCount()}, org volume ${await orgVolume()}, org events ${await orgEvents()}`)

  // POSITIVE CONTROL: a real refund through reconcile_refund must move it.
  const refundTickets = tickets.slice(0, 3)
  const req = await one(
    "SELECT * FROM public.create_refund_request($1,$2,'requested_by_buyer','admin',$3,'drift drive')",
    [orderId, refundTickets, ownerUser],
  )
  await q('UPDATE public.refunds SET stripe_refund_id=$2 WHERE id=$1', [req.refund_id, `re_drift_${sfx}`])
  const beforeRefund = await soldCount()
  const volBeforeRefund = await orgVolume()
  const holdBeforeRefund = await orgHold()
  const rec = (await one('SELECT public.reconcile_refund($1,$2,$3) r', [`re_drift_${sfx}`, `ch_drift_${sfx}`, num(req.amount_cents)])).r
  console.log(`  reconcile_refund returned ${rec}`)
  const afterRefund = await soldCount()
  record(
    'sold_count',
    'POSITIVE CONTROL: 3 tickets refunded through reconcile_refund',
    afterRefund === beforeRefund - 3 ? 'FOLLOWS' : 'DRIFTS',
    beforeRefund,
    afterRefund,
    beforeRefund - 3,
  )

  // THE DRIVE: tickets are DELETED. Nothing outside the RPCs maintains the count.
  const beforeTicketDelete = await soldCount()
  await q('DELETE FROM public.tickets WHERE id = ANY($1::uuid[])', [tickets.slice(3, 5)])
  const afterTicketDelete = await soldCount()
  record(
    'sold_count',
    'DRIVE: 2 valid tickets DELETED from the table the count summarises',
    afterTicketDelete === (await liveTickets()) ? 'FOLLOWS' : 'DRIFTS',
    beforeTicketDelete,
    afterTicketDelete,
    await liveTickets(),
  )

  /* ==================================================================== *
   * FIGURE 3: organisations.total_volume_cents
   * ==================================================================== */
  console.log('\n=== FIGURE 3: organisations.total_volume_cents ===')

  const volAfterRefund = await orgVolume()
  record(
    'total_volume_cents',
    'POSITIVE CONTROL: reconcile_refund decrements it (the only decrement in the tree)',
    volAfterRefund < volBeforeRefund ? 'FOLLOWS' : 'DRIFTS',
    volBeforeRefund,
    volAfterRefund,
    `less than ${volBeforeRefund}`,
  )

  // THE DRIVE: the confirmed order is DELETED. The money it represented is gone
  // from the orders table; the lifetime figure keeps counting it.
  const volBeforeOrderDelete = await orgVolume()
  // FK ORDER MATTERS AND THE DATABASE SAYS SO. refund_tickets.ticket_id,
  // refunds.order_id and payments.order_id are all RESTRICT, so a delete in the
  // wrong order raises 23503 rather than cascading. The first run of this script
  // did exactly that. Children first, in dependency order.
  await q('DELETE FROM public.refund_tickets WHERE refund_id IN (SELECT id FROM public.refunds WHERE order_id=$1)', [orderId])
  await q('DELETE FROM public.refunds WHERE order_id=$1', [orderId])
  await q('DELETE FROM public.refund_requests WHERE order_id=$1', [orderId])
  await q('DELETE FROM public.payments WHERE order_id=$1', [orderId])
  await q('DELETE FROM public.tickets WHERE order_id=$1', [orderId])
  await q('DELETE FROM public.order_items WHERE order_id=$1', [orderId])
  await q('DELETE FROM public.orders WHERE id=$1', [orderId])
  const volAfterOrderDelete = await orgVolume()
  const trueVolume = num(
    (await one("SELECT COALESCE(SUM(total_cents),0) s FROM public.orders WHERE organisation_id=$1 AND status='confirmed'", [orgId])).s,
  )
  record(
    'total_volume_cents',
    'DRIVE: the confirmed order is DELETED',
    volAfterOrderDelete === trueVolume ? 'FOLLOWS' : 'DRIFTS',
    volBeforeOrderDelete,
    volAfterOrderDelete,
    trueVolume,
  )

  /* ==================================================================== *
   * FIGURE 5: organisations.hold_amount_cents
   * ==================================================================== */
  console.log('\n=== FIGURE 5: organisations.hold_amount_cents ===')

  const holdAfterRefund = await orgHold()
  record(
    'hold_amount_cents',
    'POSITIVE CONTROL: reconcile_refund releases the reserve hold it covers',
    holdAfterRefund < holdBeforeRefund ? 'FOLLOWS' : 'DRIFTS',
    holdBeforeRefund,
    holdAfterRefund,
    `less than ${holdBeforeRefund}`,
  )

  // A SECOND HOLD, BECAUSE THE FIRST ONE IS ALREADY RELEASED. The refund above
  // took hold_amount_cents to 0, so deleting the (now released) hold row would
  // compare 0 with 0 and report FOLLOWS while proving nothing. A drive that can
  // only pass is not a drive. So a fresh hold is created and counted exactly as
  // the ledger counts one, and THAT is the row the drive deletes.
  const hold2Id = randomUUID()
  await q(
    `INSERT INTO public.payout_holds (id, organisation_id, event_id, hold_type, amount_cents, currency, release_at, metadata)
     VALUES ($1,$2,$3,'reserve',$4,'AUD', now() + interval '33 days', jsonb_build_object('order_id',$5::text))`,
    [hold2Id, orgId, eventId, 5000, orderId],
  )
  await q('UPDATE public.organisations SET hold_amount_cents = hold_amount_cents + 5000 WHERE id=$1', [orgId])
  const holdBeforeDelete = await orgHold()
  await q('DELETE FROM public.payout_holds WHERE id=$1', [hold2Id])
  const holdAfterDelete = await orgHold()
  const trueHold = num(
    (await one("SELECT COALESCE(SUM(amount_cents),0) s FROM public.payout_holds WHERE organisation_id=$1 AND hold_type='reserve'", [orgId])).s,
  )
  record(
    'hold_amount_cents',
    'DRIVE: the payout_hold rows it totals are DELETED',
    holdAfterDelete === trueHold ? 'FOLLOWS' : 'DRIFTS',
    holdBeforeDelete,
    holdAfterDelete,
    trueHold,
  )

  /* ==================================================================== *
   * FIGURE 6: event_addons.sold_count
   *
   * NO POSITIVE CONTROL EXISTS, AND THAT IS THE FINDING. Nothing in the tree
   * writes this column: not a migration, not a trigger, not a line of
   * TypeScript. It is created 0 and stays 0 forever. The checkout selector caps
   * an addon at `total_capacity - sold_count`
   * (src/components/checkout/ticket-selector.tsx), so the cap never shrinks and
   * a capped addon can be sold without limit.
   * ==================================================================== */
  console.log('\n=== FIGURE 6: event_addons.sold_count ===')

  const addonId = randomUUID()
  await q(
    `INSERT INTO public.event_addons (id, event_id, name, price, total_capacity, sold_count)
     VALUES ($1,$2,'Drink voucher',500,2,0)`,
    [addonId, eventId],
  )
  const addonOrderId = randomUUID()
  await q(
    `INSERT INTO public.orders (id, order_number, event_id, organisation_id, status, subtotal_cents,
       platform_fee_cents, processing_fee_cents, total_cents, currency, guest_email, guest_name)
     VALUES ($1,$2,$3,$4,'confirmed',1000,0,0,1000,'AUD',$5,'Addon Buyer')`,
    [addonOrderId, `ADDON${sfx}`, eventId, orgId, `drift_${sfx}@test.invalid`],
  )
  await q(
    `INSERT INTO public.order_items (id, order_id, item_type, item_name, addon_id, quantity, unit_price_cents)
     VALUES ($1,$2,'addon','Drink voucher',$3,2,500)`,
    [randomUUID(), addonOrderId, addonId],
  )
  const addonSold = num((await one('SELECT sold_count s FROM public.event_addons WHERE id=$1', [addonId])).s)
  const addonReallySold = num(
    (await one("SELECT COALESCE(SUM(quantity),0) s FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE oi.addon_id=$1 AND o.status='confirmed'", [addonId])).s,
  )
  record(
    'event_addons.sold_count',
    'DRIVE: 2 of a 2-capacity addon are sold on a confirmed order',
    addonSold === addonReallySold ? 'FOLLOWS' : 'DRIFTS',
    0,
    addonSold,
    addonReallySold,
  )
  console.log(
    `           the checkout cap is total_capacity - sold_count = 2 - ${addonSold} = ${2 - addonSold}, ` +
      (addonSold === addonReallySold
        ? 'so the addon correctly reads as sold out'
        : 'so the next buyer still sees it as available'),
  )

  /* ==================================================================== *
   * FIGURE 7: events.is_free  -  THE COUNTER-EXAMPLE
   *
   * This is what a maintained stored value looks like, and it is included so the
   * report is not a list of failures with no standard to compare them against.
   * trg_update_event_is_free fires AFTER INSERT OR DELETE OR UPDATE on
   * ticket_tiers and RECOMPUTES from the whole tier set rather than adjusting a
   * running total. A recompute cannot drift: there is no accumulated error to
   * carry, and no event it can miss, because it is derived on every write.
   * ==================================================================== */
  console.log('\n=== FIGURE 7: events.is_free (the counter-example) ===')

  await q('UPDATE public.ticket_tiers SET price = 0 WHERE id=$1', [tierId])
  const freeAfterZero = await isFree()
  record(
    'events.is_free',
    'DRIVE: the only tier price is set to 0',
    freeAfterZero === true ? 'FOLLOWS' : 'DRIFTS',
    false,
    freeAfterZero,
    true,
  )
  await q('UPDATE public.ticket_tiers SET price = 3000 WHERE id=$1', [tierId])
  const freeAfterPaid = await isFree()
  record(
    'events.is_free',
    'DRIVE: the price is put back to 3000',
    freeAfterPaid === false ? 'FOLLOWS' : 'DRIFTS',
    true,
    freeAfterPaid,
    false,
  )

  /* ==================================================================== *
   * FIGURE 8: discount_codes.current_uses
   *
   * Incremented inside confirm_order. Never decremented anywhere: a grep of
   * every migration for a subtraction of this column returns nothing. So a
   * refunded or deleted order goes on consuming one of the code's uses, and a
   * code capped at max_uses is permanently exhausted by orders that no longer
   * exist. The truth is countable: discount_code_usages holds one row per use
   * and cascades away with the order.
   * ==================================================================== */
  console.log('\n=== FIGURE 8: discount_codes.current_uses ===')

  const codeId = randomUUID()
  const discountOrderId = randomUUID()
  await q(
    `INSERT INTO public.discount_codes (id, event_id, organisation_id, code, discount_type, discount_amount_cents, currency, max_uses, current_uses, is_active)
     VALUES ($1,$2,$3,$4,'fixed_amount',500,'AUD',3,0,true)`,
    [codeId, eventId, orgId, `DRIFT${sfx}`.toUpperCase()],
  )
  await q(
    `INSERT INTO public.orders (id, order_number, event_id, organisation_id, status, subtotal_cents,
       platform_fee_cents, processing_fee_cents, total_cents, currency, guest_email, guest_name, discount_code_id, discount_cents)
     VALUES ($1,$2,$3,$4,'confirmed',3000,0,0,2500,'AUD',$5,'Discount Buyer',$6,500)`,
    [discountOrderId, `DISC${sfx}`, eventId, orgId, `drift_${sfx}@test.invalid`, codeId],
  )
  await q(
    `INSERT INTO public.discount_code_usages (id, discount_code_id, order_id, discount_applied_cents)
     VALUES ($1,$2,$3,500)`,
    [randomUUID(), codeId, discountOrderId],
  )
  // confirm_order is what increments this in production; applied here directly
  // because the fixture order is inserted already-confirmed. The DRIVE is the
  // delete below, not this line.
  await q('UPDATE public.discount_codes SET current_uses = current_uses + 1 WHERE id=$1', [codeId])

  const usesBefore = num((await one('SELECT current_uses u FROM public.discount_codes WHERE id=$1', [codeId])).u)
  await q('DELETE FROM public.discount_code_usages WHERE order_id=$1', [discountOrderId])
  await q('DELETE FROM public.order_items WHERE order_id=$1', [discountOrderId])
  await q('DELETE FROM public.orders WHERE id=$1', [discountOrderId])
  const usesAfter = num((await one('SELECT current_uses u FROM public.discount_codes WHERE id=$1', [codeId])).u)
  const trueUses = num(
    (await one("SELECT count(*) c FROM public.discount_code_usages u JOIN public.orders o ON o.id=u.order_id WHERE u.discount_code_id=$1 AND o.status='confirmed'", [codeId])).c,
  )
  record(
    'discount_codes.current_uses',
    'DRIVE: the order that consumed the code is DELETED',
    usesAfter === trueUses ? 'FOLLOWS' : 'DRIFTS',
    usesBefore,
    usesAfter,
    trueUses,
  )
  console.log(`           max_uses is 3, so the code now reads ${3 - usesAfter} use(s) left when the truth is ${3 - trueUses}`)
  await q('DELETE FROM public.discount_codes WHERE id=$1', [codeId])

  /* ==================================================================== *
   * FIGURE 9: tier_access_codes.current_uses
   *
   * FOUND BY THE ENUMERATION OF 25 AUGUST 2026, not by anyone hitting it.
   * NOTHING wrote this column: not a trigger, not a function, not a line of
   * TypeScript. validateAccessCode refused a code when current_uses >= max_uses,
   * so a code capped at 1 use was redeemable without limit.
   * ==================================================================== */
  console.log('\n=== FIGURE 9: tier_access_codes.current_uses ===')

  const accessCodeId = randomUUID()
  const accessCode = `DRILL${sfx.toUpperCase()}`
  await q(
    `INSERT INTO public.tier_access_codes (id, ticket_tier_id, code, max_uses, current_uses, is_active)
     VALUES ($1,$2,$3,1,0,true)`,
    [accessCodeId, tierId, accessCode],
  )

  const usesOf = async () =>
    num((await one('SELECT current_uses u FROM public.tier_access_codes WHERE id=$1', [accessCodeId])).u)

  const firstRedeem = await q('SELECT * FROM public.redeem_tier_access_codes($1, $2::uuid[])', [
    accessCode,
    [tierId],
  ])
  record(
    'tier_access_codes.current_uses',
    'POSITIVE CONTROL: the first redemption of a max_uses 1 code is admitted and counted',
    firstRedeem.rowCount === 1 && (await usesOf()) === 1 ? 'FOLLOWS' : 'DRIFTS',
    0,
    await usesOf(),
    1,
  )

  const secondRedeem = await q('SELECT * FROM public.redeem_tier_access_codes($1, $2::uuid[])', [
    accessCode,
    [tierId],
  ])
  record(
    'tier_access_codes.current_uses',
    'DRIVE: the SECOND redemption of a max_uses 1 code must be refused',
    secondRedeem.rowCount === 0 && (await usesOf()) === 1 ? 'FOLLOWS' : 'DRIFTS',
    1,
    await usesOf(),
    1,
  )
  console.log(
    `           the second call unlocked ${secondRedeem.rowCount} tier(s); before 25 August 2026 it unlocked 1 and every call after it did too`,
  )
  await q('DELETE FROM public.tier_access_codes WHERE id=$1', [accessCodeId])

  /* ==================================================================== *
   * FIGURE 4: organisations.total_event_count
   * ==================================================================== */
  console.log('\n=== FIGURE 4: organisations.total_event_count ===')

  const eventsBeforeDelete = await orgEvents()
  await q('DELETE FROM public.reservations WHERE event_id=$1', [eventId])
  await q('DELETE FROM public.payout_holds WHERE event_id=$1', [eventId])
  // orders.event_id is RESTRICT, so the addon order from FIGURE 6 blocks the
  // delete until it goes. The database refusing to orphan an order is correct;
  // it is the ORGANISATION counters that are supposed to notice and do not.
  await q('DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE event_id=$1)', [eventId])
  await q('DELETE FROM public.orders WHERE event_id=$1', [eventId])
  await q('DELETE FROM public.events WHERE id=$1', [eventId])
  const eventsAfterDelete = await orgEvents()
  const trueEvents = num((await one('SELECT count(*) c FROM public.events WHERE organisation_id=$1', [orgId])).c)
  record(
    'total_event_count',
    'DRIVE: the event is DELETED, exactly as the production purge deleted 46 of them',
    eventsAfterDelete === trueEvents ? 'FOLLOWS' : 'DRIFTS',
    eventsBeforeDelete,
    eventsAfterDelete,
    trueEvents,
  )

  await q('ROLLBACK')
  console.log('\n[fixture] ROLLBACK - nothing persisted.')
} catch (err) {
  await q('ROLLBACK').catch(() => {})
  console.error('\n[drift-drive] the drive threw; everything was rolled back:', err?.message ?? err)
  console.error(err)
  await client.end()
  process.exit(2)
}

/* ====================================================================== *
 * THE CENSUS: how far has the LIVE data already drifted?
 * READ ONLY.
 * ====================================================================== */
console.log('\n=== CENSUS OF THE LIVE TEST DATA (read only) ===')

const tierCensus = await q(`
  SELECT tt.id, tt.sold_count,
         COALESCE(t.live, 0) AS live_tickets
  FROM public.ticket_tiers tt
  LEFT JOIN (
    SELECT ticket_tier_id, count(*) AS live
    FROM public.tickets WHERE status IN ('valid','scanned') GROUP BY ticket_tier_id
  ) t ON t.ticket_tier_id = tt.id
  WHERE tt.sold_count <> COALESCE(t.live, 0)
  ORDER BY abs(tt.sold_count - COALESCE(t.live,0)) DESC`)
console.log(`  ticket_tiers whose sold_count disagrees with its live tickets: ${tierCensus.rows.length}`)
for (const r of tierCensus.rows.slice(0, 5)) {
  console.log(`    tier ${r.id}  sold_count ${r.sold_count}  live tickets ${r.live_tickets}`)
}
if (tierCensus.rows.length > 5) console.log(`    ... and ${tierCensus.rows.length - 5} more`)

const reservedCensus = await q(`
  SELECT tt.id, tt.reserved_count, COALESCE(r.held, 0) AS held
  FROM public.ticket_tiers tt
  LEFT JOIN (
    SELECT (i->>'ticket_tier_id')::uuid AS tier, SUM((i->>'quantity')::int) AS held
    FROM public.reservations res, jsonb_array_elements(res.items) i
    WHERE res.status = 'active' AND res.expires_at > now()
    GROUP BY 1
  ) r ON r.tier = tt.id
  WHERE tt.reserved_count <> COALESCE(r.held, 0)
  ORDER BY abs(tt.reserved_count - COALESCE(r.held,0)) DESC`)
console.log(`  ticket_tiers whose reserved_count disagrees with its live holds: ${reservedCensus.rows.length}`)
for (const r of reservedCensus.rows.slice(0, 5)) {
  console.log(`    tier ${r.id}  reserved_count ${r.reserved_count}  live holds ${r.held}`)
}

const orgCensus = await q(`
  SELECT o.id, o.slug, o.total_event_count, o.total_volume_cents,
         COALESCE(e.n, 0) AS real_events,
         COALESCE(v.v, 0) AS real_volume
  FROM public.organisations o
  LEFT JOIN (SELECT organisation_id, count(*) n FROM public.events GROUP BY 1) e ON e.organisation_id = o.id
  LEFT JOIN (SELECT organisation_id, SUM(total_cents) v FROM public.orders WHERE status='confirmed' GROUP BY 1) v ON v.organisation_id = o.id
  WHERE o.total_event_count <> 0 OR o.total_volume_cents <> 0
  ORDER BY o.total_volume_cents DESC`)
let orgsOverCounting = 0
console.log(`  organisations carrying a non-zero counter: ${orgCensus.rows.length}`)
for (const r of orgCensus.rows) {
  const eventsOff = num(r.total_event_count) !== num(r.real_events)
  const volumeOff = num(r.total_volume_cents) !== num(r.real_volume)
  if (eventsOff || volumeOff) {
    orgsOverCounting += 1
    if (orgsOverCounting <= 8) {
      console.log(
        `    ${r.slug}  total_event_count ${r.total_event_count} vs ${r.real_events} real` +
          `   total_volume_cents ${r.total_volume_cents} vs ${r.real_volume} confirmed`,
      )
    }
  }
}
console.log(`  organisations whose counters disagree with their rows: ${orgsOverCounting} of ${orgCensus.rows.length}`)

await client.end()

/* ====================================================================== *
 * VERDICT
 * ====================================================================== */
console.log('\n=== VERDICT ===')
const controls = findings.filter(f => f.scenario.startsWith('POSITIVE CONTROL'))
const drives = findings.filter(f => f.scenario.startsWith('DRIVE'))
const brokenControls = controls.filter(f => f.verdict !== 'FOLLOWS')
const drifting = drives.filter(f => f.verdict === 'DRIFTS')

console.log(`  positive controls: ${controls.length}, of which ${brokenControls.length} did NOT move`)
console.log(`  drives: ${drives.length}, of which ${drifting.length} DRIFTED`)
for (const f of drifting) console.log(`    DRIFTS  ${f.figure}  ${f.scenario}`)
if (drifting.length > 0) {
  console.log('')
  console.log('  The organisation counters above still drift IN THE COLUMN and nothing renders them any')
  console.log('  more: src/lib/admin/organisers.ts counts the rows since 25 August 2026, so the admin')
  console.log('  surface cannot show a stale figure. ticket_tiers.sold_count is left as it is on purpose:')
  console.log('  it is the oversell figure, held under a row lock, and for a reserved-seating event its')
  console.log('  truth lives in the seats table. Rewriting it belongs in its own pass, not in an audit.')
}

if (brokenControls.length > 0) {
  console.error('\n[drift-drive] INCONCLUSIVE: a positive control did not move, so a "does not move" result')
  console.error('[drift-drive] below it cannot be attributed to drift rather than to a broken measurement.')
  for (const f of brokenControls) console.error(`  - ${f.figure}: ${f.scenario}`)
  process.exit(2)
}

// This script REPORTS. It exits 0 whether or not drift was found, because its
// job is measurement; the build-failing opinion belongs to
// scripts/guards/maintained-aggregates.mjs.
console.log('\n[drift-drive] every positive control moved, so every result above is attributable.')
process.exit(0)
