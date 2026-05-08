/**
 * Editorial copy generator for /culture/[culture]/[city] intersection
 * pages (Batch 7).
 *
 * Each intersection page is the SEO bait for high-intent searches like
 * "African events Sydney" or "Bollywood Melbourne". The editorial
 * paragraph names specific suburbs the culture occupies in the city,
 * specific event types popular in that combination, and ends with an
 * organiser-pride line.
 *
 * Strategy:
 *  - Hand-crafted copy for the top 10 most-trafficked combinations.
 *  - Smart template fallback for the remaining ~261. The fallback
 *    composes from the culture's existing tagline + sub-culture list +
 *    the city's known cultural communities.
 *
 * Voice: Australian English, no em-dashes, no exclamation marks.
 */

import type { CultureContent, CultureSlug } from './data'
import type { CityContent, CitySlug } from '@/lib/cities/data'

type IntersectionKey = `${CultureSlug}/${CitySlug}`

const HAND_CRAFTED: Partial<Record<IntersectionKey, string>> = {
  'african/sydney':
    "From the auntie booking the hall in Chatswood for an Owambe Saturday, to the DJ keeping Marrickville moving with Amapiano sets, Sydney's African scene is alive and growing. Afrobeats Fridays in the CBD, Pan-African Gospel Sundays in Lakemba, West African drum nights in Newtown - the city moves to every African rhythm. Whether you're Yoruba, Igbo, Akan, Zulu or Somali, Sydney has space for your celebration. EventLinqs is built for the Sydney organisers running it all - the festival chair, the squad booker, the promoter who knows every aunty's WhatsApp.",

  'african/melbourne':
    "Footscray, Sunshine, Werribee, North Melbourne - Melbourne's African community runs on weekend events and the city blocks them. Ethiopian coffee ceremonies in West Footscray, Sudanese family festivals in Sunshine, Nigerian Owambe at Melbourne Town Hall, Amapiano warehouse parties in Brunswick, South African braais in Werribee. Pan-African Gospel Sundays draw congregations from every postcode. EventLinqs gives Melbourne African organisers a platform tuned for diaspora-scale community events, with WhatsApp share built in and squad bookings so the whole crew comes together.",

  'south-asian/sydney':
    "Bollywood club nights at the Star, garba and Navratri at Sydney Olympic Park, Diwali fireworks lighting up Parramatta and Auburn, Holi colours covering Sydney University every March. Tamil cinema premieres in Strathfield, Indian classical at the Opera House, bhangra raves in Liverpool. Sydney's South Asian scene is generations deep and a million strong, from Indian and Pakistani aunties running family festivals to Sri Lankan and Bangladeshi student societies booking out venues every weekend. EventLinqs is built for the Sydney South Asian promoters who already know the community shows up - we just give them a fairer ticketing platform.",

  'south-asian/melbourne':
    "Indian Film Festival of Melbourne every August, Diwali at Federation Square, Holi at Princes Park, Navratri garba nights in Wantirna, bhangra warehouse parties in Brunswick, South Indian classical at the Melbourne Recital Centre. Tamil and Telugu cinema in Box Hill, Bollywood at the Bendigo Bank Centre, Sri Lankan family festivals in Dandenong. Melbourne's South Asian community runs every weekend and books every kind of venue. EventLinqs is built for Melbourne South Asian organisers who want transparent fees, WhatsApp-first sharing, and tools that respect a community that has been throwing the city's biggest cultural events for decades.",

  'caribbean/sydney':
    "Sydney Carnival every February turning Hyde Park into Notting Hill for a weekend, Soca Saturdays in Newtown, reggae nights in Marrickville, Trinidadian J'ouvert breakfasts in Coogee, Jamaican beach parties at Bondi, Caribbean Gospel Sundays in Liverpool. The city's Caribbean community is small but runs hard, and the calendar peaks every Australian summer with mas, calypso and steel drum events that pull a whole-city crowd. EventLinqs is built for the Sydney Caribbean promoters who keep the carnival alive year-round.",

  'east-asian/sydney':
    "Chinese New Year turning Haymarket into a 100,000-strong outdoor party, K-pop concerts at Qudos Bank Arena, J-rock and anime conventions at the ICC, Vietnamese New Year at Cabra-Vale, Korean cultural festivals in Strathfield, Japanese matsuri in Darling Harbour. Lunar new year red lanterns light up every Chinatown corner. From K-pop dance crews to Tamil cinema and J-pop singalongs, Sydney's East Asian community runs the most diverse event calendar in the country. EventLinqs is built for Sydney's East Asian promoters - the dance crew leader, the cultural society chair, the festival committee chair.",

  'latin/sydney':
    "Salsa nights in Surry Hills, bachata socials in Newtown, reggaeton club nights in Kings Cross, Mexican Day of the Dead at Carriageworks, Brazilian samba schools in Petersham, Cuban son nights at the basement, Argentine tango milongas across the inner west. Sydney's Latin scene is a Pan-American mosaic, with promoters from every country in Central and South America running weekly socials and seasonal mega-events. EventLinqs gives Sydney Latin organisers a fair platform that respects how the community moves: WhatsApp shares, squad bookings for crews, and zero hidden fees.",

  'mediterranean/melbourne':
    "Italian sagra in Carlton every summer, Greek glendi in Oakleigh through every month, Spanish flamenco at the Melbourne Recital Centre, Portuguese fado in Brunswick, Cypriot souvla at the Cypriot Community Hall, Lebanese mahrajan in Coburg. Melbourne's Mediterranean scene is generations old and still growing, with old-country club venues sitting beside contemporary fusion warehouse parties. EventLinqs is built for the Melbourne Mediterranean organisers running everything from family-club glendi to high-end festival weekends.",

  'middle-eastern/sydney':
    "Lebanese mahrajan in Punchbowl pulling 5000 a weekend, Persian Norouz at the Town Hall, Iraqi cultural festivals in Fairfield, Egyptian shaabi nights in Bankstown, Turkish folk dances in Auburn, Arabic concerts at the ICC and the Hordern Pavilion. Sydney's Middle Eastern community is dense, organised and runs both family-scale weekend events and city-scale festivals across Lebanese, Egyptian, Persian, Iraqi, Turkish and Israeli communities. EventLinqs is built for Sydney Middle Eastern promoters who already know their community shows up loud.",

  'filipino/melbourne':
    "Filipino Fiesta at Federation Square, Sinulog street parade in central Melbourne, Modern Filipino DJ nights in Brunswick, Filipino Independence Day celebrations across Wyndham, parol-lit Christmas at the Filipino Community Council. Melbourne's Filipino community is one of the largest in the country, running weekend fiestas in Werribee and Cranbourne, family festivals at Filipino-Australian sports clubs, and youth-led modern fusion events in the inner city. EventLinqs is built for Melbourne Filipino organisers running events that bring a generations-deep community together.",
}

