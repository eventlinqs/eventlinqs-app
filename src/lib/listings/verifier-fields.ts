import { alsoOn, buttonOf, priceToShow, type BookingLink } from '@/lib/events/booking-links'

/**
 * PRICE AND CATEGORY IN THE VERIFIER'S SAMPLE (WINDOW 5A's 09:44 of 7 November 2026; the CONTROLLER's 10:16). LAW 19
 * section 3 asks the 20 event sample field by field between source, database and live page; the verifier compared the
 * start, venue, city and link. These are the price and the category, database against live page: the stored side is built
 * by the schema's own rule (src/lib/seo/event-schema.ts: the button's link, then the others, a price only while fresh, a
 * free registration at 0), the live side read from what a visitor's browser receives. Source against database for the
 * price is the accuracy sweep's, for every listing. Pure.
 */

/** The price the event page's schema should offer first, from the stored links; null when no link holds a fresh price. */
export function expectedOfferCents(links: readonly BookingLink[], now: Date): number | null {
  for (const l of [buttonOf(links), ...alsoOn(links)]) {
    if (!l) continue
    const cents = l.kind === 'free_register' ? 0 : priceToShow(l, now)
    if (cents !== null) return cents
  }
  return null
}

/** The first Offer's price in the page's JSON-LD, in cents; null when it offers no price. */
export function liveOfferCents(html: string): number | null {
  const m = html.match(/"@type"\s*:\s*"Offer"[^{}]*?"price"\s*:\s*"?(\d+(?:\.\d{1,2})?)"?/)
  return m ? Math.round(Number(m[1]) * 100) : null
}

/** The live page offers the price the stored links say it should: the same figure, or none on either side. */
export function priceAgrees(expected: number | null, live: number | null): boolean {
  return expected === live
}

/**
 * The stored category is what the event page's hero shows: its name in the page's own text before the title (the hero's
 * chip sits above the title). Null when no category is stored, which is not judged.
 */
export function categoryShown(mainText: string, title: string, category: string | null): boolean | null {
  if (!category) return null
  const fold = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const text = fold(mainText)
  const at = text.indexOf(fold(title))
  const hero = at >= 0 ? text.slice(0, at) : text.slice(0, 200)
  return hero.includes(fold(category))
}
