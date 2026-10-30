import 'server-only'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

/**
 * WHAT A PHOTO IS, for "no photo is ever reused" (Lawal's ruling of 31 October 2026, 00:14; the photo system's P1):
 * the SHA-256 of its original bytes, and its 64-bit difference hash (dHash) so a resized or re-encoded copy is still the
 * same photo. public.photo_assignments holds both: a unique index on the first, and a near copy (6 bits of 64 or fewer
 * apart) refused on the second.
 *
 * dHash: the picture in greyscale at 9 by 8, each bit whether a pixel is darker than the one to its right. As a signed
 * bigint string, the shape of the bigint column it is written to.
 */
export async function photoHashes(bytes: Buffer): Promise<{ sha256: string; dhash: string }> {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const pixels = await sharp(bytes).rotate().greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer()
  let bits = 0n
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (pixels[y * 9 + x] < pixels[y * 9 + x + 1] ? 1n : 0n)
    }
  }
  return { sha256, dhash: BigInt.asIntN(64, bits).toString() }
}

/** How many of the 64 bits two difference hashes differ by. */
export function dhashDistance(a: string, b: string): number {
  let x = BigInt.asUintN(64, BigInt(a) ^ BigInt(b))
  let n = 0
  while (x > 0n) {
    n += Number(x & 1n)
    x >>= 1n
  }
  return n
}
