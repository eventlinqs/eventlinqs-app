import { describe, expect, test } from 'vitest'
import { encodeForClient, exec, wantsBase64 } from '../../../scripts/verify/upstash-local-stub.mjs'

/**
 * THE GATE'S OWN REDIS STUB MUST SPEAK THE CLIENT'S ENCODING.
 *
 * 12 September 2026: the first route sweep run against the pre-push gate's
 * served build reported /api/health/redis answering 503 with
 * `result: "<(F"`. The @upstash/redis client defaults to base64 responses,
 * sends `Upstash-Encoding: base64`, and decodes every string it gets back; the
 * stub answered PING with a plain "PONG", which decodes to those three bytes.
 * The rate limiter never noticed because INCR answers a number. These hold the
 * stub to what Upstash does: strings encoded when asked, numbers and null left
 * alone, arrays element by element, and nothing touched without the header.
 */
describe('encodeForClient', () => {
  test('a string is base64-encoded when the client asked for base64, which is what the real service does', () => {
    expect(encodeForClient('PONG', true)).toBe(Buffer.from('PONG', 'utf8').toString('base64'))
    expect(Buffer.from(String(encodeForClient('PONG', true)), 'base64').toString('utf8')).toBe('PONG')
  })

  test('numbers and null travel as they are, and an array is encoded element by element', () => {
    expect(encodeForClient(7, true)).toBe(7)
    expect(encodeForClient(null, true)).toBeNull()
    expect(encodeForClient(['OK', 3, null], true)).toEqual([Buffer.from('OK').toString('base64'), 3, null])
  })

  test('without the header nothing is touched, so the gate ping that posts a bare PING still reads PONG', () => {
    expect(encodeForClient('PONG', false)).toBe('PONG')
    expect(encodeForClient(['OK', 3], false)).toEqual(['OK', 3])
  })
})

describe('wantsBase64 and the commands', () => {
  test('the header is read case-insensitively in its value, and is absent by default', () => {
    expect(wantsBase64({ 'upstash-encoding': 'base64' })).toBe(true)
    expect(wantsBase64({ 'upstash-encoding': 'BASE64' })).toBe(true)
    expect(wantsBase64({})).toBe(false)
    expect(wantsBase64({ 'upstash-encoding': 'plain' })).toBe(false)
  })

  test('PING answers PONG, INCR counts, and an unknown command answers null', () => {
    expect(exec(['PING'])).toBe('PONG')
    expect(exec(['INCR', 'test:counter'])).toBe(1)
    expect(exec(['INCR', 'test:counter'])).toBe(2)
    expect(exec(['NOPE'])).toBeNull()
  })
})
