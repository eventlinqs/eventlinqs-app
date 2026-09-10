import { describe, expect, test, vi } from 'vitest'

/**
 * WHAT THE PANEL CLAIMS. Close-out D2, the third of three.
 *
 *     "On the organiser dashboard: how many abandoned, how many emailed, how
 *      many returned, and revenue recovered in dollars. This panel is the
 *      product."
 *
 * A panel is the one part of this that an organiser will quote back at us, so
 * every number on it has to be exactly what it says it is. The cases below are
 * the ways a recovery figure is quietly wrong: counting a sale that happened
 * BEFORE the message, counting one person three times because they were sent
 * three messages, and counting a buyer the engine never wrote to at all.
 *
 * `identityHash` is stubbed rather than mocked away, so the test compares the
 * same two things production does: an address on a send record against the
 * `buyer_hash` on a sale row.
 */

vi.mock('@/lib/ledger/identity', () => ({
  identityHash: (value: string | null | undefined) => {
    const normalised = (value ?? '').trim().toLowerCase()
    return normalised ? `h:${normalised}` : null
  },
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('no client in this test') } }))

const { proofForSlot } = await import('@/lib/fillrate/proof')

/**
 * A DATABASE THAT ANSWERS WHAT IT IS TOLD TO, and nothing more.
 *
 * Every method returns `this` so the real call chains work unchanged, and the
 * object is awaited at the end. The answers are keyed on the table plus the
 * columns asked for, because `proofForSlot` reads `ledger_entries` three times
 * for three different things and a stub keyed only on the table would give all
 * three the same rows.
 */
function fakeDb(answers: Record<string, { data?: unknown[]; count?: number }>) {
  /*
   * A FRESH CHAIN PER `from()`, and its first draft did not do that. The four
   * reads are BUILT synchronously and awaited together, so one shared chain let
   * the last `select()` overwrite the key for all four and every read answered
   * with the same rows. The stub was wrong in exactly the way that makes a test
   * agree with whatever the code does.
   */
  const start = {
    from(table: string) {
      let key = table
      const chain: Record<string, unknown> = {
        select(columns: string, options?: { count?: string; head?: boolean }) {
          key = `${key}:${columns}${options?.head ? ':count' : ''}`
          return chain
        },
        eq: () => chain,
        in: () => chain,
        not: () => chain,
        gte: () => chain,
        order: () => chain,
        maybeSingle: () => chain,
        then(resolve: (value: { data: unknown[]; count: number | null; error: null }) => unknown) {
          const answer = answers[key] ?? {}
          return Promise.resolve(
            resolve({
              data: (answer.data ?? []) as unknown[],
              count: answer.count ?? null,
              error: null,
            }),
          )
        },
      }
      return chain
    },
  }
  return start as never
}

const NOW = new Date('2026-09-11T10:00:00.000Z')
const at = (offsetMinutes: number) => new Date(NOW.getTime() + offsetMinutes * 60_000).toISOString()

const KEYS = {
  abandoned: 'ledger_entries:contact_email',
  sends: 'recovery_sends:contact_email, sent_at',
  sales: 'ledger_entries:buyer_hash, amount_cents, occurred_at',
  holds: 'recovery_holds:claimed_at, released_at, expires_at',
  cumulative: 'ledger_entries:id:count',
}

