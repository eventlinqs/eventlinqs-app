import { KIT_CODE_LENGTH, isKitCode } from './draft-store'

/**
 * The reference an act's link carries: which kit, and which name on it.
 *
 * Encoded rather than stored, so THE BILL needs no table of its own and an
 * act's link works the instant the organiser types their name. The kit code is
 * the security boundary: it is already unguessable, and this only ever appends
 * a name that the organiser themselves typed.
 *
 * Shape: <kitCode><base64url(name)>. The kit code is fixed width, so the split
 * is unambiguous without a separator that would need escaping.
 */

const MAX_NAME_LENGTH = 80

export type BillRef = { kitCode: string; name: string }

/**
 * base64url of a UTF-8 string, in BOTH runtimes.
 *
 * This has to work in the browser: THE BILL renders the act's link as the
 * organiser types each name, and a client component has no Buffer. Using
 * Buffer alone is why nothing could render the link before.
 */
function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function encodeBillRef(kitCode: string, name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH)
  return `${kitCode}${toBase64Url(clean)}`
}

export function decodeBillRef(value: string | null | undefined): BillRef | null {
  if (typeof value !== 'string' || value.length <= KIT_CODE_LENGTH) return null

  const kitCode = value.slice(0, KIT_CODE_LENGTH)
  if (!isKitCode(kitCode)) return null

  const encoded = value.slice(KIT_CODE_LENGTH)
  // Reject anything that is not base64url before decoding, so a tampered
  // reference fails cleanly rather than yielding replacement characters.
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null

  try {
    const name = Buffer.from(encoded, 'base64url').toString('utf8').trim()
    if (!name || name.length > MAX_NAME_LENGTH) return null

    // A name that round-trips to control characters is not a name. Checked by
    // CODE POINT rather than a regex range: a hand-written range here is
    // exactly the kind of thing that silently matches printable characters
    // instead of the control block it was meant to cover.
    for (let i = 0; i < name.length; i += 1) {
      const cp = name.charCodeAt(i)
      if (cp < 0x20 || cp === 0x7f) return null
    }

    return { kitCode, name }
  } catch {
    return null
  }
}
