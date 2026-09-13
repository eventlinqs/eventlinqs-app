/**
 * THE OPAQUE LINK CODE.
 *
 * WHY OPAQUE. The code is the primary key of the link and therefore the carrier
 * of the campaign, the channel, the partner and the recipient. A readable code
 * would leak all four to anybody the link is forwarded to, and a sequential one
 * would let a competitor count a client's campaigns by incrementing it. So it
 * is random, lowercase alphanumeric, and means nothing on its own.
 *
 * WHY NOT REUSE `share-codes.ts`. That module mints the codes an ORGANISER
 * presses Share to create, in two formats, one of them deliberately readable so
 * it can be printed and typed. Both properties are wrong here. The two
 * subsystems are kept apart on purpose; see BUILD-LOG-B.md, GA3 step 1.
 *
 * THE LENGTH IS CONFIGURATION. `marketing_attribution_config.link_code_length`
 * holds it, so it is read rather than typed, and the database CHECK on
 * `marketing_link.code` bounds it independently.
 */
import { randomBytes } from 'node:crypto'

/**
 * The alphabet. Lowercase and digits only: a code that differs from another
 * only by case is a code somebody transcribes wrongly off a screen, and the
 * database CHECK refuses anything else.
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** The shape the database enforces, kept here so a caller can check before writing. */
const CODE_SHAPE = /^[a-z0-9]{8,32}$/

export function isValidLinkCode(code: string): boolean {
  return CODE_SHAPE.test(code)
}

/**
 * Mints a code of the configured length.
 *
 * Rejection sampling rather than a modulo: 256 is not a multiple of 36, so
 * `byte % 36` would make the first four letters of the alphabet slightly more
 * likely than the rest. It costs nothing to do correctly and a biased code
 * space is the kind of thing nobody finds until it matters.
 */
export function mintLinkCode(length: number): string {
  if (!Number.isInteger(length) || length < 8 || length > 32) {
    throw new Error(`link code length must be an integer between 8 and 32, got ${length}`)
  }
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length
  let out = ''
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= limit) continue
      out += ALPHABET[byte % ALPHABET.length]
      if (out.length === length) break
    }
  }
  return out
}
