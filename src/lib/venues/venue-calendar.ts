import { partnerSourceRow, type PartnerSourceRow } from '@/lib/listings/partner-feed'

/**
 * D3 (3), A VENUE GIVES EVENTLINQS ITS OWN CALENDAR (the DemandOS directive, section 3, "Approved event calendar access").
 *
 * Staff could already add a partner's feed on their yes (/admin/collected, src/lib/listings/partner-feed.ts). This is
 * the venue's own door on /dashboard/organisation/media: one of a claimed venue's own people (the database's rule,
 * public.venue_image_manager) gives its iCal address with its yes, and the same register row is written, read daily,
 * its new nights at the venue's own address accepted by the partner rule (src/lib/listings/collect-run.ts
 * acceptedByRule) and everything else queued for review. One live calendar per venue. Stopping it sets the source to
 * 'never' read, so the reading stops at once and the record of the yes is kept.
 */

export const VENUE_CALENDAR_YES_WORDS =
  'EventLinqs may read this calendar every day and list our public nights on EventLinqs, each with a link to book with us.'

/** Where the venue gives its yes: the register keeps it as the place the yes was said. */
const WHERE = 'https://www.eventlinqs.com.au/dashboard/organisation/media'

export type VenueCalendarAnswer = { readonly state: 'done'; readonly id: string } | { readonly state: 'refused'; readonly reason: string }

export type VenueCalendarDeps = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code: string; message: string } | null }>
  venue(venueId: string): Promise<{ name: string; citySlug: string | null; organisationId: string; organisationName: string } | null>
  /** The ids of the venue's own calendars still read. */
  liveCalendars(venueId: string): Promise<string[]>
  insert(row: PartnerSourceRow): Promise<string>
  source(sourceId: string): Promise<{ venueId: string | null; sourceType: string; collection: string } | null>
  stop(sourceId: string): Promise<void>
}

async function mayAct(userId: string, venueId: string, deps: VenueCalendarDeps): Promise<boolean> {
  const { data, error } = await deps.rpc('venue_image_manager', { p_user: userId, p_venue: venueId })
  if (error) throw new Error(`who may act for the venue could not be read: ${error.message}`)
  return data === true
}

export async function giveVenueCalendar(
  input: { userId: string; venueId: string; categoryId: string; feedUrl: string; ticked: boolean; authority: boolean; today: string },
  deps: VenueCalendarDeps,
): Promise<VenueCalendarAnswer> {
  if (!input.ticked || !input.authority) return { state: 'refused', reason: 'Tick both boxes, so we may read your calendar.' }
  if (!(await mayAct(input.userId, input.venueId, deps))) return { state: 'refused', reason: 'Only the people of a claimed venue may give us its calendar.' }
  const venue = await deps.venue(input.venueId)
  if (!venue) return { state: 'refused', reason: 'Only the people of a claimed venue may give us its calendar.' }
  if ((await deps.liveCalendars(input.venueId)).length > 0) {
    return { state: 'refused', reason: 'We already read a calendar of yours. Stop it first to give us a new one.' }
  }
  const built = partnerSourceRow(
    {
      organisationId: venue.organisationId,
      venueId: input.venueId,
      categoryId: input.categoryId,
      feedUrl: input.feedUrl.trim(),
      feedKind: 'calendar',
      yesUrl: WHERE,
      yesWords: VENUE_CALENDAR_YES_WORDS,
      yesOn: input.today,
      organisationName: venue.organisationName,
      venueName: venue.name,
      venueCitySlug: venue.citySlug,
    },
    input.today,
  )
  if ('refused' in built) return { state: 'refused', reason: built.refused }
  return { state: 'done', id: await deps.insert(built.row) }
}

export async function stopVenueCalendar(userId: string, sourceId: string, deps: VenueCalendarDeps): Promise<VenueCalendarAnswer> {
  const source = await deps.source(sourceId)
  if (!source || source.sourceType !== 'venue_partnership' || source.venueId === null) {
    return { state: 'refused', reason: 'That is not a calendar your venue gave us.' }
  }
  if (!(await mayAct(userId, source.venueId, deps))) return { state: 'refused', reason: 'Only the people of a claimed venue may stop its calendar.' }
  await deps.stop(sourceId)
  return { state: 'done', id: sourceId }
}
