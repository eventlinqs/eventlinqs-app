/**
 * WHO A PAGE NAMES AS AN EVENT'S ORGANISER (WI2, ruling A of 23 October 2026:
 * "the listings organisation is Lawal's and is never shown ... every artefact of
 * an EventLinqs listing names its host").
 *
 * An organiser's own event names its organisation, links its page and can be
 * followed. An EventLinqs listing (events.listing_source 'eventlinqs', written by
 * the city listings import) is held by the listings organisation until its host
 * claims it, and that organisation is shown NOWHERE: not on a card, not on the
 * event page, not in the structured data, not as an organiser page or a sitemap
 * entry. The listing names its HOST, the venue whose night it is, with no
 * organiser page to link and no organiser to follow (a claimed host gets those
 * in WI2 Part 3). artefactOrganiser (src/lib/broadcast/artefact-organiser.ts)
 * holds the same rule for the Launch Kit's artefacts.
 *
 * A leaf, so every rule here is tested without a database.
 */

/** The organisation that holds EventLinqs listings (scripts/ops/make-listings-organisation.mjs). */
export const LISTINGS_ORGANISATION_SLUG = 'eventlinqs-listings'

export function isEventLinqsListing(event: { listing_source?: string | null } | null | undefined): boolean {
  return event?.listing_source === 'eventlinqs'
}

/** Whether an organisation is the listings organisation, by its slug. */
export function isListingsOrganisation(slug: string | null | undefined): boolean {
  return slug === LISTINGS_ORGANISATION_SLUG
}

export type ShownOrganiser = {
  /** The name a reader sees. */
  name: string
  /** The organiser page's slug, or null when there is no organiser page to link. */
  slug: string | null
  shortName: string | null
  website: string | null
  instagram: string | null
  /** Whether a Follow button for this organiser belongs on the page. */
  followable: boolean
}

/**
 * THE HOST WHEN IT IS NOT THE VENUE (the PM's 09:45 of 19 November 2026, item 1 (b), and what looking found at 10:02).
 * A listing names its host, the venue whose night it is; but an organiser's festival in a public garden is not the
 * garden's night. Asia Oasis' Colours of Asia used to read venue 'Asia Oasis, 3 Boathouse Drive' so that the page named
 * the host; once its venue was corrected to Alexandra Gardens (Aria's own words), the page read 'Organised by Alexandra
 * Gardens'. The night now records its host in its own metadata (host_name, with host_source saying where that came
 * from), and a listing names it before the venue.
 */
export function listingHost(event: { venue_name?: string | null; metadata?: unknown }): string | null {
  const meta = event.metadata
  const host = meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>).host_name : null
  if (typeof host === 'string' && host.trim() !== '') return host.trim()
  return event.venue_name?.trim() || null
}

export function shownOrganiser(
  event: { listing_source?: string | null; venue_name?: string | null; metadata?: unknown },
  organisation: {
    name?: string | null
    slug?: string | null
    short_name?: string | null
    website?: string | null
    instagram_handle?: string | null
  } | null,
): ShownOrganiser {
  if (isEventLinqsListing(event) || isListingsOrganisation(organisation?.slug)) {
    return {
      name: listingHost(event) || 'The venue',
      slug: null,
      shortName: null,
      website: null,
      instagram: null,
      followable: false,
    }
  }
  return {
    name: organisation?.name?.trim() || 'the organiser',
    slug: organisation?.slug ?? null,
    shortName: organisation?.short_name ?? null,
    website: organisation?.website ?? null,
    instagram: organisation?.instagram_handle ?? null,
    followable: Boolean(organisation),
  }
}

/**
 * WHO PUTS A NIGHT ON, NEVER WHERE IT IS (the PM's verify of 23 November 2026 on piece da22e104: its caption read 'A Moment
 * of Sanity, by Thornbury Apothecary', the venue named as the night's maker). A page shows a listing under its host, which
 * is its venue unless its metadata records another (listingHost); a line that says who MADE the night names only an
 * organiser the night itself names: an organiser's own night, its organisation; a listing, the host its metadata records
 * (host_name), else the organiser its own words name as presenting, hosting or organising it (presenterNamedIn); else
 * nobody, and never the venue for want of a name. Pure.
 */
export function nightMaker(
  event: { listing_source?: string | null; metadata?: unknown; words?: readonly (string | null | undefined)[] },
  organisation: { name?: string | null; slug?: string | null } | null,
): string | null {
  if (!isEventLinqsListing(event) && !isListingsOrganisation(organisation?.slug)) {
    const own = organisation?.name?.trim()
    if (own) return own
  }
  const meta = event.metadata
  const host = meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>).host_name : null
  if (typeof host === 'string' && host.trim() !== '') return host.trim()
  for (const text of event.words ?? []) {
    const named = presenterNamedIn(text)
    if (named) return named
  }
  return null
}

/** A name as a night's words write it: up to six words in capitals, joined by spaces or '&'. */
const NAME = String.raw`[A-Z0-9][^\s,.;:!?()"“”]*(?:\s+(?:&\s+)?[A-Z0-9][^\s,.;:!?()"“”]*){0,5}`
/**
 * The words that say who puts a night on ('presented by', 'hosted by', 'organised by', 'run by', 'led by', 'facilitated
 * by', 'brought to you by', 'your host is'), the name after them, and the organisation that person is of, where named
 * ('Berenice Franklin of GroovyTown Wellbeing', '... from ...', '... (GroovyTown Wellbeing)').
 */
const MAKER_WORDS = new RegExp(
  String.raw`\b(?:(?:[Pp]resented|[Hh]osted|[Oo]rgani[sz]ed|[Rr]un|[Cc]urated|[Ll]ed|[Ff]acilitated|[Bb]rought to you)\s+by|[Yy]our hosts?(?:\s+is|\s+are|,|:)?)\s+(${NAME})(?:\s+(?:of|from)\s+(${NAME})|\s*\((${NAME})\))?`,
)

/**
 * The organiser a night's own words name as putting it on, or null: the organisation where a person is named with it (the
 * PM's RETURN of 15:30 of 23 November 2026: the listing names 'Berenice Franklin of GroovyTown Wellbeing' as host, and the
 * line must read 'by GroovyTown Wellbeing'), else the name itself ('... hosted by GroovyTown Wellbeing at the apothecary.').
 * Only a name in capitals right after the words counts, up to six words, so 'run by volunteers' or a sentence that merely
 * mentions a venue is never read as an organiser. Pure.
 */
export function presenterNamedIn(text: string | null | undefined): string | null {
  if (typeof text !== 'string' || text.trim() === '') return null
  const plain = text.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
  const m = MAKER_WORDS.exec(plain)
  const name = (m?.[2] ?? m?.[3] ?? m?.[1] ?? '').trim()
  return name.length >= 2 && name.length <= 80 ? name : null
}
