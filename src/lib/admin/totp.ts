import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Minimal RFC 6238 TOTP implementation (HMAC-SHA1, 30s step, 6 digits).
 *
 * Compatible with Google Authenticator, 1Password, Authy, Microsoft
 * Authenticator, Bitwarden. Implemented locally to avoid adding an npm
 * dependency (package.json is a [SHARED] file requiring coordination).
 *
 * The shared secret is generated as 20 random bytes and exposed to the
 * user as a base32 string for manual entry, plus an otpauth:// URI for
 * QR scanners (QR rendering itself is out of A1 scope - the user pastes
 * the URI or types the secret).
 */

const STEP_SECONDS = 30
const DIGITS = 6
const ALGO = 'sha1' as const

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export interface TotpProvisioning {
  secretBase32: string
  otpauthUri: string
}

export function generateTotpSecret(label: string, issuer = 'EventLinqs Admin'): TotpProvisioning {
  const raw = randomBytes(20)
  const secretBase32 = base32Encode(raw)
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  })
  const otpauthUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?${params.toString()}`
  return { secretBase32, otpauthUri }
}

export function verifyTotp(code: string, secretBase32: string, nowMs = Date.now(), windowSteps = 1): boolean {
  const cleaned = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(cleaned)) return false
  const counter = Math.floor(nowMs / 1000 / STEP_SECONDS)
  for (let drift = -windowSteps; drift <= windowSteps; drift++) {
    if (computeCode(secretBase32, counter + drift) === cleaned) return true
  }
  return false
}

function computeCode(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = createHmac(ALGO, key).update(buf).digest()
  const offset = h[h.length - 1] & 0x0f
  const binCode =
    ((h[offset] & 0x7f) << 24) |
    ((h[offset + 1] & 0xff) << 16) |
    ((h[offset + 2] & 0xff) << 8) |
    (h[offset + 3] & 0xff)
  return String(binCode % 10 ** DIGITS).padStart(DIGITS, '0')
}

// ------------------- Recovery codes -------------------

const RECOVERY_CODE_COUNT = 10

export function generateRecoveryCodes(): { plain: string[]; hashed: string[] } {
  const plain: string[] = []
  const hashed: string[] = []
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = formatRecoveryCode(randomBytes(5))
    plain.push(code)
    hashed.push(hashRecoveryCode(code))
  }
  return { plain, hashed }
}

export function hashRecoveryCode(code: string): string {
  // scrypt-based hashing. Format: scrypt$N$r$p$saltB64$hashB64
  const salt = randomBytes(16)
  const N = 16384, r = 8, p = 1
  const hash = scryptSync(code.replace(/-/g, '').toLowerCase(), salt, 32, { N, r, p })
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyRecoveryCode(code: string, hashed: string): boolean {
  const parts = hashed.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false
  const salt = Buffer.from(parts[4], 'base64')
  const expected = Buffer.from(parts[5], 'base64')
  const got = scryptSync(code.replace(/-/g, '').toLowerCase(), salt, expected.length, { N, r, p })
  if (got.length !== expected.length) return false
  return timingSafeEqual(got, expected)
}

function formatRecoveryCode(buf: Buffer): string {
  // 5 bytes -> 10 hex chars -> grouped 4-4-4 with hyphens lowercased base32
  const b32 = base32Encode(buf).slice(0, 10).toLowerCase()
  return `${b32.slice(0, 4)}-${b32.slice(4, 7)}-${b32.slice(7, 10)}`
}

// ------------------- Base32 -------------------

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f]
      bits -= 5
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
  }
  return out
}

export function base32Decode(s: string): Buffer {
  const cleaned = s.replace(/=+$/, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx < 0) throw new Error(`invalid base32 char: ${ch}`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}
