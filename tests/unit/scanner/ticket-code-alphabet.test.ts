import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { parseManual, parseScan } from '@/lib/scanner/parse-qr'

/**
 * THE DOOR MUST ACCEPT EVERY CODE THE DATABASE CAN ISSUE.
 *
 * WHAT HAPPENED, 3 September 2026, found by driving journey 6 rather than by
 * reading either file. Two alphabets had drifted apart:
 *
 *   gen_ticket_code()   '23456789ABCDEFGHJKMNPQRSTUVWXYZ'   emits U, never L
 *   parse-qr.ts         'ABCDEFGHJKLMNPQRSTVWXYZ23456789'   rejects U, allows L
 *
 * Measured against 128 real tickets: 30 of them, 23.4 percent, could not be
 * admitted at the door at all. The only offending character was U.
 *
 * It failed on BOTH paths, because parseScan and parseManual share the same
 * validity check, so presenting the QR was refused exactly like typing the code
 * by hand. Roughly one holder in four would have been turned away at the door
 * with a valid ticket, and told their code was invalid.
 *
 * Nothing caught it. Both files were internally consistent and each looked
 * correct on its own; the defect lived in the space between them. So this test
 * reads the REAL alphabet out of the migration rather than restating it, which
 * is the only version that cannot drift with the thing it is checking.
 */
const MIGRATION = 'supabase/migrations/20260517000001_ticketing_system_v1.sql'

function alphabetFromMigration(): string {
  const sql = readFileSync(MIGRATION, 'utf8')
  const m = sql.match(/alphabet\s+CONSTANT\s+TEXT\s*:=\s*'([^']+)'/)
  if (!m) throw new Error(`could not find the ticket code alphabet in ${MIGRATION}`)
  return m[1]
}

const SECRET = '63620a3f-7243-46e5-977b-a499302bf8c8'

describe('the ticket code alphabet the door accepts', () => {
  it('accepts every character gen_ticket_code can emit', () => {
    const alphabet = alphabetFromMigration()
    expect(alphabet.length).toBeGreaterThan(0)

    const rejected: string[] = []
    for (const ch of alphabet) {
      // A code made entirely of this one character is still a legal code.
      const code = `EL-${ch.repeat(4)}-${ch.repeat(4)}`
      if (parseManual(code, SECRET) === null) rejected.push(ch)
    }

    expect(
      rejected,
      `the door rejects ${rejected.length} character(s) the database can issue: ${rejected.join(', ')}`,
    ).toEqual([])
  })

  it('admits the exact real ticket that was refused, EL-DRP7-P9TU', () => {
    // Regression pin. This code was sitting in the database, valid and unscanned,
    // and the door refused it because of the U.
    expect(parseManual('EL-DRP7-P9TU', SECRET)).toEqual({
      ticketCode: 'EL-DRP7-P9TU',
      secret: SECRET,
    })
  })

  it('refuses the same code on the QR path too, before the fix, and accepts it after', () => {
    // parseScan and parseManual share isValidPair, so the bearer URL must agree.
    expect(parseScan(`https://eventlinqs.com/t/EL-DRP7-P9TU?k=${SECRET}`)).toEqual({
      ticketCode: 'EL-DRP7-P9TU',
      secret: SECRET,
    })
  })

  it('still refuses characters the generator excludes, so this is not just a widening', () => {
    const alphabet = alphabetFromMigration()
    for (const ch of ['I', 'O', '0', '1']) {
      expect(alphabet).not.toContain(ch)
      expect(parseManual(`EL-${ch.repeat(4)}-${ch.repeat(4)}`, SECRET)).toBeNull()
    }
  })

  it('still refuses a malformed secret', () => {
    expect(parseManual('EL-DRP7-P9TU', 'not-a-uuid')).toBeNull()
  })
})
