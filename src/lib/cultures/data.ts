/**
 * Culture content registry - the single source of truth for the
 * Culture Taxonomy v2 heritage landing pages at /culture/[slug].
 *
 * v2 (founder decisions A-G, locked 2026-05-16): 21 cultural heritages,
 * Aboriginal & Torres Strait Islander always first, then ordered by the
 * documented blend (EventLinqs event-inventory strength + ABS 2021
 * census presence). Faith is a separate dimension
 * (src/lib/faiths/data.ts). Event type is a separate dimension. Gospel,
 * Comedy, Wellness and Pride are NOT heritages in v2 (Gospel -> faith,
 * Comedy/Wellness -> event type, Pride -> identity facet).
 *
 * The `CultureContent` interface and the getCulture / getAllCultures /
 * isCultureSlug / CULTURE_SLUGS API are intentionally unchanged from v1
 * so the ~30 downstream consumers keep compiling. `tier` is retained
 * for interface stability; in v2 every heritage is tier 1 and the
 * /cultures index renders one ordered list with First Nations pinned
 * first via `heritageOrder`.
 *
 * Voice: Australian English, no em-dashes, no exclamation marks.
 */

export type CultureSlug =
  | 'aboriginal-torres-strait-islander'
  | 'african'
  | 'caribbean'
  | 'indian'
  | 'chinese'
  | 'filipino'
  | 'latin-american'
  | 'vietnamese'
  | 'lebanese-levantine'
  | 'greek'
  | 'italian'
  | 'korean'
  | 'japanese'
  | 'pacific-pasifika'
  | 'maori'
  | 'persian-iranian'
  | 'turkish'
  | 'arab'
  | 'other-south-asian'
  | 'other-east-southeast-asian'
  | 'other-european'

export interface SubCulture {
  slug: string
  label: string
  /** Short blurb shown under the rail tile heading. */
  blurb: string
}

export interface CultureContent {
  slug: CultureSlug
  displayName: string
  /** Retained for interface stability. All v2 heritages are tier 1. */
  tier: 1 | 2
  /** 1-based blend ordering. First Nations is always 1. */
  heritageOrder: number
  /** Optional discovery roll-up this heritage belongs to (Decision C). */
  rollUp: 'asian' | 'european' | 'mena' | 'african' | 'pacific' | null
  /** Canonical short tagline shown under the eyebrow + display name. */
  tagline: string
  /** Hero h1 line. */
  heroHeadline: string
  /** Hero supporting paragraph. */
  heroBody: string
  /** Story paragraphs (3) for the editorial intro section. */
  storyParagraphs: string[]
  /** Sub-cultures rail: in-heritage breakdown / sub-filter tabs. */
  subCultures: SubCulture[]
  /** Cities where this culture has critical mass. */
  cities: string[]
  /** Cross-discovery rail. */
  relatedCultures: CultureSlug[]
  /** Faith slugs commonly associated with this heritage (cross-link). */
  relatedFaiths: string[]
  /** Persona bullets shown beside the organiser CTA. */
  organiserPersonas: string[]
  /** SEO keywords. */
  keywords: string[]
}

const AU_CORE: string[] = [
  'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
  'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
  'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
]

