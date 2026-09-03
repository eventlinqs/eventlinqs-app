export type ParsedScan = { ticketCode: string; secret: string }

/*
 * THE DOOR MUST ACCEPT EVERY CODE THE DATABASE CAN ISSUE.
 *
 * This alphabet is a COPY of gen_ticket_code() in
 * supabase/migrations/20260517000001_ticketing_system_v1.sql:170:
 *
 *     alphabet CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
 *
 * FOUND 3 September 2026 by driving journey 6. The two had DRIFTED. The
 * generator emits U; this regex did not accept it, and it accepted L, which the
 * generator never emits. The consequence was not cosmetic:
 *
 *   measured on 128 real tickets, 30 of them, 23.4 percent, could not be
 *   admitted at the door AT ALL. The only offending character was U.
 *
 * It failed on BOTH paths, because parseScan and parseManual share isValidPair,
 * so scanning the QR was refused exactly like typing the code by hand. Roughly
 * one ticket holder in four would have been turned away holding a valid ticket,
 * and the door would have told them their code was invalid.
 *
 * The generator is authoritative because codes are already issued and cannot be
 * reissued, so this side is the side that moves. If the alphabet ever changes,
 * change it there and here together: tests/unit/scanner/ticket-code-alphabet.test.ts
 * fails when they disagree.
 */
const TICKET_CODE_RE = /^EL-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/
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
