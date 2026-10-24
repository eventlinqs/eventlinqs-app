import { describe, expect, test } from 'vitest'
import { orderKey, signatureFor, verifyBookedproofSignature } from '@/lib/connect/bookedproof/signature'

/**
 * E51, THE FIXED SIGNING VECTOR BOTH SIDES TEST AGAINST (the contract's
 * section 8, written by window 1 on 23 October 2026). These bytes are copied
 * from the contract, never recomputed here: a test that derived its expectation
 * with the function under test would pass for any HMAC at all.
 */

const SECRET = '06677f823493f4f6355c0c636489e7a0eca2e77ae0d54b1f3e1bfec887b0db3b'
const TIMESTAMP = '1792738800'
const BODY = '{"emails":["bp-vector-organiser@bookedproof.test"],"pages":[],"since":null}'
const SIGNATURE = 'v1=244e6db4d85690359509c76e76ad6459ff6d0a728db49202277d9fdd936e9894'
const SIGNED_AT = new Date('2026-10-23T07:00:00Z')

const verify = (over: Partial<Parameters<typeof verifyBookedproofSignature>[0]> = {}) =>
  verifyBookedproofSignature({ secret: SECRET, timestamp: TIMESTAMP, signature: SIGNATURE, rawBody: BODY, now: SIGNED_AT, ...over })

describe('the section 8 vector', () => {
  test('the body is the 75 bytes the contract names', () => {
    expect(Buffer.byteLength(BODY, 'utf8')).toBe(75)
    expect(Number(TIMESTAMP) * 1000).toBe(SIGNED_AT.getTime())
  })

  test('signs to the contract signature, the secret used as text', () => {
    expect(signatureFor(SECRET, TIMESTAMP, BODY)).toBe(SIGNATURE)
  })

  test('verifies at the moment it was signed', () => {
    expect(verify()).toEqual({ ok: true })
  })

  test('the body altered by one byte signs to the contract value and the vector signature is refused', () => {
    const altered = BODY.replace('organiser@', 'organisers@')
    expect(signatureFor(SECRET, TIMESTAMP, altered)).toBe(
      'v1=fd7d579250fdc2d8bc1e29c843ac083cc5833c5a2dac073ccdbc802e89575b0f',
    )
    expect(verify({ rawBody: altered })).toEqual({ ok: false, reason: 'bad-signature' })
  })

  test('the timestamp one second on signs to the contract value and the vector signature is refused', () => {
    expect(signatureFor(SECRET, '1792738801', BODY)).toBe(
      'v1=1101dada23d4dc338ec28d2c53edd9f500e92a685aed3bc5f03721a7c04c6c0c',
    )
    expect(verify({ timestamp: '1792738801' })).toEqual({ ok: false, reason: 'bad-signature' })
  })

  test('read 301 seconds after its timestamp it is stale, and at 300 it is not', () => {
    expect(verify({ now: new Date('2026-10-23T07:05:01Z') })).toEqual({ ok: false, reason: 'stale' })
    expect(verify({ now: new Date('2026-10-23T07:05:00Z') })).toEqual({ ok: true })
    expect(verify({ now: new Date('2026-10-23T06:54:59Z') })).toEqual({ ok: false, reason: 'stale' })
  })

  test('the order key of order-0001 is the contract value', () => {
    expect(orderKey(SECRET, 'order-0001')).toBe('d56b4e5bb94e63d3ee32b40d071b0b04bd38f05965323710bded6cd5b0085b02')
  })
})

describe('the refusals', () => {
  test('a missing header is unsigned', () => {
    expect(verify({ timestamp: null })).toEqual({ ok: false, reason: 'unsigned' })
    expect(verify({ signature: null })).toEqual({ ok: false, reason: 'unsigned' })
    expect(verify({ timestamp: '' })).toEqual({ ok: false, reason: 'unsigned' })
  })

  test('another secret, a missing version, upper-case hex or a short digest is a bad signature', () => {
    expect(verify({ secret: SECRET.replace(/^0/, '1') })).toEqual({ ok: false, reason: 'bad-signature' })
    expect(verify({ signature: SIGNATURE.slice(3) })).toEqual({ ok: false, reason: 'bad-signature' })
    expect(verify({ signature: SIGNATURE.toUpperCase().replace('V1=', 'v1=') })).toEqual({ ok: false, reason: 'bad-signature' })
    expect(verify({ signature: SIGNATURE.slice(0, -2) })).toEqual({ ok: false, reason: 'bad-signature' })
  })

  test('a timestamp that is not whole seconds is a bad signature, never a parse', () => {
    expect(verify({ timestamp: '1792738800.5' })).toEqual({ ok: false, reason: 'bad-signature' })
    expect(verify({ timestamp: '17927e5' })).toEqual({ ok: false, reason: 'bad-signature' })
  })
})
