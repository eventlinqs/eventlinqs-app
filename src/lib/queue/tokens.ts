import crypto from 'crypto'

const secret = process.env.QUEUE_SECRET ?? 'dev-queue-secret-change-in-prod'

/**
 * Generate an opaque position token to store in virtual_queue.position_token
 * at join time. Ties this slot to a specific event + session.
 */
export function generatePositionToken(eventId: string, sessionId: string): string {
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
