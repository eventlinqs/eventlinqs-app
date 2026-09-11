import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { forgetKeyWarning, identityFingerprints, identityHash } from '@/lib/ledger/identity'

/**
 * A BUYER HASHED WITHOUT THE KEY IS STILL THE SAME BUYER. Close-out D1,
 * 12 September 2026.
 *
 * The one approved production backfill ran in a shell with no
 * ORDER_ACCESS_SECRET, so its three sale rows carry a buyer_hash keyed with the
 * empty secret while every live sale on production is keyed with the real one.
 * The ledger is append only, so the rows stay as they are; what must not stay
 * is a comparison that can only see one of the two shapes. These hold that the
 * keyed and unkeyed hashes differ (the key does something), that the
 * fingerprint list carries both when a key is set and one when it is not, and
 * that a hash written without the key is found by a lookup made with it.
 */

const ADDRESS = 'Buyer@Example.com '
const original = process.env.ORDER_ACCESS_SECRET

beforeEach(() => forgetKeyWarning())
afterEach(() => {
  if (original === undefined) delete process.env.ORDER_ACCESS_SECRET
  else process.env.ORDER_ACCESS_SECRET = original
  forgetKeyWarning()
})

describe('identityFingerprints', () => {
  test('with a key set, the keyed hash comes first and differs from the unkeyed one', () => {
    process.env.ORDER_ACCESS_SECRET = 'a-real-secret-for-this-test'
    const keyed = identityHash(ADDRESS)
    const prints = identityFingerprints(ADDRESS)
    expect(prints).toHaveLength(2)
    expect(prints[0]).toBe(keyed)
    expect(prints[1]).not.toBe(keyed)
    expect(prints[1]).toMatch(/^[0-9a-f]{32}$/)
  })

  test('with no key set there is one shape, and it is the one identityHash writes', () => {
    delete process.env.ORDER_ACCESS_SECRET
    const unkeyed = identityHash(ADDRESS)
    expect(identityFingerprints(ADDRESS)).toEqual([unkeyed])
  })

  test('a row hashed on a deployment without the key is found by a lookup made with it', () => {
    delete process.env.ORDER_ACCESS_SECRET
    const writtenWithoutKey = identityHash(ADDRESS)
    process.env.ORDER_ACCESS_SECRET = 'a-real-secret-for-this-test'
    const lookup = identityFingerprints('buyer@example.com')
    expect(lookup).toContain(writtenWithoutKey)
    expect(identityFingerprints('')).toEqual([])
  })
})
