import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * THE ORGANISER'S SECURE PHOTO LINK (Lawal, 12 November 2026, 12:01, item 2: "Each organiser draft carries the PHOTO
 * PERMISSION request in his format: their secure link to upload their own photos and choose the uses (media permissions,
 * order 4 item 6), recorded per grant").
 *
 * /photos/<contact id>/<proof>. The proof is derived from the contact's own unsubscribe token, which is random, kept on
 * their contact row and only ever written into messages to them: sha256 of "photos:" and the token, first 32 hex. It
 * needs no new secret and no new column, it opens nothing but that contact's photo page, and it cannot be turned back
 * into the token (so the photo link never works as an unsubscribe link). A page that does not match answers 404.
 * Pure.
 */

export function photoProof(unsubscribeToken: string): string {
  return createHash('sha256').update(`photos:${unsubscribeToken}`).digest('hex').slice(0, 32)
}

export function photoPath(contactId: string, unsubscribeToken: string): string {
  return `/photos/${contactId}/${photoProof(unsubscribeToken)}`
}

/** True only when the given proof is the one for this token; compared in constant time. */
export function proofMatches(given: string, unsubscribeToken: string | null): boolean {
  if (!unsubscribeToken || !/^[0-9a-f]{32}$/.test(given)) return false
  const want = Buffer.from(photoProof(unsubscribeToken), 'utf8')
  const got = Buffer.from(given, 'utf8')
  return want.length === got.length && timingSafeEqual(want, got)
}
