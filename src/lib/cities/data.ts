/**
 * City + suburb content registry - source of truth for the 20 city +
 * 24 suburb landing pages at /city/[slug] and /city/[slug]/[suburb].
 *
 * Tier 1 AU (8): sydney, melbourne, brisbane, perth, adelaide, gold-coast,
 *                canberra, hobart
 * Tier 2 AU (12): newcastle, wollongong, geelong, townsville, cairns,
 *                darwin, sunshine-coast, bendigo, ballarat, albury,
 *                launceston, toowoomba
 *
 * The DB cities + suburbs tables (20260507000001_city_taxonomy.sql)
 * mirror the slug + tier + lat/lng + hero_query; this file owns the
 * editorial content (descriptor, prose, related cities, suburb prose).
 *
 * Voice: Australian English, no em-dashes, no exclamation marks.
 */

export type CitySlug =
  | 'sydney' | 'melbourne' | 'brisbane' | 'perth' | 'adelaide'
  | 'gold-coast' | 'canberra' | 'hobart'
  | 'newcastle' | 'wollongong' | 'geelong' | 'townsville' | 'cairns'
  | 'darwin' | 'sunshine-coast' | 'bendigo' | 'ballarat' | 'albury'
  | 'launceston' | 'toowoomba'

export type SuburbSlug =
  | 'sydney-inner-west' | 'sydney-north-shore' | 'sydney-eastern-suburbs'
  | 'sydney-western-sydney' | 'sydney-northern-beaches' | 'sydney-sutherland-shire'
  | 'melbourne-inner-melbourne' | 'melbourne-eastern-suburbs'
  | 'melbourne-western-suburbs' | 'melbourne-northern-suburbs'
  | 'melbourne-southern-suburbs' | 'melbourne-bayside'
  | 'brisbane-inner-city' | 'brisbane-north-side' | 'brisbane-south-side'
  | 'brisbane-west-end'
  | 'perth-inner-perth' | 'perth-northern-suburbs' | 'perth-southern-suburbs'
  | 'perth-coastal'
  | 'gold-coast-surfers-paradise' | 'gold-coast-broadbeach'
  | 'canberra-civic'
  | 'hobart-inner-city'

export interface CityContent {
  slug: CitySlug
  name: string
  state: string
  region: string
  tier: 1 | 2
  population: number
  latitude: number
  longitude: number
  /** Single-sentence descriptor used under the hero. */
  descriptor: string
  /** Editorial prose, 200-300 words. Mention 3+ cultural communities,
   *  2+ suburbs, 2+ event types, end on organiser-pride line. */
  editorial: string
  /** Suggested zoom level for the Mapbox map (10 = wide metro, 12 = tight CBD). */
  mapZoom: number
  /** Related city slugs for the bottom rail. AU geographic neighbours first. */
  relatedCities: CitySlug[]
  /** Suburb slugs that carry their own pages (Tier 1 cities only). */
  suburbs: SuburbSlug[]
  /** SEO keywords. */
  keywords: string[]
}

export interface SuburbContent {
  slug: SuburbSlug
  citySlug: CitySlug
  name: string
  /** Short character descriptor for the hero subtitle. */
  characterDescriptor: string
  latitude: number
  longitude: number
  /** Editorial prose, 100-150 words. */
  editorial: string
  /** Slugs of sibling suburbs for the related rail. */
  relatedSuburbs: SuburbSlug[]
}

