import { fourLevels, levelLines, nightFiguresFrom, venueLevels, type FourLevels, type VenueLevels } from '@/lib/growth/four-levels'

/**
 * THE VENUE'S OWN REPORT (the DemandOS directive of 30 October 2026, section 3, "venue-level performance reporting";
 * the final blueprint's section 7; the PROJECT MANAGER's 17:25: "the venue partnership report shows the four honest
 * levels (exposure, interest, booking intent, verified sale) and never more"). The levels and their words are
 * src/lib/growth/four-levels.ts, so a venue, its organiser and Lawal read the same numbers. This file holds only what
 * a venue adds: WHICH nights it may read, and how much of each.
 *
 * A venue hosts other organisers' nights, and their order counts are their own commercial numbers. So a venue reads:
 *   its own organisation's nights: all four levels;
 *   a night it JOINED as a collaborator (event_collaborators, status joined): exposure, interest and booking intent,
 *     and never the orders, which stay with the organiser who runs it;
 *   any other organiser's night at its address: nothing, not even that it exists.
 * Pure.
 */

export interface VenueNightRow {
  readonly eventId: string
  readonly title: string
  readonly startDate: string
  readonly timezone: string
  /** The venue's own organisation runs it; false is a night it joined. */
  readonly own: boolean
  /** organiser_night_reports.figures as kept. */
  readonly figures: unknown
}

export interface VenueReportNight extends FourLevels {
  readonly eventId: string
  readonly title: string
  readonly startDate: string
  readonly timezone: string
  readonly own: boolean
}

export interface VenueReport {
  readonly empty: boolean
  readonly levels: VenueLevels
  /** The four lines, in plain words; none when no night has been reported. */
  readonly lines: readonly string[]
  readonly nights: readonly VenueReportNight[]
  readonly joinedNights: number
  /** Kept reports these levels cannot read (another version): counted, never read as zeros. */
  readonly unread: number
}

/** The nights at this venue that it may read at all, and whose each one is. */
export function nightsAVenueSees<T extends { id: string; organisation_id: string }>(
  events: readonly T[],
  venueOrganisationId: string,
  joinedEventIds: ReadonlySet<string>,
): (T & { own: boolean })[] {
  const seen: (T & { own: boolean })[] = []
  for (const e of events) {
    const own = e.organisation_id === venueOrganisationId
    if (own || joinedEventIds.has(e.id)) seen.push({ ...e, own })
  }
  return seen
}

/** A joined night's orders are dropped HERE, before anything can add or show them. */
function asTheVenueMaySee(levels: FourLevels, own: boolean): FourLevels {
  return own ? levels : { ...levels, verifiedSale: { orders: null, tickets: null } }
}

export function buildVenueReport(rows: readonly VenueNightRow[]): VenueReport {
  const nights: VenueReportNight[] = []
  let unread = 0
  for (const row of rows) {
    const figures = nightFiguresFrom(row.figures)
    if (!figures) {
      unread++
      continue
    }
    nights.push({
      ...asTheVenueMaySee(fourLevels(figures), row.own),
      eventId: row.eventId,
      title: row.title,
      startDate: row.startDate,
      timezone: row.timezone,
      own: row.own,
    })
  }
  const joinedNights = nights.filter((n) => !n.own).length
  const added = venueLevels(nights)
  // venueLevels counts every night with no orders as not ticketed; a joined night may well be ticketed, by its organiser.
  const levels: VenueLevels = { ...added, verifiedSale: { ...added.verifiedSale, nightsNotVisible: added.verifiedSale.nightsNotVisible - joinedNights } }
  return { empty: nights.length === 0, levels, lines: nights.length === 0 ? [] : venueLines(levels, joinedNights), nights, joinedNights, unread }
}

function venueLines(levels: VenueLevels, joinedNights: number): string[] {
  const lines = [...levelLines(levels)]
  if (joinedNights > 0) {
    const theirs = `${joinedNights} ${joinedNights === 1 ? 'night' : 'nights'} run by another organiser, whose sales are theirs to share`
    lines[3] = lines[3].endsWith('none counted') ? `Verified sale: ${theirs}` : `${lines[3]}; ${theirs}`
  }
  return lines
}
