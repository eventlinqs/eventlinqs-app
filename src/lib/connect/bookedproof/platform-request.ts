/**
 * BOOKEDPROOF'S PLATFORM READ (trial gate T3, "day 1, connected"): which scope
 * is asked, which secret signs it, and the body of one page.
 *
 * The project manager's rulings of 26 October 2026, 22:35 (3) and 22:45 (3):
 * a signed, read only connection for Bookedproof alone that hands over the
 * organisers, the events, the checkout ledger and ONLY the buyers whose consent
 * wording names Bookedproof, never a write, EACH SCOPE ITS OWN SECRET, and every
 * read logged and shown to the owner in plain words. The signing is E51's
 * (signature.ts): HMAC-SHA256 of "<timestamp>.<raw body>", the same headers.
 *
 * The scope is the last segment of the path, so the secret is chosen before a
 * byte of the body is read, and a secret for one scope can never read another.
 *
 * The body of a page: {"after": <the last id of the page before> or null,
 * "limit": 1 to MAX_LIMIT}. Anything else is refused with its reason, never
 * guessed at. Every scope pages by its rows' own id, ascending, so a page is
 * stable while rows are added behind it.
 */

export const PLATFORM_SCOPES = ['organisations', 'events', 'buyers', 'ledger'] as const
export type PlatformScope = (typeof PLATFORM_SCOPES)[number]

/** The environment variable holding each scope's own secret. */
export const PLATFORM_SECRET_ENV: Record<PlatformScope, string> = {
  organisations: 'BOOKEDPROOF_PLATFORM_SECRET_ORGANISATIONS',
  events: 'BOOKEDPROOF_PLATFORM_SECRET_EVENTS',
  buyers: 'BOOKEDPROOF_PLATFORM_SECRET_BUYERS',
  ledger: 'BOOKEDPROOF_PLATFORM_SECRET_LEDGER',
}

export const DEFAULT_LIMIT = 200
export const MAX_LIMIT = 500

export function isPlatformScope(value: string): value is PlatformScope {
  return (PLATFORM_SCOPES as readonly string[]).includes(value)
}

/** The scope's secret, or null while it is unset (the route then answers 503). */
export function platformSecretFor(scope: PlatformScope, env: NodeJS.ProcessEnv = process.env): string | null {
  return env[PLATFORM_SECRET_ENV[scope]]?.trim() || null
}

export type PlatformPageRequest = { after: string | null; limit: number }
export type ParsedPageRequest = { ok: true; value: PlatformPageRequest } | { ok: false; reason: string }

/** An id or an address, as a scope's rows are keyed: no space, no quote, no comma. */
const CURSOR = /^[A-Za-z0-9@._+-]{1,320}$/

export function parsePlatformPageRequest(rawBody: string): ParsedPageRequest {
  let body: unknown
  try {
    body = rawBody.trim() === '' ? {} : JSON.parse(rawBody)
  } catch {
    return { ok: false, reason: 'the body is not JSON' }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'the body is not an object' }
  const unknown = Object.keys(body).filter((k) => !['after', 'limit'].includes(k))
  if (unknown.length > 0) return { ok: false, reason: `unknown field(s): ${unknown.join(', ')}` }
  const b = body as { after?: unknown; limit?: unknown }

  let after: string | null = null
  if (b.after !== undefined && b.after !== null) {
    if (typeof b.after !== 'string' || !CURSOR.test(b.after)) return { ok: false, reason: 'after must be the last key of the page before, or null' }
    after = b.after
  }

  let limit = DEFAULT_LIMIT
  if (b.limit !== undefined) {
    if (typeof b.limit !== 'number' || !Number.isInteger(b.limit) || b.limit < 1 || b.limit > MAX_LIMIT) {
      return { ok: false, reason: `limit must be a whole number from 1 to ${MAX_LIMIT}` }
    }
    limit = b.limit
  }
  return { ok: true, value: { after, limit } }
}