const CITIES: Record<CitySlug, CityContent> = {
  sydney: {
    slug: 'sydney', name: 'Sydney', state: 'NSW', region: 'Greater Sydney',
    tier: 1, population: 5312000, latitude: -33.8688, longitude: 151.2093,
    descriptor: "Australia's largest city, every community in one harbour.",
    editorial:
      "From Lakemba's Ramadan night markets to Bondi's summer beach parties, Sydney runs on diversity and rhythm. Filipino fiestas in Blacktown, Mardi Gras parades in Darlinghurst, Lebanese mahrajan in Punchbowl, Korean street food festivals in Strathfield, Yoruba owambe in Chatswood, Greek paneghiri in Marrickville. Every weekend, every borough, another community celebrating. Concerts under the Harbour Bridge, comedy in Newtown, warehouse DJ sets in Marrickville, tasting menus in the eastern suburbs and afterparties in the inner west. EventLinqs is built for the Sydney organisers running it all - the auntie booking the hall, the DJ keeping the floor moving, the festival chair making sure every community in this city has a stage.",
    mapZoom: 10,
    relatedCities: ['melbourne', 'newcastle', 'wollongong', 'gold-coast', 'canberra', 'brisbane'],
    suburbs: ['sydney-inner-west', 'sydney-north-shore', 'sydney-eastern-suburbs', 'sydney-western-sydney', 'sydney-northern-beaches', 'sydney-sutherland-shire'],
    keywords: ['sydney events', 'things to do sydney', 'sydney concerts', 'sydney festivals', 'sydney club nights', 'sydney comedy'],
  },
  melbourne: {
    slug: 'melbourne', name: 'Melbourne', state: 'VIC', region: 'Greater Melbourne',
    tier: 1, population: 5078000, latitude: -37.8136, longitude: 144.9631,
    descriptor: "Australia's arts and live music capital.",
    editorial:
      "Melbourne is a city of laneways, late nights and four-season weather forecast in a single afternoon. Greek glendi in Oakleigh, Vietnamese New Year on Victoria Street, Italian feasts in Carlton, Ethiopian coffee ceremonies in Footscray, Indian Diwali in Wantirna, Sudanese weddings in Sunshine. Brunswick warehouse parties run until sunrise. St Kilda comedy clubs send a new generation through every weekend. The MCG holds 100,000 for one team, then a stadium tour the next. Theatre on Southbank, jazz in Fitzroy, EDM at Melbourne Pavilion, dumpling crawls in Box Hill. EventLinqs gives Melbourne organisers transparent fees, real human support and tools tuned for the rhythm of a city that turns every Sunday afternoon into a community festival.",
    mapZoom: 10,
    relatedCities: ['geelong', 'ballarat', 'bendigo', 'sydney', 'adelaide', 'hobart'],
    suburbs: ['melbourne-inner-melbourne', 'melbourne-eastern-suburbs', 'melbourne-western-suburbs', 'melbourne-northern-suburbs', 'melbourne-southern-suburbs', 'melbourne-bayside'],
    keywords: ['melbourne events', 'things to do melbourne', 'melbourne concerts', 'melbourne live music', 'melbourne club nights', 'melbourne comedy'],
  },
  brisbane: {
    slug: 'brisbane', name: 'Brisbane', state: 'QLD', region: 'South East Queensland',
    tier: 1, population: 2560000, latitude: -27.4698, longitude: 153.0251,
    descriptor: 'Sunbelt capital with a year-round festival calendar.',
    editorial:
      "Brisbane runs on outdoor weather and an open-air sound. Riverfire across the CBD, BlakSound for First Nations music at South Bank, Filipino Barrio Fiesta in Inala, Pacific Island youth festivals at Sunnybank, Indian Holi at Roma Street, Brazilian samba schools in Fortitude Valley. The Valley music precinct never sleeps. South Bank turns into one big public festival every weekend. King Street West End hosts Lebanese, Vietnamese and Greek family events back to back. Concerts under the bridges. Comedy at Powerhouse. Workshops at the Gallery of Modern Art. EventLinqs is built for the Brisbane organisers turning Queensland's sunshine and humidity into an event calendar that doesn't let up from January to December.",
    mapZoom: 11,
    relatedCities: ['gold-coast', 'sunshine-coast', 'toowoomba', 'cairns', 'sydney', 'townsville'],
    suburbs: ['brisbane-inner-city', 'brisbane-north-side', 'brisbane-south-side', 'brisbane-west-end'],
    keywords: ['brisbane events', 'things to do brisbane', 'brisbane concerts', 'brisbane festivals', 'queensland events', 'brisbane comedy'],
  },
  perth: {
    slug: 'perth', name: 'Perth', state: 'WA', region: 'Perth Metropolitan',
    tier: 1, population: 2192000, latitude: -31.9523, longitude: 115.8613,
    descriptor: 'Western capital with deep multicultural roots.',
    editorial:
      "Perth is a city of Indian Ocean sunsets, Sunday markets and a global festival calendar tucked into the western edge of the country. Filipino fiestas in Mirrabooka, Italian community feasts in Balcatta, Burmese new year water festivals in Cannington, South African braais in Joondalup, Korean lunar new year in Northbridge, Croatian club dances in Fremantle. Beach DJs at Scarborough every summer Sunday. Concerts at RAC Arena. Comedy at the Astor. Theatre at His Majesty's. Workshop weekends at PICA. Community festivals in Hyde Park year round. EventLinqs gives Perth organisers fees that make sense, share flows that respect WhatsApp, and a platform tuned for a city that runs on long days and warm nights.",
    mapZoom: 11,
    relatedCities: ['adelaide', 'sydney', 'melbourne', 'brisbane', 'darwin', 'hobart'],
    suburbs: ['perth-inner-perth', 'perth-northern-suburbs', 'perth-southern-suburbs', 'perth-coastal'],
    keywords: ['perth events', 'things to do perth', 'perth concerts', 'perth festivals', 'western australia events', 'perth comedy'],
  },
  adelaide: {
    slug: 'adelaide', name: 'Adelaide', state: 'SA', region: 'Greater Adelaide',
    tier: 1, population: 1402000, latitude: -34.9285, longitude: 138.6007,
    descriptor: 'The festival city.',
    editorial:
      "Adelaide is a city built around a festival calendar. WOMADelaide brings global music to Botanic Park every March. Adelaide Fringe runs the longest comedy and arts festival in the southern hemisphere. Greek glendi in Thebarton, Italian street fairs in Norwood, Vietnamese new year at Bonython Park, Filipino fiestas in Salisbury, Iranian Norouz at Rymill Park, German Schutzenfest in Hahndorf. Live music venues line Hindley Street. Concerts at Adelaide Oval. Workshops at the Art Gallery of South Australia. Cabaret at the Gov. Theatre at Her Majesty's. EventLinqs is built for the Adelaide organisers who already know the city runs on community events and want a ticketing platform that respects that rhythm.",
    mapZoom: 11,
    relatedCities: ['melbourne', 'sydney', 'perth', 'ballarat', 'bendigo', 'hobart'],
    suburbs: [],
    keywords: ['adelaide events', 'things to do adelaide', 'adelaide festivals', 'adelaide fringe', 'adelaide concerts', 'adelaide comedy'],
  },
  'gold-coast': {
    slug: 'gold-coast', name: 'Gold Coast', state: 'QLD', region: 'South East Queensland',
    tier: 1, population: 727000, latitude: -28.0167, longitude: 153.4000,
    descriptor: 'Beach city, festival weekends, year-round sunshine.',
    editorial:
      "Gold Coast is 70km of beach, theme parks, surf community and a steady rhythm of festival weekends. Bleach Festival turns the coast into outdoor theatre every winter. SWELL Sculpture Festival lines the beach with art for ten days. Korean Cultural Festival at Broadbeach, Filipino fiestas in Southport, Pacific Island youth festivals at Burleigh, Indian Diwali in Robina, Brazilian beach parties at Surfers Paradise. Cooly Rocks On runs vintage music down the Coolangatta strip. Theatre at HOTA. Comedy at the Star. Workshops at the Surf Club. Community family days at Kurrawa Park. EventLinqs gives Gold Coast organisers a platform tuned for short-form weekend events and a beach city that never quite turns off.",
    mapZoom: 11,
    relatedCities: ['brisbane', 'sunshine-coast', 'toowoomba', 'sydney', 'cairns', 'newcastle'],
    suburbs: ['gold-coast-surfers-paradise', 'gold-coast-broadbeach'],
    keywords: ['gold coast events', 'things to do gold coast', 'gold coast concerts', 'gold coast festivals', 'gold coast comedy', 'gold coast beach events'],
  },
  canberra: {
    slug: 'canberra', name: 'Canberra', state: 'ACT', region: 'Australian Capital Territory',
    tier: 1, population: 463000, latitude: -35.2809, longitude: 149.1300,
    descriptor: 'National capital, embassy quarter, civic community.',
    editorial:
      "Canberra is small, surprisingly young, and full of Friday night events. Embassies host community nights for every country represented. Multicultural Festival turns the city centre into a 200-stall outdoor party every February. Filipino, Vietnamese, Indian, Sudanese and Korean community festivals run through the year. Floriade brings live music and food to Commonwealth Park every spring. Live music at the Polish Club, jazz at Smith's Alternative, comedy at the Belconnen Arts Centre, theatre at the Canberra Theatre Centre. Concerts at GIO Stadium and AIS Arena. Workshops at the National Gallery and the National Portrait Gallery. EventLinqs gives Canberra organisers a fair platform for a city that punches well above its population.",
    mapZoom: 11,
    relatedCities: ['sydney', 'wollongong', 'melbourne', 'newcastle', 'albury', 'geelong'],
    suburbs: ['canberra-civic'],
    keywords: ['canberra events', 'things to do canberra', 'canberra festivals', 'canberra concerts', 'canberra multicultural', 'canberra comedy'],
  },
  hobart: {
    slug: 'hobart', name: 'Hobart', state: 'TAS', region: 'Greater Hobart',
    tier: 1, population: 251000, latitude: -42.8821, longitude: 147.3272,
    descriptor: 'Mountain-and-sea capital, MONA, Dark Mofo.',
    editorial:
      "Hobart is mountain, sea, MONA and a bohemian arts scene that draws talent from the mainland for every winter and every summer festival. Dark Mofo turns the waterfront red for ten nights every June. MONA FOMA brings boundary-pushing music and art into January. Salamanca Markets run every Saturday. Greek paneghiri in Glenorchy, Polish Festival at the Polish Club, Filipino fiestas in Hobart, Indian community Diwali at the Town Hall. Live music at the Republic Bar, jazz at the Brisbane Hotel, theatre at the Theatre Royal, comedy at the Peacock Theatre. Concerts at MyState Bank Arena. Workshops at the Tasmanian Museum. EventLinqs is built for the Hobart organisers who know Tasmania runs on community-scale events and a global arts identity well beyond its size.",
    mapZoom: 11,
    relatedCities: ['launceston', 'melbourne', 'adelaide', 'sydney', 'geelong', 'ballarat'],
    suburbs: ['hobart-inner-city'],
    keywords: ['hobart events', 'things to do hobart', 'hobart festivals', 'dark mofo', 'mona foma', 'tasmania events'],
  },
  newcastle: {
    slug: 'newcastle', name: 'Newcastle', state: 'NSW', region: 'Hunter Region',
    tier: 2, population: 322000, latitude: -32.9283, longitude: 151.7817,
    descriptor: 'Coal river city turned coastal arts hub.',
    editorial:
      "Newcastle has reinvented itself from coal export port to coastal arts city. The waterfront hosts year-round live music, the inner west of the city centre carries the live venues, and the beaches absorb the weekend crowds. New Annual brings contemporary art and music to the city every September. Filipino, Indian, Vietnamese and Korean community festivals run through the calendar. Concerts at Newcastle Entertainment Centre. Live music at Lass O'Gowrie and the Cambridge. Comedy at the Civic Theatre. Theatre at the Civic. Workshops at the Newcastle Art Gallery. Community events along the foreshore. EventLinqs gives Newcastle organisers transparent fees and tools that match the energy of a coastal city redefining itself in real time.",
    mapZoom: 11,
    relatedCities: ['sydney', 'wollongong', 'gold-coast', 'canberra', 'sunshine-coast', 'townsville'],
    suburbs: [],
    keywords: ['newcastle events', 'things to do newcastle', 'newcastle nsw concerts', 'newcastle festivals', 'newcastle live music', 'hunter region events'],
  },
  wollongong: {
    slug: 'wollongong', name: 'Wollongong', state: 'NSW', region: 'Illawarra',
    tier: 2, population: 308000, latitude: -34.4278, longitude: 150.8931,
    descriptor: 'Steel city by the sea, big university crowd.',
    editorial:
      "Wollongong is steel, surf, university and a steady stream of student-driven events that keep the city centre humming through term and a beach calendar that fills every summer weekend. Viva la Gong takes over the city every November. Greek Glendi at Beaton Park, Macedonian community festival at Berkeley, Italian community feasts in Fairy Meadow, Indian community Diwali at WIN Stadium, Filipino fiestas in Warrawong. Live music at the UniBar, comedy at the Pavilion, theatre at the IPAC, concerts at WIN Entertainment Centre. Workshops at the Wollongong Art Gallery. Beach DJs at North Wollongong every summer Sunday. EventLinqs is built for Illawarra organisers who already know how a beach-side university town runs on weekend energy.",
    mapZoom: 11,
    relatedCities: ['sydney', 'newcastle', 'canberra', 'albury', 'gold-coast', 'geelong'],
    suburbs: [],
    keywords: ['wollongong events', 'things to do wollongong', 'wollongong concerts', 'illawarra events', 'wollongong festivals', 'wollongong live music'],
  },
  geelong: {
    slug: 'geelong', name: 'Geelong', state: 'VIC', region: 'Greater Geelong',
    tier: 2, population: 290000, latitude: -38.1499, longitude: 144.3617,
    descriptor: 'Bayside Victorian city with a growing arts spine.',
    editorial:
      "Geelong is a bayside city with a heritage waterfront, a growing arts spine and an event calendar that's quietly catching Melbourne. Toast to the Coast wine festival every winter. National Celtic Festival across Easter. Filipino, Indian, Greek and Italian community festivals through the year. Concerts at GMHBA Stadium and Costa Hall. Live music at the Barwon Club, the Wool Exchange and the Beav. Theatre at the GPAC. Comedy at the Sphinx Hotel. Workshops at the Geelong Gallery. Community events at Cunningham Pier. EventLinqs gives Geelong organisers fees that make sense for a regional city growing into a metro one.",
    mapZoom: 11,
    relatedCities: ['melbourne', 'ballarat', 'bendigo', 'hobart', 'adelaide', 'sydney'],
    suburbs: [],
    keywords: ['geelong events', 'things to do geelong', 'geelong concerts', 'geelong festivals', 'victoria events', 'geelong live music'],
  },
  townsville: {
    slug: 'townsville', name: 'Townsville', state: 'QLD', region: 'North Queensland',
    tier: 2, population: 195000, latitude: -19.2589, longitude: 146.8169,
    descriptor: 'Tropical north Queensland anchor city.',
    editorial:
      "Townsville is the gateway to Magnetic Island, the largest city in tropical north Queensland, and a community that runs every event around the dry season. Australian Festival of Chamber Music in winter. Townsville Cultural Festival every August. Greek Glendi at the Greek Hall, Italian community festival in Belgian Gardens, Filipino fiestas at Riverway, Indian Diwali at the Civic Theatre, Pacific Island community festivals at Strand Park. Live music at Flinders Street venues, theatre at the Civic Theatre, comedy at the Brewery, concerts at Townsville Entertainment Centre. Workshops at Pinnacles Gallery. Community events along the Strand. EventLinqs is built for tropical-north organisers running a calendar tuned to the wet and the dry.",
    mapZoom: 11,
    relatedCities: ['cairns', 'brisbane', 'gold-coast', 'sunshine-coast', 'darwin', 'sydney'],
    suburbs: [],
    keywords: ['townsville events', 'things to do townsville', 'townsville concerts', 'north queensland events', 'townsville festivals', 'tropical events'],
  },
  cairns: {
    slug: 'cairns', name: 'Cairns', state: 'QLD', region: 'Far North Queensland',
    tier: 2, population: 152000, latitude: -16.9186, longitude: 145.7781,
    descriptor: 'Reef gateway, tropical festival town.',
    editorial:
      "Cairns runs on tourism, the Great Barrier Reef and a community that throws an event every weekend the wet allows. Cairns Festival across August. Cairns Indigenous Art Fair every July. Filipino fiestas, Indian community Diwali, Pacific Island youth festivals, Italian community Festa, Polynesian markets. Concerts at the Cairns Convention Centre. Live music at the Salt House and the Pier Bar. Theatre at JUTE. Comedy at the Wharf One. Workshops at the Tanks Arts Centre. Community events at Munro Martin Parklands. Beach DJs at Palm Cove. EventLinqs is built for far-north organisers running a calendar that lives outdoors and balances tourist and local seasons.",
    mapZoom: 11,
    relatedCities: ['townsville', 'darwin', 'brisbane', 'gold-coast', 'sunshine-coast', 'sydney'],
    suburbs: [],
    keywords: ['cairns events', 'things to do cairns', 'cairns concerts', 'far north queensland events', 'cairns festivals', 'tropical events'],
  },
  darwin: {
    slug: 'darwin', name: 'Darwin', state: 'NT', region: 'Top End',
    tier: 2, population: 147000, latitude: -12.4634, longitude: 130.8456,
    descriptor: 'Top End capital, Asian-Pacific crossroads.',
    editorial:
      "Darwin is the Top End, the closest Australian capital to Asia, and a city of First Nations communities, Greek, Italian, Filipino, Indonesian, Timorese, Pacific Islander and South African communities living in close quarters and running events together. Darwin Festival every August. Mindil Beach Sunset Markets through the dry season. Glenti Greek Festival, Filipino Fiesta at the Greek School, India@Mindil, Pacific Festival at the Marrara fields. Concerts at the Amphitheatre. Live music at Lola's Pergola and the Brown's Mart. Theatre at the Brown's Mart. Comedy at the Happy Yess. Workshops at MAGNT. Community events at Bicentennial Park. EventLinqs gives Top End organisers a platform that respects a calendar built around the wet, the dry and the dry-season festival rush.",
    mapZoom: 11,
    relatedCities: ['cairns', 'townsville', 'brisbane', 'perth', 'adelaide', 'sydney'],
    suburbs: [],
    keywords: ['darwin events', 'things to do darwin', 'top end events', 'darwin concerts', 'darwin festivals', 'northern territory events'],
  },
  'sunshine-coast': {
    slug: 'sunshine-coast', name: 'Sunshine Coast', state: 'QLD', region: 'South East Queensland',
    tier: 2, population: 333000, latitude: -26.6500, longitude: 153.0667,
    descriptor: 'Beach hinterland lifestyle, growing music scene.',
    editorial:
      "Sunshine Coast is the bigger, slower coast above Brisbane: 100km of beach, hinterland villages and a music and arts scene that's growing every year. Caloundra Music Festival across October. Big Pineapple Music Festival every May. Curated Plate dining festival across August. Greek paneghiri in Maroochydore, Filipino fiestas at Caloundra, Indian community Diwali in Mooloolaba, Pacific Island family days at Cotton Tree. Live music at Solbar, the Doonan Pub and the Eumundi markets. Theatre at the Events Centre Caloundra. Comedy at the Lamb the Family. Workshops at the Caloundra Regional Gallery. EventLinqs is built for coast-hinterland organisers running events that span a tropical resort beach and a craft-village hinterland.",
    mapZoom: 10,
    relatedCities: ['gold-coast', 'brisbane', 'cairns', 'townsville', 'newcastle', 'sydney'],
    suburbs: [],
    keywords: ['sunshine coast events', 'things to do sunshine coast', 'sunshine coast concerts', 'sunshine coast festivals', 'queensland coast events', 'caloundra events'],
  },
  bendigo: {
    slug: 'bendigo', name: 'Bendigo', state: 'VIC', region: 'Loddon Mallee',
    tier: 2, population: 100000, latitude: -36.7570, longitude: 144.2794,
    descriptor: 'Goldfields heritage city.',
    editorial:
      "Bendigo is the heart of the Victorian goldfields: heritage architecture, a Chinese community precinct, a major regional gallery and a calendar of festivals that fills every season. Bendigo Easter Festival is one of the longest-running multicultural festivals in Australia. Chinese New Year at the Golden Dragon Museum. Festival of Light around Diwali. Greek paneghiri at the Greek Centre. Filipino community fiesta at Lake Weeroona. Italian Festa in central Bendigo. Live music at the Old Church on the Hill. Theatre at the Capital Theatre. Comedy at the Golden Vine. Concerts at Ulumbarra Theatre. Workshops at the Bendigo Art Gallery. EventLinqs is built for goldfields organisers running events that honour the heritage and the diversity of a city built by the rest of the world.",
    mapZoom: 11,
    relatedCities: ['ballarat', 'melbourne', 'geelong', 'albury', 'adelaide', 'sydney'],
    suburbs: [],
    keywords: ['bendigo events', 'things to do bendigo', 'bendigo festivals', 'bendigo easter festival', 'goldfields events', 'central victoria events'],
  },
  ballarat: {
    slug: 'ballarat', name: 'Ballarat', state: 'VIC', region: 'Central Highlands',
    tier: 2, population: 109000, latitude: -37.5622, longitude: 143.8503,
    descriptor: 'Goldfields city, heritage festivals, growing arts scene.',
    editorial:
      "Ballarat is heritage gold rush city with a strong arts identity, a major regional gallery, and a winter festival that turns the streets into an immersive light show. White Night Ballarat across August. Begonia Festival across the long weekend in March. Eureka Day every December. Filipino fiestas at the Mining Exchange, Greek paneghiri at the Greek Hall, Italian community festivals in Sebastopol, Indian community Diwali at the Civic Hall. Live music at the Eastern, the Karova Lounge and the Bridge Mall Inn. Theatre at Her Majesty's. Comedy at the Eastern. Concerts at the Civic Hall. Workshops at the Art Gallery of Ballarat. EventLinqs is built for goldfields and central-highlands organisers running events that respect heritage and welcome new arrivals.",
    mapZoom: 11,
    relatedCities: ['bendigo', 'melbourne', 'geelong', 'adelaide', 'albury', 'sydney'],
    suburbs: [],
    keywords: ['ballarat events', 'things to do ballarat', 'ballarat festivals', 'white night ballarat', 'goldfields events', 'central victoria events'],
  },
  albury: {
    slug: 'albury', name: 'Albury', state: 'NSW', region: 'Murray Region',
    tier: 2, population: 56000, latitude: -36.0737, longitude: 146.9135,
    descriptor: 'Border twin city on the Murray.',
    editorial:
      "Albury sits across the Murray from Wodonga as one twin city across two states. The Border Music Festival runs every autumn. Australian Country Music Spectacular every winter. Filipino fiestas at the Albury Entertainment Centre, Greek paneghiri at the Greek Community Hall, Indian community Diwali at QEII Square, Italian community feasts in central Albury. Live music at the SS&A and the Commercial Club. Theatre at the Albury Entertainment Centre. Comedy at the Atura Hotel. Concerts at the Albury Sports Ground. Workshops at the Albury Library Museum. Community events at Noreuil Park. EventLinqs is built for border organisers running events that span two states and a regional crowd that drives in from across the Riverina.",
    mapZoom: 12,
    relatedCities: ['wollongong', 'bendigo', 'ballarat', 'canberra', 'geelong', 'melbourne'],
    suburbs: [],
    keywords: ['albury events', 'things to do albury', 'albury wodonga events', 'border events', 'murray river events', 'riverina events'],
  },
  launceston: {
    slug: 'launceston', name: 'Launceston', state: 'TAS', region: 'Northern Tasmania',
    tier: 2, population: 107000, latitude: -41.4332, longitude: 147.1441,
    descriptor: 'Northern Tasmanian gateway to the Tamar Valley.',
    editorial:
      "Launceston is northern Tasmania's heritage city, gateway to the Tamar wine valley, and home to a year-round event calendar that punches above the city's size. Junction Arts Festival every September. Festivale across February. Mona Foma weekends in January. Greek Festival at the Greek Hall, Italian community festivals at the Italian Club, Filipino fiestas in central Launceston, Indian community Diwali at the Tasmanian University. Live music at the Royal Oak and the Royal on George. Theatre at the Princess Theatre. Comedy at the Royal Oak. Concerts at the Silverdome. Workshops at the QVMAG. Community events at City Park. EventLinqs is built for northern Tasmanian organisers running events that connect Launceston, the Tamar valley and the surrounding region.",
    mapZoom: 11,
    relatedCities: ['hobart', 'melbourne', 'geelong', 'ballarat', 'bendigo', 'adelaide'],
    suburbs: [],
    keywords: ['launceston events', 'things to do launceston', 'tamar valley events', 'tasmania events', 'launceston festivals', 'junction arts festival'],
  },
  toowoomba: {
    slug: 'toowoomba', name: 'Toowoomba', state: 'QLD', region: 'Darling Downs',
    tier: 2, population: 142000, latitude: -27.5598, longitude: 151.9507,
    descriptor: "Garden city of Queensland's downs.",
    editorial:
      "Toowoomba sits on the edge of the Darling Downs, an hour and a half west of Brisbane, with a mild climate, the largest regional gallery in Queensland and a year-round festival calendar. Carnival of Flowers across September. First Coat street art festival every May. Greek paneghiri at the Greek Hall, Filipino fiestas at Picnic Point, Indian community Diwali at Queens Park, Italian community feasts in central Toowoomba, Pacific Island youth festivals at Toowoomba East. Live music at the Spotted Cow, the Royal Hotel and the Empire Theatre. Theatre at the Empire. Comedy at the Spotted Cow. Concerts at the Toowoomba Sports Ground. Workshops at the Toowoomba Regional Art Gallery. EventLinqs is built for Darling Downs organisers running events that bring the rural west and the city together.",
    mapZoom: 11,
    relatedCities: ['brisbane', 'gold-coast', 'sunshine-coast', 'cairns', 'townsville', 'sydney'],
    suburbs: [],
    keywords: ['toowoomba events', 'things to do toowoomba', 'carnival of flowers', 'darling downs events', 'queensland regional events', 'toowoomba festivals'],
  },
}

