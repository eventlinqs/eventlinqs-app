import { describe, expect, test } from 'vitest'
import { parseScan } from '@/lib/scanner/parse-qr'

const SECRET = '550e8400-e29b-41d4-a716-446655440000'

describe('parseScan', () => {
  test('parses a full bearer URL (the camera case)', () => {
    expect(parseScan(`https://eventlinqs.com/t/EL-7G4K-2PMQ?k=${SECRET}`)).toEqual({
      ticketCode: 'EL-7G4K-2PMQ',
      secret: SECRET,
    })
  })

  test('parses a bearer URL on any host (staging/preview)', () => {
    expect(parseScan(`https://eventlinqs-app.vercel.app/t/EL-7G4K-2PMQ?k=${SECRET}`)).toEqual({
      ticketCode: 'EL-7G4K-2PMQ',
      secret: SECRET,
    })
  })

  test('url-decodes an encoded ticket code', () => {
    expect(parseScan(`https://eventlinqs.com/t/EL%2D7G4K%2D2PMQ?k=${SECRET}`)).toEqual({
      ticketCode: 'EL-7G4K-2PMQ',
      secret: SECRET,
    })
  })

  test('returns null when the bearer URL has no secret', () => {
    expect(parseScan('https://eventlinqs.com/t/EL-7G4K-2PMQ')).toBeNull()
  })

  test('returns null for a URL that is not a /t/ bearer link', () => {
    expect(parseScan(`https://eventlinqs.com/events/some-event?k=${SECRET}`)).toBeNull()
  })

  test('returns null for a non-uuid secret', () => {
    expect(parseScan('https://eventlinqs.com/t/EL-7G4K-2PMQ?k=not-a-uuid')).toBeNull()
  })

  test('returns null for garbage input', () => {
    expect(parseScan('just some random text')).toBeNull()
  })

  test('returns null for an empty string', () => {
    expect(parseScan('')).toBeNull()
  })

  test('trims surrounding whitespace from a scanned URL', () => {
    expect(parseScan(`  https://eventlinqs.com/t/EL-7G4K-2PMQ?k=${SECRET}  `)).toEqual({
      ticketCode: 'EL-7G4K-2PMQ',
      secret: SECRET,
    })
  })
})

describe('parseManual', () => {
  test('accepts a raw ticket code and a separate secret', async () => {
    const { parseManual } = await import('@/lib/scanner/parse-qr')
    expect(parseManual('EL-7G4K-2PMQ', SECRET)).toEqual({
      ticketCode: 'EL-7G4K-2PMQ',
      secret: SECRET,
    })
  })

  test('upper-cases and trims a lower-case typed code', async () => {
    const { parseManual } = await import('@/lib/scanner/parse-qr')
    expect(parseManual('  el-7g4k-2pmq  ', SECRET)).toEqual({
      ticketCode: 'EL-7G4K-2PMQ',
      secret: SECRET,
    })
  })

  test('accepts a full bearer URL pasted into the manual code field', async () => {
    const { parseManual } = await import('@/lib/scanner/parse-qr')
    expect(parseManual(`https://eventlinqs.com/t/EL-7G4K-2PMQ?k=${SECRET}`, '')).toEqual({
      ticketCode: 'EL-7G4K-2PMQ',
      secret: SECRET,
    })
  })

  test('returns null when the code is empty', async () => {
    const { parseManual } = await import('@/lib/scanner/parse-qr')
    expect(parseManual('', SECRET)).toBeNull()
  })

  test('returns null when the secret is missing and the code is not a URL', async () => {
    const { parseManual } = await import('@/lib/scanner/parse-qr')
    expect(parseManual('EL-7G4K-2PMQ', '')).toBeNull()
  })

  test('returns null for a non-uuid secret', async () => {
    const { parseManual } = await import('@/lib/scanner/parse-qr')
    expect(parseManual('EL-7G4K-2PMQ', 'nope')).toBeNull()
  })
})
