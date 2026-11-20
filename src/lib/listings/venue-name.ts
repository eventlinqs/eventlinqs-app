/**
 * A VENUE IS A PLACE (the PM's 03:14 of 21 November 2026, item 3). Read on production at 03:30 that day: six venue rows
 * were named after a council ('City of Greater Geelong', the host of Carols by the Bay, held at Steampacket Gardens by its
 * own words), and one was a bare street address ('1 Sailors Gully Road, Eaglehawk', five nights of Witness for the
 * Prosecution, staged in the Old Eaglehawk Court House by their own words). A guide, a card and a newsletter say where to
 * go; an organisation is who runs a night, and an address is where a place is, never its name. The collector refuses to
 * make a venue of either and holds the night for a person, who names the place. Pure.
 */

const COUNCIL = /^(city|shire|rural city|borough|town) of\b|\bcouncil$/i
const STREET_TYPES = 'road|rd|street|st|avenue|ave|parade|pde|drive|dr|lane|ln|highway|hwy|place|pl|terrace|tce|court|ct|crescent|cres|boulevard|blvd|way|esplanade'
const BARE_ADDRESS = new RegExp(`^\\d+[a-z]?(-\\d+[a-z]?)?\\s+[a-z' ]+\\s(${STREET_TYPES})\\b`, 'i')

/** Why a name is not a place (a council or organisation, or a bare street address), or null where it may be a venue. */
export function notAPlace(name: string | null | undefined): string | null {
  const n = (name ?? '').replace(/\s+/g, ' ').trim()
  if (n === '') return 'no venue is named'
  if (COUNCIL.test(n)) return `'${n}' names a council, which runs nights; it is not where one is held`
  if (BARE_ADDRESS.test(n)) return `'${n}' is a street address, not the name of a place`
  return null
}
