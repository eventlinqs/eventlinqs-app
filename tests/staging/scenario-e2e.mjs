// Scenario e2e against real ticket rows. Staging only.
// Run: node tests/staging/scenario-e2e.mjs
//
// Proves: admit; re-scan already used; refunded reject; void reject;
// wrong-event reject; unauthorised user refused.

import { setupScenario, teardown, authedClientFor, check } from './harness.mjs'

async function scan(client, ticket, eventId) {
  const { data, error } = await client.rpc('scan_ticket', {
    p_ticket_code: ticket.ticket_code,
    p_secret: ticket.secret,
    p_event_id: eventId,
  })
  if (error) return { error: error.message }
  return { result: data?.[0]?.result ?? null, firstScannedAt: data?.[0]?.first_scanned_at ?? null }
}

async function main() {
  const s = await setupScenario({ staffRole: 'manager' })
  let failed = false
  try {
    console.log('Scenario e2e: door admit/reject paths against real tickets')
    const staff = await authedClientFor(s.staffEmail, s.password)

    // 1. Valid ticket admits and records first_scanned_at.
    const first = await scan(staff, s.ticket, s.eventId)
    check('valid ticket -> admitted', first.result === 'admitted')
    check('admit sets first_scanned_at', Boolean(first.firstScannedAt))

    // 2. Same ticket again -> already used.
    const again = await scan(staff, s.ticket, s.eventId)
    check('second scan -> already_scanned', again.result === 'already_scanned')

    // 3. Refunded ticket -> refunded. (Mint a fresh one, then refund it.)
    const refunded = s.otherEventTicket // reuse a separate ticket row
    await s.db.from('tickets').update({ status: 'refunded' }).eq('id', refunded.id)
    const refundedScan = await scan(staff, refunded, s.otherEventId)
    check('refunded ticket -> refunded', refundedScan.result === 'refunded')

    // 4. Void ticket -> void.
    await s.db.from('tickets').update({ status: 'void' }).eq('id', refunded.id)
    const voidScan = await scan(staff, refunded, s.otherEventId)
    check('void ticket -> void', voidScan.result === 'void')

    // 5. Wrong event: a fresh valid ticket scanned at the wrong event id.
    await s.db
      .from('tickets')
      .update({ status: 'valid', scan_count: 0, first_scanned_at: null, last_scanned_at: null })
      .eq('id', refunded.id)
    const wrongEvent = await scan(staff, refunded, s.eventId) // refunded belongs to otherEventId
    check('valid ticket at wrong event -> wrong_event', wrongEvent.result === 'wrong_event')

    // 6. Unauthorised user (no role on the org) is refused by the RPC.
    const outsider = await setupScenario({ staffRole: null })
    try {
      const stranger = await authedClientFor(outsider.staffEmail, outsider.password)
      const refused = await scan(stranger, s.ticket, s.eventId)
      check('unauthorised user -> RPC raises not_authorised', Boolean(refused.error?.includes('not_authorised')))
    } finally {
      await teardown(outsider)
    }
  } catch (err) {
    failed = true
    console.error(err.message)
  } finally {
    await teardown(s)
  }

  console.log(failed ? '\nSCENARIO E2E: FAIL' : '\nSCENARIO E2E: PASS')
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
