/**
 * LB-SEATWHOLE. EVERY CEILING ON THE ORGANISER'S SEATING SURFACES WAS A
 * DIFFERENT NUMBER, AND ALL THREE WERE SILENT.
 *
 * What is asserted here, and what is asserted elsewhere:
 *
 *   the counting        here, exhaustively. `seatCountsFromRpc` is the only
 *                       thing standing between the database's answer and the
 *                       number an organiser reads, so it refuses anything it
 *                       cannot vouch for rather than coercing it.
 *   the round trip      scripts/verify/lb-seatwhole-drive.mjs, against a real
 *                       chart on TEST larger than the ceiling. A unit test
 *                       cannot prove a row ceiling exists; only a database can.
 *   the shapes          here, by reading the five screens. The guard enforces
 *                       these on every build; these tests name the THREE
 *                       SPECIFIC ceilings that were in the tree, so that if the
 *                       guard is ever narrowed the numbers themselves are still
 *                       written down somewhere that fails.
 *   the authorisation   here, by reading the migration. The function is
 *                       SECURITY DEFINER over another organiser's seats, so who
 *                       may call it is the whole of its safety.
 */
import { describe, it, expect } from 'vitest'
import { readRepoFile } from '../../helpers/read-repo-file'
import {
  seatCountsFromRpc,
  countIn,
  protectedSeats,
  readSeatStatusCounts,
  readSeatStatusCountsMany,
  PROTECTED_SEAT_STATUSES,
  type SeatCountRpcClient,
} from '@/lib/events/seat-counts'

const read = (p: string) => readRepoFile(p)

/*
 * READ THE CODE, NOT THE PROSE ABOUT THE CODE.
 *
 * The first run of the two ceiling tests below FAILED, and both were right to:
 * every one of these files now carries a comment quoting the exact defect it
 * replaced, `.range(0, 1999)` in the launch kit and `from < 10000` in the seat
 * manager. A test that greps raw source therefore fails on the EXPLANATION of
 * the bug rather than on the bug, which is the same trap
 * `scripts/guards/lib/source.mjs` exists to avoid for the guards. This blanks
 * comments the same way, so the assertion is about what runs.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const MIGRATION = read('supabase/migrations/20260920000020_the_database_counts_the_seats.sql')
const EVENTS_LIST = read('src/app/(dashboard)/dashboard/events/page.tsx')
const EVENTS_TABLE = read('src/app/(dashboard)/dashboard/events/events-table.tsx')
const SEATS = read('src/app/(dashboard)/dashboard/events/[id]/seats/page.tsx')
const LAUNCH_KIT = read('src/app/(dashboard)/dashboard/events/[id]/launch-kit/page.tsx')
const SEAT_MAPS = read('src/app/(dashboard)/dashboard/venues/[id]/seat-maps/page.tsx')
const SEAT_MAP_ACTIONS = read('src/app/(dashboard)/dashboard/venues/[id]/seat-maps/actions.ts')
const GUARD = read('scripts/guards/the-seating-surfaces-count-every-seat.mjs')
const RUN_GUARDS = read('scripts/guards/run-guards.mjs')

/** A whole answer from the function, as it comes back over the wire. */
const WHOLE = {
  available: 3150,
  reserved: 40,
  sold: 1810,
  held: 0,
  blocked: 0,
  accessible: 0,
  total: 5000,
}

function clientReturning(data: unknown, error: { message: string } | null = null): SeatCountRpcClient & {
  calls: { fn: string; args: Record<string, unknown> }[]
} {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args })
      return Promise.resolve({ data, error })
    },
  }
}

