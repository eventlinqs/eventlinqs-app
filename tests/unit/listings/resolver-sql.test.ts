import { describe, expect, it } from 'vitest'
import { resolverSql, type Ruled } from '@/lib/listings/resolver-sql'
import { reviewedBody } from '../../../scripts/ops/apply-reviewed-sql-production.mjs'

/*
 * THE RESOLVER'S WRITES GO THE REVIEWED WAY (operating rule 4 of 25 September 2026; the CONTROLLER's 10:50): its corrections and
 * holds become one begin and rollback file for scripts/ops/apply-reviewed-sql-production.mjs, dry run first, applied on APPLY,
 * logged. A correction writes the official page's value to that night's link; a price hold withholds the price; a night hold
 * makes that dated night private, never deleted; every hold is a row in listing_holds with its readings.
 */
const EV = '11111111-1111-4111-8111-111111111111'
const ruled = (over: Partial<Ruled>): Ruled => ({ eventId: EV, seriesId: null, field: 'price', linkUrl: 'https://www.comedyrepublic.com.au/x', ruling: 'correct', value: '3900', scope: null, reason: null, readings: [], ...over })

describe('the resolver file', () => {
  it('is one begin, its statements, one rollback', () => {
    const sql = resolverSql([ruled({})])
    expect(sql.startsWith('begin;')).toBe(true)
    expect(sql.trimEnd().endsWith('rollback;')).toBe(true)
  })
  it('a price correction writes the official price to that link, checked now', () => {
    const sql = resolverSql([ruled({})])
    expect(sql).toContain(`update public.event_booking_links set price_from_cents = 3900, price_checked_at = now() where event_id = '${EV}' and url = 'https://www.comedyrepublic.com.au/x';`)
  })
  it('a status correction writes the official status', () => {
    expect(resolverSql([ruled({ field: 'status', value: 'sold_out' })])).toContain("set availability = 'sold_out'")
  })
  it('a price hold withholds the price, both columns at once, and records the hold', () => {
    const sql = resolverSql([ruled({ ruling: 'hold', value: null, scope: 'fact', reason: 'officials_disagree' })])
    expect(sql).toContain(`update public.event_booking_links set price_from_cents = null, price_checked_at = null where event_id = '${EV}';`)
    expect(sql).toContain('insert into public.listing_holds (event_id, series_id, field, scope, reason, readings, next_source, next_check_at)')
  })
  /*
   * THE TABLE'S OWN RULE, event_booking_links_price_with_its_check (20261027130001):
   * check ((price_from_cents is null) = (price_checked_at is null)). The first apply on production was refused by it
   * (7 November 2026, 16:03, 'violates check constraint "event_booking_links_price_with_its_check"'): the price hold
   * cleared the check time and left the price. Every booking link statement the resolver writes sets both or neither,
   * and sets them null together or valued together.
   */
  it('every booking link statement keeps a price and its check time together, as the table requires', () => {
    const sql = resolverSql([
      ruled({}),
      ruled({ field: 'status', value: 'sold_out' }),
      ruled({ ruling: 'hold', value: null, scope: 'fact', reason: 'officials_disagree' }),
      ruled({ ruling: 'resource', value: '4500' }),
    ])
    const updates = sql.split('\n').filter((l) => l.startsWith('update public.event_booking_links set '))
    expect(updates.length).toBe(4)
    for (const u of updates) {
      const set = u.slice('update public.event_booking_links set '.length, u.indexOf(' where '))
      const price = /price_from_cents = (\S+?),?(?: |$)/.exec(set)?.[1]
      const checked = /price_checked_at = (\S+?),?(?: |$)/.exec(set)?.[1]
      expect(price === undefined, u).toBe(checked === undefined)
      if (price !== undefined) expect(price === 'null', u).toBe(checked === 'null')
    }
  })
  it('a night hold makes the night private, never deletes it, and records the hold', () => {
    const sql = resolverSql([ruled({ field: 'start', ruling: 'hold', value: null, scope: 'night', reason: 'no_official_page' })])
    expect(sql).toContain(`update public.events set visibility = 'private' where id = '${EV}' and visibility = 'public';`)
    expect(sql).not.toMatch(/\bdelete\b/i)
  })
  it('a quote in a reading cannot break the file', () => {
    const sql = resolverSql([ruled({ ruling: 'hold', value: null, scope: 'fact', reason: 'officials_disagree', readings: [{ kind: 'venue', url: "https://x.com/o'neil", value: '1' }] })])
    expect(sql).toContain("o''neil")
  })
  it('a start the official page corrects is noted, never written on one read (LAW 19 (d))', () => {
    const sql = resolverSql([ruled({ field: 'start', ruling: 'correct', value: '2026-11-20T09:30:00.000Z' })])
    expect(sql).toContain('-- start of')
    expect(sql).not.toMatch(/^update public\.events set start_date/m)
  })
  it('a file with a hold reads the open holds back after it applies', () => {
    const sql = resolverSql([ruled({ ruling: 'hold', value: null, scope: 'fact', reason: 'officials_disagree' })])
    expect(sql).toMatch(/select count\(\*\) as open_holds from public\.listing_holds where released_at is null;\nrollback;\n$/)
  })
  it('the reviewed apply takes the file as written: every write in one block, the open holds read back after', () => {
    const sql = resolverSql([
      ruled({}),
      ruled({ field: 'start', ruling: 'correct', value: '2026-11-20T09:30:00.000Z' }),
      ruled({ ruling: 'hold', value: null, scope: 'fact', reason: 'officials_disagree', readings: [{ kind: 'venue', url: "https://x.com/o'neil;a", value: '1' }] }),
      ruled({ field: 'start', ruling: 'hold', value: null, scope: 'night', reason: 'no_official_page' }),
    ])
    const out = reviewedBody(sql) as { refused?: string; statements?: number; readBack?: string | null }
    expect(out.refused).toBeUndefined()
    // the price correction 1, the start correction 0 (a note), the fact hold 2, the night hold 2
    expect(out.statements).toBe(5)
    expect(out.readBack).toMatch(/^select count\(\*\) as open_holds/)
  })
  it('every new hold names its next action: its first page, read again a day on (CONTROLLER 16:55 (1))', () => {
    const sql = resolverSql([ruled({ ruling: 'hold', value: null, scope: 'fact', reason: 'officials_disagree', readings: [{ kind: 'venue', url: 'https://v/', value: '1' }, { kind: 'seller', url: 'https://s/', value: '2' }] })])
    expect(sql).toContain("insert into public.listing_holds (event_id, series_id, field, scope, reason, readings, next_source, next_check_at)")
    expect(sql).toContain("'https://v/', now() + interval '1 day');")
  })
  it('a ruling to keep writes nothing', () => {
    expect(resolverSql([ruled({ ruling: 'keep' })]).split('\n').filter((l) => /^(update|insert)/.test(l))).toEqual([])
  })
})
