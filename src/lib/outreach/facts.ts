/**
 * THE VERIFIED FACTS A MESSAGE IS FILLED FROM (window 6, 28 October 2026).
 *
 * The messages file: "fields in [brackets] come from the verified listing. If the true line cannot be filled from
 * verified facts, the message is HELD for Lawal, never sent generic." So every field here is read from a row the
 * listings import checked (venues, event_series, cities) or from the contact itself; a field with no such source is
 * left out, and the rules (src/lib/outreach/rules.ts) hold the draft and name it.
 *
 * THE TRUE LINE is built from the series' own facts only: its name, its venue, and when it runs ("Open Mic Comedy at
 * Here & Now Lounge, every Sunday."). No adjective, no claim about the night, nothing the listing does not hold.
 * Links are minted as the routes resolve them: /venues/<venueSlugify(name)> and its /claim (src/lib/venues/venue-slug.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { venueSlugify } from '@/lib/venues/venue-slug'

type Admin = SupabaseClient<Database>

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ORDINAL: Record<string, string> = { 'monthly-1': 'first', 'monthly-2': 'second', 'monthly-3': 'third', 'monthly-4': 'fourth', 'monthly-last': 'last' }

/** When a series runs, in words, from its rule and weekday; null for a one-off. */
export function whenItRuns(rule: string, day: number): string | null {
  const weekday = WEEKDAYS[day]
  if (!weekday) return null
  if (rule === 'weekly') return `every ${weekday}`
  if (rule === 'fortnightly') return `every second ${weekday}`
  if (ORDINAL[rule]) return `the ${ORDINAL[rule]} ${weekday} of each month`
  return null
}

/**
 * "Open Mic Comedy" names one night; the nights are "Open Mic Comedy nights" unless the name already says so. A series
 * that starts before 5 pm is not a night (the drive's Friday morning library session read as "nights"), so it is
 * "sessions": the word follows the listing's own start time, never the template's habit.
 */
export function nightsOf(seriesName: string, startsAt?: string | null): string {
  const name = seriesName.trim()
  if (/\bnights?$/i.test(name)) return name.replace(/\b(night)$/i, '$1s')
  const hour = startsAt ? Number(startsAt.slice(0, 2)) : NaN
  return Number.isFinite(hour) && hour < 17 ? `${name} sessions` : `${name} nights`
}

export function trueLine(seriesName: string, venueName: string, rule: string, day: number): string | null {
  const when = whenItRuns(rule, day)
  if (!when) return null
  return `${seriesName.trim()} at ${venueName.trim()}, ${when}.`
}

export type ContactFacts = Record<string, string | null>

/** Every field the templates use that this contact's verified rows can fill. */
export async function factsForContact(db: Admin, contactId: string, origin: string): Promise<ContactFacts> {
  const facts: ContactFacts = {}
  const contact = await db.from('organiser_contacts').select('organiser_id, person_name, unsubscribe_token').eq('id', contactId).single()
  if (contact.error) throw new Error(`the contact: ${contact.error.message}`)
  const first = contact.data.person_name?.trim().split(/\s+/)[0]
  facts['first name'] = first && first.length > 0 ? first : null

  const links = await db.from('organiser_venues').select('venue_id').eq('organiser_id', contact.data.organiser_id)
  const venueIds = (links.data ?? []).map((l) => l.venue_id)
  if (venueIds.length === 0) return facts
  const venues = await db.from('venues').select('id, name, city_slug, removed_at').in('id', venueIds).is('removed_at', null).order('name')
  const venue = venues.data?.[0]
  if (!venue) return facts
  facts.venue = venue.name
  const handle = venueSlugify(venue.name)
  const base = origin.replace(/\/+$/, '')
  facts['listing link'] = `${base}/venues/${handle}`
  facts['claim link'] = `${base}/venues/${handle}/claim`
  facts.link = `${base}/venues/${handle}`

  if (venue.city_slug) {
    const city = await db.from('cities').select('name').eq('slug', venue.city_slug).maybeSingle()
    facts.city = city.data?.name ?? null
  }

  // A recurring series speaks for the venue before a one-off: only a rhythm gives a true line (the drive found a venue
  // whose alphabetically first series was a one-off while a weekly one ran beside it).
  const series = await db.from('event_series').select('name, rule, day, starts_at').eq('venue_id', venue.id).eq('status', 'active').order('name').limit(20)
  const s = (series.data ?? []).find((x) => x.rule !== 'once') ?? series.data?.[0]
  if (s) {
    facts.night = s.name
    facts.nights = nightsOf(s.name, s.starts_at)
    // Message 4 closes "All the best with the [gigs]": the listing's own words for them are its nights or sessions.
    facts.gigs = facts.nights
    facts['night type'] = s.name
    facts['true line'] = trueLine(s.name, venue.name, s.rule, s.day)
    facts['short true line'] = facts['true line'] ? facts['true line'].replace(/\.$/, '') : null
  }
  return facts
}
