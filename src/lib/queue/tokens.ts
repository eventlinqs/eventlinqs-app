import crypto from 'crypto'

/**
 * The dev-only signing secret. This constant is public (it lives in the repo),
 * so it must never be reachable in production: anyone could mint an admission
 * token with it and walk straight past the /events/<slug> queue gate in
 * `src/proxy.ts`. Outside production it keeps local runs and tests
 * deterministic.
 */
const DEV_FALLBACK_SECRET = 'dev-queue-secret-change-in-prod'

/**
 * Resolve the queue signing secret.
 *
 * Read per call rather than captured at module load, so a deployment missing
 * the secret fails closed on every request instead of baking one bad value in
 * for the life of the process.
 *
 * Returns null in production when QUEUE_SECRET is absent or empty (the
 * present-but-empty case is the silent-failure class the critical-env spec
 * exists to catch). Callers must treat null as fail-closed: refuse to ISSUE a
 * token, and refuse to HONOUR any token presented. Never fall back.
 */
function resolveSecret(): string | null {
  const fromEnv = process.env.QUEUE_SECRET
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv
  if (process.env.NODE_ENV === 'production') return null
  return DEV_FALLBACK_SECRET
}

/**
 * Generate an opaque position token to store in virtual_queue.position_token
 * at join time. Ties this slot to a specific event + session.
 */
export function generatePositionToken(eventId: string, sessionId: string): string {
  const secret = resolveSecret()
  if (!secret) throw new Error('QUEUE_SECRET is not set: refusing to mint a queue position token')
  const nonce = crypto.randomBytes(16).toString('hex')
  const mac = crypto
    .createHmac('sha256', secret)
    .update(`${eventId}:${sessionId}:${nonce}`)
    .digest('hex')
  return `${nonce}.${mac}`
}

/**
 * Generate a short-lived admission token once a user is admitted.
 * Encoded as base64url(queueId:eventId:expiresAtMs:hmacHex).
 */
export function generateAdmissionToken(
  queueId: string,
  eventId: string,
  expiresAtMs: number
): string {
  const secret = resolveSecret()
  if (!secret) throw new Error('QUEUE_SECRET is not set: refusing to mint a queue admission token')
  const payload = `${queueId}:${eventId}:${expiresAtMs}`
  const mac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${mac}`).toString('base64url')
}

/**
 * Validate an admission token. Returns the embedded queueId + eventId on success.
 * Rejects tampered, expired, or malformed tokens.
 */
export function validateAdmissionToken(
  token: string
): { valid: true; queueId: string; eventId: string } | { valid: false } {
  // Fail closed: with no secret in production, no token is ever honoured, so
  // every visitor is sent to the queue rather than admitted on a forged token.
  const secret = resolveSecret()
  if (!secret) return { valid: false }
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8')
    // Format: queueId:eventId:expiresAtMs:hmacHex
    // UUIDs contain hyphens but no colons, so split at the last 2 colons
    const lastColon = raw.lastIndexOf(':')
    const secondLastColon = raw.lastIndexOf(':', lastColon - 1)
    if (lastColon === -1 || secondLastColon === -1) return { valid: false }

    const mac = raw.slice(lastColon + 1)
    const expiresAtMsStr = raw.slice(secondLastColon + 1, lastColon)
    const rest = raw.slice(0, secondLastColon)
    // rest = queueId:eventId - split on first colon
    const firstColon = rest.indexOf(':')
    if (firstColon === -1) return { valid: false }
    const queueId = rest.slice(0, firstColon)
    const eventId = rest.slice(firstColon + 1)

    const expiresAtMs = parseInt(expiresAtMsStr, 10)
    if (isNaN(expiresAtMs) || Date.now() > expiresAtMs) return { valid: false }

    const payload = `${queueId}:${eventId}:${expiresAtMs}`
    const expectedMacBuf = Buffer.from(
      crypto.createHmac('sha256', secret).update(payload).digest('hex'),
      'hex'
    )
    const macBuf = Buffer.from(mac, 'hex')
    if (
      macBuf.length !== expectedMacBuf.length ||
      !crypto.timingSafeEqual(macBuf, expectedMacBuf)
    ) {
      return { valid: false }
    }

    return { valid: true, queueId, eventId }
  } catch {
    return { valid: false }
  }
}