describe('the counts come back whole or not at all', () => {
  it('reads every status and the total the database computed', () => {
    const counts = seatCountsFromRpc(WHOLE)
    expect(counts.total).toBe(5000)
    expect(counts.byStatus.sold).toBe(1810)
    expect(counts.byStatus.available).toBe(3150)
    // Every label, including the ones with no rows, so a caller never reads
    // `undefined` and renders it as a blank where a zero belongs.
    expect(Object.keys(counts.byStatus).sort()).toEqual([
      'accessible',
      'available',
      'blocked',
      'held',
      'reserved',
      'sold',
    ])
  })

  it('refuses a total that does not equal the sum of its statuses', () => {
    /*
     * The two are computed in the same loop in SQL, so a disagreement means the
     * loop missed a label, which is the silent shortfall this whole item exists
     * to end. It is refused here rather than rendered.
     */
    expect(() => seatCountsFromRpc({ ...WHOLE, sold: 1809 })).toThrow(/does not equal the sum/)
  })

  it('refuses an answer with no total at all', () => {
    const { total: _dropped, ...noTotal } = WHOLE
    expect(() => seatCountsFromRpc(noTotal)).toThrow(/no total/)
  })

  it.each([
    ['null', null],
    ['an array', [1, 2, 3]],
    ['a string', 'five thousand'],
  ])('refuses %s where an object belongs', (_label, value) => {
    expect(() => seatCountsFromRpc(value)).toThrow(/returned no object/)
  })

  it.each([
    ['a float', 12.5],
    ['a negative', -1],
    ['a string that looks like a number', '1810'],
  ])('refuses %s as a count', (_label, value) => {
    expect(() => seatCountsFromRpc({ ...WHOLE, sold: value })).toThrow(/is not a count/)
  })

  it('sums the protected statuses and nothing else', () => {
    const counts = seatCountsFromRpc(WHOLE)
    expect([...PROTECTED_SEAT_STATUSES]).toEqual(['reserved', 'sold', 'held'])
    expect(protectedSeats(counts)).toBe(40 + 1810 + 0)
    // An unknown status contributes nothing rather than NaN.
    expect(countIn(counts, ['sold', 'no_such_status'])).toBe(1810)
  })
})

describe('the reader throws rather than reporting nought', () => {
  it('throws when the single-event call errors', async () => {
    const client = clientReturning(null, { message: 'connection reset' })
    await expect(readSeatStatusCounts(client, 'e1')).rejects.toThrow(/connection reset/)
  })

  it('throws when the many call errors, so a failure is never nought sold', async () => {
    const client = clientReturning(null, { message: 'statement timeout' })
    await expect(readSeatStatusCountsMany(client, ['e1', 'e2'])).rejects.toThrow(/statement timeout/)
  })

  it('asks the database nothing when there is nothing to ask about', async () => {
    const client = clientReturning({})
    expect((await readSeatStatusCountsMany(client, [])).size).toBe(0)
    expect(client.calls).toHaveLength(0)
  })

  it('leaves an unanswered event ABSENT from the map rather than at nought', async () => {
    /*
     * The difference is the whole point. "This event has no seats" is a fact.
     * "This event was not in the answer" is a fault, and the screen renders the
     * second as Unknown rather than as a sold-out show that has sold nothing.
     */
    const client = clientReturning({ e1: WHOLE })
    const map = await readSeatStatusCountsMany(client, ['e1', 'e2'])
    expect(map.get('e1')?.byStatus.sold).toBe(1810)
    expect(map.has('e2')).toBe(false)
    expect(client.calls[0]).toEqual({
      fn: 'event_seat_status_counts_many',
      args: { p_event_ids: ['e1', 'e2'] },
    })
  })
})

describe('the migration counts in the database and lets only the right people ask', () => {
  it('counts with COUNT(*) per status rather than returning the rows', () => {
    expect(MIGRATION).toContain('SELECT COUNT(*) INTO v_n')
    expect(MIGRATION).toContain("WHERE t.typname = 'seat_status'")
  })

  it('carries the same authorisation as the money-records function', () => {
    for (const clause of [
      "v_role <> 'service_role'",
      'o.owner_id = v_uid',
      "m.role IN ('owner', 'admin', 'manager')",
      'a.disabled_at IS NULL',
      "USING ERRCODE = '42501'",
    ]) {
      expect(MIGRATION).toContain(clause)
    }
  })

  it('raises rather than truncating when handed too many events', () => {
    expect(MIGRATION).toContain('too many events in one call (max 500)')
    expect(MIGRATION).toContain("USING ERRCODE = '22023'")
  })

  it('is revoked from anon on both functions', () => {
    const revokes = MIGRATION.match(/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon;/g) ?? []
    expect(revokes).toHaveLength(2)
  })
})

