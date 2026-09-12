import { describe, expect, test } from 'vitest'
import { addressForToken, isTokenShaped } from '@/lib/fillrate/read'

/**
 * A MALFORMED LINK IS NOT FOUND, NEVER A 500.
 *
 * 12 September 2026, the first production smoke after the merge of #145: the
 * route sweep asked https://www.eventlinqs.com.au/unsubscribe/recovery/zzzzzzzzzzzz
 * and production answered 500. Vercel's runtime error: "the engine could not
 * resolve that link: invalid input syntax for type uuid: 'zzzzzzzzzzzz'".
 * recovery_contacts.token is a uuid column, so a value of any other shape is
 * refused by the database, and addressForToken threw that refusal as an
 * outage. A link that cannot name anybody is simply not found; only a real
 * failure to ask is a 500 (the read-failure rule: a 500 says ask again, a 404
 * says something false and permanent). So the shape is judged before the
 * database is asked, and a genuine error on a well-formed token still throws.
 */

type Answer = { data: { contact_email: string } | null; error: { message: string } | null }

/** A database that records whether it was asked, and answers what it is told to. */
function fakeDb(answer: Answer) {
  const asked: string[] = []
  const db = {
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: async () => {
            asked.push(`${table}:${value}`)
            return answer
          },
        }),
      }),
    }),
  }
  return { db: db as unknown as Parameters<typeof addressForToken>[1], asked }
}

const WELL_FORMED = '8d6c2f3a-5b1e-4c7d-9e2f-0a1b2c3d4e5f'

describe('isTokenShaped: the shape every token the engine mints has', () => {
  test('a uuid is token shaped, whatever its case, with surrounding whitespace forgiven', () => {
    expect(isTokenShaped(WELL_FORMED)).toBe(true)
    expect(isTokenShaped(WELL_FORMED.toUpperCase())).toBe(true)
    expect(isTokenShaped(` ${WELL_FORMED} `)).toBe(true)
  })

  test('the production placeholder, an empty string, a near miss and a non-string are not', () => {
    expect(isTokenShaped('zzzzzzzzzzzz')).toBe(false)
    expect(isTokenShaped('')).toBe(false)
    expect(isTokenShaped('8d6c2f3a-5b1e-4c7d-9e2f-0a1b2c3d4e5')).toBe(false)
    expect(isTokenShaped('8d6c2f3a-5b1e-4c7d-9e2f-0a1b2c3d4e5g')).toBe(false)
    expect(isTokenShaped(undefined)).toBe(false)
    expect(isTokenShaped(42)).toBe(false)
  })
})

describe('addressForToken', () => {
  test('THE DEFECT: a malformed token is not found, and the database is never asked', async () => {
    // Were it asked, the uuid column would refuse, which is the production 500.
    const { db, asked } = fakeDb({ data: null, error: { message: 'invalid input syntax for type uuid: "zzzzzzzzzzzz"' } })
    await expect(addressForToken('zzzzzzzzzzzz', db)).resolves.toBeNull()
    expect(asked).toEqual([])
  })

  test('a well-formed token nobody holds is not found, after one question', async () => {
    const { db, asked } = fakeDb({ data: null, error: null })
    await expect(addressForToken(WELL_FORMED, db)).resolves.toBeNull()
    expect(asked).toEqual([`recovery_contacts:${WELL_FORMED}`])
  })

  test('a well-formed token that names somebody answers their address', async () => {
    const { db } = fakeDb({ data: { contact_email: 'casey@example.com' }, error: null })
    await expect(addressForToken(WELL_FORMED, db)).resolves.toBe('casey@example.com')
  })

  test('a real failure to ask on a well-formed token still throws, so an outage is never a quiet not-found', async () => {
    const { db } = fakeDb({ data: null, error: { message: 'connection refused' } })
    await expect(addressForToken(WELL_FORMED, db)).rejects.toThrow(/could not resolve that link: connection refused/)
  })
})
