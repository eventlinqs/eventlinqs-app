/**
 * WHAT A PLACE IS CALLED, WHERE THE PERSON IS. Close-out D2.
 *
 *     "All customer facing copy is parameterised by slot category. The word for
 *      a unit comes from a category lookup: ticket, class, appointment, seat,
 *      place, booking. No user facing string hard codes 'ticket'."
 *
 * This file is the lookup, and it is the reason the engine can be pointed at a
 * gym tomorrow: the message a person receives is composed from the slot's own
 * category, which the ledger carries as data, rather than from what this
 * platform happens to sell today.
 *
 * The DEFAULT is deliberately the vaguest of the six rather than the most
 * likely. A gym whose category we have not mapped yet should read "your place",
 * which is true of every business this will ever run for, rather than "your
 * ticket", which would be wrong and would look like a platform that had not
 * noticed what it was selling.
 */

/** The six words the close-out names, and nothing outside them. */
export const UNIT_WORDS = ['ticket', 'class', 'appointment', 'seat', 'place', 'booking'] as const
export type UnitWord = (typeof UNIT_WORDS)[number]

/** The word used when a category has no mapping. True of every business. */
export const DEFAULT_UNIT_WORD: UnitWord = 'place'

/**
 * Category to unit word. Keyed on the slot's own `category`, lower cased.
 *
 * Every key here is a category slug this ledger has actually seen, because a
 * lookup full of categories nobody has is a lookup nobody can check. The ones
 * that are not ticketing are there to prove the mapping is a mapping rather than
 * a synonym for one industry, and they are the categories the close-out itself
 * names as the future of this engine.
 */
const BY_CATEGORY: Record<string, UnitWord> = {
  // Dated performances and gatherings: somebody holds a ticket.
  music: 'ticket',
  comedy: 'ticket',
  festival: 'ticket',
  nightlife: 'ticket',
  sports: 'ticket',
  family: 'ticket',
  'arts-and-community': 'ticket',
  'food-and-drink': 'ticket',
  'business-and-networking': 'seat',

  // The businesses this engine is built to reach without being rebuilt.
  fitness: 'class',
  studio: 'class',
  clinic: 'appointment',
  health: 'appointment',
  tour: 'booking',
  travel: 'booking',
  venue: 'booking',
}

/**
 * The word for one unit of this slot's capacity.
 *
 * @param category the slot's own category, as the ledger recorded it
 */
export function unitWord(category: string | null | undefined): UnitWord {
  const key = (category ?? '').trim().toLowerCase()
  return BY_CATEGORY[key] ?? DEFAULT_UNIT_WORD
}

/** The plural, for the one place a count needs it. */
export function unitWordPlural(category: string | null | undefined, count: number): string {
  const word = unitWord(category)
  return count === 1 ? word : `${word}s`
}

/**
 * Money, in the reader's own words. AUD today because that is what the ledger
 * holds, and a currency the engine does not know is printed as the amount and
 * the code rather than guessed at with a symbol.
 */
export function money(cents: number, currency = 'AUD'): string {
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}
