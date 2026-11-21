import { OUR_CHECKOUT_LABEL, OUR_REGISTRATION_LABEL, OUTBOUND_LABEL, WALK_IN_LABEL, type DirectoryRow } from '@/lib/events/whats-on-directory'
import { ROW_FREE_WITH_BOOKING } from '@/lib/events/cta'
import { archivalNote } from '@/lib/media/photo-credits'
import { illustrativePhoto } from '@/lib/images/illustrative'

/**
 * THE FACTS A CARD DRAWS, ONE SOURCE (moved here word for word from the city guide's client module on 21 November 2026,
 * train AU, so the marketplace home's server component can call them; src/components/features/city-guide/city-guide.tsx
 * re-exports both, unchanged).
 */

/**
 * THE PHOTOGRAPH A CARD DRAWS (Lawal, 12 November 2026, 01:01): the night's own, with no credit line (law 17 (d) as
 * narrowed by Lawal, 19 November 2026, 11:36: "You don't put no photo credit"; its permission stays in the register),
 * only, where archival, that it is from a past one (archivalNote);
 * else the venue's own photograph the photo lock dealt to this night (src/lib/events/venue-thumbs.ts), labelled as the
 * venue beside its licence credit, the one credit law 17 (d) keeps, so the venue is never presented as the act; else
 * (law 46 (f), Lawal's 09:16 of 21 November 2026, which replaces 'else none, never a stand-in') the licensed photograph
 * of its kind, looked at, no face its subject, labelled 'Illustrative photo' on the photograph; else none.
 */
export function cardPhoto(r: DirectoryRow): { src: string; alt: string; credit: string | null; illustrative?: boolean } | null {
  if (r.thumb) return { src: r.thumb, alt: r.thumbAlt ?? '', credit: archivalNote(r.thumbCredit) }
  if (r.venueThumb) {
    const venue = r.venue ? `The venue, ${r.venue}` : 'The venue'
    return { src: r.venueThumb, alt: r.venue ? `${r.venue}, the venue` : 'The venue', credit: [venue, r.venueThumbCredit].filter(Boolean).join('. ') }
  }
  const stand = illustrativePhoto(r.categorySlug)
  if (stand) return { src: stand, alt: `${r.category ?? 'An event'}, an illustrative photo`, credit: null, illustrative: true }
  return null
}

/**
 * ONE ROW, EACH FACT ONCE (Lawal, 2 November 2026, 09:00, refinements 1 and 4). `said` is the row's one meta word for
 * price: 'Free · Walk in' for a free walk-in night, 'Free' for a free night with a booking, else the price; `book` is
 * where it is booked ('Book on EventLinqs', 'Tickets at <seller>', 'Register at <seller>', 'Get tickets'), alone on its
 * line, with the outbound mark when it leaves EventLinqs. Nothing is said twice and no row names a domain.
 */
export function bookingLine(r: Pick<DirectoryRow, 'price' | 'source' | 'free'>): { said: string | null; book: string | null; outbound: boolean } {
  if (r.source === WALK_IN_LABEL) return { said: WALK_IN_LABEL, book: null, outbound: false }
  const said = r.free ? ROW_FREE_WITH_BOOKING : r.price || null
  if (r.source === OUR_CHECKOUT_LABEL || r.source === OUR_REGISTRATION_LABEL) return { said, book: r.source, outbound: false }
  if (OUTBOUND_LABEL.test(r.source)) return { said, book: r.source, outbound: true }
  return { said, book: null, outbound: false }
}
