/**
 * A PARTNER'S OWN FEED, REGISTERED FROM THEIR YES (the engine plan of 28 October 2026, part E: "partner calendar feeds
 * (iCal or website)"; the directive's section 16: "allow future events to enter EventLinqs through approved submission
 * forms, recurring schedules, calendars or permitted feeds").
 *
 * One register row (public.listing_sources) per partner venue: read daily, the organiser's own words of permission as
 * the evidence for reading it and for its facts, its venue and category named so a night it gives can be published by
 * the partner rule (./collect-run.ts). Photos, posters and descriptions are not taken from the feed: an organiser's
 * images come through the media vault with their own rights record (part D), never from here.
 *
 * Pure: the action on /admin/collected reads the venue and writes the row.
 */

export type PartnerFeedInput = {
  organisationId: string
  organisationName: string
  venueId: string
  venueName: string
  venueCitySlug: string | null
  categoryId: string
  /** The calendar feed (an iCal address) or the events page carrying the organiser's own Event data. */
  feedUrl: string
  feedKind: 'calendar' | 'page'
  /** Where the organiser said yes, or publishes the feed for subscription. */
  yesUrl: string
  /** The organiser's words, as they wrote them. */
  yesWords: string
  /** The day they said it, YYYY-MM-DD. */
  yesOn: string
}

export type PartnerSourceRow = Record<string, string | boolean | null>

const HTTPS = /^https:\/\/[^\s]+$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The register row for a partner's feed, or why it cannot be one. today is YYYY-MM-DD in Melbourne. */
export function partnerSourceRow(input: PartnerFeedInput, today: string): { row: PartnerSourceRow } | { refused: string } {
  const words = input.yesWords.trim()
  if (!HTTPS.test(input.feedUrl)) return { refused: 'The feed must be an https address.' }
  if (!HTTPS.test(input.yesUrl)) return { refused: 'Where they said yes must be an https address.' }
  if (words.length === 0) return { refused: 'Their words of permission are needed, as they wrote them.' }
  if (words.length > 2000) return { refused: 'Their words of permission are longer than 2000 characters.' }
  if (!DAY.test(input.yesOn) || input.yesOn < '2026-01-01' || input.yesOn > today) return { refused: 'The day they said yes must be a real day, not in the future.' }

  const evidence = (prefix: string) => ({
    [prefix]: 'yes',
    [`${prefix}_quote`]: words,
    [`${prefix}_url`]: input.yesUrl,
    [`${prefix}_read_on`]: input.yesOn,
  })
  return {
    row: {
      name: `${input.venueName} (partner feed)`.slice(0, 120),
      kind: 'venue',
      city_slug: input.venueCitySlug,
      page_url: input.feedUrl,
      collection: 'read',
      terms_url: input.yesUrl,
      terms_quote: words,
      terms_read_on: input.yesOn,
      changes: 'daily',
      source_type: 'venue_partnership',
      organisation_id: input.organisationId,
      venue_id: input.venueId,
      category_id: input.categoryId,
      /* All five answers stated, never left to a column default: a batch insert sends a missing key as NULL. */
      may_scrape: 'unknown',
      may_subscribe: 'unknown',
      may_use_dataset: 'unknown',
      may_reuse_media: 'unknown',
      ...evidence(input.feedKind === 'calendar' ? 'may_subscribe' : 'may_scrape'),
      ...evidence('may_redistribute_facts'),
      permits_facts: true,
      permits_links: true,
      permits_descriptions: false,
      permits_images: false,
      verification: 'verified',
      verified_on: today,
      licence_owner: input.organisationName.slice(0, 200),
      notes: `A partner's own feed, read daily on their yes of ${input.yesOn}; their nights publish by the partner rule.`,
    },
  }
}
