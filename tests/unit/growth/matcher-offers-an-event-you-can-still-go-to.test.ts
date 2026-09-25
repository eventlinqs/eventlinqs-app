import { describe, it, expect } from 'vitest'

/**
 * THE MATCHER'S EVENT PICKER OFFERS EVENTS THAT ARE NOT YET OVER.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT, measured against TEST on 19 September 2026.
 *
 * /admin/matches composed its picker read inline: published, public,
 * `order('start_date', ascending)`, `limit(40)`, and NO BOUND ON TIME, under a
 * comment in the component claiming it listed "the soonest published events".
 * Ordering every published event ascending and taking forty gives the forty
 * OLDEST events the platform has ever had.
 *
 *   published + public on TEST:  101 already over, 175 still to come
 *   what the picker offered:     June 2026, every one of them finished
 *
 * So the screen that decides who hears about an event could not be pointed at a
 * single event anybody could still go to, and it got worse every time a past
 * event was added. Nothing threw, nothing was empty, and the list looked
 * entirely plausible, which is why no test and no drive had ever noticed.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY IT IS THE QUERY RATHER THAN THE ROWS.
 *
 * The bug is not in what the code does with the rows, it is in WHICH ROWS IT
 * ASKS FOR. A stub that simply returns rows would pass with or without the
 * bound. So the stub RECORDS the calls the door makes and the assertions are
 * about the question put to the database: the filters, the time predicate, the
 * order and the limit.
 *
 * THE BOUND IS THE PLATFORM'S OWN. The first version of this door wrote its own
 * `gte('end_date')` and scripts/guards/one-visibility-source.mjs refused it
 * within the minute. It was right, and the shared rule is stricter: the listing
 * window keeps an event offerable until it has ACTUALLY ENDED, and for an event
 * with no end_date it uses the end of the calendar day of start_date IN THE
 * EVENT'S OWN ZONE. So these tests assert the composed predicate rather than a
 * column comparison this module no longer makes.
 *
 * `now` is an argument to the door rather than a call to the clock, so these
 * run identically at any hour.
 */

import { readMatchableEvents, readEventForMatching } from '@/lib/matching/events'

type Call = { method: string; args: unknown[] }

/** A recording builder: every chained call is kept, and awaiting it yields rows. */
function recorder(rows: unknown[]) {
  const calls: Call[] = []
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'lte', 'order', 'limit', 'or', 'is', 'ilike']) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ method: m, args })
      return builder
    }
  }
  builder.maybeSingle = (...args: unknown[]) => {
    calls.push({ method: 'maybeSingle', args })
    return Promise.resolve({ data: rows[0] ?? null, error: null })
  }
  ;(builder as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve({ data: rows, error: null })
  const admin = {
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] })
      return builder
    },
  }
  return { admin, calls }
}

const argsFor = (calls: Call[], method: string, first: unknown) =>
  calls.find(c => c.method === method && c.args[0] === first)?.args

const NOW = new Date('2026-09-19T02:00:00Z')

const row = (id: string, startDate: string, timezone = 'Australia/Sydney') => ({
  id,
  title: `Lane B ${id}`,
  start_date: startDate,
  timezone,
})

describe('the matcher only offers an event that has not finished', () => {
  it('carries a time predicate built at the instant it was asked', async () => {
    const { admin, calls } = recorder([row('e1', '2026-10-01T09:00:00Z')])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await readMatchableEvents(admin as any, NOW)

    const or = calls.find(c => c.method === 'or')
    expect(or, 'the read must carry the listing window, which the shared rule adds as an or()').toBeTruthy()
    const predicate = String(or?.args[0] ?? '')

    /*
     * THE EXACT INSTANT, not merely "an instant". The first version of this
     * assertion asked the door twice and required the two predicates to differ,
     * and a drill proved that worthless: a door that reads the clock ITSELF also
     * produces two different predicates, because the two calls are milliseconds
     * apart and the predicate carries milliseconds.
     */
    expect(predicate).toContain(`end_date.gte.${NOW.toISOString()}`)
  })

  it('never offers an externally ticketed event, because that is not what the consent was given for', async () => {
    const { admin, calls } = recorder([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await readMatchableEvents(admin as any, NOW)
    // The facilitated wording is "events ticketed on EventLinqs, marketed by
    // EventLinqs as the sender". An event whose tickets are sold elsewhere is
    // not that.
    expect(argsFor(calls, 'is', 'external_ticket_url')?.[1]).toBeNull()
  })

  it('still asks for published and public only, soonest first, capped', async () => {
    const { admin, calls } = recorder([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await readMatchableEvents(admin as any, NOW, 40)

    expect(argsFor(calls, 'eq', 'status')?.[1]).toBe('published')
    expect(argsFor(calls, 'eq', 'visibility')?.[1]).toBe('public')
    expect(argsFor(calls, 'order', 'start_date')?.[1]).toEqual({ ascending: true })
    expect(calls.find(c => c.method === 'limit')?.args[0]).toBe(40)
    expect(calls.find(c => c.method === 'from')?.args[0]).toBe('events')
  })

  it('asks for the event own zone in the select, not only in the type', async () => {
    const { admin, calls } = recorder([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await readMatchableEvents(admin as any, NOW)
    /*
     * THE COLUMNS, ASSERTED. A stub hands back whatever rows the test wrote, so
     * the mapping test below passes even when the door stops ASKING for the
     * zone. A drill proved exactly that, and this is the assertion that catches
     * it: a column nothing selects is a column nothing has.
     */
    const columns = String(calls.find(c => c.method === 'select')?.args[0] ?? '')
    expect(columns).toContain('timezone')
    expect(columns).toContain('start_date')
  })

  it('maps the event own zone out with the instant, because a date without one cannot be rendered', async () => {
    const { admin } = recorder([
      row('perth', '2026-03-15T13:30:00Z', 'Australia/Perth'),
      row('sydney', '2026-03-15T13:30:00Z', 'Australia/Sydney'),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events = await readMatchableEvents(admin as any, NOW)
    expect(events.map(e => e.timezone)).toEqual(['Australia/Perth', 'Australia/Sydney'])
    expect(events[0].startDate).toBe('2026-03-15T13:30:00Z')
  })

  it('an empty answer is an empty list rather than a throw', async () => {
    const { admin } = recorder([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readMatchableEvents(admin as any, NOW)).toEqual([])
  })
})

describe('reading one event by id is deliberately NOT bounded by time', () => {
  it('fetches the named event with no date filter, so a past run can still be described', async () => {
    const { admin, calls } = recorder([row('old', '2026-06-07T08:00:00Z')])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = await readEventForMatching(admin as any, 'old')

    expect(event?.id).toBe('old')
    expect(argsFor(calls, 'eq', 'id')?.[1]).toBe('old')
    expect(calls.some(c => c.method === 'or')).toBe(false)
    expect(calls.some(c => c.method === 'gte')).toBe(false)
  })

  it('a missing event is null rather than a half-built object', async () => {
    const { admin } = recorder([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await readEventForMatching(admin as any, 'nope')).toBeNull()
  })
})