const SUBURBS: Record<SuburbSlug, SuburbContent> = {
  'sydney-inner-west': {
    slug: 'sydney-inner-west', citySlug: 'sydney', name: 'Inner West',
    characterDescriptor: "Sydney's live music and creative postcode.",
    latitude: -33.8966, longitude: 151.1656,
    editorial:
      "Inner West Sydney runs on live music, street art and a young creative population that turns Newtown, Marrickville and Enmore into a non-stop event district. Vietnamese restaurants in Marrickville sit next to Lebanese sweets shops, Korean BBQ and Greek tavernas. The Enmore Theatre, Marrickville's warehouse parties, the Newtown Hotel and the Vic on the Park form a live music spine. Pride flags fly along King Street year round.",
    relatedSuburbs: ['sydney-eastern-suburbs', 'sydney-western-sydney', 'sydney-north-shore'],
  },
  'sydney-north-shore': {
    slug: 'sydney-north-shore', citySlug: 'sydney', name: 'North Shore',
    characterDescriptor: "Sydney's harbour-side polish.",
    latitude: -33.8000, longitude: 151.2100,
    editorial:
      "North Shore Sydney runs harbour-side from North Sydney through Mosman to the upper north shore. Concerts at North Sydney Oval. Korean and Chinese community festivals across Chatswood. Comedy at the Twelfth Night Theatre. Theatre at Glen Street Theatre. Sailing regattas across the harbour. Family-friendly festival days in Mosman.",
    relatedSuburbs: ['sydney-eastern-suburbs', 'sydney-northern-beaches', 'sydney-inner-west'],
  },
  'sydney-eastern-suburbs': {
    slug: 'sydney-eastern-suburbs', citySlug: 'sydney', name: 'Eastern Suburbs',
    characterDescriptor: 'Bondi, Coogee, Paddington, beaches and brunches.',
    latitude: -33.8915, longitude: 151.2767,
    editorial:
      "Eastern Suburbs Sydney is beaches, brunches and a string of music venues from Bondi to Coogee. Festival of the Winds at Bondi Beach every September. Open Air Cinema at Bondi over summer. Comedy at the Comedy Store at the Entertainment Quarter. Theatre at the Hayden Orpheum and Bondi Pavilion. Family beach days every weekend.",
    relatedSuburbs: ['sydney-inner-west', 'sydney-north-shore', 'sydney-northern-beaches'],
  },
  'sydney-western-sydney': {
    slug: 'sydney-western-sydney', citySlug: 'sydney', name: 'Western Sydney',
    characterDescriptor: "Every community in one postcode.",
    latitude: -33.8150, longitude: 150.9953,
    editorial:
      "Western Sydney is the most diverse postcode in the country: Parramatta, Blacktown, Liverpool, Cabramatta, Bankstown. Filipino fiestas at Mt Druitt, Indian Diwali at Parramatta, Lebanese mahrajan at Punchbowl, Vietnamese new year in Cabramatta, Sudanese weddings in Blacktown, Pacific Island youth festivals at Penrith. Concerts at Western Sydney Stadium. Live music at the Factory Theatre. Theatre at the Riverside Theatres. Family festival days at Parramatta Park.",
    relatedSuburbs: ['sydney-inner-west', 'sydney-sutherland-shire', 'sydney-eastern-suburbs'],
  },
  'sydney-northern-beaches': {
    slug: 'sydney-northern-beaches', citySlug: 'sydney', name: 'Northern Beaches',
    characterDescriptor: '30km of coast from Manly to Palm Beach.',
    latitude: -33.7969, longitude: 151.2842,
    editorial:
      "Northern Beaches Sydney runs 30km of coast from Manly to Palm Beach. Manly Jazz festival across the October long weekend. Beach concerts at Manly Beach. Live music at the Manly Wharf and the Newport. Comedy at the Brookvale Hotel. Surf carnivals at every beach over summer. Family festival days at Dee Why.",
    relatedSuburbs: ['sydney-eastern-suburbs', 'sydney-north-shore', 'sydney-sutherland-shire'],
  },
  'sydney-sutherland-shire': {
    slug: 'sydney-sutherland-shire', citySlug: 'sydney', name: 'Sutherland Shire',
    characterDescriptor: 'Cronulla, Sutherland, surf community south.',
    latitude: -34.0290, longitude: 151.1592,
    editorial:
      "Sutherland Shire is Sydney south of the Georges River: Cronulla beach, Caringbah dining, Sylvania family suburbs and Bundeena bushwalks. Surf carnivals at Cronulla every summer. Live music at Brass Monkey. Comedy at the Tradies Caringbah. Family festival days at Sutherland Shire Festival every October. Theatre at Sutherland Entertainment Centre.",
    relatedSuburbs: ['sydney-eastern-suburbs', 'sydney-western-sydney', 'sydney-northern-beaches'],
  },

  'melbourne-inner-melbourne': {
    slug: 'melbourne-inner-melbourne', citySlug: 'melbourne', name: 'Inner Melbourne',
    characterDescriptor: 'CBD, Fitzroy, Carlton, laneway community.',
    latitude: -37.8136, longitude: 144.9631,
    editorial:
      "Inner Melbourne is the CBD, Fitzroy, Carlton, Collingwood and Richmond: Italian Lygon Street, Vietnamese Victoria Street, the live music spine through Fitzroy and Brunswick, the warehouse arts of Collingwood. Concerts at Rod Laver Arena. Comedy at the Comic's Lounge. Theatre at the Athenaeum. Workshops at the NGV. Greek glendi in Lonsdale Street, Italian Festa in Lygon Street, Vietnamese Lunar new year in Richmond.",
    relatedSuburbs: ['melbourne-northern-suburbs', 'melbourne-southern-suburbs', 'melbourne-bayside'],
  },
  'melbourne-eastern-suburbs': {
    slug: 'melbourne-eastern-suburbs', citySlug: 'melbourne', name: 'Eastern Suburbs',
    characterDescriptor: 'Box Hill, Camberwell, leafy and growing.',
    latitude: -37.8500, longitude: 145.1500,
    editorial:
      "Eastern Suburbs Melbourne is Box Hill, Camberwell, Glen Waverley and Doncaster: Chinese, Korean and Indian communities, leafy residential streets and a growing live event scene. Box Hill Lunar new year. Korean Festival in Glen Waverley. Indian Diwali at Wantirna. Live music at the Croxton. Comedy at the Camberwell Hotel. Theatre at the Burrinja Cultural Centre. Family festivals at Whitehorse and Monash council parks.",
    relatedSuburbs: ['melbourne-southern-suburbs', 'melbourne-northern-suburbs', 'melbourne-inner-melbourne'],
  },
  'melbourne-western-suburbs': {
    slug: 'melbourne-western-suburbs', citySlug: 'melbourne', name: 'Western Suburbs',
    characterDescriptor: 'Footscray, Sunshine, most diverse in the country.',
    latitude: -37.7995, longitude: 144.8980,
    editorial:
      "Western Suburbs Melbourne is the most diverse part of the most diverse city in the country: Footscray, Sunshine, Werribee, St Albans. Vietnamese, Sudanese, Ethiopian, Karen, Filipino, Indian, Pacific Island and Lebanese communities run weekend events back to back. Footscray Festival every November. Sudanese South community festivals through the year. Live music at the Footscray Community Arts. Theatre at the Yarraville Club. Comedy at the Sun Theatre. Family festivals at Williamstown and Werribee Park.",
    relatedSuburbs: ['melbourne-northern-suburbs', 'melbourne-inner-melbourne', 'melbourne-southern-suburbs'],
  },
  'melbourne-northern-suburbs': {
    slug: 'melbourne-northern-suburbs', citySlug: 'melbourne', name: 'Northern Suburbs',
    characterDescriptor: 'Brunswick, Coburg, creative streets.',
    latitude: -37.7700, longitude: 144.9614,
    editorial:
      "Northern Suburbs Melbourne is Brunswick, Coburg, Preston, Northcote: warehouse parties, Mediterranean delicatessens, Lebanese bakeries, Greek tavernas, Sicilian cake shops, the Sydney Road live music spine. Live music at the Howler, the Spotted Mallard and the John Curtin. Comedy at the Spotted Mallard. Theatre at the Northcote Town Hall. Workshops at the Counihan Gallery. Family festivals at Sumner Park and along Sydney Road.",
    relatedSuburbs: ['melbourne-inner-melbourne', 'melbourne-western-suburbs', 'melbourne-eastern-suburbs'],
  },
  'melbourne-southern-suburbs': {
    slug: 'melbourne-southern-suburbs', citySlug: 'melbourne', name: 'Southern Suburbs',
    characterDescriptor: 'South Yarra, Prahran, nightlife and dining.',
    latitude: -37.8400, longitude: 144.9890,
    editorial:
      "Southern Suburbs Melbourne is South Yarra, Prahran, Toorak, Caulfield: nightlife, dining, the Jewish community of Caulfield and St Kilda East, Greek, Italian and Filipino communities through Bentleigh, Asian-Australian families across Carnegie. Live music at the Espy in St Kilda and Revolver in Prahran. Comedy at the Comic's Lounge in South Yarra. Theatre at the Comedy Theatre. Family festivals at Albert Park.",
    relatedSuburbs: ['melbourne-bayside', 'melbourne-inner-melbourne', 'melbourne-eastern-suburbs'],
  },
  'melbourne-bayside': {
    slug: 'melbourne-bayside', citySlug: 'melbourne', name: 'Bayside',
    characterDescriptor: 'St Kilda, Brighton, bay beaches and venues.',
    latitude: -37.8700, longitude: 144.9800,
    editorial:
      "Bayside Melbourne runs from St Kilda south through Brighton and Sandringham. St Kilda Festival every February. Live music at the Espy. Comedy at the Prince Bandroom. Theatre at the Palais. Beach DJs at St Kilda Beach. Greek glendi at Acland Street, Italian community feasts at Brighton, Jewish community festivals across Caulfield. Family festival days at Brighton Beach.",
    relatedSuburbs: ['melbourne-southern-suburbs', 'melbourne-inner-melbourne', 'melbourne-eastern-suburbs'],
  },

  'brisbane-inner-city': {
    slug: 'brisbane-inner-city', citySlug: 'brisbane', name: 'Inner City',
    characterDescriptor: 'CBD, South Brisbane, river precincts and arts.',
    latitude: -27.4698, longitude: 153.0251,
    editorial:
      "Inner City Brisbane runs the river: CBD, South Brisbane, Kangaroo Point, the Gallery of Modern Art and the Queensland Performing Arts Centre. Riverfire every September. Brisbane Festival across September. Greek Paniyiri at Musgrave Park. Indian Diwali at South Bank. Filipino fiesta at Roma Street Parkland. Live music at the Tivoli, comedy at the Powerhouse, theatre at QPAC, concerts at the Riverstage.",
    relatedSuburbs: ['brisbane-west-end', 'brisbane-south-side', 'brisbane-north-side'],
  },
  'brisbane-north-side': {
    slug: 'brisbane-north-side', citySlug: 'brisbane', name: 'North Side',
    characterDescriptor: 'Chermside, Aspley, Stafford, family suburbs.',
    latitude: -27.4140, longitude: 153.0470,
    editorial:
      "North Side Brisbane is Chermside, Aspley, Stafford, Kedron and the Pine Rivers. Filipino, Indian and Pacific Island community festivals across Chermside. Korean church events in Stafford. Live music at the Royal Mail Hotel. Comedy at the Aspley Hornets. Theatre at the Brookside Theatre. Family festivals at Sandgate and Brighton.",
    relatedSuburbs: ['brisbane-inner-city', 'brisbane-south-side', 'brisbane-west-end'],
  },
  'brisbane-south-side': {
    slug: 'brisbane-south-side', citySlug: 'brisbane', name: 'South Side',
    characterDescriptor: 'Sunnybank, Mt Gravatt, Asian-Australian food and community.',
    latitude: -27.5400, longitude: 153.0600,
    editorial:
      "South Side Brisbane is Sunnybank, Mt Gravatt, Eight Mile Plains, Calamvale and Inala: the heart of Asian-Australian Brisbane. Vietnamese new year at Inala. Korean community festivals at Sunnybank. Lunar new year at Sunnybank Plaza. Filipino Barrio Fiesta at Inala. Live music at the Robertson Hotel. Theatre at the Sunnybank Hotel. Family festivals at Mt Gravatt Showgrounds.",
    relatedSuburbs: ['brisbane-inner-city', 'brisbane-west-end', 'brisbane-north-side'],
  },
  'brisbane-west-end': {
    slug: 'brisbane-west-end', citySlug: 'brisbane', name: 'West End / Fortitude Valley',
    characterDescriptor: "Brisbane's nightlife and live music spine.",
    latitude: -27.4795, longitude: 153.0252,
    editorial:
      "West End and Fortitude Valley together carry Brisbane's nightlife and live music spine. The Valley music precinct never sleeps. West End markets every Saturday. Live music at the Triffid, the Zoo, the Brightside, the Foundry. Comedy at the Sit Down Comedy Club. Theatre at the Princess Theatre. Greek Glendi at Boundary Street. Indian community Diwali at Davies Park. Filipino fiesta at West End. Family festivals at Davies Park.",
    relatedSuburbs: ['brisbane-inner-city', 'brisbane-south-side', 'brisbane-north-side'],
  },

  'perth-inner-perth': {
    slug: 'perth-inner-perth', citySlug: 'perth', name: 'Inner Perth',
    characterDescriptor: 'CBD, Northbridge, Subiaco, nightlife and community.',
    latitude: -31.9523, longitude: 115.8613,
    editorial:
      "Inner Perth is the CBD, Northbridge, Subiaco and West Perth. Northbridge is Perth's nightlife quarter and the community centre with PICA, the Art Gallery and the State Theatre. Korean Lunar new year at Northbridge. Vietnamese new year in central Perth. Filipino Festival at Forrest Place. Live music at the Bird, the Rosemount and the Court. Comedy at the Lazy Susan's. Theatre at His Majesty's. Concerts at RAC Arena.",
    relatedSuburbs: ['perth-northern-suburbs', 'perth-southern-suburbs', 'perth-coastal'],
  },
  'perth-northern-suburbs': {
    slug: 'perth-northern-suburbs', citySlug: 'perth', name: 'Northern Suburbs',
    characterDescriptor: 'Joondalup, Scarborough, beaches and family suburbs.',
    latitude: -31.8000, longitude: 115.7670,
    editorial:
      "Northern Suburbs Perth is Joondalup, Scarborough, Wanneroo, Mirrabooka. Filipino fiesta at Mirrabooka. Italian community feasts at Balcatta. South African braais at Joondalup. Croatian community festivals at Wanneroo. Live music at the Indi Bar. Comedy at the Charles Hotel. Theatre at the Joondalup Resort. Beach DJs at Scarborough every summer Sunday. Family festivals at Hillarys Boat Harbour.",
    relatedSuburbs: ['perth-inner-perth', 'perth-coastal', 'perth-southern-suburbs'],
  },
  'perth-southern-suburbs': {
    slug: 'perth-southern-suburbs', citySlug: 'perth', name: 'Southern Suburbs',
    characterDescriptor: 'Fremantle, Cockburn, port community and markets.',
    latitude: -32.0560, longitude: 115.7440,
    editorial:
      "Southern Suburbs Perth is Fremantle, Cockburn, Murdoch, Rockingham. Fremantle is the port: Italian community feasts in central Freo, Croatian community festivals at the Croatian Hall, Filipino Fiesta at the Esplanade, Burmese community new year at Cannington. Live music at Mojos and the Bird Cage. Comedy at the Fly by Night. Theatre at the Fremantle Town Hall. Family festivals at Fremantle Park.",
    relatedSuburbs: ['perth-inner-perth', 'perth-coastal', 'perth-northern-suburbs'],
  },
  'perth-coastal': {
    slug: 'perth-coastal', citySlug: 'perth', name: 'Coastal',
    characterDescriptor: 'Scarborough, Cottesloe, surf and sunset venues.',
    latitude: -31.8970, longitude: 115.7570,
    editorial:
      "Coastal Perth is Scarborough, Cottesloe, City Beach, Trigg. Beach DJ sessions at Scarborough every summer Sunday. Sculpture by the Sea at Cottesloe Beach every March. Family beach days every weekend through the warm months. Live music at the Ocean Beach Hotel. Comedy at the Cott. Surf carnivals at every beach.",
    relatedSuburbs: ['perth-northern-suburbs', 'perth-southern-suburbs', 'perth-inner-perth'],
  },

  'gold-coast-surfers-paradise': {
    slug: 'gold-coast-surfers-paradise', citySlug: 'gold-coast', name: 'Surfers Paradise',
    characterDescriptor: 'Beachfront highrise nightlife strip.',
    latitude: -28.0023, longitude: 153.4145,
    editorial:
      "Surfers Paradise is the heart of the Gold Coast: beachfront, highrise, nightlife strip, year-round tourist crowds and a calendar that never quite slows. Schoolies in November. Surf life saving carnivals every summer. Korean community events at Surfers Beach. Brazilian beach parties through the warm months. Live music at the Beergarden. Comedy at the Royal Pines. Theatre at HOTA. Family festivals at Cavill Avenue.",
    relatedSuburbs: ['gold-coast-broadbeach'],
  },
  'gold-coast-broadbeach': {
    slug: 'gold-coast-broadbeach', citySlug: 'gold-coast', name: 'Broadbeach',
    characterDescriptor: 'Casino, dining, family-friendly beach.',
    latitude: -28.0356, longitude: 153.4317,
    editorial:
      "Broadbeach sits below Surfers Paradise as the Gold Coast's family-friendly dining and casino quarter. Korean Cultural Festival every September. Comedy at the Star. Live music at the Star Casino. Family beach days at Kurrawa Park. Pacific Island community festivals through the year. Community events at Broadbeach Mall.",
    relatedSuburbs: ['gold-coast-surfers-paradise'],
  },

  'canberra-civic': {
    slug: 'canberra-civic', citySlug: 'canberra', name: 'Civic',
    characterDescriptor: "Canberra's central nightlife and arts.",
    latitude: -35.2809, longitude: 149.1300,
    editorial:
      "Civic and Braddon together form Canberra's central nightlife and arts quarter: Lonsdale Street dining, the Australian Centre for Christian and Culture, the Canberra Theatre Centre, embassies running community nights every weekend. Multicultural Festival turns Civic into a 200-stall outdoor party every February. Floriade across spring. Live music at the Polish Club, jazz at Smith's Alternative, comedy at the Belconnen Arts Centre, theatre at the Canberra Theatre Centre.",
    relatedSuburbs: [],
  },

  'hobart-inner-city': {
    slug: 'hobart-inner-city', citySlug: 'hobart', name: 'Inner City',
    characterDescriptor: 'Salamanca, Battery Point, heritage waterfront.',
    latitude: -42.8821, longitude: 147.3272,
    editorial:
      "Inner City Hobart is Salamanca, Battery Point, North Hobart and Sandy Bay: heritage warehouses turned bars and galleries, Salamanca Markets every Saturday, the Theatre Royal as the oldest working theatre in Australia, MONA across the river. Dark Mofo through June. Greek paneghiri at the Greek Hall. Polish festival at the Polish Club. Filipino fiesta in central Hobart. Live music at the Republic Bar. Comedy at the Peacock Theatre. Concerts at MyState Bank Arena.",
    relatedSuburbs: [],
  },
}

