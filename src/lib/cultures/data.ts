/**
 * Culture content registry - the single source of truth for the 14
 * culture landing pages at /culture/[slug].
 *
 * Tier 1 (10): african, south-asian, caribbean, latin, east-asian,
 *              filipino, mediterranean, middle-eastern, european, pacific
 * Tier 2 (4):  gospel, comedy, wellness, pride
 *
 * The DB cultures table mirrors the slug + tier + tagline + hero_query;
 * this file owns the rich editorial content (paragraphs, sub-cultures,
 * related cultures, organiser CTA copy) which is not user-editable.
 *
 * Voice: Australian English, no em-dashes, no exclamation marks.
 * Cultures order is the marketed-rhythm order from CLAUDE.md.
 */

export type CultureSlug =
  | 'african'
  | 'south-asian'
  | 'caribbean'
  | 'latin'
  | 'east-asian'
  | 'filipino'
  | 'mediterranean'
  | 'middle-eastern'
  | 'european'
  | 'pacific'
  | 'gospel'
  | 'comedy'
  | 'wellness'
  | 'pride'

export interface SubCulture {
  slug: string
  label: string
  /** Short blurb shown under the rail tile heading. */
  blurb: string
}

export interface CultureContent {
  slug: CultureSlug
  displayName: string
  tier: 1 | 2
  /** Canonical short tagline shown under the eyebrow + display name. */
  tagline: string
  /** Hero h1 line. */
  heroHeadline: string
  /** Hero supporting paragraph. */
  heroBody: string
  /** Story paragraphs (3) for the editorial intro section. */
  storyParagraphs: string[]
  /** Sub-cultures rail: cross-genre breakdown. */
  subCultures: SubCulture[]
  /** Cities where this culture has critical mass. */
  cities: string[]
  /** Cross-discovery rail. */
  relatedCultures: CultureSlug[]
  /** Persona bullets shown beside the organiser CTA. */
  organiserPersonas: string[]
  /** SEO keywords. */
  keywords: string[]
}

