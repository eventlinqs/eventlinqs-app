/**
 * Broadcast Layer share-code primitives: pure and client-safe. The server
 * side (minting, resolution, recording) lives in share-links.ts; this module
 * holds the constants and validators both sides share, so the client beacon
 * and share bar never pull server-only imports into the browser bundle.
 */

export const SHARE_CHANNELS = [
  'instagram',
  'facebook',
  'linkedin',
  'x',
  'whatsapp',
  'messenger',
  'email',
  'sms',
  'copy',
  'native',
  'qr',
  'other',
] as const

export type ShareChannel = (typeof SHARE_CHANNELS)[number]

export function isShareChannel(value: unknown): value is ShareChannel {
  return typeof value === 'string' && (SHARE_CHANNELS as readonly string[]).includes(value)
}

/** The share attribution cookie: the last tracked link the browser followed.
 * Last touch wins for CHANNEL attribution (the most recent share that led to
 * the purchase gets the sale), distinct from the first-touch el_ref signup
 * cookies in lib/growth/referrals, which keep crediting the original referrer. */
export const SHARE_COOKIE = 'el_share_code'
export const SHARE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export const SHARE_CODE_LENGTH = 10
const SHARE_CODE_RE = /^[0-9A-Za-z]{10}$/

/** Strict format gate. Anything that fails this never reaches the database. */
export function isValidShareCode(code: unknown): code is string {
  return typeof code === 'string' && SHARE_CODE_RE.test(code)
}

/** The absolute short URL for a code. */
export function buildShortUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/s/${code}`
}
