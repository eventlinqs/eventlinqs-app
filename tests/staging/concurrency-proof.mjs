// Concurrency proof: two scanners hit the same ticket at the same instant.
// Exactly one admits; the loser gets already_scanned; scan_count = 1.
// Staging only. Run: node tests/staging/concurrency-proof.mjs

import { setupScenario, teardown, authedClientFor, check } from './harness.mjs'

async function main() {
  const s = await setupScenario({ staffRole: 'manager' })
  let failed = false
  try {
    console.log('Concurrency proof: two simultaneous scans of one valid ticket')

    // Two independent authenticated clients for the same authorised staff user.
    const [c1, c2] = await Promise.all([
      authedClientFor(s.staffEmail, s.password),
      authedClientFor(s.staffEmail, s.password),
    ])

    const args = {
      p_ticket_code: s.ticket.ticket_code,
      p_secret: s.ticket.secret,
      p_event_id: s.eventId,
    }

    // Fire both at once. The row lock inside scan_ticket serialises them.
    const [r1, r2] = await Promise.all([
      c1.rpc('scan_ticket', args),
      c2.rpc('scan_ticket', args),
    ])

    if (r1.error) throw new Error(`scan 1 errored: ${r1.error.message}`)
    if (r2.error) throw new Error(`scan 2 errored: ${r2.error.message}`)

    const results = [r1.data?.[0]?.result, r2.data?.[0]?.result].sort()
    check('exactly one admitted, one already_scanned', results.join(',') === 'admitted,already_scanned')

    const { data: ticket } = await s.db
      .from('tickets')
      .select('scan_count, first_scanned_at, status')
      .eq('id', s.ticket.id)
      .single()

    check('scan_count is exactly 1', ticket.scan_count === 1)
    check('first_scanned_at is set exactly once', Boolean(ticket.first_scanned_at))
    check("status is 'scanned'", ticket.status === 'scanned')

    const { count } = await s.db
      .from('ticket_scans')
      .select('*', { count: 'exact', head: true })
      .eq('ticket_id', s.ticket.id)
      .eq('result', 'admitted')
    check('exactly one admitted audit row', count === 1)
  } catch (err) {
    failed = true
    console.error(err.message)
  } finally {
    await teardown(s)
  }

  console.log(failed ? '\nCONCURRENCY PROOF: FAIL' : '\nCONCURRENCY PROOF: PASS')
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
