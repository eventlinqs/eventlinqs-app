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

function hashKey(): Buffer {
  const secret = process.env.ORDER_ACCESS_SECRET ?? ''
  if (!secret && !warnedAboutKey) {
    warnedAboutKey = true
    console.warn('[ledger] ORDER_ACCESS_SECRET is not set, so buyer hashes are unsalted on this deployment.')
  }
  return createHash('sha256').update(`eventlinqs.ledger.identity.v1:${secret}`).digest()
}

/** One person, told apart from another, without the ledger knowing who they are. */
export function identityHash(value: string | null | undefined): string | null {
  const normalised = (value ?? '').trim().toLowerCase()
  if (!normalised) return null
  return createHmac('sha256', hashKey()).update(normalised).digest('hex').slice(0, 32)
}

/** Reset the one-time warning, so a test can observe it more than once. */
export function forgetKeyWarning(): void {
  warnedAboutKey = false
}
