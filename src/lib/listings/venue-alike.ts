import { SAME_TITLE_SHARE, titleShare, type ListingKey } from '@/lib/events/booking-links'
import { venueSlugify } from '@/lib/venues/venue-slug'

/** Lower case, accents and punctuation gone, single spaces. Pure. */
const fold = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * ONE PLACE WRITTEN TWO WAYS IS ONE PLACE (the Event Discovery Engine, part (e): "merges duplicates"; 13 November 2026). On
 * that day 137 nights waited for a person as 'venue_changed' though not one had moved: their own pages named the venue a
 * little differently from the listing ('Rod Laver Arena, Melbourne' against 'Rod Laver Arena'; 'The Play House' with its
 * address written two ways), and sameVenue (src/lib/events/booking-links.ts) asks for the same name slug and the same
 * address. Read at the SAME start with titles alike, a venue that is plainly the same place is the same night: its links
 * are added to the listing (merged), never held as a change. Alike: the same name slug; one name the other with more
 * words after it (a suburb or a city appended); or, where both give one, the same street number and street word. A
 * different venue at the same minute stays a change for the resolver. Pure.
 */
export function venuesAlike(a: Pick<ListingKey, 'venueName' | 'venueAddress'>, b: Pick<ListingKey, 'venueName' | 'venueAddress'>): boolean {
  const x = venueSlugify(a.venueName ?? '')
  const y = venueSlugify(b.venueName ?? '')
  if (x !== '' && y !== '') {
    if (x === y) return true
    const strip = (s: string) => s.replace(/^the-/, '')
    const [short, long] = strip(x).length <= strip(y).length ? [strip(x), strip(y)] : [strip(y), strip(x)]
    if (short.length >= 4 && long.startsWith(`${short}-`)) return true
  }
  const street = (address: string | null) => {
    const m = fold(address ?? '').match(/\b(\d+[a-z]?)\s+([a-z]+)/)
    return m ? `${m[1]} ${m[2]}` : null
  }
  const sa = street(a.venueAddress)
  const sb = street(b.venueAddress)
  return sa !== null && sa === sb
}

/** The same night, read again: the same exact start (within a minute), titles alike, the venue alike. Pure. */
export function sameNightAlike(k: ListingKey, e: ListingKey): boolean {
  const apart = Math.abs(new Date(k.startsAt).getTime() - new Date(e.startsAt).getTime())
  return Number.isFinite(apart) && apart < 60_000 && titleShare(k.title, e.title) >= SAME_TITLE_SHARE && venuesAlike(k, e)
}