const CULTURES: Record<CultureSlug, CultureContent> = {
  'aboriginal-torres-strait-islander': {
    slug: 'aboriginal-torres-strait-islander',
    displayName: 'Aboriginal & Torres Strait Islander',
    tier: 1,
    heritageOrder: 1,
    rollUp: null,
    tagline: 'The oldest living cultures on earth, front and centre.',
    heroHeadline: 'First Nations culture, led by First Nations people.',
    heroBody:
      'NAIDOC events, community gatherings, dance and song, language and art, Torres Strait Islander celebrations. Listed by and for First Nations communities, on a platform that puts them first.',
    storyParagraphs: [
      'More than 65,000 years of continuous culture, 250-plus language groups, and a living calendar that runs from NAIDOC Week to community days, corroboree, dance and song, art markets, film and storytelling. Aboriginal and Torres Strait Islander events are community-led by design: organised by mob, for mob and for everyone who wants to listen and learn properly. The Torres Strait carries its own island traditions, song lines and dance distinct again. EventLinqs leads with First Nations because an Australian platform that does not is not an Australian platform.',
      'EventLinqs supports First Nations organisers with transparent fees, community pricing for not-for-profit and grassroots events, accessible ticket tiers, and human support. Cultural protocols and community ownership of content sit with the community, always.',
      'If you run NAIDOC events, community gatherings, dance, art markets or First Nations festivals, list with us. Community-led, on your terms.',
    ],
    subCultures: [
      { slug: 'naidoc',          label: 'NAIDOC',           blurb: 'NAIDOC Week, community celebrations.' },
      { slug: 'dance-song',      label: 'Dance & Song',     blurb: 'Corroboree, contemporary, community.' },
      { slug: 'art-markets',     label: 'Art & Markets',    blurb: 'Art fairs, makers, exhibitions.' },
      { slug: 'language-story',  label: 'Language & Story', blurb: 'Storytelling, film, language.' },
      { slug: 'torres-strait',   label: 'Torres Strait',    blurb: 'Island song, dance, tradition.' },
      { slug: 'community-day',   label: 'Community Days',   blurb: 'Family days, gatherings, fundraisers.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['pacific-pasifika', 'maori', 'african'],
    relatedFaiths: [],
    organiserPersonas: [
      'First Nations community organisations and land councils',
      'NAIDOC Week committees and community event groups',
      'Aboriginal and Torres Strait Islander artists and dance groups',
      'Community-controlled organisations running family and culture days',
    ],
    keywords: ['First Nations events', 'NAIDOC Week', 'Aboriginal events Australia', 'Torres Strait Islander', 'Indigenous culture events', 'community day'],
  },

  african: {
    slug: 'african',
    displayName: 'African',
    tier: 1,
    heritageOrder: 2,
    rollUp: 'african',
    tagline: 'Every rhythm. Every region. One platform.',
    heroHeadline: 'African events on every dance floor in your city.',
    heroBody:
      'From Lagos to Naarm, Joburg to London. Afrobeats, Amapiano, Owambe and the next sound starting tonight. EventLinqs is built for the promoters and crews making it happen.',
    storyParagraphs: [
      "Where Lagos meets Lagos in Sydney. Where the gele goes on, the aso ebi gets cut, and the DJ knows exactly when to drop Amapiano right after Owambe. African nights are a continent moving through every dance floor: Afrobeats from West Africa, Amapiano from South Africa, Bongo Flava from East Africa, Owambe celebrations spilling out of community halls, festival weekends in Naarm. The crews are family, the food is real, and the phones come out for the line dances and the moments nobody planned.",
      'EventLinqs gives African organisers transparent fees, WhatsApp-first share flows, squad bookings so the whole crew comes together, and real human support. No platform tax disguised as convenience.',
      'If you run African nights, festivals, concerts or cultural events, list with us. The first event is on us.',
    ],
    subCultures: [
      { slug: 'afrobeats',     label: 'Afrobeats',     blurb: 'West African pop, Lagos to London.' },
      { slug: 'amapiano',      label: 'Amapiano',      blurb: 'South African log-drum house.' },
      { slug: 'owambe',        label: 'Owambe',        blurb: 'Nigerian celebrations, all colours.' },
      { slug: 'west-african',  label: 'West African',  blurb: 'Highlife, Afrobeat, Hiplife.' },
      { slug: 'east-african',  label: 'East African',  blurb: 'Bongo Flava, Gengetone, Taarab.' },
      { slug: 'southern-african', label: 'Southern African', blurb: 'Amapiano, Gqom, Kwaito.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['caribbean', 'arab', 'latin-american'],
    relatedFaiths: ['christian'],
    organiserPersonas: [
      'Independent promoters running monthly Afrobeats and Amapiano nights',
      'Festival organisers booking continental and global culture artists',
      'University African society party committees',
      'Owambe planners coordinating weddings, naming ceremonies and milestones',
    ],
    keywords: ['African events', 'Afrobeats Melbourne', 'Amapiano Sydney', 'Owambe Australia', 'Nigerian events', 'Ghanaian events'],
  },

  caribbean: {
    slug: 'caribbean',
    displayName: 'Caribbean',
    tier: 1,
    heritageOrder: 3,
    rollUp: null,
    tagline: 'Carnival energy, all year round.',
    heroHeadline: 'The Caribbean lives where you do.',
    heroBody:
      'Soca, dancehall, reggae, calypso and steel pan. From Carnival weekends to summer fete season, the islands are wherever the people gather.',
    storyParagraphs: [
      "Where Trinidad meets Naarm under the same steel pan. Where the soca starts at midnight, the dancehall gets sweaty, and somebody's auntie is pulling sorrel out of a freezer. Caribbean events are Carnival weekends with feathered costumes you could not fake, fete season in every city the islands settled, dancehall parties that never seem to stop, reggae nights where the bass moves the floorboards, and steel pan orchestras that stop a whole street.",
      'EventLinqs is built for fete promoters who need clean ticketing, group bookings for the whole crew, and WhatsApp share flows that work the way the community already moves.',
      'If you run Carnival weekends, fete season, dancehall parties or steel pan nights, list with us.',
    ],
    subCultures: [
      { slug: 'soca',           label: 'Soca',           blurb: 'Trinidad Carnival, year-round.' },
      { slug: 'dancehall',      label: 'Dancehall',      blurb: 'Jamaica sound, world riddim.' },
      { slug: 'reggae',         label: 'Reggae',         blurb: 'Roots, dub, lovers rock.' },
      { slug: 'trinidadian',    label: 'Trinidadian',    blurb: 'Mas, Jouvert, calypso.' },
      { slug: 'jamaican',       label: 'Jamaican',       blurb: 'Beach parties, riddim culture.' },
      { slug: 'afro-caribbean', label: 'Afro-Caribbean', blurb: 'Drumming, fusion rhythm.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['african', 'latin-american', 'arab'],
    relatedFaiths: ['christian'],
    organiserPersonas: [
      "Carnival organisers running Jouvert and parade events",
      'Soca and dancehall fete promoters',
      'Reggae festival and concert promoters',
      'Steel band orchestras booking concert nights',
    ],
    keywords: ['Caribbean events', 'soca Sydney', 'dancehall Melbourne', 'reggae Australia', 'carnival', 'steel pan'],
  },

  indian: {
    slug: 'indian',
    displayName: 'Indian',
    tier: 1,
    heritageOrder: 4,
    rollUp: 'asian',
    tagline: 'Bollywood, bhangra, garba and beyond.',
    heroHeadline: 'Indian community, the way it deserves to be sold.',
    heroBody:
      'Bollywood nights, garba and Navratri, Diwali parties, Holi celebrations, bhangra raves, Tamil and Telugu cinema events. Every rhythm of India in one place.',
    storyParagraphs: [
      "Where Mumbai meets Melbourne under the same DJ booth. Where the lehengas come out, the dhol kicks in, and someone's auntie still runs the kitchen. Indian events are sangeets that go past sunrise, garba nights nine deep into Navratri, Holi parties where the colours never quite come off, Bollywood club nights, bhangra raves, and Tamil and Telugu cinema premieres. India is the fastest-growing migrant community in Australia and the events scene shows it.",
      'EventLinqs supports squad bookings for the whole family group, group payments split through the app, WhatsApp-first sharing, and transparent pricing so the all-in price is what you pay.',
      'If you run garba nights, Bollywood parties, Holi or Diwali celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'bollywood',    label: 'Bollywood',      blurb: 'Hindi cinema and dance nights.' },
      { slug: 'bhangra',      label: 'Bhangra',        blurb: 'Punjabi rhythms, full energy.' },
      { slug: 'garba-raas',   label: 'Garba & Raas',   blurb: 'Navratri devotional dance.' },
      { slug: 'holi-diwali',  label: 'Holi & Diwali',  blurb: 'Colours and the festival of lights.' },
      { slug: 'tamil-telugu', label: 'Tamil & Telugu', blurb: 'South Indian cinema and culture.' },
      { slug: 'classical',    label: 'Classical',      blurb: 'Bharatanatyam, Kathak, sitar nights.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['other-south-asian', 'persian-iranian', 'arab'],
    relatedFaiths: ['hindu'],
    organiserPersonas: [
      'Bollywood club night promoters in major cities',
      'Garba and Navratri organisers running 9-night events',
      'Wedding and sangeet planners selling guest tickets',
      'University Indian society and cultural club committees',
    ],
    keywords: ['Indian events', 'Bollywood Sydney', 'Garba Melbourne', 'Diwali events Australia', 'Holi parties', 'bhangra night'],
  },

  chinese: {
    slug: 'chinese',
    displayName: 'Chinese',
    tier: 1,
    heritageOrder: 5,
    rollUp: 'asian',
    tagline: 'Lunar New Year, lion dance, lanterns and beyond.',
    heroHeadline: 'Chinese community, every season.',
    heroBody:
      'Lunar New Year parades, Mid-Autumn lantern festivals, lion dance, Mandarin and Cantonese concerts, banquets and community galas. The calendar runs all year.',
    storyParagraphs: [
      'Where Guangzhou meets Sydney under the same lantern. Where the lion dance clears the street, the mooncakes appear on the table like clockwork, and the banquet runs eight courses before the speeches. Chinese events span Lunar New Year parades that stop entire suburbs, Mid-Autumn family feasts under paper moons, Mandarin and Cantonese concerts, calligraphy and tea ceremony, and community galas that fill function centres. Chinese is one of Australia top ancestries and one of its largest recent migrant intakes.',
      'EventLinqs supports community committees with banquet and table booking flows, multi-language listings, family bundles, and transparent pricing.',
      'If you run Lunar New Year events, Mid-Autumn festivals, concerts or community galas, list with us.',
    ],
    subCultures: [
      { slug: 'lunar-new-year', label: 'Lunar New Year', blurb: 'Parades, lion dance, red lanterns.' },
      { slug: 'mid-autumn',     label: 'Mid-Autumn',     blurb: 'Mooncakes, lanterns, family feasts.' },
      { slug: 'cantonese',      label: 'Cantonese',      blurb: 'Cantopop, opera, Hong Kong scene.' },
      { slug: 'mandarin',       label: 'Mandarin',       blurb: 'Mandopop concerts, modern tours.' },
      { slug: 'banquet',        label: 'Banquet & Gala', blurb: 'Eight-course community dinners.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['vietnamese', 'korean', 'other-east-southeast-asian'],
    relatedFaiths: ['buddhist'],
    organiserPersonas: [
      'Lunar New Year community festival committees',
      'Chinese community association gala organisers',
      'Mandarin and Cantonese concert promoters',
      'Cultural society and university committees',
    ],
    keywords: ['Chinese events', 'Lunar New Year Sydney', 'Mid-Autumn festival Melbourne', 'lion dance', 'Cantopop concert', 'Chinese gala'],
  },

  filipino: {
    slug: 'filipino',
    displayName: 'Filipino',
    tier: 1,
    heritageOrder: 6,
    rollUp: 'asian',
    tagline: 'Fiesta. Family. Forever.',
    heroHeadline: 'Filipino fiesta, wherever you are.',
    heroBody:
      'Sinulog and Ati-Atihan, OPM concerts, parol-making workshops, balikbayan reunions and family fiestas. The Philippines lives loud, every weekend.',
    storyParagraphs: [
      "Where Cebu meets Sydney under the same parol star. Where Pasko starts in September, Sinulog gets the whole barangay dancing in unison, and the family fiesta runs until the lechon is gone and the karaoke starts. Filipino events are family-first by design: OPM concerts when the artists tour, Flores de Mayo processions in May, Sinulog and Ati-Atihan blowing through January, and town fiestas that never quite stop. Three generations come together for one night and stay until breakfast.",
      'EventLinqs is built for the way Filipino events actually work: family ticket bundles, group payments through the app, multilingual listings (Tagalog, Cebuano, English), and Messenger share flows.',
      'If you run fiestas, OPM concerts, Pasko events or community celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'opm',             label: 'OPM',             blurb: 'Original Pinoy Music tours.' },
      { slug: 'fiesta',          label: 'Fiesta',          blurb: 'Town saint celebrations.' },
      { slug: 'sinulog',         label: 'Sinulog',         blurb: 'January street festivals.' },
      { slug: 'pasko',           label: 'Pasko',           blurb: 'Filipino Christmas, parol, carols.' },
      { slug: 'modern-filipino', label: 'Modern Filipino', blurb: 'Youth, hip-hop, fusion.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['pacific-pasifika', 'other-east-southeast-asian', 'chinese'],
    relatedFaiths: ['christian'],
    organiserPersonas: [
      'Filipino community fiesta organisers',
      'OPM concert promoters and tour organisers',
      'Sinulog and Ati-Atihan event committees',
      'Parol-making and Filipino craft workshop hosts',
    ],
    keywords: ['Filipino events', 'Sinulog Sydney', 'OPM concert Melbourne', 'Pasko Australia', 'Filipino fiesta', 'parol workshop'],
  },

  'latin-american': {
    slug: 'latin-american',
    displayName: 'Latin American',
    tier: 1,
    heritageOrder: 7,
    rollUp: null,
    tagline: 'Salsa, bachata, reggaeton: the heat lives here.',
    heroHeadline: 'Latin American nights from Naarm to New York.',
    heroBody:
      'Salsa socials, bachata clubs, reggaeton raves, cumbia bands, mariachi performances and tango milongas. The rhythm is in the room, every night of the week.',
    storyParagraphs: [
      'Where Havana meets Naarm on the same dance floor. Where the salsa lesson runs past closing, the bachata couple knows every regular by face, and the reggaeton drops at exactly the right moment. Latin American nights are salsa socials that turn into milongas, bachata congresses with dancers from every continent, reggaeton clubs full of chants, cumbia bands that bring the accordion in, and tango milongas where the regulars know each other by step.',
      'EventLinqs is built for Latin American organisers who want clean ticketing, squad bookings for couples and friend groups, and a platform that respects the dance scene.',
      'If you run salsa socials, bachata congresses, reggaeton clubs or Latin festivals, list with us.',
    ],
    subCultures: [
      { slug: 'salsa',       label: 'Salsa',       blurb: 'Cuban, LA, Colombian styles.' },
      { slug: 'bachata',     label: 'Bachata',     blurb: 'Sensual, dominican, congresses.' },
      { slug: 'reggaeton',   label: 'Reggaeton',   blurb: 'Club nights, urbano, perreo.' },
      { slug: 'cumbia',      label: 'Cumbia',      blurb: 'Colombian and Mexican cumbia.' },
      { slug: 'mexican',     label: 'Mexican',     blurb: 'Mariachi, banda, fiestas patrias.' },
      { slug: 'brazilian',   label: 'Brazilian',   blurb: 'Samba, forro, bossa nova.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['caribbean', 'african', 'italian'],
    relatedFaiths: ['christian'],
    organiserPersonas: [
      'Salsa and bachata social promoters running weekly nights',
      'Reggaeton club night promoters',
      'Tango milonga organisers',
      'Latin American festival and national-day organisers',
    ],
    keywords: ['Latin events', 'salsa Sydney', 'bachata Melbourne', 'reggaeton Australia', 'cumbia', 'Latin American festival'],
  },

  vietnamese: {
    slug: 'vietnamese',
    displayName: 'Vietnamese',
    tier: 1,
    heritageOrder: 8,
    rollUp: 'asian',
    tagline: 'Tet, ao dai, V-pop and the whole table.',
    heroHeadline: 'Vietnamese culture, every weekend.',
    heroBody:
      'Tet Lunar New Year festivals, Mid-Autumn lantern nights, V-pop concerts, ao dai showcases and community fundraisers. One of Australia largest and most established communities.',
    storyParagraphs: [
      'Where Saigon meets Cabramatta under the same Tet banner. Where the lion dance runs the markets, the ao dai comes out for the new year, and the whole community shows for the Tet festival. Vietnamese events span Tet street festivals that fill showgrounds, Mid-Autumn lantern parades, V-pop concerts when the artists tour, ao dai and culture showcases, and community fundraisers run with serious organisation. Vietnamese is one of the top languages spoken at home in Australia.',
      'EventLinqs supports community committees with festival multi-day passes, family bundles, multilingual listings, and transparent fees.',
      'If you run Tet festivals, Mid-Autumn events, V-pop concerts or community celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'tet',          label: 'Tet',           blurb: 'Lunar New Year, the big one.' },
      { slug: 'mid-autumn',   label: 'Mid-Autumn',    blurb: 'Lantern parades, mooncakes.' },
      { slug: 'v-pop',        label: 'V-pop',         blurb: 'Modern Vietnamese pop tours.' },
      { slug: 'ao-dai',       label: 'Ao Dai & Culture', blurb: 'Showcases, heritage nights.' },
      { slug: 'community',    label: 'Community',     blurb: 'Fundraisers, association events.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['chinese', 'other-east-southeast-asian', 'filipino'],
    relatedFaiths: ['buddhist'],
    organiserPersonas: [
      'Vietnamese community association Tet committees',
      'Mid-Autumn festival organisers',
      'V-pop concert promoters',
      'Cultural and university society committees',
    ],
    keywords: ['Vietnamese events', 'Tet festival Sydney', 'Mid-Autumn Melbourne', 'V-pop concert', 'ao dai showcase', 'Vietnamese community'],
  },

  'lebanese-levantine': {
    slug: 'lebanese-levantine',
    displayName: 'Lebanese & Levantine',
    tier: 1,
    heritageOrder: 9,
    rollUp: 'mena',
    tagline: 'Dabke, mahrajan, mezze and the long table.',
    heroHeadline: 'Lebanese and Levantine culture, every weekend.',
    heroBody:
      'Mahrajan festivals, dabke nights, Eid and Easter celebrations, oud and tarab concerts, mezze long-tables. One of Australia strongest cultural-event communities.',
    storyParagraphs: [
      "Where Beirut meets Sydney under the same dabke line. Where the table never stops filling, the dabke pulls the whole room in whether you know the steps or not, and the oud cuts through every conversation after midnight. Lebanese and Levantine events span mahrajan festivals, dabke nights, Eid and Easter celebrations, tarab and oud concerts, and mezze long-tables that turn into all-nighters. The community is large, organised and loyal.",
      'EventLinqs supports family bundles, long-table booking flows, multilingual listings (Arabic, English), and WhatsApp share because that is where the audience lives.',
      'If you run mahrajans, dabke nights, Eid events or Levantine concerts, list with us.',
    ],
    subCultures: [
      { slug: 'dabke',     label: 'Dabke',      blurb: 'Line dance, mahrajan, weddings.' },
      { slug: 'mahrajan',  label: 'Mahrajan',   blurb: 'Festivals, food, live music.' },
      { slug: 'tarab-oud', label: 'Tarab & Oud', blurb: 'Classical, concerts, recitals.' },
      { slug: 'syrian',    label: 'Syrian',     blurb: 'Levantine music and food.' },
      { slug: 'palestinian', label: 'Palestinian', blurb: 'Heritage nights, dabke, culture.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['arab', 'turkish', 'persian-iranian'],
    relatedFaiths: ['muslim', 'christian'],
    organiserPersonas: [
      'Lebanese community association festival organisers',
      'Dabke troupes and wedding-circuit organisers',
      'Tarab and oud concert promoters',
      'Levantine restaurant and long-table event hosts',
    ],
    keywords: ['Lebanese events', 'mahrajan Sydney', 'dabke Melbourne', 'Levantine concert', 'Eid festival', 'Arabic music'],
  },

  greek: {
    slug: 'greek',
    displayName: 'Greek',
    tier: 1,
    heritageOrder: 10,
    rollUp: 'european',
    tagline: 'Glendi, bouzouki, and the whole village.',
    heroHeadline: 'Greek community, every season.',
    heroBody:
      'Glendi nights, festival panigiri, bouzouki and rebetiko, Greek Orthodox Easter, dance groups and food festivals. One of Australia great cultural-event traditions.',
    storyParagraphs: [
      "Where Thessaloniki meets Melbourne under the same bouzouki. Where the glendi runs until the plates are gone, the dance circle never quite closes, and someone's yiayia is still bringing out food at midnight. Greek events are glendi nights with live bouzouki and rebetiko, festival panigiri and food festivals, Greek Orthodox Easter, and dance groups that have run for generations. Melbourne holds one of the largest Greek communities in the world outside Greece.",
      'EventLinqs supports long-table communal dinners with set seating, festival multi-day passes, family bundles, and transparent fees.',
      'If you run glendi nights, panigiri, Greek festivals or dance evenings, list with us.',
    ],
    subCultures: [
      { slug: 'glendi',      label: 'Glendi',      blurb: 'Live music, dance, all night.' },
      { slug: 'rebetiko',    label: 'Rebetiko',    blurb: 'Bouzouki, the Greek blues.' },
      { slug: 'panigiri',    label: 'Panigiri',    blurb: 'Festival, food, community.' },
      { slug: 'dance',       label: 'Dance',       blurb: 'Regional dance groups and shows.' },
      { slug: 'cypriot',     label: 'Cypriot',     blurb: 'Souvla, meze, syrtos.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['italian', 'other-european', 'turkish'],
    relatedFaiths: ['christian'],
    organiserPersonas: [
      'Greek community and brotherhood committees',
      'Glendi and bouzouki night promoters',
      'Panigiri and food festival organisers',
      'Greek dance group and school committees',
    ],
    keywords: ['Greek events', 'glendi Melbourne', 'panigiri Sydney', 'rebetiko night', 'Greek festival Australia', 'bouzouki'],
  },

  italian: {
    slug: 'italian',
    displayName: 'Italian',
    tier: 1,
    heritageOrder: 11,
    rollUp: 'european',
    tagline: 'Sagra, festa, opera: la dolce vita.',
    heroHeadline: 'Italian community, every season.',
    heroBody:
      'Sagra food festivals, festa saint-day celebrations, opera nights, Italian film, regional clubs and long-table dinners. A founding thread of multicultural Australia.',
    storyParagraphs: [
      "Where Palermo meets Carlton under the same long table. Where the sagra runs three days, the band starts after the pasta, and someone's nonna is still bringing out more food at midnight. Italian events are saint-day feste with food that takes a year to plan, sagra food festivals, opera and tarantella nights, Italian film seasons, and regional club dinners. Italian is one of Australia largest ancestries and oldest community calendars.",
      'EventLinqs supports long-table communal dinners with set seating, festival multi-day passes, family bundles, and transparent fees.',
      'If you run sagras, feste, opera nights or Italian festivals, list with us.',
    ],
    subCultures: [
      { slug: 'sagra',      label: 'Sagra',      blurb: 'Food festivals, regional specialties.' },
      { slug: 'festa',      label: 'Festa',      blurb: 'Saint-day processions and feasts.' },
      { slug: 'opera',      label: 'Opera & Classical', blurb: 'Opera nights, recitals.' },
      { slug: 'italian-film', label: 'Italian Film', blurb: 'Film seasons and screenings.' },
      { slug: 'regional',   label: 'Regional Clubs', blurb: 'Calabrese, Siciliani, Veneti.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['greek', 'other-european', 'latin-american'],
    relatedFaiths: ['christian'],
    organiserPersonas: [
      'Italian regional club and association committees',
      'Sagra and food festival organisers',
      'Opera and classical concert promoters',
      'Italian film festival programmers',
    ],
    keywords: ['Italian events', 'sagra Melbourne', 'festa Sydney', 'Italian film festival', 'opera night', 'Italian club'],
  },

  korean: {
    slug: 'korean',
    displayName: 'Korean',
    tier: 1,
    heritageOrder: 12,
    rollUp: 'asian',
    tagline: 'K-pop, hallyu, and the whole wave.',
    heroHeadline: 'Korean community, every weekend.',
    heroBody:
      'K-pop concerts and dance covers, fan meets, Chuseok and Seollal, Korean film, food festivals and language exchanges. The Korean wave, live.',
    storyParagraphs: [
      'Where Seoul meets Sydney under the same K-pop chant. Where the fan chant is letter-perfect, the dance cover crew has rehearsed for months, and the concert sells out in ninety seconds. Korean events span stadium-scale K-pop concerts, dance cover competitions, fan meets, Chuseok and Seollal community days, Korean film seasons, and food and language events. The hallyu wave keeps the calendar full all year.',
      'EventLinqs supports reserved seating for concerts, group bookings for fan crews, multi-language listings, and transparent pricing.',
      'If you run K-pop events, dance covers, fan meets or Korean cultural festivals, list with us.',
    ],
    subCultures: [
      { slug: 'k-pop',        label: 'K-pop',         blurb: 'Concerts, tours, dance covers.' },
      { slug: 'fan-meet',     label: 'Fan Meets',     blurb: 'Cup sleeve, birthday, fandom.' },
      { slug: 'seollal-chuseok', label: 'Seollal & Chuseok', blurb: 'New Year, harvest, family.' },
      { slug: 'korean-film',  label: 'Korean Film',   blurb: 'Film seasons and screenings.' },
      { slug: 'korean-food',  label: 'Food & Culture', blurb: 'Festivals, markets, language.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['japanese', 'chinese', 'other-east-southeast-asian'],
    relatedFaiths: ['christian', 'buddhist'],
    organiserPersonas: [
      'K-pop dance crew and cover event organisers',
      'Fan club and fandom event committees',
      'K-pop concert and tour promoters',
      'Korean community and university society committees',
    ],
    keywords: ['Korean events', 'K-pop Sydney', 'K-pop concert Melbourne', 'fan meet', 'Chuseok', 'Korean film festival'],
  },

  japanese: {
    slug: 'japanese',
    displayName: 'Japanese',
    tier: 1,
    heritageOrder: 13,
    rollUp: 'asian',
    tagline: 'Matsuri, anime, taiko and J-culture.',
    heroHeadline: 'Japanese community, every season.',
    heroBody:
      'Matsuri festivals, anime conventions, taiko and J-rock, cherry blossom events, tea ceremony and Japanese film. A deep and growing event vertical.',
    storyParagraphs: [
      'Where Osaka meets Sydney under the same matsuri lantern. Where the taiko shakes the floor, the cosplay takes over the convention centre, and the cherry blossom event books out the park for a weekend. Japanese events span matsuri street festivals, anime and pop-culture conventions with multi-day passes, taiko and J-rock concerts, hanami cherry blossom gatherings, tea ceremony and Japanese film. The community and the fandom both run deep.',
      'EventLinqs supports multi-day convention passes, reserved seating, group bookings, and transparent pricing.',
      'If you run matsuri, anime conventions, taiko concerts or Japanese cultural events, list with us.',
    ],
    subCultures: [
      { slug: 'matsuri',   label: 'Matsuri',    blurb: 'Street festivals, food, dance.' },
      { slug: 'anime',     label: 'Anime & Pop', blurb: 'Conventions, cosplay, screenings.' },
      { slug: 'taiko',     label: 'Taiko & Music', blurb: 'Drumming, J-rock, concerts.' },
      { slug: 'hanami',    label: 'Hanami',     blurb: 'Cherry blossom gatherings.' },
      { slug: 'tea-arts',  label: 'Tea & Arts', blurb: 'Ceremony, ikebana, film.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['korean', 'chinese', 'other-east-southeast-asian'],
    relatedFaiths: ['buddhist'],
    organiserPersonas: [
      'Matsuri and Japan festival committees',
      'Anime convention organisers',
      'Taiko ensemble and J-rock promoters',
      'Japanese cultural society and film programmers',
    ],
    keywords: ['Japanese events', 'matsuri Sydney', 'anime convention Melbourne', 'taiko concert', 'hanami', 'Japanese film festival'],
  },

  'pacific-pasifika': {
    slug: 'pacific-pasifika',
    displayName: 'Pacific / Pasifika',
    tier: 1,
    heritageOrder: 14,
    rollUp: 'pacific',
    tagline: 'Samoan, Tongan, Fijian: islands in the room.',
    heroHeadline: 'Pasifika community, where the islands meet the city.',
    heroBody:
      'Pasifika festivals, Samoan flag day, Tongan and Fijian church concerts, island dance and family fundraisers. The islands live wherever the families settled.',
    storyParagraphs: [
      "Where Apia meets Sydney under the same siva. Where the church choir runs the night past closing, the dance is fierce, and somebody's aunty is feeding the whole hall whether you ate already or not. Pasifika events span Pasifika festivals in Sydney and Brisbane, Samoan flag day, Tongan and Fijian church-led concerts, island dance, and family fundraisers that pull a thousand people together on a single weekend. The community is tight and family-led.",
      'EventLinqs supports family ticket bundles, group church-led organising, multilingual listings (Samoan, Tongan, Fijian, English), and transparent pricing.',
      'If you run Pasifika events, flag days, church concerts or island cultural celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'samoan',     label: 'Samoan',     blurb: 'Flag day, fiafia, Lotu Tamaiti.' },
      { slug: 'tongan',     label: 'Tongan',     blurb: 'Faka-Tonga, church concerts.' },
      { slug: 'fijian',     label: 'Fijian',     blurb: 'Meke, community, fundraisers.' },
      { slug: 'cook-islands', label: 'Cook Islands', blurb: 'Drumming, dance, language week.' },
      { slug: 'pasifika-fest', label: 'Pasifika Festivals', blurb: 'City-wide multi-culture events.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['maori', 'aboriginal-torres-strait-islander', 'filipino'],
    relatedFaiths: ['christian'],
    organiserPersonas: [
      'Pasifika festival committees',
      'Samoan, Tongan and Fijian church event organisers',
      'Island dance group and cultural committees',
      'Pacific community fundraiser organisers',
    ],
    keywords: ['Pasifika events', 'Pasifika Sydney', 'Samoan flag day', 'Tongan church concert', 'Fijian community', 'island dance'],
  },

  maori: {
    slug: 'maori',
    displayName: 'Maori',
    tier: 1,
    heritageOrder: 15,
    rollUp: 'pacific',
    tagline: 'Kapa haka, te ao Maori, in the room.',
    heroHeadline: 'Maori community, carried across the Tasman.',
    heroBody:
      'Kapa haka, Matariki, te reo Maori events, waiata and community days. A distinct community with a large and growing presence in Australia.',
    storyParagraphs: [
      'Where Aotearoa meets Australia under the same haka. Where the kapa haka is precise and powerful, Matariki marks the new year, and the waiata fills the hall. Maori events span kapa haka competitions and performances, Matariki celebrations, te reo Maori and waiata events, and community days for the large Maori community across Australia. Maori is a distinct community, not a sub-set of anything, and is given its own home here.',
      'EventLinqs supports community-led organising, family bundles, te reo Maori listings, and transparent pricing.',
      'If you run kapa haka, Matariki, te reo events or Maori community days, list with us.',
    ],
    subCultures: [
      { slug: 'kapa-haka',  label: 'Kapa Haka',  blurb: 'Performance, competition, wananga.' },
      { slug: 'matariki',   label: 'Matariki',   blurb: 'Maori new year, the cluster rises.' },
      { slug: 'te-reo',     label: 'Te Reo & Waiata', blurb: 'Language, song, storytelling.' },
      { slug: 'community',  label: 'Community Days', blurb: 'Whanau days, fundraisers.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['pacific-pasifika', 'aboriginal-torres-strait-islander', 'filipino'],
    relatedFaiths: ['christian'],
    organiserPersonas: [
      'Kapa haka roopu and competition organisers',
      'Matariki festival committees',
      'Te reo Maori and waiata event hosts',
      'Maori community and whanau group organisers',
    ],
    keywords: ['Maori events', 'kapa haka Australia', 'Matariki Sydney', 'te reo Maori', 'waiata', 'Maori community'],
  },

  'persian-iranian': {
    slug: 'persian-iranian',
    displayName: 'Persian / Iranian',
    tier: 1,
    heritageOrder: 16,
    rollUp: 'mena',
    tagline: 'Nowruz, classical, and the thirteen days.',
    heroHeadline: 'Persian community, every season.',
    heroBody:
      'Nowruz celebrations, Chaharshanbe Suri fire-jumping, Persian classical and pop concerts, Yalda night and poetry evenings. A deep calendar, beautifully kept.',
    storyParagraphs: [
      'Where Tehran meets Sydney under the same haft-sin. Where the haft-sin gets set, the fire gets jumped before the new year, and Yalda runs until the poetry is finished and the pomegranate is gone. Persian events span Nowruz celebrations stretching across thirteen days, Chaharshanbe Suri fire festivals, Persian classical and modern pop concerts, Yalda night, and Hafez poetry evenings. Communities are tight-knit and events sell out before they are advertised.',
      'EventLinqs supports multi-language listings (Farsi, English), family bookings, and WhatsApp share flows.',
      'If you run Nowruz events, concerts, Yalda nights or Persian cultural celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'nowruz',      label: 'Nowruz',       blurb: 'Persian new year, haft-sin, sizdah.' },
      { slug: 'yalda',       label: 'Yalda',        blurb: 'Longest night, poetry, pomegranate.' },
      { slug: 'classical',   label: 'Classical',    blurb: 'Tar, setar, tradition.' },
      { slug: 'diaspora-pop', label: 'Modern Persian Pop', blurb: 'Modern Persian concerts, tours.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['arab', 'lebanese-levantine', 'turkish'],
    relatedFaiths: [],
    organiserPersonas: [
      'Nowruz community celebration organisers',
      'Persian classical and pop concert promoters',
      'Yalda and poetry night hosts',
      'Iranian community and cultural society committees',
    ],
    keywords: ['Persian events', 'Nowruz Sydney', 'Yalda Melbourne', 'Persian concert', 'Iranian community', 'Chaharshanbe Suri'],
  },

  turkish: {
    slug: 'turkish',
    displayName: 'Turkish',
    tier: 1,
    heritageOrder: 17,
    rollUp: 'mena',
    tagline: 'Saz, sema, and the long table.',
    heroHeadline: 'Turkish community, every weekend.',
    heroBody:
      'Turkish festivals, Ramadan and Eid events, saz and folk concerts, sema ceremonies, food festivals and community nights. A warm and well-organised community.',
    storyParagraphs: [
      'Where Istanbul meets Sydney under the same saz. Where the festival fills the showground, the saz carries the folk songs, and the table never stops filling. Turkish events span community festivals, Ramadan and Eid celebrations, saz and folk concerts, sema ceremonies, and food festivals that draw the whole community. The community is warm, organised and generous with the table.',
      'EventLinqs supports family bundles, festival passes, multilingual listings (Turkish, English), and transparent pricing.',
      'If you run Turkish festivals, Eid events, concerts or community nights, list with us.',
    ],
    subCultures: [
      { slug: 'folk-saz',  label: 'Folk & Saz', blurb: 'Anatolian folk, saz, halay.' },
      { slug: 'festival',  label: 'Festival',   blurb: 'Community festivals, food, music.' },
      { slug: 'sema',      label: 'Sema',       blurb: 'Whirling, sufi tradition.' },
      { slug: 'modern',    label: 'Modern Turkish', blurb: 'Pop concerts, modern tours.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['lebanese-levantine', 'arab', 'persian-iranian'],
    relatedFaiths: ['muslim'],
    organiserPersonas: [
      'Turkish community association festival committees',
      'Saz and folk concert promoters',
      'Eid and Ramadan event organisers',
      'Turkish cultural society committees',
    ],
    keywords: ['Turkish events', 'Turkish festival Sydney', 'Eid Melbourne', 'saz concert', 'Turkish community', 'sema'],
  },

  arab: {
    slug: 'arab',
    displayName: 'Arab',
    tier: 1,
    heritageOrder: 18,
    rollUp: 'mena',
    tagline: 'Tarab, oud, and the whole region.',
    heroHeadline: 'Arab community, every weekend.',
    heroBody:
      'Egyptian, Iraqi, Syrian and Gulf events, Arabic concerts, Eid celebrations, oud and tarab recitals and community festivals across the Arab world.',
    storyParagraphs: [
      'Where Cairo meets Sydney under the same oud. Where the tarab takes the room somewhere, the Eid table is open to everyone, and the concert sells out the moment the artist is announced. Arab events span Arabic concerts when the global stars tour, Egyptian, Iraqi, Syrian and Gulf community festivals, Eid celebrations, and oud and tarab recitals. This heritage sits alongside Lebanese and Levantine rather than being folded into it, so each community keeps its own home.',
      'EventLinqs supports multilingual listings (Arabic, English), family bookings, and WhatsApp share flows.',
      'If you run Arabic concerts, Eid events, recitals or Arab community festivals, list with us.',
    ],
    subCultures: [
      { slug: 'egyptian',  label: 'Egyptian',  blurb: 'Shaabi, classical, modern.' },
      { slug: 'iraqi',     label: 'Iraqi',     blurb: 'Maqam, community, heritage.' },
      { slug: 'gulf-khaleeji', label: 'Khaleeji', blurb: 'Gulf music and culture.' },
      { slug: 'tarab-oud', label: 'Tarab & Oud', blurb: 'Classical recitals, concerts.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['lebanese-levantine', 'persian-iranian', 'turkish'],
    relatedFaiths: ['muslim', 'christian'],
    organiserPersonas: [
      'Arabic concert promoters booking touring artists',
      'Egyptian, Iraqi and Syrian community committees',
      'Eid and community festival organisers',
      'Tarab and oud recital promoters',
    ],
    keywords: ['Arab events', 'Arabic concert Sydney', 'Eid Melbourne', 'oud recital', 'Egyptian community', 'tarab'],
  },

  'other-south-asian': {
    slug: 'other-south-asian',
    displayName: 'Other South Asian',
    tier: 1,
    heritageOrder: 19,
    rollUp: 'asian',
    tagline: 'Nepali, Sri Lankan, Pakistani, Bangladeshi and more.',
    heroHeadline: 'South Asian beyond India, with its own home.',
    heroBody:
      'Nepali festivals, Sri Lankan and Tamil events, Pakistani concerts and Eid, Bangladeshi Pohela Boishakh and community nights. The fast-growing communities that deserve their own page.',
    storyParagraphs: [
      'Where Kathmandu, Colombo, Karachi and Dhaka meet Sydney. Nepali is among the fastest-growing communities in Australia, and Sri Lankan, Pakistani and Bangladeshi communities run rich, well-organised calendars: Dashain and Tihar, Pohela Boishakh, Sri Lankan and Tamil New Year, Pakistani concerts and Eid, and community festivals across every capital. This heritage exists so these communities are not subsumed under Indian or lost under a vague South Asian label.',
      'EventLinqs supports family bundles, multilingual listings, group payments, and transparent pricing.',
      'If you run Dashain, Pohela Boishakh, Sri Lankan New Year, Pakistani or Bangladeshi events, list with us.',
    ],
    subCultures: [
      { slug: 'nepali',       label: 'Nepali',       blurb: 'Dashain, Tihar, community.' },
      { slug: 'sri-lankan',   label: 'Sri Lankan',   blurb: 'Sinhala and Tamil New Year.' },
      { slug: 'pakistani',    label: 'Pakistani',    blurb: 'Concerts, Eid, qawwali.' },
      { slug: 'bangladeshi',  label: 'Bangladeshi',  blurb: 'Pohela Boishakh, music, culture.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['indian', 'arab', 'other-east-southeast-asian'],
    relatedFaiths: ['hindu', 'muslim', 'buddhist'],
    organiserPersonas: [
      'Nepali community Dashain and Tihar committees',
      'Sri Lankan and Tamil New Year organisers',
      'Pakistani concert and Eid event promoters',
      'Bangladeshi Pohela Boishakh committees',
    ],
    keywords: ['Nepali events', 'Sri Lankan New Year', 'Pakistani concert Sydney', 'Bangladeshi events', 'Dashain', 'Pohela Boishakh'],
  },

  'other-east-southeast-asian': {
    slug: 'other-east-southeast-asian',
    displayName: 'Other East & Southeast Asian',
    tier: 1,
    heritageOrder: 20,
    rollUp: 'asian',
    tagline: 'Thai, Indonesian, Malaysian, Cambodian, Lao and more.',
    heroHeadline: 'East and Southeast Asia, every community kept.',
    heroBody:
      'Thai Songkran, Indonesian and Malaysian festivals, Cambodian and Lao New Year, food festivals and community nights. The communities a vague label would erase.',
    storyParagraphs: [
      'Where Bangkok, Jakarta, Kuala Lumpur, Phnom Penh and Vientiane meet Australia. Thai Songkran water festivals, Indonesian and Malaysian community festivals and food markets, Cambodian and Lao New Year, and Hmong and other community celebrations all run strong calendars. This heritage exists so each of these communities keeps a home rather than being lost inside a single broad bucket.',
      'EventLinqs supports family bundles, multilingual listings, festival passes, and transparent pricing.',
      'If you run Songkran, Indonesian, Malaysian, Cambodian or Lao events, list with us.',
    ],
    subCultures: [
      { slug: 'thai',        label: 'Thai',        blurb: 'Songkran, Loy Krathong, food.' },
      { slug: 'indonesian',  label: 'Indonesian',  blurb: 'Festivals, gamelan, food markets.' },
      { slug: 'malaysian',   label: 'Malaysian',   blurb: 'Festivals, food, community.' },
      { slug: 'cambodian-lao', label: 'Cambodian & Lao', blurb: 'New year, dance, community.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['vietnamese', 'chinese', 'filipino'],
    relatedFaiths: ['buddhist'],
    organiserPersonas: [
      'Thai community Songkran organisers',
      'Indonesian and Malaysian festival committees',
      'Cambodian and Lao New Year organisers',
      'Southeast Asian food festival and community hosts',
    ],
    keywords: ['Thai events', 'Songkran Sydney', 'Indonesian festival Melbourne', 'Malaysian community', 'Cambodian New Year', 'Lao events'],
  },

  'other-european': {
    slug: 'other-european',
    displayName: 'Other European',
    tier: 1,
    heritageOrder: 21,
    rollUp: 'european',
    tagline: 'Polish, German, Irish, Balkan, Ukrainian and more.',
    heroHeadline: 'Europe beyond Greek and Italian, every tradition kept.',
    heroBody:
      'Oktoberfest, Polish and Ukrainian folk, Irish music and St Patrick, Balkan brass, Maltese and Eurovision nights. The whole continent in one calendar.',
    storyParagraphs: [
      "Where Bavaria, Krakow, Dublin and the Balkans meet Australia. Other European events run a hundred traditions: Oktoberfest beer halls with brass and full-room singing, Polish polka and Wigilia, Ukrainian folk dance in hand-embroidered vyshyvanka, Irish trad sessions and St Patrick, Balkan brass nights, Maltese feasts, and the great democratic ritual of a Eurovision watch party. Every community keeps its own calendar alive.",
      'EventLinqs supports festival multi-day passes, intimate folk evenings, language-specific listings, and squad bookings.',
      'If you run European cultural events, festivals, folk evenings or community celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'german',     label: 'German',     blurb: 'Oktoberfest, brass, beer halls.' },
      { slug: 'polish',     label: 'Polish',     blurb: 'Polka, Wigilia, pierogi.' },
      { slug: 'irish',      label: 'Irish',      blurb: 'Trad, St Patrick, ceili.' },
      { slug: 'ukrainian',  label: 'Ukrainian',  blurb: 'Folk dance, vyshyvanka, choir.' },
      { slug: 'balkan',     label: 'Balkan',     blurb: 'Brass, kolo, Balkan beats.' },
      { slug: 'eurovision', label: 'Eurovision', blurb: 'Watch parties, the whole show.' },
    ],
    cities: AU_CORE,
    relatedCultures: ['italian', 'greek', 'latin-american'],
    relatedFaiths: ['christian'],
    organiserPersonas: [
      'Oktoberfest and German club organisers',
      'Polish, Ukrainian and Balkan community committees',
      'Irish trad and St Patrick promoters',
      'Eurovision watch-party and European film hosts',
    ],
    keywords: ['European events', 'Oktoberfest Melbourne', 'Polish event Sydney', 'Irish trad', 'Balkan brass', 'Eurovision party'],
  },
}

/**
 * Batch 11.0 AU-first launch lock: filter culture.cities to AU
 * display-names only before exposing to consumers. The raw CULTURES
 * table keeps the global lists for SEO copy + future regional
 * expansion.
 */
const AU_CITY_DISPLAY_NAMES = new Set<string>([
  'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
  'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
  'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin',
  'Townsville', 'Toowoomba', 'Ballarat', 'Bendigo', 'Albury',
  'Launceston',
])

function filterToAuCities(culture: CultureContent): CultureContent {
  const auCities = culture.cities.filter(c => AU_CITY_DISPLAY_NAMES.has(c))
  if (auCities.length === culture.cities.length) return culture
  return { ...culture, cities: auCities }
}

/** Heritage-order sort, First Nations always first. */
function byHeritageOrder(a: CultureContent, b: CultureContent): number {
  return a.heritageOrder - b.heritageOrder
}

export function getCulture(slug: string): CultureContent | null {
  const c = CULTURES[slug as CultureSlug]
  return c ? filterToAuCities(c) : null
}

export function isCultureSlug(slug: string): slug is CultureSlug {
  return slug in CULTURES
}

export function getAllCultures(): CultureContent[] {
  return Object.values(CULTURES).map(filterToAuCities).sort(byHeritageOrder)
}

/**
 * v2: tier is retained for interface stability only. Every heritage is
 * tier 1, so getTier1Cultures returns the full ordered list and
 * getTier2Cultures returns an empty array. The /cultures index renders
 * one ordered list and pins First Nations first via heritageOrder.
 */
export function getTier1Cultures(): CultureContent[] {
  return getAllCultures()
}

export function getTier2Cultures(): CultureContent[] {
  return []
}

export const CULTURE_SLUGS: CultureSlug[] = (Object.values(CULTURES) as CultureContent[])
  .sort(byHeritageOrder)
  .map(c => c.slug)
