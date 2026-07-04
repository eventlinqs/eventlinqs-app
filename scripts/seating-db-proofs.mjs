/**
 * Reserved-seating database evidence battery (TEST only, guarded):
 *   1. CONCURRENCY: two simultaneous reservation attempts for the SAME seat;
 *      exactly one succeeds, with the seat row and reservation rows dumped.
 *   2. ADVERSARIAL: a crafted request for a non-existent seat and for an
 *      unavailable (reserved) seat; both rejected server-side.
 *   3. HOLD EXPIRY: a held seat whose reservation expiry has passed returns
 *      to available via release_expired_seat_reservations (the cron's RPC).
 * Writes docs/seating/evidence/db-proofs.json.
 */
import fs from 'node:fs'

const PROD_REF = 'gndnldyfudbytbboxesk'
const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const URL = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (URL.includes(PROD_REF)) throw new Error('SAFETY STOP: prod')

const EVENT_ID = '768788e0-8358-490a-8bba-d9920e675b92' // comedy-paid

const anonH = { apikey: ANON, authorization: `Bearer ${ANON}`, 'content-type': 'application/json' }
const svcH = { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }

async function reserve(seatIds) {
  const res = await fetch(`${URL}/rest/v1/rpc/create_seat_reservation`, {
    method: 'POST',
    headers: anonH,
    body: JSON.stringify({ p_event_id: EVENT_ID, p_user_id: null, p_seat_ids: seatIds, p_ttl_minutes: 10, p_session_id: 'proof-session-' + Math.random().toString(36).slice(2) }),
  })
  return { status: res.status, body: await res.json() }
}

async function q(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: svcH })
  return res.json()
}

const proofs = { generatedAt: new Date().toISOString(), eventId: EVENT_ID }

// ── 1. Concurrency: same seat, two simultaneous buyers ───────────────────────
const seats = await q(`seats?event_id=eq.${EVENT_ID}&status=eq.available&select=id,row_label,seat_number&order=row_label,seat_number&limit=3`)
if (seats.length < 3) throw new Error('Not enough available seats for the battery')
const target = seats[0]

const [a, b] = await Promise.all([reserve([target.id]), reserve([target.id])])
const successes = [a, b].filter(r => r.body?.success === true)
const failures = [a, b].filter(r => r.body?.success !== true)
proofs.concurrency = {
  seat: target,
  buyerA: a.body,
  buyerB: b.body,
  exactlyOneSucceeded: successes.length === 1 && failures.length === 1,
  loserMessage: failures[0]?.body?.error ?? null,
  seatRowAfter: (await q(`seats?id=eq.${target.id}&select=id,row_label,seat_number,status,reservation_id`))[0],
  reservationRows: await q(
    `reservations?id=eq.${successes[0]?.body?.reservation_id}&select=id,status,expires_at,items`,
  ),
}

// ── 2. Adversarial: non-existent seat, then an unavailable seat ─────────────
const ghost = await reserve(['00000000-0000-4000-8000-00000000dead'])
const takenAgain = await reserve([target.id]) // now 'reserved', not available
proofs.adversarial = {
  nonExistentSeat: { rejected: ghost.body?.success !== true, response: ghost.body },
  unavailableSeat: { rejected: takenAgain.body?.success !== true, response: takenAgain.body },
}

// ── 3. Hold expiry: abandoned hold returns to available ─────────────────────
const expirySeat = seats[1]
const hold = await reserve([expirySeat.id])
if (hold.body?.success !== true) throw new Error('Expiry setup hold failed')
const holdReservationId = hold.body.reservation_id

// Simulate the buyer walking away past the TTL: backdate the expiry (the
// exact state the cron meets a minute after a real 10-minute hold lapses).
await fetch(`${URL}/rest/v1/reservations?id=eq.${holdReservationId}`, {
  method: 'PATCH',
  headers: { ...svcH, prefer: 'return=minimal' },
  body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
})
const before = (await q(`seats?id=eq.${expirySeat.id}&select=id,status,reservation_id`))[0]
const releaseRes = await fetch(`${URL}/rest/v1/rpc/release_expired_seat_reservations`, {
  method: 'POST', headers: svcH, body: '{}',
})
const releasedCount = await releaseRes.json()
const after = (await q(`seats?id=eq.${expirySeat.id}&select=id,status,reservation_id`))[0]
proofs.holdExpiry = {
  seat: expirySeat,
  reservationId: holdReservationId,
  seatWhileHeld: before,
  releasedCountFromRpc: releasedCount,
  seatAfterRelease: after,
  returnedToAvailable: after?.status === 'available' && after?.reservation_id === null,
  reservationAfter: (await q(`reservations?id=eq.${holdReservationId}&select=id,status,expires_at`))[0],
}

// ── Cleanup: free the concurrency seat so the catalogue stays clean ─────────
if (successes[0]?.body?.reservation_id) {
  await fetch(`${URL}/rest/v1/reservations?id=eq.${successes[0].body.reservation_id}`, {
    method: 'PATCH',
    headers: { ...svcH, prefer: 'return=minimal' },
    body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
  })
  await fetch(`${URL}/rest/v1/rpc/release_expired_seat_reservations`, { method: 'POST', headers: svcH, body: '{}' })
  proofs.cleanup = { concurrencySeatFinal: (await q(`seats?id=eq.${target.id}&select=id,status`))[0] }
}

fs.mkdirSync('docs/seating/evidence', { recursive: true })
fs.writeFileSync('docs/seating/evidence/db-proofs.json', JSON.stringify(proofs, null, 2))

const pass =
  proofs.concurrency.exactlyOneSucceeded &&
  proofs.adversarial.nonExistentSeat.rejected &&
  proofs.adversarial.unavailableSeat.rejected &&
  proofs.holdExpiry.returnedToAvailable
console.log(JSON.stringify({
  concurrencyExactlyOne: proofs.concurrency.exactlyOneSucceeded,
  adversarialGhostRejected: proofs.adversarial.nonExistentSeat.rejected,
  adversarialTakenRejected: proofs.adversarial.unavailableSeat.rejected,
  holdExpiryReturned: proofs.holdExpiry.returnedToAvailable,
  ALL_GREEN: pass,
}, null, 2))
if (!pass) process.exit(1)
