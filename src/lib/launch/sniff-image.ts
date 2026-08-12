/**
 * Magic-byte image sniffing for the anonymous upload endpoint.
 *
 * The declared Content-Type on a multipart upload is attacker-controlled and is
 * never consulted. This reads the real container from the leading bytes.
 *
 * Extracted from the route so it can be tested directly: it is the first
 * security control an untrusted upload meets, and a control nothing exercises
 * is a control nobody knows works.
 *
 * SVG IS DELIBERATELY ABSENT, and the omission is stated rather than left
 * silent because Humanitix accepts SVG ("Accepted formats are JPEG, PNG, or
 * SVG", help article 8892493, fetched 9 August 2026) and somebody will ask why
 * we do not. SVG is XML, not a raster: it can carry script, event handlers and
 * external entity references, and it executes when opened directly in a
 * browser. This endpoint is unauthenticated and the bucket it writes to is
 * publicly readable, so accepting SVG would let a stranger host executing
 * content on our own storage domain. No organiser needs that badly enough.
 */

export type SniffedFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'heic'

/** The ISO base media brands that mean AVIF rather than HEIC. */
const AVIF_BRANDS = new Set(['avif', 'avis'])
/** The ISO base media brands an iPhone writes. */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'])

export function sniffImage(bytes: Buffer | Uint8Array): SniffedFormat | null {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (buf.length < 12) return null

  // JPEG: SOI marker followed by any marker byte.
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'

  // PNG: the 8-byte signature, of which the first four are enough here.
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'

  // WebP: a RIFF container whose form type is WEBP. Both must match, because
  // RIFF alone is also WAV and AVI.
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    return 'webp'
  }

  // AVIF and HEIC share the ISO base media container; the brand at offset 8
  // separates them.
  if (buf.toString('latin1', 4, 8) === 'ftyp') {
    const brand = buf.toString('latin1', 8, 12)
    if (AVIF_BRANDS.has(brand)) return 'avif'
    if (HEIC_BRANDS.has(brand)) return 'heic'
  }

  return null
}
