import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { dhashDistance, photoHashes } from '@/lib/images/photo-hash'

/*
 * NO PHOTO IS EVER REUSED (Lawal's ruling of 31 October 2026, 00:14; the photo system's P1): a photo is the SHA-256 of
 * its bytes and its 64-bit difference hash, so a resized or re-encoded copy is still the same photo. Real files, never
 * a mock (the 8 August 2026 law on a user-content path): the library's own output is what is judged.
 */

const AFROBEATS = readFileSync(resolve(process.cwd(), 'public/images/hero/afrobeats.jpg'))
const AMAPIANO = readFileSync(resolve(process.cwd(), 'public/images/hero/amapiano.jpg'))

describe('a photo is its bytes and its picture', () => {
  it('names the bytes by their SHA-256 in hex', async () => {
    const { sha256 } = await photoHashes(AFROBEATS)
    expect(sha256).toMatch(/^[0-9a-f]{64}$/)
    expect((await photoHashes(Buffer.from(AFROBEATS))).sha256).toBe(sha256)
  })

  it('gives a 64-bit difference hash as a signed bigint string, the column the database holds', async () => {
    const { dhash } = await photoHashes(AFROBEATS)
    const n = BigInt(dhash)
    expect(n >= -(2n ** 63n) && n < 2n ** 63n).toBe(true)
  })

  it('a resized, re-encoded copy has other bytes but the same picture, within 6 of 64 bits', async () => {
    const copy = await sharp(AFROBEATS).resize({ width: 640 }).webp({ quality: 60 }).toBuffer()
    const a = await photoHashes(AFROBEATS)
    const b = await photoHashes(copy)
    expect(b.sha256).not.toBe(a.sha256)
    expect(dhashDistance(a.dhash, b.dhash)).toBeLessThanOrEqual(6)
  })

  it('another photograph is a different picture, well beyond 6 bits', async () => {
    const a = await photoHashes(AFROBEATS)
    const b = await photoHashes(AMAPIANO)
    expect(dhashDistance(a.dhash, b.dhash)).toBeGreaterThan(12)
  })
})
