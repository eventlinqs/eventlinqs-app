export type ParsedScan = { ticketCode: string; secret: string }

// Ticket codes are EL-XXXX-XXXX over a Crockford-ish alphabet (no I/O/0/1),
// matching gen_ticket_code() in the ticketing migration.
const TICKET_CODE_RE = /^EL-[ABCDEFGHJKLMNPQRSTVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTVWXYZ23456789]{4}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normaliseCode(code: string): string {
  return code.trim().toUpperCase()
}

function isValidPair(ticketCode: string, secret: string): boolean {
  return TICKET_CODE_RE.test(ticketCode) && UUID_RE.test(secret)
}

/**
 * Parses a scanned QR payload into a ticket code and secret. The bearer QR
 * encodes `https://<host>/t/<ticket_code>?k=<secret>` (any host, so staging and
 * preview links work). Returns null for anything that is not a well-formed
 * bearer link with a valid code and uuid secret.
 */
export function parseScan(raw: string): ParsedScan | null {
  const input = raw.trim()
  if (!input) return null

  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }

  const match = url.pathname.match(/^\/t\/([^/]+)\/?$/)
  if (!match) return null

  const ticketCode = normaliseCode(decodeURIComponent(match[1]))
  const secret = (url.searchParams.get('k') ?? '').trim()

  return isValidPair(ticketCode, secret) ? { ticketCode, secret } : null
}

/**
 * Parses manual entry: either a raw ticket code plus a separately typed secret,
 * or a full bearer URL pasted into the code field (in which case the secret
 * argument is ignored). Returns null if the result is not a valid pair.
 */
export function parseManual(code: string, secret: string): ParsedScan | null {
  const trimmed = code.trim()
  if (!trimmed) return null

  // Allow pasting a whole bearer URL into the code box.
  if (/^https?:\/\//i.test(trimmed)) {
    return parseScan(trimmed)
  }

  const ticketCode = normaliseCode(trimmed)
  const cleanSecret = secret.trim()
  return isValidPair(ticketCode, cleanSecret) ? { ticketCode, secret: cleanSecret } : null
}