const CITY_SLUG_SET: Set<string> = new Set(Object.keys(CITIES))
const SUBURB_SLUG_SET: Set<string> = new Set(Object.keys(SUBURBS))

export function isCitySlug(slug: string): slug is CitySlug {
  return CITY_SLUG_SET.has(slug)
}

export function isSuburbSlug(slug: string): slug is SuburbSlug {
  return SUBURB_SLUG_SET.has(slug)
}

export function getCity(slug: string): CityContent | null {
  if (!isCitySlug(slug)) return null
  return CITIES[slug]
}

export function getSuburb(slug: string): SuburbContent | null {
  if (!isSuburbSlug(slug)) return null
  return SUBURBS[slug]
}

export function getAllCities(): CityContent[] {
  return Object.values(CITIES)
}

export function getAllSuburbs(): SuburbContent[] {
  return Object.values(SUBURBS)
}

export function getSuburbsForCity(citySlug: CitySlug): SuburbContent[] {
  return Object.values(SUBURBS).filter(s => s.citySlug === citySlug)
}

/**
 * The 8 city-page event types. Backed by event_types in DB after the
 * Batch 6 migration adds dj-set + cultural; the rest are reused from
 * the existing event_types seed.
 */
export const CITY_EVENT_TYPES = [
  { slug: 'concert',    label: 'Concerts',     icon: 'music' },
  { slug: 'dj-set',     label: 'DJ Sets',      icon: 'disc' },
  { slug: 'comedy',     label: 'Comedy',       icon: 'mic' },
  { slug: 'theatre',    label: 'Theatre',      icon: 'theater' },
  { slug: 'workshop',   label: 'Workshops',    icon: 'hammer' },
  { slug: 'cultural',   label: 'Community',    icon: 'flag' },
  { slug: 'food-drink', label: 'Food & Drink', icon: 'utensils' },
  { slug: 'sport',      label: 'Sports',       icon: 'trophy' },
] as const