const CULTURES: Record<CultureSlug, CultureContent> = {
  african: {
    slug: 'african',
    displayName: 'African',
    tier: 1,
    tagline: 'Every rhythm. Every region. One platform.',
    heroHeadline: 'African events on every dance floor in your city.',
    heroBody:
      'From Lagos to Naarm, Joburg to London. Afrobeats, Amapiano, Owambe and the next sound starting tonight. EventLinqs is built for the promoters and crews making it happen.',
    storyParagraphs: [
      "Where Lagos meets Lagos in Sydney. Where the gele goes on, the aso ebi gets cut, and the DJ knows exactly when to drop Amapiano right after Owambe. African nights aren't one sound. They're a continent moving through every dance floor on every continent: Afrobeats from West Africa, Amapiano from South Africa, Bongo Flava from East Africa, Owambe celebrations spilling out of community halls. Festival weekends in Naarm. Sunday gospel that resets the week. The crews are family, the food is real, and the phones come out for the line dances and the moments nobody planned.",
      "EventLinqs gives African organisers transparent fees, WhatsApp-first share flows, squad bookings so the whole crew comes together, and real human support. No platform tax disguised as convenience. No questions about whether your community is large enough to matter.",
      'If you run African nights, festivals, concerts or cultural events, list with us. The first event is on us.',
    ],
    subCultures: [
      { slug: 'afrobeats',           label: 'Afrobeats',          blurb: 'West African pop, Lagos to London.' },
      { slug: 'amapiano',            label: 'Amapiano',           blurb: 'South African log-drum house.' },
      { slug: 'owambe',              label: 'Owambe',             blurb: 'Nigerian celebrations, all colours.' },
      { slug: 'west-african',        label: 'West African',       blurb: 'Highlife, Afrobeat, Hiplife.' },
      { slug: 'east-african',        label: 'East African',       blurb: 'Bongo Flava, Gengetone, Taarab.' },
      { slug: 'pan-african-gospel',  label: 'Pan-African Gospel', blurb: 'Faith and family, every Sunday.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'London', 'Toronto', 'Houston', 'Atlanta', 'Lagos',
    ],
    relatedCultures: ['caribbean', 'gospel', 'comedy'],
    organiserPersonas: [
      'Independent promoters running monthly Afrobeats and Amapiano nights',
      'Festival organisers booking continental and global culture artists',
      'University African society party committees',
      'Owambe planners coordinating weddings, naming ceremonies and milestones',
    ],
    keywords: ['African events', 'Afrobeats Melbourne', 'Amapiano Sydney', 'African events London', 'Owambe Australia', 'Nigerian events', 'Ghanaian events'],
  },

  'south-asian': {
    slug: 'south-asian',
    displayName: 'South Asian',
    tier: 1,
    tagline: 'Bollywood, bhangra, garba and beyond.',
    heroHeadline: 'South Asian culture, the way it deserves to be sold.',
    heroBody:
      'Bollywood nights, garba and Navratri, Diwali parties, Holi celebrations, bhangra raves, Tamil and Telugu cinema events. Every rhythm of the subcontinent in one place.',
    storyParagraphs: [
      "Where Mumbai meets Melbourne under the same DJ booth. Where the lehengas come out, the dhol kicks in, and someone's auntie still runs the kitchen. South Asian events are sangeets that go past sunrise, garba nights nine deep into Navratri, Holi parties where the colours never quite come off, and Bollywood club nights that turn into family reunions by 1am. The community is huge, the energy is generational, and the platforms have been ignoring it for too long. From bhangra raves to Tamil cinema premieres to Diwali blocks of fireworks, every region of the subcontinent shows up loud, dressed and ready.",
      "EventLinqs supports squad bookings for the whole family group, group payments split through the app, WhatsApp-first sharing because that's where the audience lives, and transparent pricing so the all-in price is what you pay.",
      'If you run garba nights, Bollywood parties, Holi or Diwali celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'bollywood',     label: 'Bollywood',      blurb: 'Hindi cinema and dance nights.' },
      { slug: 'bhangra',       label: 'Bhangra',        blurb: 'Punjabi rhythms, full energy.' },
      { slug: 'garba-raas',    label: 'Garba & Raas',   blurb: 'Navratri devotional dance.' },
      { slug: 'holi-diwali',   label: 'Holi & Diwali',  blurb: 'Festival of colours and lights.' },
      { slug: 'tamil-telugu',  label: 'Tamil & Telugu', blurb: 'South Indian cinema and culture.' },
      { slug: 'classical',     label: 'Classical',      blurb: 'Bharatanatyam, Kathak, sitar nights.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'London', 'Toronto', 'New York', 'Dubai', 'Mumbai',
    ],
    relatedCultures: ['middle-eastern', 'east-asian', 'wellness'],
    organiserPersonas: [
      'Bollywood club night promoters in major cities',
      'Garba and Navratri organisers running 9-night events',
      'Wedding and sangeet planners selling guest tickets',
      'University Indian society and cultural club committees',
    ],
    keywords: ['South Asian events', 'Bollywood Sydney', 'Garba Melbourne', 'Diwali events Australia', 'Holi parties', 'bhangra night London'],
  },

  caribbean: {
    slug: 'caribbean',
    displayName: 'Caribbean',
    tier: 1,
    tagline: 'Carnival energy, all year round.',
    heroHeadline: 'The Caribbean lives where you do.',
    heroBody:
      'Soca, dancehall, reggae, calypso and steel pan. From Carnival weekends to summer fete season, the islands are wherever the people gather.',
    storyParagraphs: [
      "Where Trinidad meets Brixton meets Naarm under the same steel pan. Where the soca starts at midnight, the dancehall gets sweaty, and somebody's auntie is pulling sorrel out of a freezer. Caribbean events are Carnival weekends with feathered costumes you couldn't fake, fete season in every city the islands settled, dancehall parties that never seem to stop, reggae nights where the bass moves the floorboards, and steel pan orchestras that stop a whole street. The community keeps it alive on every continent. The food is real, the DJs are family, and the J'ouvert paint never fully washes off.",
      "EventLinqs is built for fete promoters who need clean ticketing, group bookings for the whole crew, and WhatsApp share flows that work the way the community already moves. Transparent fees, fast payouts, and zero patronising about what your audience looks like.",
      'If you run Carnival weekends, fete season, dancehall parties or steel pan nights, list with us.',
    ],
    subCultures: [
      { slug: 'reggae',          label: 'Reggae',         blurb: 'Roots, dub, lovers rock.' },
      { slug: 'soca',            label: 'Soca',           blurb: 'Trinidad Carnival, year-round.' },
      { slug: 'dancehall',       label: 'Dancehall',      blurb: 'Jamaica\'s sound, the world\'s riddim.' },
      { slug: 'afro-caribbean',  label: 'Afro-Caribbean', blurb: 'Drumming, fusion rhythm.' },
      { slug: 'trinidadian',     label: 'Trinidadian',    blurb: 'Mas, J\'ouvert, calypso.' },
      { slug: 'jamaican',        label: 'Jamaican',       blurb: 'Beach parties, riddim culture.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'London', 'Toronto', 'New York', 'Miami', 'Kingston',
    ],
    relatedCultures: ['african', 'latin', 'gospel'],
    organiserPersonas: [
      'Carnival organisers running J\'ouvert and parade events',
      'Soca and dancehall fete promoters',
      'Reggae festival and concert promoters',
      'Steel band orchestras booking concert nights',
    ],
    keywords: ['Caribbean events', 'soca Sydney', 'dancehall Melbourne', 'reggae London', 'carnival Toronto', 'steel pan'],
  },

  latin: {
    slug: 'latin',
    displayName: 'Latin',
    tier: 1,
    tagline: 'Salsa, bachata, reggaeton: the heat lives here.',
    heroHeadline: 'Latin nights from Naarm to New York.',
    heroBody:
      'Salsa socials, bachata clubs, reggaeton raves, cumbia bands, mariachi performances and tango milongas. The rhythm is in the room, every night of the week.',
    storyParagraphs: [
      "Where Havana meets Naarm meets Brooklyn on the same dance floor. Where the salsa lesson runs past closing, the bachata couple knows every regular by face, and the reggaeton drops at exactly the right moment. Latin nights are salsa socials that turn into milongas, bachata congresses with dancers from every continent, reggaeton clubs full of Bad Bunny chants, cumbia bands that bring the accordion in, and tango milongas where the regulars know each other by step. The dance floor is loud, the food is communal, and the room moves as one body.",
      "EventLinqs is built for Latin organisers who want clean ticketing, squad bookings for couples and friend groups, and a platform that respects the dance scene rather than treating it like an afterthought.",
      'If you run salsa socials, bachata congresses, reggaeton clubs or Latin festivals, list with us.',
    ],
    subCultures: [
      { slug: 'mexican',       label: 'Mexican',       blurb: 'Mariachi, banda, tejano.' },
      { slug: 'colombian',     label: 'Colombian',     blurb: 'Salsa, cumbia, vallenato.' },
      { slug: 'cuban',         label: 'Cuban',         blurb: 'Salsa Havana, son, rumba.' },
      { slug: 'argentinian',   label: 'Argentinian',   blurb: 'Tango, milonga, folk.' },
      { slug: 'brazilian',     label: 'Brazilian',     blurb: 'Samba, bossa, forró.' },
      { slug: 'spanish-latin', label: 'Spanish-Latin', blurb: 'Flamenco fusion, ibérico.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'Miami', 'Los Angeles', 'New York', 'Madrid',
    ],
    relatedCultures: ['caribbean', 'mediterranean', 'pride'],
    organiserPersonas: [
      'Salsa and bachata social promoters running weekly nights',
      'Reggaeton club night promoters',
      'Tango milonga organisers',
      'Latin festival and cultural celebration organisers',
    ],
    keywords: ['Latin events', 'salsa Sydney', 'bachata Melbourne', 'reggaeton Miami', 'tango Buenos Aires', 'cumbia events'],
  },

  'east-asian': {
    slug: 'east-asian',
    displayName: 'East Asian',
    tier: 1,
    tagline: 'K-pop, Lunar, anime, J-rock: the full spectrum.',
    heroHeadline: 'East Asian culture, every weekend.',
    heroBody:
      'K-pop dance covers, Lunar New Year celebrations, anime conventions, J-rock concerts, mahjong tournaments and Mid-Autumn festivals. The whole region in one calendar.',
    storyParagraphs: [
      "Where Seoul meets Sydney under the same K-pop chant. Where the lanterns go up in February, the cosplay comes out in autumn, and the mooncakes appear on the table like clockwork. East Asian events span Lunar New Year street parades that stop entire suburbs, Mid-Autumn family feasts under paper moons, K-pop concerts that fill stadiums in 90 seconds, anime conventions that take over convention centres, mahjong leagues that meet every Tuesday without fail, and J-rock tours that sell out the second they're announced. The community is intergenerational, the events are professional, and next weekend already has three on.",
      "EventLinqs supports the full range: stadium-scale K-pop events with reserved seating, intimate Lunar New Year community dinners, ticketed anime cons with multi-day passes, and everything between. Transparent pricing, multi-language listings, and squad bookings for the friend groups buying together.",
      'If you run Lunar celebrations, K-pop events, anime cons or East Asian cultural festivals, list with us.',
    ],
    subCultures: [
      { slug: 'chinese',    label: 'Chinese',        blurb: 'New Year, lanterns, lion dance.' },
      { slug: 'korean',     label: 'Korean',         blurb: 'K-pop, hallyu, fan meets.' },
      { slug: 'japanese',   label: 'Japanese',       blurb: 'Matsuri, J-rock, anime.' },
      { slug: 'vietnamese', label: 'Vietnamese',     blurb: 'Tet, áo dài, modern pop.' },
      { slug: 'thai',       label: 'Thai',           blurb: 'Songkran, Loi Krathong.' },
      { slug: 'lunar',      label: 'Lunar New Year', blurb: 'Pan-Asian celebration.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'London', 'New York', 'Toronto', 'Vancouver', 'Singapore',
    ],
    relatedCultures: ['south-asian', 'filipino', 'wellness'],
    organiserPersonas: [
      'K-pop dance crew event organisers',
      'Lunar New Year community festival committees',
      'Anime convention organisers',
      'J-rock tour promoters and fan club committees',
    ],
    keywords: ['East Asian events', 'K-pop Sydney', 'Lunar New Year Melbourne', 'anime convention London', 'Mid-Autumn festival'],
  },

  filipino: {
    slug: 'filipino',
    displayName: 'Filipino',
    tier: 1,
    tagline: 'Fiesta. Family. Forever.',
    heroHeadline: 'Filipino fiesta, wherever you are.',
    heroBody:
      'Sinulog, Ati-Atihan, Pasko sa Sarili. OPM concerts, parol-making workshops, balikbayan reunions and family fiestas. The Philippines lives loud, every weekend.',
    storyParagraphs: [
      "Where Cebu meets Sydney under the same parol star. Where Pasko starts in September, Sinulog gets the whole barangay dancing in unison, and the family fiesta runs until the lechon is gone and the karaoke starts. Filipino events are family-first by design: OPM concerts when the artists tour, Flores de Mayo processions in May, Sinulog and Ati-Atihan blowing through January, parol-making workshops every December, and town fiestas that never quite stop. The community is large, organised and loyal. The food is real. Three generations come together for one night and stay until breakfast.",
      "EventLinqs is built for the way Filipino events actually work: family ticket bundles for parents-plus-kids, group payments through the app, multilingual listings (Tagalog, Cebuano, English), and WhatsApp / Messenger share flows.",
      'If you run fiestas, OPM concerts, Pasko events or community celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'opm',             label: 'OPM',             blurb: 'Original Pinoy Music tours.' },
      { slug: 'fiesta',          label: 'Fiesta',          blurb: 'Town saint celebrations.' },
      { slug: 'sinulog',         label: 'Sinulog',         blurb: 'January street festivals.' },
      { slug: 'modern-filipino', label: 'Modern Filipino', blurb: 'Youth, hip-hop, fusion.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'Los Angeles', 'San Francisco', 'New York', 'Toronto', 'Manila',
    ],
    relatedCultures: ['east-asian', 'pacific', 'gospel'],
    organiserPersonas: [
      'Filipino community fiesta organisers',
      'OPM concert promoters and tour organisers',
      'Sinulog and Ati-Atihan event committees',
      'Parol-making and Filipino craft workshop hosts',
    ],
    keywords: ['Filipino events', 'Sinulog Sydney', 'OPM concert Melbourne', 'Pasko Australia', 'Filipino fiesta', 'parol workshop'],
  },

  mediterranean: {
    slug: 'mediterranean',
    displayName: 'Mediterranean',
    tier: 1,
    tagline: 'Italian, Greek, Spanish, Portuguese: la dolce vita.',
    heroHeadline: 'Mediterranean culture, every season.',
    heroBody:
      'Italian sagras and opera nights, Greek dance evenings, Spanish flamenco, Portuguese fado, Lebanese mezze parties. The slow Mediterranean weekend, every weekend.',
    storyParagraphs: [
      "Where Palermo meets Naarm under the same long table. Where the sagra runs three days, the bouzouki kicks in after the souvlaki, and someone's nonna is still bringing out more food at midnight. Mediterranean events are Italian saint-day festivals with food that takes a year to cook, Greek glendi nights with plate-smashing and live bouzouki, Spanish flamenco evenings, Portuguese fado nights that stop the room cold, and Lebanese mezze tables that turn into all-nighters around the arak. The events are warm, the food is intergenerational, the wine is honest, and nobody leaves hungry.",
      "EventLinqs supports the format: long-table communal dinners with set seating, festival multi-day passes for sagras and feast days, family bundles, transparent fees so the all-in price is what you pay.",
      'If you run sagras, fado nights, flamenco evenings or Mediterranean festivals, list with us.',
    ],
    subCultures: [
      { slug: 'italian',    label: 'Italian',    blurb: 'Sagra, opera, la dolce vita.' },
      { slug: 'greek',      label: 'Greek',      blurb: 'Glendi, bouzouki, plate-smashing.' },
      { slug: 'spanish',    label: 'Spanish',    blurb: 'Flamenco, fiesta, paella.' },
      { slug: 'portuguese', label: 'Portuguese', blurb: 'Fado, festa, soul music.' },
      { slug: 'cypriot',    label: 'Cypriot',    blurb: 'Souvla, meze, syrtos.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'London', 'New York', 'Toronto', 'Rome', 'Athens',
    ],
    relatedCultures: ['middle-eastern', 'european', 'latin'],
    organiserPersonas: [
      'Italian sagra committees and Italian club organisers',
      'Greek dance evening and glendi promoters',
      'Flamenco and fado night promoters',
      'Lebanese mezze and Mediterranean restaurant event hosts',
    ],
    keywords: ['Mediterranean events', 'Italian sagra Sydney', 'Greek night Melbourne', 'flamenco London', 'fado Lisbon', 'Lebanese mezze'],
  },

  'middle-eastern': {
    slug: 'middle-eastern',
    displayName: 'Middle Eastern',
    tier: 1,
    tagline: 'Arabic, Persian, Turkish, Israeli: one stage.',
    heroHeadline: 'Middle Eastern culture, every weekend.',
    heroBody:
      'Arabic concerts, Persian Norouz celebrations, Turkish nights, Israeli simchas, dabke parties, oud recitals and shisha lounges with live music.',
    storyParagraphs: [
      "Where Tehran meets Sydney under the same Norouz table. Where the haft sin gets set, the dabke line forms by itself, and the oud cuts through every conversation after midnight. Middle Eastern events span Arabic concerts when the global stars tour, Persian Norouz celebrations stretching across thirteen days of fire-jumping and family dinners, Turkish nights with whirling dervishes, Israeli simchas, and dabke parties that pull the whole room into the line whether you know the steps or not. Communities are tight-knit, events sell out before they're advertised, and the music carries thousands of years.",
      "EventLinqs supports multi-language listings (Arabic, Farsi, Turkish, Hebrew, English), squad bookings for family groups, and WhatsApp share because that's where the audience lives.",
      'If you run Arabic concerts, Norouz celebrations, dabke nights or Middle Eastern cultural events, list with us.',
    ],
    subCultures: [
      { slug: 'lebanese', label: 'Lebanese', blurb: 'Dabke, mahrajan, mezze.' },
      { slug: 'persian',  label: 'Persian',  blurb: 'Norouz, classical, fusion.' },
      { slug: 'turkish',  label: 'Turkish',  blurb: 'Saz, sema, modern pop.' },
      { slug: 'arab',     label: 'Arab',     blurb: 'Tarab, oud, classical.' },
      { slug: 'egyptian', label: 'Egyptian', blurb: 'Shaabi, classical, modern.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'London', 'New York', 'Toronto', 'Dubai', 'Beirut',
    ],
    relatedCultures: ['mediterranean', 'south-asian', 'european'],
    organiserPersonas: [
      'Arabic concert promoters booking touring artists',
      'Norouz organisers running multi-day Persian celebrations',
      'Dabke party and Levantine event organisers',
      'Turkish, Israeli and Armenian community event committees',
    ],
    keywords: ['Middle Eastern events', 'Arabic concert Sydney', 'Norouz Melbourne', 'dabke London', 'Persian events', 'Turkish night'],
  },

  european: {
    slug: 'european',
    displayName: 'European',
    tier: 1,
    tagline: 'From Polish to French to Ukrainian, all here.',
    heroHeadline: 'European culture, every weekend.',
    heroBody:
      'Oktoberfest, Polish polka nights, French chanson concerts, Ukrainian dance evenings, Czech beer halls, Swedish midsummer. The whole continent in one calendar.',
    storyParagraphs: [
      "Where Bavaria meets Melbourne under the same brass band. Where the lederhosen come out, the polka kicks in by the first stein, and somebody's grandmother is still making pierogi by the kilo. European events run a hundred different traditions: Oktoberfest beer halls with brass and full-room singing, Polish polka and Wigilia nights, French chanson evenings in bistros that feel like a Montmartre side street, Ukrainian folk dance in vyshyvanka shirts hand-embroidered over winter, Czech beer halls, and Swedish midsummer with maypoles in suburban parks. Every community keeps its own calendar alive. The food is honest, the traditions stretch back centuries, and the welcome is wide open.",
      "EventLinqs supports the breadth: festival weekends with multi-day passes, intimate folk evenings, language-specific listings, and squad bookings so families and friend groups come together.",
      'If you run European cultural events, festivals, folk evenings or community celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'polish',    label: 'Polish',    blurb: 'Polka, Wigilia, pierogi.' },
      { slug: 'russian',   label: 'Russian',   blurb: 'Folk, balalaika, festivals.' },
      { slug: 'german',    label: 'German',    blurb: 'Oktoberfest, brass, beer halls.' },
      { slug: 'french',    label: 'French',    blurb: 'Chanson, Bastille, bistro.' },
      { slug: 'hungarian', label: 'Hungarian', blurb: 'Czardas, folk, classical.' },
      { slug: 'romanian',  label: 'Romanian',  blurb: 'Folk dance, Hora, Christmas.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'London', 'New York', 'Toronto', 'Berlin', 'Paris',
    ],
    relatedCultures: ['mediterranean', 'middle-eastern', 'east-asian'],
    organiserPersonas: [
      'Oktoberfest and Bavarian beer hall organisers',
      'Polish, Ukrainian and Czech community committees',
      'French chanson and Bastille Day promoters',
      'Scandinavian midsummer and Christmas market organisers',
    ],
    keywords: ['European events', 'Oktoberfest Melbourne', 'Polish event Sydney', 'French chanson London', 'Ukrainian Australia', 'midsummer'],
  },

  pacific: {
    slug: 'pacific',
    displayName: 'Pacific',
    tier: 1,
    tagline: 'Maori, Samoan, Tongan, Fijian: islands in the room.',
    heroHeadline: 'Pacific culture, where the islands meet the city.',
    heroBody:
      'Polyfest performances, Pasifika festivals, Maori kapa haka, Samoan flag day, Tongan church concerts and Fijian fundraisers. The islands live wherever the families settled.',
    storyParagraphs: [
      "Where Apia meets Sydney under the same tatau. Where the kapa haka is fierce, the church choir runs the night past closing, and somebody's aunty is feeding the whole hall whether you ate already or not. Pacific events span Polyfest in Tamaki Makaurau, Pasifika in Sydney and Brisbane, Maori kapa haka competitions, Samoan flag day celebrations, Tongan and Fijian church-led concerts, and family fundraisers that pull together a thousand people on a single weekend. The community is tight, the events are family-led, and the platforms have ignored them for far too long. We changed that.",
      "EventLinqs supports family ticket bundles, group church-led organising, multilingual listings (Te Reo Maori, Samoan, Tongan, Fijian, English), and transparent pricing.",
      'If you run Polyfest, Pasifika events, kapa haka or Pacific cultural celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'maori',         label: 'Maori',                  blurb: 'Kapa haka, te ao Maori.' },
      { slug: 'samoan',        label: 'Samoan',                 blurb: 'Flag day, Lotu Tamaiti, fiafia.' },
      { slug: 'tongan',        label: 'Tongan',                 blurb: 'Faka-Tonga, church concerts.' },
      { slug: 'fijian',        label: 'Fijian',                 blurb: 'Meke, Diwali Fiji.' },
      { slug: 'aboriginal',    label: 'Aboriginal',             blurb: 'First Nations, ceremony, dance.' },
      { slug: 'torres-strait', label: 'Torres Strait Islander', blurb: 'Island traditions, song, dance.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'Auckland', 'Wellington', 'Honolulu', 'Los Angeles', 'Toronto',
    ],
    relatedCultures: ['filipino', 'east-asian', 'gospel'],
    organiserPersonas: [
      'Polyfest and Pasifika festival committees',
      'Kapa haka kapa and rōpū organisers',
      'Samoan, Tongan and Fijian church event organisers',
      'Pacific community fundraiser organisers',
    ],
    keywords: ['Pacific events', 'Polyfest Auckland', 'Pasifika Sydney', 'kapa haka', 'Samoan flag day', 'Tongan church'],
  },

  // ----------------------------------------------------------------------
  // Tier 2 - cross-cultural verticals
  // ----------------------------------------------------------------------
  gospel: {
    slug: 'gospel',
    displayName: 'Gospel',
    tier: 2,
    tagline: 'Worship. Praise. Together.',
    heroHeadline: 'Every faith tradition, on one platform.',
    heroBody:
      'African gospel concerts, Pacific church choirs, Filipino praise nights, Latin Christian festivals. Worship music crosses every culture and EventLinqs supports them all.',
    storyParagraphs: [
      "Where Lagos meets Atlanta under the same praise break. Where the choir takes the room to a new altitude, the worship leader knows exactly when to hold the note, and the whole congregation comes to its feet without being told. Gospel events span African gospel from Nigeria, Ghana and South Africa, Pacific church choirs from Samoa and Tonga, Filipino praise nights, Latin Christian rock festivals, Black gospel from across the United States, and Caribbean gospel concerts that move whole communities. Every culture has its own gospel scene. They all sell tickets, they all bring the spirit, and they all leave the room lighter than they found it.",
      "EventLinqs supports churches and choirs with non-profit pricing, recurring weekly service ticket flows, multi-language listings, and family ticket bundles.",
      'If you run gospel concerts, choir performances or worship festivals, list with us.',
    ],
    subCultures: [
      { slug: 'african-gospel',   label: 'African gospel',   blurb: 'Nigerian, Ghanaian, South African.' },
      { slug: 'pacific-choir',    label: 'Pacific choir',    blurb: 'Samoan, Tongan, Fijian church.' },
      { slug: 'filipino-praise',  label: 'Filipino praise',  blurb: 'Tagalog and English worship.' },
      { slug: 'black-gospel',     label: 'Black gospel',     blurb: 'United States traditional and contemporary.' },
      { slug: 'latin-christian',  label: 'Latin Christian',  blurb: 'Spanish-language worship.' },
      { slug: 'caribbean-gospel', label: 'Caribbean gospel', blurb: 'Jamaican, Trinidadian gospel.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'London', 'New York', 'Toronto',
    ],
    relatedCultures: ['african', 'pacific', 'filipino'],
    organiserPersonas: [
      'Church choir directors booking concerts',
      'Gospel festival organisers',
      'Worship night promoters',
      'Christian music tour organisers',
    ],
    keywords: ['gospel events', 'African gospel Sydney', 'church concert', 'worship night', 'Christian festival'],
  },

  comedy: {
    slug: 'comedy',
    displayName: 'Comedy',
    tier: 2,
    tagline: 'Stand-up, sketch, improv, all of it.',
    heroHeadline: 'Comedy, in your culture, in your city.',
    heroBody:
      'African comedy tours, South Asian stand-up, Latin sketch nights, Filipino improv, English-language pubs and clubs. Laughter is universal and the line-ups are local.',
    storyParagraphs: [
      "Where Lagos meets Naarm meets Mumbai on the same stage. Where the jokes hit harder when the room knows the references, the headliner's still a regular at the open mic, and the audience holds the silence right before the punchline lands. Comedy in your culture, in your language, in your city: African comedians touring globally, South Asian stand-up filling theatres, Latin and Spanish-language clubs, Filipino improv troupes, Pacific stand-up nights. Plus the entire English-language scene from open-mic Tuesday to arena Saturday. The line-ups are local, the laughs are universal, and the room knows exactly when to lose it.",
      "EventLinqs supports comedy promoters with reserved seating for multi-act bills, two-drink-minimum bundles, group bookings, and transparent fees.",
      'If you run comedy nights, tours or festivals in any language or culture, list with us.',
    ],
    subCultures: [
      { slug: 'african-comedy',    label: 'African comedy',    blurb: 'Nigerian, Ghanaian, Kenyan tours.' },
      { slug: 'south-asian-comedy', label: 'South Asian comedy', blurb: 'Hindi, Tamil, Punjabi, English.' },
      { slug: 'latin-comedy',      label: 'Latin comedy',      blurb: 'Spanish-language stand-up.' },
      { slug: 'filipino-comedy',   label: 'Filipino comedy',   blurb: 'Tagalog and English stand-up.' },
      { slug: 'open-mic',          label: 'Open mic',          blurb: 'New voices, every Tuesday.' },
      { slug: 'improv',            label: 'Improv & sketch',   blurb: 'Live, unscripted, fearless.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'London', 'New York', 'Toronto',
    ],
    relatedCultures: ['african', 'south-asian', 'pride'],
    organiserPersonas: [
      'Comedy club bookers programming weekly nights',
      'Touring comedy promoters running national runs',
      'Festival programmers (Comedy Festival, Fringe)',
      'Cultural comedy promoters specialising in one tradition',
    ],
    keywords: ['comedy events', 'stand-up Sydney', 'African comedy tour', 'Bollywood comedy', 'open mic Melbourne', 'comedy festival'],
  },

  wellness: {
    slug: 'wellness',
    displayName: 'Wellness',
    tier: 2,
    tagline: 'Yoga, sound bath, breathwork, retreats.',
    heroHeadline: 'Wellness, with cultural roots.',
    heroBody:
      'Yoga and meditation rooted in South Asian tradition. Sound healing across cultures. Breathwork from every region. Retreats, workshops and weekly classes that respect where the practice came from.',
    storyParagraphs: [
      "Where Mysore meets Byron Bay under the same sunrise. Where the yoga teacher knows the lineage, the sound bath actually moves something in the room, and the breathwork class isn't pretending. Wellness with cultural roots: yoga and Ayurveda from South Asia, tai chi and qigong from East Asia, Pacific lomi lomi, African dance therapy, Latin curanderismo. Plus modern formats that draw from all of them: meditation circles, sound baths, breathwork sessions, and multi-day retreats in places that hold a quietness most cities forget. The lineages are deep, the practitioners are serious, and the space is held with respect for where it came from.",
      "EventLinqs supports wellness practitioners with class series ticketing, multi-day retreat passes, family bundles, accessible pricing tiers, and transparent fees.",
      'If you run yoga, sound healing, meditation, breathwork, or wellness retreats, list with us.',
    ],
    subCultures: [
      { slug: 'yoga',          label: 'Yoga',          blurb: 'Hatha, vinyasa, kundalini, restorative.' },
      { slug: 'meditation',    label: 'Meditation',    blurb: 'Vipassana, Zen, mindfulness.' },
      { slug: 'sound-bath',    label: 'Sound bath',    blurb: 'Crystal bowls, gongs, voice.' },
      { slug: 'breathwork',    label: 'Breathwork',    blurb: 'Wim Hof, holotropic, pranayama.' },
      { slug: 'retreats',      label: 'Retreats',      blurb: 'Weekend, week-long, immersive.' },
      { slug: 'tai-chi',       label: 'Tai chi & qigong', blurb: 'East Asian moving meditation.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'London', 'New York', 'Toronto',
    ],
    relatedCultures: ['south-asian', 'east-asian', 'pacific'],
    organiserPersonas: [
      'Yoga studio owners selling class packs and series',
      'Retreat organisers running multi-day events',
      'Sound healing and meditation practitioners',
      'Wellness festival programmers',
    ],
    keywords: ['wellness events', 'yoga Sydney', 'meditation retreat Melbourne', 'sound bath Byron', 'breathwork', 'retreat Bali'],
  },

  pride: {
    slug: 'pride',
    displayName: 'Pride',
    tier: 2,
    tagline: 'Queer culture, every culture, all welcome.',
    heroHeadline: 'Pride is every culture, every weekend.',
    heroBody:
      'Mardi Gras, drag brunch, queer film festivals, ballroom voguing, queer dance parties and intersectional pride events that hold space for everyone.',
    storyParagraphs: [
      "Where Sydney meets San Francisco meets Naarm under the same rainbow. Where the drag queen runs the room, the ballroom voguers throw the category down without apology, and chosen family takes up a whole row at the front. Pride is every culture and every culture has queer voices: Sydney Mardi Gras, ballroom voguing scenes from New York to Naarm, queer film festivals worldwide, drag brunch and dance party circuits in every city, and intersectional pride events that hold space for everyone. The events are joyful, the events are defiant, and the events are growing every single year.",
      "EventLinqs supports queer promoters with safer-space ticketing flows, accessible pricing tiers, group bookings for chosen family, and zero tolerance for hateful behaviour from the platform side.",
      'If you run drag shows, ballroom events, queer dance parties or pride festivals, list with us.',
    ],
    subCultures: [
      { slug: 'mardi-gras',  label: 'Mardi Gras',     blurb: 'Sydney, Auckland, global pride.' },
      { slug: 'drag',        label: 'Drag',           blurb: 'Brunch, theatre, club shows.' },
      { slug: 'ballroom',    label: 'Ballroom & vogue', blurb: 'Houses, balls, kiki nights.' },
      { slug: 'queer-film',  label: 'Queer film',     blurb: 'Festivals, screenings, premieres.' },
      { slug: 'queer-dance', label: 'Queer dance',    blurb: 'Honcho, Heaps Gay, Horse Meat.' },
      { slug: 'pride-fest',  label: 'Pride festivals', blurb: 'City-wide multi-day events.' },
    ],
    cities: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
      'Gold Coast', 'Canberra', 'Hobart', 'Newcastle', 'Geelong',
      'Sunshine Coast', 'Wollongong', 'Cairns', 'Darwin', 'Townsville',
      'London', 'New York', 'Toronto',
    ],
    relatedCultures: ['comedy', 'latin', 'african'],
    organiserPersonas: [
      'Drag show promoters and brunch organisers',
      'Ballroom house leaders running balls and kikis',
      'Queer dance party promoters',
      'Pride festival committees',
    ],
    keywords: ['pride events', 'Mardi Gras Sydney', 'drag brunch Melbourne', 'ballroom New York', 'queer dance Berlin', 'queer film festival'],
  },
}

export function getCulture(slug: string): CultureContent | null {
  return CULTURES[slug as CultureSlug] ?? null
}

export function isCultureSlug(slug: string): slug is CultureSlug {
  return slug in CULTURES
}

export function getAllCultures(): CultureContent[] {
  return Object.values(CULTURES)
}

export function getTier1Cultures(): CultureContent[] {
  return Object.values(CULTURES).filter(c => c.tier === 1)
}

export function getTier2Cultures(): CultureContent[] {
  return Object.values(CULTURES).filter(c => c.tier === 2)
}

export const CULTURE_SLUGS: CultureSlug[] = Object.keys(CULTURES) as CultureSlug[]