describe('what the panel counts', () => {
  test('a slot nobody has abandoned reports nothing rather than zero recovered', async () => {
    const proof = await proofForSlot('slot-1', fakeDb({}), NOW)
    expect(proof.abandoned).toBe(0)
    expect(proof.emailed).toBe(0)
    expect(proof.recoveredCents).toBe(0)
    expect(proof.returned).toBe(0)
  })

  test('somebody emailed who then bought is a recovery, and the money is counted', async () => {
    const proof = await proofForSlot(
      'slot-1',
      fakeDb({
        [KEYS.abandoned]: { data: [{ contact_email: 'buyer@example.com' }] },
        [KEYS.sends]: { data: [{ contact_email: 'buyer@example.com', sent_at: at(-120) }] },
        [KEYS.sales]: { data: [{ buyer_hash: 'h:buyer@example.com', amount_cents: 1800, occurred_at: at(-60) }] },
      }),
      NOW,
    )
    expect(proof.returned).toBe(1)
    expect(proof.recoveredCents).toBe(1800)
  })

  test('somebody who bought BEFORE the message is not a recovery, whatever the totals look like', async () => {
    const proof = await proofForSlot(
      'slot-1',
      fakeDb({
        [KEYS.sends]: { data: [{ contact_email: 'buyer@example.com', sent_at: at(-60) }] },
        [KEYS.sales]: { data: [{ buyer_hash: 'h:buyer@example.com', amount_cents: 1800, occurred_at: at(-120) }] },
      }),
      NOW,
    )
    expect(proof.returned).toBe(0)
    expect(proof.recoveredCents).toBe(0)
  })

  test('a buyer the engine never wrote to is not a recovery', async () => {
    const proof = await proofForSlot(
      'slot-1',
      fakeDb({
        [KEYS.sends]: { data: [{ contact_email: 'written@example.com', sent_at: at(-120) }] },
        [KEYS.sales]: { data: [{ buyer_hash: 'h:someone-else@example.com', amount_cents: 5000, occurred_at: at(-10) }] },
      }),
      NOW,
    )
    expect(proof.returned).toBe(0)
    expect(proof.recoveredCents).toBe(0)
  })

  test('three messages to one person is three sends and one person, so the rate is out of one', async () => {
    const proof = await proofForSlot(
      'slot-1',
      fakeDb({
        [KEYS.sends]: {
          data: [
            { contact_email: 'buyer@example.com', sent_at: at(-4320) },
            { contact_email: 'buyer@example.com', sent_at: at(-1440) },
            { contact_email: 'buyer@example.com', sent_at: at(-120) },
          ],
        },
        [KEYS.sales]: { data: [{ buyer_hash: 'h:buyer@example.com', amount_cents: 1800, occurred_at: at(-2000) }] },
      }),
      NOW,
    )
    expect(proof.emailed).toBe(3)
    expect(proof.peopleEmailed).toBe(1)
    expect(proof.returned).toBe(1)
  })

  test('a sale between message one and message three still counts, because the FIRST message is the clock', async () => {
    const proof = await proofForSlot(
      'slot-1',
      fakeDb({
        [KEYS.sends]: {
          data: [
            { contact_email: 'buyer@example.com', sent_at: at(-4320) },
            { contact_email: 'buyer@example.com', sent_at: at(-120) },
          ],
        },
        [KEYS.sales]: { data: [{ buyer_hash: 'h:buyer@example.com', amount_cents: 2500, occurred_at: at(-3000) }] },
      }),
      NOW,
    )
    expect(proof.returned).toBe(1)
    expect(proof.recoveredCents).toBe(2500)
  })

  test('two sales to one recovered person are one person and both amounts', async () => {
    const proof = await proofForSlot(
      'slot-1',
      fakeDb({
        [KEYS.sends]: { data: [{ contact_email: 'buyer@example.com', sent_at: at(-120) }] },
        [KEYS.sales]: {
          data: [
            { buyer_hash: 'h:buyer@example.com', amount_cents: 1800, occurred_at: at(-60) },
            { buyer_hash: 'h:buyer@example.com', amount_cents: 1800, occurred_at: at(-59) },
          ],
        },
      }),
      NOW,
    )
    expect(proof.returned).toBe(1)
    expect(proof.recoveredCents).toBe(3600)
  })
})

describe('what the panel says about the waiting list', () => {
  test('a claimed offer, a released one and one that simply ran out are told apart', async () => {
    const proof = await proofForSlot(
      'slot-1',
      fakeDb({
        [KEYS.holds]: {
          data: [
            { claimed_at: at(-30), released_at: null, expires_at: at(-20) },
            { claimed_at: null, released_at: at(-10), expires_at: at(-15) },
            { claimed_at: null, released_at: null, expires_at: at(-1) },
            { claimed_at: null, released_at: null, expires_at: at(+10) },
          ],
        },
      }),
      NOW,
    )
    expect(proof.offered).toBe(4)
    expect(proof.claimed).toBe(1)
    expect(proof.lapsed).toBe(2)
  })
})

describe('the holdout, which does not exist yet and says so', () => {
  test('below the threshold it is not due', async () => {
    const proof = await proofForSlot('slot-1', fakeDb({ [KEYS.cumulative]: { count: 299 } }), NOW)
    expect(proof.cumulativeAbandonments).toBe(299)
    expect(proof.holdoutDue).toBe(false)
  })

  test('at the threshold the build says so rather than silently starting one', async () => {
    const proof = await proofForSlot('slot-1', fakeDb({ [KEYS.cumulative]: { count: 300 } }), NOW)
    expect(proof.holdoutDue).toBe(true)
  })
})
