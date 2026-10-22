import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * THE SIGNED REQUEST OF BOOKEDPROOF'S ORGANISER READ (E51).
 *
 * The contract (C:\dev\EVIDENCE\WI1\EL-BOOKEDPROOF-ORGANISER-READ-CONTRACT.md,
 * sections 2 and 8, reconciled by the project manager at 10:05 on 23 October
 * 2026): the caller signs "<timestamp>.<raw body>" with HMAC-SHA256 under the
 * shared secret, sends the timestamp in X-EventLinqs-Timestamp and "v1=" plus the
 * lower-case hex in X-EventLinqs-Signature. The secret is used as text (its
 * UTF-8 bytes), never hex-decoded, exactly as window 1's fixed vector does.
 *
 * Refused with one word and nothing more: `unsigned` (a header missing),
 * `stale` (more than 300 seconds from the server's clock, either way) or
 * `bad-signature` (anything else that does not verify). The comparison runs in
 * constant time. No replay store: the endpoint only reads, over TLS (10:05 (1)).
 */

export const TIMESTAMP_HEADER = 'x-eventlinqs-timestamp'
export const SIGNATURE_HEADER = 'x-eventlinqs-signature'
export const SIGNATURE_WINDOW_SECONDS = 300

export type SignatureVerdict = { ok: true } | { ok: false; reason: 'unsigned' | 'stale' | 'bad-signature' }

const hmacHex = (secret: string, text: string) => createHmac('sha256', secret).update(text, 'utf8').digest('hex')

/** The signature header value for a body, as the caller sends it. */
export function signatureFor(secret: string, timestamp: string, rawBody: string): string {
  return `v1=${hmacHex(secret, `${timestamp}.${rawBody}`)}`
}

export function verifySignature(input: {
  secret: string
  timestamp: string | null
  signature: string | null
  rawBody: string
  now: Date
}): SignatureVerdict {
  const { secret, timestamp, signature, rawBody, now } = input
  if (!timestamp || !signature) return { ok: false, reason: 'unsigned' }
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: 'bad-signature' }
  const skew = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp))
  if (skew > SIGNATURE_WINDOW_SECONDS) return { ok: false, reason: 'stale' }
  if (!/^v1=[0-9a-f]{64}$/.test(signature)) return { ok: false, reason: 'bad-signature' }
  const expected = Buffer.from(signatureFor(secret, timestamp, rawBody), 'utf8')
  const given = Buffer.from(signature, 'utf8')
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'bad-signature' }
  return { ok: true }
}

/**
 * An order's key in the response: the HMAC of its id under the same secret,
 * stable for one order and never the id itself (the 10:05 (3)). Section 8's
 * vector: "order-0001" keys to d56b4e5b...85b02.
 */
export function orderKey(secret: string, orderId: string): string {
  return hmacHex(secret, orderId)
}
