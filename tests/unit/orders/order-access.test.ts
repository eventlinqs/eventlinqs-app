import { describe, expect, test, afterEach, vi } from 'vitest'
import {
  mintOrderAccessToken,
  verifyOrderAccessToken,
  orderAccessUrl,
  orderAccessConfigured,
} from '@/lib/orders/order-access'

/**
 * THE GUEST'S KEY TO THEIR OWN ORDER.
 *
 * A buyer who checks out as a guest has no account, so before 29 August 2026
 * every ownership check answered no: they were offered a "Request a refund"
 * button, allowed to write a reason, and then told to sign in as the purchaser.
 * Guest checkout creates no account, so that was impossible. Journey 4.
 *
 * This token is now the only thing standing between a stranger and somebody
 * else's order, so the properties below are the ones that matter. Each is here
 * because getting it wrong has a name:
 *
 *   scoped      a token for order A must not open order B, or one leaked link
 *               becomes a key to the whole table
 *   fail closed with no secret in production it must refuse to mint AND refuse
 *               to honour, never fall back to the public dev constant
 *   opaque      not derivable without the secret
 */

const ORDER_A = '11111111-1111-4111-8111-111111111111'
const ORDER_B = '22222222-2222-4222-8222-222222222222'

/*
 * vi.stubEnv rather than assigning process.env directly: Node refuses a bare
 * defineProperty on process.env ("only accepts a configurable, writable, and
 * enumerable data descriptor"), and NODE_ENV has to move for the fail-closed
 * tests to mean anything.
 */
afterEach(() => {
  vi.unstubAllEnvs()
})

function setEnv(secret: string | undefined, nodeEnv: string) {
  vi.stubEnv('NODE_ENV', nodeEnv)
  if (secret === undefined) vi.stubEnv('ORDER_ACCESS_SECRET', '')
  else vi.stubEnv('ORDER_ACCESS_SECRET', secret)
}

describe('the token opens exactly one order', () => {
  test('verifies for the order it was minted for', () => {
    setEnv('a-secret-long-enough-for-the-shape-check', 'production')
    const token = mintOrderAccessToken(ORDER_A)
    expect(token).toBeTruthy()
    expect(verifyOrderAccessToken(ORDER_A, token)).toBe(true)
  })

  test('does NOT open a different order', () => {
    setEnv('a-secret-long-enough-for-the-shape-check', 'production')
    const token = mintOrderAccessToken(ORDER_A)
    expect(
      verifyOrderAccessToken(ORDER_B, token),
      'a token minted for one order opened another: one leaked link would be a key to every order',
    ).toBe(false)
  })

  test('a different secret produces a different token', () => {
    setEnv('secret-number-one-long-enough-for-shape', 'production')
    const first = mintOrderAccessToken(ORDER_A)
    setEnv('secret-number-two-long-enough-for-shape', 'production')
    const second = mintOrderAccessToken(ORDER_A)
    expect(first).not.toBe(second)
    // Rotating the secret is the revocation mechanism, so the old link must die.
    expect(verifyOrderAccessToken(ORDER_A, first)).toBe(false)
  })

  test('rejects rubbish without throwing', () => {
    setEnv('a-secret-long-enough-for-the-shape-check', 'production')
    for (const bad of ['', 'x', 'z'.repeat(40), 'null', undefined, null]) {
      expect(verifyOrderAccessToken(ORDER_A, bad as string | null | undefined)).toBe(false)
    }
  })
})

describe('with no secret in production it fails closed', () => {
  test('refuses to mint', () => {
    setEnv(undefined, 'production')
    expect(orderAccessConfigured()).toBe(false)
    expect(mintOrderAccessToken(ORDER_A)).toBeNull()
    expect(orderAccessUrl('https://x.test', ORDER_A)).toBeNull()
  })

  test('refuses to HONOUR a token minted elsewhere', () => {
    // The dangerous case: a token minted where the dev fallback WAS reachable,
    // presented to a production deployment that has no secret. If the fallback
    // were reachable there, anyone could mint a key to any order.
    setEnv(undefined, 'development')
    const devToken = mintOrderAccessToken(ORDER_A)
    expect(devToken).toBeTruthy()
    setEnv(undefined, 'production')
    expect(
      verifyOrderAccessToken(ORDER_A, devToken),
      'production honoured a token signed with the PUBLIC dev constant',
    ).toBe(false)
  })

  test('outside production the dev fallback keeps local runs working', () => {
    setEnv(undefined, 'development')
    expect(orderAccessConfigured()).toBe(true)
    const token = mintOrderAccessToken(ORDER_A)
    expect(verifyOrderAccessToken(ORDER_A, token)).toBe(true)
  })
})

describe('the link a buyer follows', () => {
  test('points at their order and carries the token', () => {
    setEnv('a-secret-long-enough-for-the-shape-check', 'production')
    const url = orderAccessUrl('https://www.eventlinqs.com.au/', ORDER_A)
    expect(url).toContain(`/orders/${ORDER_A}/confirmation?t=`)
    // No double slash from a trailing-slash site URL.
    expect(url).not.toContain('.au//orders')
    const token = new URL(url as string).searchParams.get('t')
    expect(verifyOrderAccessToken(ORDER_A, token)).toBe(true)
  })
})