describe('the three ceilings that were in the tree are gone, by name', () => {
  it('the launch kit no longer caps its seats at two thousand', () => {
    // The literal that printed "{n} seats . {m} open right now" out of the
    // first 2,000 rows of a chart that could be any size.
    expect(codeOnly(LAUNCH_KIT)).not.toContain('.range(0, 1999)')
    expect(LAUNCH_KIT).toContain("readEveryRow<SeatData>('launch kit seats'")
  })

  it('the seat manager no longer stops paging at ten thousand', () => {
    expect(codeOnly(SEATS)).not.toMatch(/from\s*<\s*10000/)
    expect(codeOnly(SEATS)).not.toContain('const fetchAllSeats')
    expect(SEATS).toContain("readEveryRow<SeatRow>('event seats'")
  })

  it('the paid holders waiting for a seat are read to the end, in a total order', () => {
    expect(SEATS).toContain("readEveryRow<UnassignedTicketRow>('event unassigned ticket holders'")
    const holders = SEATS.slice(SEATS.indexOf('event unassigned ticket holders'))
    const chain = holders.slice(0, holders.indexOf('.range('))
    // created_at is not unique, so it cannot be the only paging key.
    expect(chain).toContain(".order('created_at')")
    expect(chain).toContain(".order('id')")
  })

  it('the events list counts sold seats in the database, not row by row here', () => {
    expect(EVENTS_LIST).toContain('readSeatStatusCountsMany(adminClient, reservedEventIds)')
    expect(codeOnly(EVENTS_LIST)).not.toMatch(/seatSoldCountMap\[row\.event_id\]/)
  })

  it('an uncounted reserved-seating event reads Unknown rather than nought', () => {
    expect(EVENTS_TABLE).toContain('seatSoldCountMap[event.id]')
    expect(codeOnly(EVENTS_TABLE)).not.toContain('(seatSoldCountMap[event.id] ?? 0)')
    expect(EVENTS_TABLE).toContain('soldCount === undefined')
    expect(EVENTS_TABLE).toContain('Unknown')
  })

  it('the protected-seat count binds its error instead of coalescing to nought', () => {
    expect(SEAT_MAPS).toContain('error: protectedError')
    expect(SEAT_MAPS).toContain('could not be counted')
  })

  it('the section insert compares what came back with what it sent', () => {
    expect(SEAT_MAP_ACTIONS).toContain('returnedSections.length !== sectionInserts.length')
  })
})

describe('the guard is registered and says what it judges', () => {
  it('is in the blocking list', () => {
    expect(RUN_GUARDS).toContain("'scripts/guards/the-seating-surfaces-count-every-seat.mjs'")
  })

  it('judges all five seating screens', () => {
    for (const screen of [
      'dashboard/events/page.tsx',
      'dashboard/events/[id]/seats/page.tsx',
      'dashboard/events/[id]/launch-kit/page.tsx',
      'dashboard/venues/[id]/seat-maps/page.tsx',
      'dashboard/venues/[id]/seat-maps/actions.ts',
    ]) {
      expect(GUARD).toContain(screen)
    }
  })

  it('carries the clause the other three row-ceiling guards do not have', () => {
    /*
     * Clause 5 is the reason this is a fourth guard. Two of the three ceilings
     * on these screens were BOUNDS, so "is this read bounded" answered PASS
     * about both of them for as long as they existed.
     */
    expect(GUARD).toContain('NO NUMERIC LITERAL CEILING')
    expect(GUARD).toMatch(/\\\.range\\\(/)
    expect(GUARD).toContain('cursor|start')
  })
})
