import crypto from 'crypto'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  generateAdmissionToken,
  generatePositionToken,
  validateAdmissionToken,
} from '@/lib/queue/tokens'

/**
 * Proves the queue signing secret cannot fall back to the public dev constant
 * in production.
 *
 * The bypass this guards: `dev-queue-secret-change-in-prod` is committed to the
 * repo, and `src/proxy.ts` admits any request carrying a token that validates.
 * So if production ever signs with that constant, anyone reading the repo can
 * mint an admission token and skip the /events/<slug> queue gate entirely.
 */

const PUBLIC_DEV_SECRET = 'dev-queue-secret-change-in-prod'
const REAL_SECRET = 'a'.repeat(64)

/** Mint an admission token with an arbitrary secret, mirroring the real format. */
function mintWith(secret: string, queueId: string, eventId: string, expiresAtMs: number): string {
  const payload = `${queueId}:${eventId}:${expiresAtMs}`
  const mac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${mac}`).toString('base64url')
}

const future = () => Date.now() + 5 * 60 * 1000

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('queue token secret resolution', () => {
  test('production without QUEUE_SECRET refuses to mint tokens', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QUEUE_SECRET', '')

    expect(() => generateAdmissionToken('q1', 'e1', future())).toThrow(/QUEUE_SECRET is not set/)
    expect(() => generatePositionToken('e1', 's1')).toThrow(/QUEUE_SECRET is not set/)
  })

  test('production without QUEUE_SECRET rejects a token forged with the public dev secret', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QUEUE_SECRET', '')

    const forged = mintWith(PUBLIC_DEV_SECRET, 'q1', 'e1', future())
    expect(validateAdmissionToken(forged).valid).toBe(false)
  })

  test('production WITH QUEUE_SECRET rejects the public-dev-secret forgery but honours the real one', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QUEUE_SECRET', REAL_SECRET)

    const forged = mintWith(PUBLIC_DEV_SECRET, 'q1', 'e1', future())
    expect(validateAdmissionToken(forged).valid).toBe(false)

    const genuine = mintWith(REAL_SECRET, 'q1', 'e1', future())
    const result = validateAdmissionToken(genuine)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.queueId).toBe('q1')
      expect(result.eventId).toBe('e1')
    }
  })

  test('a whitespace-only QUEUE_SECRET is treated as absent, not as a secret', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QUEUE_SECRET', '   ')

    expect(() => generateAdmissionToken('q1', 'e1', future())).toThrow(/QUEUE_SECRET is not set/)
  })

  test('an expired token is rejected even when correctly signed', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QUEUE_SECRET', REAL_SECRET)

    const expired = mintWith(REAL_SECRET, 'q1', 'e1', Date.now() - 1000)
    expect(validateAdmissionToken(expired).valid).toBe(false)
  })

  test('outside production the dev fallback still works, so local runs are unaffected', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('QUEUE_SECRET', '')

    const token = generateAdmissionToken('q1', 'e1', future())
    expect(validateAdmissionToken(token).valid).toBe(true)
    expect(generatePositionToken('e1', 's1')).toMatch(/^[0-9a-f]{32}\.[0-9a-f]{64}$/)
  })
})
