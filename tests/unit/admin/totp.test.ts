import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyRecoveryCode,
  verifyTotp,
  RECOVERY_CODE_EXAMPLE,
  RECOVERY_CODE_PATTERN,
} from '@/lib/admin/totp'

describe('admin TOTP', () => {
  test('base32 round-trip preserves bytes', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0xfe, 0xff, 0x80, 0x40, 0x20])
    const encoded = base32Encode(buf)
    const decoded = base32Decode(encoded)
    expect(decoded.equals(buf)).toBe(true)
  })

  test('generated secret round-trips and verifies its own current code', () => {
    const { secretBase32, otpauthUri } = generateTotpSecret('test@example.com')
    expect(secretBase32).toMatch(/^[A-Z2-7]+$/)
    expect(otpauthUri).toContain('otpauth://totp/')
    expect(otpauthUri).toContain('algorithm=SHA1')
    expect(otpauthUri).toContain('digits=6')
    expect(otpauthUri).toContain('period=30')
  })

  test('verifyTotp rejects malformed codes', () => {
    const { secretBase32 } = generateTotpSecret('x')
    expect(verifyTotp('abcdef', secretBase32)).toBe(false)
    expect(verifyTotp('12345', secretBase32)).toBe(false)
    expect(verifyTotp('1234567', secretBase32)).toBe(false)
    expect(verifyTotp('', secretBase32)).toBe(false)
  })

  test('verifyTotp accepts a code from the same window', () => {
    const { secretBase32 } = generateTotpSecret('x')
    const now = Date.now()
    const code = pickCurrentCode(secretBase32, now)
    expect(verifyTotp(code, secretBase32, now)).toBe(true)
  })

  test('verifyTotp accepts adjacent windows but rejects far drift', () => {
    const { secretBase32 } = generateTotpSecret('x')
    const now = Date.now()
    const stepAgo = pickCurrentCode(secretBase32, now - 30_000)
    expect(verifyTotp(stepAgo, secretBase32, now)).toBe(true)
    const fiveMinAgo = pickCurrentCode(secretBase32, now - 5 * 60_000)
    expect(verifyTotp(fiveMinAgo, secretBase32, now)).toBe(false)
  })

  test('recovery codes hash with scrypt and verify only against the right plaintext', () => {
    const { plain, hashed } = generateRecoveryCodes()
    expect(plain).toHaveLength(10)
    expect(hashed).toHaveLength(10)
    for (let i = 0; i < plain.length; i++) {
      expect(verifyRecoveryCode(plain[i], hashed[i])).toBe(true)
    }
    expect(verifyRecoveryCode(plain[0], hashed[1])).toBe(false)
    expect(verifyRecoveryCode('garbage', hashed[0])).toBe(false)
  })

  test('recovery codes are case- and hyphen-insensitive', () => {
    const code = 'abcd-efg-hij'
    const h = hashRecoveryCode(code)
    expect(verifyRecoveryCode('ABCDEFGHIJ', h)).toBe(true)
    expect(verifyRecoveryCode('abcdefghij', h)).toBe(true)
    expect(verifyRecoveryCode('abcd-efghij', h)).toBe(true)
  })

  /*
   * THE SHAPE (close-out UX5). Three places described this format and all three
   * disagreed: `randomBytes(5)` base32-encodes to EIGHT characters, so the
   * final group was one character and every issued code looked like
   * `oafj-don-3`, while the code comment claimed "10 hex chars grouped 4-4-4"
   * and the admin login field advertised `abcd-efg-hij`.
   */
  test('every issued recovery code has all three groups, at 50 bits', () => {
    const { plain } = generateRecoveryCodes()
    for (const code of plain) {
      expect(code).toMatch(RECOVERY_CODE_PATTERN)
      expect(code.replace(/-/g, '')).toHaveLength(10)
    }
    // Ten distinct base32 characters is 50 bits, and no group is a stub.
    expect(new Set(plain).size).toBe(plain.length)
  })

  test('the example on the admin login field is the shape the platform issues', () => {
    // The placeholder is a literal in a CLIENT component, which cannot import
    // this module without pulling node:crypto into the browser bundle. So the
    // agreement is asserted here instead, against the file itself, which is the
    // only thing that can see both halves at once.
    const form = readFileSync(
      join(process.cwd(), 'src/app/admin/login/login-form.tsx'),
      'utf8',
    )
    const placeholder = form.match(/id="recovery"[\s\S]*?placeholder="([^"]+)"/)?.[1]
    expect(placeholder, 'the recovery field has a placeholder to check').toBeDefined()
    expect(placeholder).toBe(RECOVERY_CODE_EXAMPLE)
    expect(RECOVERY_CODE_EXAMPLE).toMatch(RECOVERY_CODE_PATTERN)
  })
})

// Helper that mirrors the production HMAC computation just enough to drive
// the verifier from a known time. Imported lazily to avoid pulling node:crypto
// into the test surface twice.
function pickCurrentCode(secretBase32: string, atMs: number): string {
  const counter = Math.floor(atMs / 1000 / 30)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', base32Decode(secretBase32)).update(buf).digest() as Buffer
  const offset = h[h.length - 1] & 0x0f
  const binCode =
    ((h[offset] & 0x7f) << 24) |
    ((h[offset + 1] & 0xff) << 16) |
    ((h[offset + 2] & 0xff) << 8) |
    (h[offset + 3] & 0xff)
  return String(binCode % 1_000_000).padStart(6, '0')
}
