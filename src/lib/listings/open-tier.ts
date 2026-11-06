/**
 * THE 'FROM' PRICE IS AN OPEN TICKET'S, EVERYWHERE (the engine accuracy sweep, 6 November 2026). A ticket a buyer must qualify
 * for (a concession, an age, a student, a pensioner, a companion, a group or a family) or add to another (an upgrade, a VIP or
 * meet package, dining, a hamper) is never the from price. The Ballarat and Geelong page rules each carried their own list,
 * and the daily link check carried none: it read Eventbrite's lowest offer for the Peter Tobin Oration, the $12 concession,
 * and wrote 'From $12' where the open ticket is $15 ('Tickets $15 ($12 concession)', the Eureka Centre's own page). One list,
 * the two rules' union, read by every reader of a price.
 */
export const RESTRICTED_TIER =
  /concession|child|senior|student|pensioner|companion|family|group|mob tix|under \d+|\d+ years|high five|upgrade|vip|meet|package|dining|hamper/i

/** Whether a ticket's own words name a tier a buyer must qualify for or add to another. */
export function isRestrictedTier(words: string | null | undefined): boolean {
  return RESTRICTED_TIER.test(words ?? '')
}
