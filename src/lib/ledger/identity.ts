import { createHash, createHmac } from 'node:crypto'

/**
 * ONE PERSON, TOLD APART FROM ANOTHER, WITHOUT THE LEDGER KNOWING WHO THEY ARE.
 *
 * Every money row in the ledger carries a `buyer_hash` and never an address:
 * a `sale` and a `refund` record that somebody paid, not who they are. Only the
 * DEMAND rows carry an address, and only because a message cannot be delivered
 * to a hash.
 *
 * WHY THIS FILE EXISTS SEPARATELY, extracted 11 September 2026 for close-out D2.
 * It lived inside `adapter.ts`, which is the one file allowed to speak this
 * platform's vocabulary. The recovery engine has to ask "did the person who
 * abandoned at 10am buy at 11am", and that is a comparison between an address on
 * a demand row and a HASH on a sale row: without the same function the engine
 * would be reading a column that is always null and reporting a suppression
 * rule that could never fire. Extracting it is the difference between a rule
 * that holds and a rule that reads as though it does.
 *
 * KEYED, not plain. A plain sha256 of an address is reversible by anyone with a
 * list of addresses, which is everyone. The key is derived from a secret the
 * deployment already holds for an unrelated purpose, through a one way
 * derivation, so a hash here cannot be used against that secret's own purpose.
 *
 * With no secret at all the hash is still stable within a deployment and still
 * distinguishes one person from another, which is all the ledger asks of it; it
 * is simply not resistant to a dictionary attack by somebody who already has the
 * database. That case is reported once rather than passed over.
 */
let warnedAboutKey = false

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(`eventlinqs.ledger.identity.v1:${secret}`).digest()
}

function hashKey(): Buffer {
  const secret = process.env.ORDER_ACCESS_SECRET ?? ''
  if (!secret && !warnedAboutKey) {
    warnedAboutKey = true
    console.warn('[ledger] ORDER_ACCESS_SECRET is not set, so buyer hashes are unsalted on this deployment.')
  }
  return keyFrom(secret)
}

function hmacWith(key: Buffer, normalised: string): string {
  return createHmac('sha256', key).update(normalised).digest('hex').slice(0, 32)
}

/** One person, told apart from another, without the ledger knowing who they are. */
export function identityHash(value: string | null | undefined): string | null {
  const normalised = (value ?? '').trim().toLowerCase()
  if (!normalised) return null
  return hmacWith(hashKey(), normalised)
}

/**
 * EVERY HASH THIS ADDRESS MAY CARRY ON A MONEY ROW, keyed first.
 *
 * WHY, 12 September 2026, close-out D1. The one approved production backfill
 * ran in a shell that held no ORDER_ACCESS_SECRET, so its three sale rows were
 * hashed with the EMPTY key while every live sale on production is hashed with
 * the real one. The ledger is append only by law, so those rows cannot be
 * rewritten, and a comparison that knew only the keyed hash would never again
 * recognise those two buyers: the engine's "never anyone who already bought"
 * would have quietly stopped holding for them, on the one slot D1 names.
 *
 * So the question "did this person buy" is asked with BOTH shapes when a key is
 * set: the keyed hash, and the hash a deployment without the key would have
 * written. Nothing is stored in the weaker shape by this function, and nothing
 * about the stored rows changes; only the comparison widens, to exactly the two
 * shapes a row can have. With no key set there is one shape and one answer.
 */
export function identityFingerprints(value: string | null | undefined): string[] {
  const normalised = (value ?? '').trim().toLowerCase()
  if (!normalised) return []
  const secret = process.env.ORDER_ACCESS_SECRET ?? ''
  const keyed = hmacWith(hashKey(), normalised)
  if (!secret) return [keyed]
  return [keyed, hmacWith(keyFrom(''), normalised)]
}

/** Reset the one-time warning, so a test can observe it more than once. */
export function forgetKeyWarning(): void {
  warnedAboutKey = false
}