/** Format a list of strings as a comma-separated phrase with " and " before the last item. */
function joinList(items: string[], conjunction: 'and' | 'or' = 'and'): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`
}

/**
 * Template fallback for combinations not in the hand-crafted set.
 * Uses the culture's sub-cultures + the city's name + a generic
 * organiser-pride closing. Voice still matches the brand: no em-dashes,
 * no exclamation marks.
 */
function templateEditorial(culture: CultureContent, cityName: string, cityRecord: CityContent | null): string {
  const subCultureLabels = culture.subCultures.slice(0, 4).map(s => s.label)
  const subCultureSentence = subCultureLabels.length > 0
    ? `${joinList(subCultureLabels)} are all on across ${cityName} when the calendar fills up.`
    : `Every ${culture.displayName} sound is on across ${cityName} when the calendar fills up.`

  const stateLine = cityRecord?.state
    ? `${cityName}, ${cityRecord.state}, has a ${culture.displayName.toLowerCase()} community that books every kind of venue, from community halls to live-music venues to outdoor festival sites.`
    : `${cityName} has a ${culture.displayName.toLowerCase()} community that books every kind of venue, from community halls to live-music venues to outdoor festival sites.`

  const closing = `EventLinqs is built for ${cityName} ${culture.displayName.toLowerCase()} organisers who want transparent fees, WhatsApp-first sharing, and squad bookings so the whole crew comes together. ${culture.tagline}`

  return `${stateLine} ${subCultureSentence} ${closing}`
}

export function getIntersectionEditorial(
  culture: CultureContent,
  citySlug: string,
  cityName: string,
  cityRecord: CityContent | null,
): string {
  const key = `${culture.slug}/${citySlug}` as IntersectionKey
  const handCrafted = HAND_CRAFTED[key]
  if (handCrafted) return handCrafted
  return templateEditorial(culture, cityName, cityRecord)
}

/**
 * Hero subtitle generator. Hand-crafted for top combinations, templated
 * fallback for the rest. Always Australian English, no em-dashes.
 */
const HERO_SUBTITLES: Partial<Record<IntersectionKey, string>> = {
  'african/sydney':         "From Lagos to Lakemba, Sydney's African scene.",
  'african/melbourne':      "From Footscray to the city, Melbourne's African scene.",
  'south-asian/sydney':     "From Bollywood to Bondi, Sydney's South Asian scene.",
  'south-asian/melbourne':  "From Bollywood to Bayside, Melbourne's South Asian scene.",
  'caribbean/sydney':       "Carnival, soca and steel drum, Sydney style.",
  'east-asian/sydney':      "K-pop, Lunar, J-rock - Sydney's full East Asian spectrum.",
  'latin/sydney':           "Salsa, bachata and reggaeton, alive across Sydney.",
  'mediterranean/melbourne':"Italian, Greek, Spanish - Melbourne's Mediterranean nights.",
  'middle-eastern/sydney':  "Lebanese, Persian, Arabic - Sydney's Middle Eastern stage.",
  'filipino/melbourne':     "Fiesta, Sinulog and modern fusion, Melbourne wide.",
}

export function getIntersectionHeroSubtitle(
  culture: CultureContent,
  citySlug: string,
  cityName: string,
): string {
  const key = `${culture.slug}/${citySlug}` as IntersectionKey
  return HERO_SUBTITLES[key] ?? `${culture.tagline} On stage in ${cityName}.`
}
