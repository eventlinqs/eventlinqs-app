import { REMOVAL_REASONS } from './removal-request'
import { isEventLinqsListing } from './shown-organiser'

/**
 * THE REPORT LINE SAYS WHAT THE PAGE IS (Lawal's 17:44 directive, section 10: the report and removal flow; looked at
 * on live, 31 October 2026). "Report or remove this listing" and the reason "I run this event or venue and want it
 * taken down" were written for listings EventLinqs wrote (events.listing_source 'eventlinqs'), whose organiser has no
 * account here. They were drawn on every page, so the Afro-Fusion Music Showcase, which its organiser runs and sells on
 * EventLinqs, asked its own organiser to request a takedown of their own event. An organiser's own event (listing_source
 * 'organiser') is reported as an event, and its organiser is pointed at the dashboard, where Edit, Pause and Cancel
 * already are (src/app/(dashboard)/dashboard/events/events-table.tsx). Invent nothing: the listing words are unchanged.
 */
export type ReportWords = {
  link: string
  eyebrow: string
  subtitle: string
  back: string
  reasons: readonly { key: string; words: string }[]
  /** For an organiser's own event: where its organiser changes it. */
  organiserLine: { words: string; href: string } | null
}

export function reportWords(listingSource: string | null | undefined): ReportWords {
  if (isEventLinqsListing({ listing_source: listingSource })) {
    return {
      link: 'Report or remove this listing',
      eyebrow: 'REPORT OR REMOVE THIS LISTING',
      subtitle: 'Tell us what is wrong with this listing. A person reads every report the same day.',
      back: 'Back to the listing',
      reasons: REMOVAL_REASONS,
      organiserLine: null,
    }
  }
  return {
    link: 'Report this event',
    eyebrow: 'REPORT THIS EVENT',
    subtitle: 'Tell us what is wrong with this event. A person reads every report the same day.',
    back: 'Back to the event',
    reasons: REMOVAL_REASONS.filter((r) => r.key !== 'mine'),
    organiserLine: { words: 'Running this event? Edit, pause or cancel it from your dashboard.', href: '/dashboard/events' },
  }
}
