/**
 * Webhook signature probe: does a deployment accept a given signing secret?
 *
 * Sends a synthetic `sentinel.probe` event, signed with the Stripe scheme, to a
 * deployment's real /api/webhooks/stripe route. `sentinel.probe` is an unmatched
 * event type, so the route verifies the signature and then logs-and-ignores it:
 * it moves no money, writes no order, and touches no seat. The funds-holding
 * engine is not exercised at all.
 *
 * Reading the result:
 *   200 = the signature verified. The deployment accepts this secret.
 *   400 = signature verification FAILED. This is the drift signature: Stripe is
 *         signing with a secret the deployment does not hold, so every real
 *         delivery 400s while payments keep succeeding and paid orders sit
 *         `pending`. (docs/payments/WEBHOOK-CANON.md)
 *
 * Usage:
 *   node scripts/verify/webhook-signature-probe.mjs <url> <secret> [--invalid]
 *
 * --invalid deliberately corrupts the signature to prove the negative case:
 * a bad signature must still be rejected once multiple secrets are configured.
 */
import crypto from 'node:crypto'

const [, , url, secret, ...flags] = process.argv
if (!url || !secret) {
  console.error('usage: node scripts/verify/webhook-signature-probe.mjs <url> <secret> [--invalid]')
  process.exit(1)
}
const invalid = flags.includes('--invalid')

const payload = JSON.stringify({
  id: `evt_probe_${crypto.randomBytes(8).toString('hex')}`,
  object: 'event',
  api_version: '2026-03-25.dahlia',
  created: Math.floor(Date.now() / 1000),
  type: 'sentinel.probe',
  livemode: false,
  data: { object: { id: 'probe', object: 'probe' } },
})

const timestamp = Math.floor(Date.now() / 1000)
let mac = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
if (invalid) {
  // Flip the last hex digit: structurally valid header, wrong signature.
  mac = mac.slice(0, -1) + (mac.slice(-1) === '0' ? '1' : '0')
}

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'stripe-signature': `t=${timestamp},v1=${mac}`,
  },
  body: payload,
})

const body = await res.text()
const fpSecret = crypto.createHash('sha256').update(secret).digest('hex').slice(0, 10)
const verdict =
  res.status === 200
    ? invalid ? 'UNEXPECTED: an invalid signature was ACCEPTED' : 'ACCEPTED (signature verified)'
    : res.status === 400
      ? invalid ? 'REJECTED as expected (invalid signature)' : 'REJECTED (signature mismatch - DRIFT)'
      : 'UNEXPECTED STATUS'

console.log(`url        : ${url}`)
console.log(`secret fp  : ${fpSecret}${invalid ? '  (signature deliberately corrupted)' : ''}`)
console.log(`http       : ${res.status}`)
console.log(`body       : ${body.slice(0, 200)}`)
console.log(`verdict    : ${verdict}`)

const pass = invalid ? res.status === 400 : res.status === 200
// exitCode rather than process.exit(): an abrupt exit while the fetch socket is
// still closing trips a libuv assertion on Windows and loses the real code.
process.exitCode = pass ? 0 : 2
