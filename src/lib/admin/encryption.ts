import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * AES-256-GCM helpers for encrypting at-rest secrets such as the TOTP
 * shared secret. Uses the ADMIN_TOTP_ENC_KEY env var as the key source.
 *
 * Format on disk: base64(iv || authTag || ciphertext)
 *   iv:   12 bytes
 *   tag:  16 bytes
 *   ct:   variable
 *
 * The key env var is required to be 32 bytes after base64 decode. If the
 * provided value is shorter or not base64, we derive a 32-byte key with
 * scrypt against a fixed salt - this is a fallback for development; in
 * production the env var MUST be a base64-encoded 32-byte random value.
 */

const IV_BYTES = 12
const TAG_BYTES = 16

function loadKey(): Buffer {
  const raw = process.env.ADMIN_TOTP_ENC_KEY
  if (!raw) {
    throw new Error('ADMIN_TOTP_ENC_KEY env var is not set. See docs/admin-marketing/phase-a1/scope.md C-A1-03.')
  }
  try {
    const decoded = Buffer.from(raw, 'base64')
    if (decoded.length === 32) return decoded
  } catch {
    /* fall through to scrypt fallback */
  }
  return scryptSync(raw, 'eventlinqs-admin-totp-enc-key', 32)
}

export function encryptString(plaintext: string): string {
  const key = loadKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decryptString(encoded: string): string {
  const key = loadKey()
  const buf = Buffer.from(encoded, 'base64')
  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error('encrypted payload too short')
  }
  const iv = buf.subarray(0, IV_BYTES)
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ct = buf.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}
