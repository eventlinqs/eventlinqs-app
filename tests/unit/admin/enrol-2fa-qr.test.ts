/**
 * THE ENROLMENT QR (close-out UX5).
 *
 * `/admin/enrol-2fa` told every new administrator to "scan the QR code" and
 * drew nothing to scan, so the real instruction was to type a 32 character
 * base32 secret off a laptop screen into a phone, on the one screen where a
 * typo locks you out of the admin console.
 *
 * The driven proof (`scripts/verify/ux5-enrol-2fa-proof.mjs`) rasterises the QR
 * as the browser paints it and decodes it with jsQR at 390, 768 and 1440. These
 * tests hold the half a browser is not needed for, and they hold it at the
 * SOURCE rather than at the screen:
 *
 *   - the picture decodes back to exactly the URI it was built from, so the
 *     encode step is proven rather than trusted;
 *   - the URI carries the secret printed beside it, so the picture and the text
 *     can never enrol different secrets;
 *   - the secret in the URI is a working RFC 6238 secret, checked by computing
 *     a code here and verifying it with the application's verifier. A QR that
 *     decodes perfectly to a secret nothing accepts is still a lockout;
 *   - the injected SVG carries nothing executable, because it reaches the page
 *     through dangerouslySetInnerHTML.
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import QRCode from 'qrcode'
import sharp from 'sharp'
import jsQR from 'jsqr'
import { generateTotpSecret, verifyTotp } from '@/lib/admin/totp'

/**
 * The exact options the page uses. Kept here so a change to either side that
 * breaks decodability fails a test rather than a person's camera.
 */
const QR_OPTIONS = {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 1,
  color: { dark: '#0A1628', light: '#FFFFFF' },
} as const

async function decodeSvg(svg: string) {
  // Rasterise big enough that the decoder is reading the symbol, not the
  // resampling. A phone camera has the same luxury.
  const png = await sharp(Buffer.from(svg)).resize(600, 600, { fit: 'fill', kernel: 'nearest' }).png().toBuffer()
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null
}

/** RFC 6238 computed here, independently of the application's implementation. */
function totpAt(secretBase32: string, atMs: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const ch of secretBase32.replace(/=+$/, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((value >>> bits) & 0xff)
    }
  }
  const counter = Math.floor(atMs / 1000 / 30)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  buf.writeUInt32BE(counter >>> 0, 4)
  const mac = createHmac('sha1', Buffer.from(bytes)).update(buf).digest()
  const offset = mac[mac.length - 1] & 0x0f
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff)
  return String(bin % 1_000_000).padStart(6, '0')
}

describe('the two-factor enrolment QR', () => {
  it('decodes back to exactly the otpauth URI it was built from', async () => {
    const { otpauthUri } = generateTotpSecret('founder@eventlinqs.com.au')
    const svg = await QRCode.toString(otpauthUri, QR_OPTIONS)
    expect(await decodeSvg(svg)).toBe(otpauthUri)
  })

  it('carries the same secret the page prints beside it', async () => {
    const { otpauthUri, secretBase32 } = generateTotpSecret('founder@eventlinqs.com.au')
    const decoded = await decodeSvg(await QRCode.toString(otpauthUri, QR_OPTIONS))
    expect(decoded).not.toBeNull()
    const inQr = new URL(decoded!.replace('otpauth://', 'https://')).searchParams.get('secret')
    expect(inQr).toBe(secretBase32)
  })

  it('carries a secret the application will actually accept', async () => {
    const { otpauthUri } = generateTotpSecret('founder@eventlinqs.com.au')
    const decoded = await decodeSvg(await QRCode.toString(otpauthUri, QR_OPTIONS))
    const inQr = new URL(decoded!.replace('otpauth://', 'https://')).searchParams.get('secret')!
    const now = Date.now()
    // Computed here from the QR's own payload, verified by the application.
    expect(verifyTotp(totpAt(inQr, now), inQr, now)).toBe(true)
  })

  it('announces the parameters an authenticator needs', async () => {
    const { otpauthUri } = generateTotpSecret('founder@eventlinqs.com.au')
    const decoded = await decodeSvg(await QRCode.toString(otpauthUri, QR_OPTIONS))
    const params = new URL(decoded!.replace('otpauth://', 'https://')).searchParams
    expect(decoded!.startsWith('otpauth://totp/')).toBe(true)
    expect(params.get('algorithm')).toBe('SHA1')
    expect(params.get('digits')).toBe('6')
    expect(params.get('period')).toBe('30')
    expect(params.get('issuer')).toBe('EventLinqs Admin')
  })

  it('injects nothing executable, because it reaches the page as raw HTML', async () => {
    const { otpauthUri, secretBase32 } = generateTotpSecret('founder@eventlinqs.com.au')
    const svg = await QRCode.toString(otpauthUri, QR_OPTIONS)
    expect(svg).not.toMatch(/<script|<foreignObject|javascript:|onload=/i)
    // The secret must be in the MODULES, never repeated as readable markup.
    expect(svg).not.toContain(secretBase32)
  })

  it('survives a label that would break a naively built URI', async () => {
    // An admin email with a plus tag and a space is a real address shape, and
    // it is exactly what an unescaped otpauth label mangles.
    const { otpauthUri, secretBase32 } = generateTotpSecret('first last+admin@eventlinqs.com.au')
    const decoded = await decodeSvg(await QRCode.toString(otpauthUri, QR_OPTIONS))
    expect(decoded).toBe(otpauthUri)
    const inQr = new URL(decoded!.replace('otpauth://', 'https://')).searchParams.get('secret')
    expect(inQr).toBe(secretBase32)
  })
})
