/**
 * PURE ORDERING FOR THE ORGANISER'S REPORTS, EXTRACTED SO IT CAN BE ARGUED WITH.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE EXIST AT ALL, which is not obvious from the outside.
 *
 * Every report in this directory used to ask the database for its display order
 * and read the answer unbounded: `.order('created_at').select(...)` with no
 * `.limit()` and no `.range()`. Supabase caps a response at 1,000 rows in
 * silence ("By default, Supabase projects return a maximum of 1,000 rows",
 * https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19),
 * so past a thousand attendees the server chose which ones to keep and nobody
 * was told.
 *
 * Paging fixes the truncation and takes the display order away, because a
 * ranged read has to page on a UNIQUE column or the windows are undefined: with
 * a non-unique `order by`, Postgres may hand back one row in two windows and
 * another in none. `created_at` is not unique on any of these tables. So every
 * read now pages on the primary key, which is a total order, and the rows are
 * put into their reading order HERE, afterwards, where it is pure and testable.
 *
 * That is the same shape `dashboard/page.tsx` already uses, and it is recorded
 * in `scripts/guards/the-organiser-dashboard-reads-every-row.mjs` clause 4.
 *
 * ---------------------------------------------------------------------------
 * EVERY COMPARATOR HERE IS TOTAL, and that word is doing work.
 *
 * A comparator that returns 0 for two different rows leaves their order to
 * `Array.prototype.sort`, and the rows arrive in primary-key order, which for a
 * uuid key is effectively random. A door list that reshuffles two attendees who
 * bought in the same second, on every page load, is not a stable document to
 * hand a person on a door. So each comparator falls through to a column that is
 * unique on its own table.
 */

/** The columns the ticket sort needs. Deliberately narrower than the row. */
export interface TicketOrderFields {
  created_at?: string | null
  ticket_code: string
}

/** The columns the order sort needs. */
export interface OrderOrderFields {
  created_at?: string | null
  order_number: string
}

/** One scan, as the door review reads it. */
export interface ScanOrderFields {
  id: string
  ticket_id?: string | null
  scanned_at?: string | null
}

/**
 * OLDEST TICKET FIRST, which is the order the attendee list and the printed
 * door list have always been read in, restored after paging on the key.
 *
 * `ticket_code` is the tiebreaker because it carries a UNIQUE index of its own,
 * so two tickets sold in the same second still have one defined order.
 */
export function byTicketReadingOrder(a: TicketOrderFields, b: TicketOrderFields): number {
  const at = a.created_at ?? ''
  const bt = b.created_at ?? ''
  if (at !== bt) return at < bt ? -1 : 1
  return a.ticket_code < b.ticket_code ? -1 : a.ticket_code > b.ticket_code ? 1 : 0
}

/**
 * NEWEST ORDER FIRST, the order both the orders report and the orders screen
 * have always shown, restored after paging on the key.
 */
export function byOrderReadingOrder(a: OrderOrderFields, b: OrderOrderFields): number {
  const at = a.created_at ?? ''
  const bt = b.created_at ?? ''
  if (at !== bt) return at > bt ? -1 : 1
  return a.order_number < b.order_number ? -1 : a.order_number > b.order_number ? 1 : 0
}

/**
 * THE FIRST SYNC WINS, AND IT HAS TO BE THE FIRST ONE.
 *
 * Scope v5 3.12: "if two scanners validate the same ticket offline, the first
 * sync wins and the second is flagged for manual review". The door review shows
 * the flagged scan beside the admission that beat it, so "the admission that
 * beat it" must be the EARLIEST admission for that ticket.
 *
 * The read this replaced took the first row it happened to encounter, from a
 * query with no `order by` at all. Which admission "won" on the screen was
 * therefore whichever one Postgres returned first, which is undefined and could
 * differ between two loads of the same page. The organiser was being shown a
 * door and a time to go and ask somebody about.
 *
 * `scanned_at` is the SERVER's record of the sync, which is what "first sync"
 * means; `device_scanned_at` is the scanner's own clock and is what gets
 * DISPLAYED, and the two are different questions. Two syncs recorded in the
 * same microsecond fall through to the scan id, which is the primary key.
 */
export function earliestScanPerTicket<T extends ScanOrderFields>(scans: T[]): Map<string, T> {
  const winners = new Map<string, T>()
  for (const scan of scans) {
    if (!scan.ticket_id) continue
    const held = winners.get(scan.ticket_id)
    if (!held) {
      winners.set(scan.ticket_id, scan)
      continue
    }
    const heldAt = held.scanned_at ?? ''
    const scanAt = scan.scanned_at ?? ''
    if (scanAt < heldAt || (scanAt === heldAt && scan.id < held.id)) {
      winners.set(scan.ticket_id, scan)
    }
  }
  return winners
}
