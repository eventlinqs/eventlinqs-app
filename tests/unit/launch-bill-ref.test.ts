import { describe, expect, it } from 'vitest'
import { decodeBillRef, encodeBillRef } from '@/lib/launch/bill-ref'
import { KIT_CODE_LENGTH, isKitCode, mintKitCode } from '@/lib/launch/draft-store'

/**
 * THE BILL's link reference. Encoded rather than stored, so an act's link
 * works the instant the organiser types their name.
 *
 * The kit code is the security boundary. These tests exist to prove a tampered
 * reference fails cleanly rather than resolving to somebody else's kit or to a
 * name full of control characters.
 */

const CODE = mintKitCode()

describe('minted codes', () => {
  it('are the declared length and pass their own validator', () => {
    for (let i = 0; i < 50; i += 1) {
      const c = mintKitCode()
      expect(c).toHaveLength(KIT_CODE_LENGTH)
      expect(isKitCode(c)).toBe(true)
    }
  })

  it('avoid the characters that get misread aloud', () => {
    // No 0/O, no 1/l/I. A person reads a kit code off a screen to a friend.
    for (let i = 0; i < 50; i += 1) {
      expect(mintKitCode()).not.toMatch(/[01oli]/)
    }
  })

  it('are not trivially repeated', () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintKitCode()))
    expect(seen.size).toBe(200)
  })
})

describe('round trip', () => {
  it('preserves an ordinary name', () => {
    const ref = decodeBillRef(encodeBillRef(CODE, 'Marlo Reyes'))
    expect(ref).toEqual({ kitCode: CODE, name: 'Marlo Reyes' })
  })

  it('preserves names with accents and apostrophes', () => {
    for (const name of ['Renée Dubois', "O'Sullivan", 'Tāne Mahuta', 'Søren Kierkegaard']) {
      expect(decodeBillRef(encodeBillRef(CODE, name))?.name).toBe(name)
    }
  })

  it('normalises whitespace so one person is one card', () => {
    expect(decodeBillRef(encodeBillRef(CODE, '  Marlo   Reyes  '))?.name).toBe('Marlo Reyes')
  })

  it('truncates an absurd name rather than rejecting it', () => {
    const long = 'a'.repeat(500)
    const ref = decodeBillRef(encodeBillRef(CODE, long))
    expect(ref?.name.length).toBeLessThanOrEqual(80)
  })
})

describe('a tampered reference fails cleanly', () => {
  it('rejects a malformed kit code', () => {
    // '0' and 'l' are outside the alphabet.
    expect(decodeBillRef('000000000000TWFybG8')).toBeNull()
  })

  it('rejects a non-base64url payload', () => {
    expect(decodeBillRef(`${CODE}not base64!`)).toBeNull()
    expect(decodeBillRef(`${CODE}%%%%`)).toBeNull()
  })

  it('rejects a bare code with no name', () => {
    expect(decodeBillRef(CODE)).toBeNull()
  })

  it('rejects null, undefined and empty', () => {
    expect(decodeBillRef(null)).toBeNull()
    expect(decodeBillRef(undefined)).toBeNull()
    expect(decodeBillRef('')).toBeNull()
  })

  it('rejects a name that decodes to control characters', () => {
    const nasty = Buffer.from('bad\u0000name', 'utf8').toString('base64url')
    expect(decodeBillRef(`${CODE}${nasty}`)).toBeNull()
  })

  it('rejects a name that decodes to only whitespace', () => {
    const blank = Buffer.from('   ', 'utf8').toString('base64url')
    expect(decodeBillRef(`${CODE}${blank}`)).toBeNull()
  })

  it('cannot be used to reach a different kit', () => {
    // Swapping the code half yields a reference to THAT kit, which is correct
    // and harmless: the code is the capability, and holding it already grants
    // read. What must not happen is a malformed code resolving at all.
    const other = mintKitCode()
    const ref = decodeBillRef(encodeBillRef(other, 'Kita'))
    expect(ref?.kitCode).toBe(other)
    expect(isKitCode(ref!.kitCode)).toBe(true)
  })
})
