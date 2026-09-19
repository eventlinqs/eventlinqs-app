import { describe, expect, test } from 'vitest'
import { suppressedAddresses } from '@/lib/fillrate/read'
import { sendingRates } from '@/lib/fillrate/rates'

/**
 * A SUPPRESSION LIST IS THE ONE READ WHERE STOPPING SHORT SENDS MAIL.
 *
 * Both reads below carried no bound. Supabase caps one response at a fixed
 * number of rows, 1,000 by default
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19),
 * and the cap is silent: HTTP 200, `error` null, a full-looking array. Measured
 * against the live TEST project on 20 September 2026:
 *
 *     Content-Range: 0-999/14364
 *
 * `suppressedAddresses` is the only thing standing between the recovery sender
 * and somebody's inbox, so a name it drops is a person who gets written to
 * after asking not to be. `sendingRates` is the reversal condition, and
 * truncating its numerator while the denominator stays an exact count
 * understates the unsubscribe and complaint rates, so the brake that should
 * stop the engine holds off exactly when it ought to fire.
 */

type Row = Record<string, unknown>

/** A database that answers a window and never volunteers that there is more. */
function pagingDb({
  suppressions = [] as Row[],
  sentCount = 0,
  pageCeiling = 1000,
  failOnPage = -1,
}: {
  suppressions?: Row[]
  sentCount?: number
  pageCeiling?: number
  failOnPage?: number
} = {}) {
  const windows: string[] = []
  let pageNumber = 0

  const db = {
    from: (table: string) => ({
      select: (_columns: string, options?: { head?: boolean }) => {
        if (options?.head) {
          return {
            eq: async () => ({ count: sentCount, data: null, error: null }),
          }
        }
        return {
          eq: () => ({
            order: () => ({
              range: async (from: number, to: number) => {
                windows.push(`${table}:${from}-${to}`)
                if (pageNumber === failOnPage) {
                  pageNumber += 1
                  return { data: null, error: { message: 'the socket went away' } }
                }
                pageNumber += 1
                return {
                  data: suppressions.slice(from, Math.min(to + 1, from + pageCeiling)),
                  error: null,
                }
              },
            }),
          }),
        }
      },
    }),
  }
  return { db: db as never, windows }
}

function addresses(count: number, from = 0): Row[] {
  return Array.from({ length: count }, (_unused, index) => ({
    contact_email: `person-${from + index}@x.test`,
    reason: 'unsubscribed',
  }))
}

describe('suppressedAddresses: read whole means paged', () => {
  test('a list inside one page is returned as it always was', async () => {
    const { db } = pagingDb({ suppressions: addresses(3) })
    const stopped = await suppressedAddresses(db)
    expect(stopped).toEqual(new Set(['person-0@x.test', 'person-1@x.test', 'person-2@x.test']))
  })

  test('THE DEFECT: the 1,001st person who said stop is still on the list', async () => {
    const { db } = pagingDb({ suppressions: addresses(2_500), pageCeiling: 1000 })
    const stopped = await suppressedAddresses(db)
    expect(stopped.size).toBe(2_500)
    expect(stopped.has('person-1000@x.test')).toBe(true)
    expect(stopped.has('person-2499@x.test')).toBe(true)
  })

  test('a server ceiling lower than the page size does not end the read early', async () => {
    const { db } = pagingDb({ suppressions: addresses(1_200), pageCeiling: 250 })
    await expect(suppressedAddresses(db)).resolves.toHaveProperty('size', 1_200)
  })

  test('addresses are still trimmed and lowercased', async () => {
    const { db } = pagingDb({ suppressions: [{ contact_email: '  Person@X.TEST ' }] })
    await expect(suppressedAddresses(db)).resolves.toEqual(new Set(['person@x.test']))
  })

  test('a failed page throws rather than returning half a suppression list', async () => {
    const { db } = pagingDb({ suppressions: addresses(2_500), failOnPage: 1 })
    await expect(suppressedAddresses(db)).rejects.toThrow(/suppression list/i)
  })
})

describe('sendingRates: the reversal condition counts every suppression', () => {
  test('THE DEFECT: the rate is measured over the whole list, not the first page', async () => {
    const { db } = pagingDb({ suppressions: addresses(2_500), sentCount: 10_000, pageCeiling: 1000 })
    const rates = await sendingRates(db)
    expect(rates.sent).toBe(10_000)
    expect(rates.unsubscribed).toBe(2_500)
  })

  test('only unsubscribed and complained are counted, and the rest are ignored', async () => {
    const { db } = pagingDb({
      suppressions: [
        { contact_email: 'a@x.test', reason: 'unsubscribed' },
        { contact_email: 'b@x.test', reason: 'complained' },
        { contact_email: 'c@x.test', reason: 'bounced' },
        { contact_email: 'd@x.test', reason: 'organiser_disabled' },
      ],
      sentCount: 100,
    })
    await expect(sendingRates(db)).resolves.toEqual({ sent: 100, unsubscribed: 1, complained: 1 })
  })

  test('an unreadable list throws instead of being counted as a clean one', async () => {
    const { db } = pagingDb({ suppressions: addresses(10), sentCount: 100, failOnPage: 0 })
    await expect(sendingRates(db)).rejects.toThrow(/suppression reasons/i)
  })
})
