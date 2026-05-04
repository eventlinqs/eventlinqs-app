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
      "African culture isn't a single sound. It's a continent of regions, languages and rhythms moving the world's dance floors. Afrobeats from West Africa, Amapiano from South Africa, Bongo Flava from East Africa, Owambe celebrations from Nigeria. Every region has its own scene.",
      "EventLinqs gives African organisers transparent fees, WhatsApp-first share flows, squad bookings so the whole crew comes together, and real human support. No platform tax disguised as convenience. No questions about whether your community is large enough to matter.",
      'If you run African nights, festivals, concerts or cultural events, list with us. The first event is on us.',
    ],
    subCultures: [
      { slug: 'afrobeats',     label: 'Afrobeats',          blurb: 'West African pop, Lagos to London.' },
      { slug: 'amapiano',      label: 'Amapiano',           blurb: 'South African log-drum house.' },
      { slug: 'owambe',        label: 'Owambe',             blurb: 'Nigerian celebrations, all colours.' },
      { slug: 'west-african',  label: 'West African',       blurb: 'Highlife, Afrobeat, Hiplife.' },
      { slug: 'east-african',  label: 'East African',       blurb: 'Bongo Flava, Gengetone, Taarab.' },
      { slug: 'pan-african',   label: 'Pan-African Gospel', blurb: 'Faith and family, every Sunday.' },
    ],
    cities: ['Melbourne', 'Sydney', 'Brisbane', 'Perth', 'London', 'Toronto', 'Houston', 'Atlanta'],
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
      "South Asian events span Bollywood, regional cinema, classical and folk dance, religious festivals, weddings, sangeets and the entire EDM-meets-bhangra rave scene. The community is enormous, the events are professional, and the platforms haven't kept up.",
      "EventLinqs supports squad bookings for the whole family group, group payments split through the app, WhatsApp-first sharing because that's where the audience lives, and transparent pricing so the all-in price is what you pay.",
      'If you run garba nights, Bollywood parties, Holi or Diwali celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'bollywood',  label: 'Bollywood',     blurb: 'Hindi cinema and dance nights.' },
      { slug: 'bhangra',    label: 'Bhangra',       blurb: 'Punjabi rhythms, full energy.' },
      { slug: 'garba',      label: 'Garba & Raas',  blurb: 'Navratri devotional dance.' },
      { slug: 'holi',       label: 'Holi & Diwali', blurb: 'Festival of colours and lights.' },
      { slug: 'tamil',      label: 'Tamil & Telugu', blurb: 'South Indian cinema and culture.' },
      { slug: 'classical',  label: 'Classical',     blurb: 'Bharatanatyam, Kathak, sitar nights.' },
    ],
    cities: ['Sydney', 'Melbourne', 'Perth', 'Brisbane', 'London', 'Toronto', 'New York', 'Houston'],
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
      "Caribbean culture is its own ecosystem: Trinidadian Carnival, Jamaican dancehall, Bajan crop over, Haitian compa, Dominican zouk. The diaspora keeps it alive on every continent and the events are pure celebration.",
      "EventLinqs is built for fete promoters who need clean ticketing, group bookings for the whole crew, and WhatsApp share flows that work the way the community already moves. Transparent fees, fast payouts, and zero patronising about what your audience looks like.",
      'If you run Carnival weekends, fete season, dancehall parties or steel pan nights, list with us.',
    ],
    subCultures: [
      { slug: 'soca',       label: 'Soca',        blurb: 'Trinidad Carnival, year-round.' },
      { slug: 'dancehall',  label: 'Dancehall',   blurb: 'Jamaica\'s sound, the world\'s riddim.' },
      { slug: 'reggae',     label: 'Reggae',      blurb: 'Roots, dub, lovers rock.' },
      { slug: 'calypso',    label: 'Calypso & Pan', blurb: 'Steel band, kaiso, mas.' },
      { slug: 'compa',      label: 'Compa',       blurb: 'Haitian carnival rhythm.' },
      { slug: 'zouk',       label: 'Zouk',        blurb: 'French Caribbean dance.' },
    ],
    cities: ['Sydney', 'Melbourne', 'London', 'Toronto', 'New York', 'Miami', 'Atlanta'],
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
      "Latin music spans the entire continent and every diaspora it has touched. Salsa from Cuba and Puerto Rico, bachata from the Dominican Republic, reggaeton from Panama and Puerto Rico, cumbia from Colombia, tango from Argentina. The dance floors are loud and the regulars know each other.",
      "EventLinqs is built for Latin organisers who want clean ticketing, squad bookings for couples and friend groups, and a platform that respects the dance scene rather than treating it like an afterthought.",
      'If you run salsa socials, bachata congresses, reggaeton clubs or Latin festivals, list with us.',
    ],
    subCultures: [
      { slug: 'salsa',      label: 'Salsa',     blurb: 'On1, On2, casino, rueda.' },
      { slug: 'bachata',    label: 'Bachata',   blurb: 'Sensual, modern, tradicional.' },
      { slug: 'reggaeton',  label: 'Reggaeton', blurb: 'Bad Bunny, Karol G, the wave.' },
      { slug: 'cumbia',     label: 'Cumbia',    blurb: 'Colombia\'s heart, drums and accordion.' },
      { slug: 'tango',      label: 'Tango',     blurb: 'Buenos Aires milongas, every city.' },
      { slug: 'mariachi',   label: 'Mariachi',  blurb: 'Mexico\'s soundtrack.' },
    ],
    cities: ['Melbourne', 'Sydney', 'New York', 'Miami', 'Los Angeles', 'Houston', 'Toronto', 'London'],
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
      "East Asian culture spans Chinese, Japanese, Korean, Taiwanese, Vietnamese, Mongolian and beyond. Lunar New Year, Mid-Autumn, Tet, K-pop concerts, J-rock tours, anime conventions, mahjong leagues, calligraphy workshops. Every weekend has multiple events somewhere in the diaspora.",
      "EventLinqs supports the full range: stadium-scale K-pop events with reserved seating, intimate Lunar New Year community dinners, ticketed anime cons with multi-day passes, and everything between. Transparent pricing, multi-language listings, and squad bookings for the friend groups buying together.",
      'If you run Lunar celebrations, K-pop events, anime cons or East Asian cultural festivals, list with us.',
    ],
    subCultures: [
      { slug: 'k-pop',      label: 'K-pop',          blurb: 'Concerts, dance covers, fan meets.' },
      { slug: 'lunar',      label: 'Lunar New Year', blurb: 'Chinese, Vietnamese, Korean.' },
      { slug: 'anime',      label: 'Anime & manga',  blurb: 'Cons, screenings, cosplay.' },
      { slug: 'j-rock',     label: 'J-rock & J-pop', blurb: 'Tours, club nights, fan events.' },
      { slug: 'mid-autumn', label: 'Mid-Autumn',     blurb: 'Mooncake, lantern, family feasts.' },
      { slug: 'mahjong',    label: 'Mahjong & games', blurb: 'Tournaments and game nights.' },
    ],
    cities: ['Sydney', 'Melbourne', 'Perth', 'Brisbane', 'London', 'Toronto', 'New York', 'Los Angeles'],
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
      "Filipino events are family-first by design. Sinulog and Ati-Atihan in January, Flores de Mayo in May, Pasko (Christmas) starting in September. Plus OPM concerts when the artists tour, fiestas every weekend, and barangay reunions year-round. The community is large, organised and loyal.",
      "EventLinqs is built for the way Filipino events actually work: family ticket bundles for parents-plus-kids, group payments through the app, multilingual listings (Tagalog, Cebuano, English), and WhatsApp / Messenger share flows.",
      'If you run fiestas, OPM concerts, Pasko events or community celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'sinulog',      label: 'Sinulog & Ati-Atihan', blurb: 'January street festivals.' },
      { slug: 'opm',          label: 'OPM concerts',          blurb: 'Original Pinoy Music tours.' },
      { slug: 'pasko',        label: 'Pasko',                 blurb: 'Filipino Christmas, all 4 months.' },
      { slug: 'flores-mayo',  label: 'Flores de Mayo',        blurb: 'May procession and Santacruzan.' },
      { slug: 'fiesta',       label: 'Town fiesta',           blurb: 'Patron saint celebrations.' },
      { slug: 'parol',        label: 'Parol & lantern',       blurb: 'Christmas lantern workshops.' },
    ],
    cities: ['Sydney', 'Melbourne', 'Perth', 'Brisbane', 'Adelaide', 'Auckland', 'Los Angeles', 'San Diego'],
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
      "Mediterranean culture is sun-soaked, food-first and built around the long table. Italian sagras and saint days, Greek dance traditions, Spanish flamenco and tapas evenings, Portuguese fado nights, Lebanese mezze gatherings. The events are warm, the food is real, and the music is intergenerational.",
      "EventLinqs supports the format: long-table communal dinners with set seating, festival multi-day passes for sagras and feast days, family bundles, transparent fees so the all-in price is what you pay.",
      'If you run sagras, fado nights, flamenco evenings or Mediterranean festivals, list with us.',
    ],
    subCultures: [
      { slug: 'italian-sagra', label: 'Italian sagra', blurb: 'Saint day food festivals.' },
      { slug: 'greek-glendi',  label: 'Greek glendi',  blurb: 'Bouzouki nights, plate smashing.' },
      { slug: 'flamenco',      label: 'Flamenco',      blurb: 'Spanish guitar and dance.' },
      { slug: 'fado',          label: 'Fado',          blurb: 'Portuguese soul music.' },
      { slug: 'opera',         label: 'Opera',         blurb: 'Italian and global tours.' },
      { slug: 'mezze',         label: 'Mezze',         blurb: 'Lebanese long-table feasts.' },
    ],
    cities: ['Sydney', 'Melbourne', 'Adelaide', 'Perth', 'London', 'Toronto', 'New York', 'Boston'],
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
      "Middle Eastern culture covers Arabic, Persian (Iranian), Turkish, Israeli, Kurdish, Armenian and beyond. Norouz in March, Eid al-Fitr after Ramadan, dabke parties year-round, Arabic and Persian concerts when the global artists tour. Communities are tight-knit and events sell fast.",
      "EventLinqs supports multi-language listings (Arabic, Farsi, Turkish, Hebrew, English), squad bookings for family groups, and WhatsApp share because that's where the audience lives.",
      'If you run Arabic concerts, Norouz celebrations, dabke nights or Middle Eastern cultural events, list with us.',
    ],
    subCultures: [
      { slug: 'arabic-concerts', label: 'Arabic concerts', blurb: 'Tarab, pop, classic.' },
      { slug: 'norouz',          label: 'Norouz',          blurb: 'Persian new year, March 21.' },
      { slug: 'dabke',           label: 'Dabke',           blurb: 'Levantine line dance.' },
      { slug: 'turkish',         label: 'Turkish',         blurb: 'Saz, sema, modern pop.' },
      { slug: 'israeli',         label: 'Israeli',         blurb: 'Mizrahi, simchas, holidays.' },
      { slug: 'oud',             label: 'Oud & qanun',     blurb: 'Classical Arabic recitals.' },
    ],
    cities: ['Sydney', 'Melbourne', 'London', 'Toronto', 'New York', 'Los Angeles', 'Detroit'],
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
      "European culture is a hundred different traditions. Oktoberfest from Bavaria, Polish polka and pierogi nights, French chansonniers and bistro evenings, Ukrainian and Russian folk dance, Czech and German beer halls, Swedish midsummer and Scandinavian Christmas markets. Every diaspora keeps its own calendar alive.",
      "EventLinqs supports the breadth: festival weekends with multi-day passes, intimate folk evenings, language-specific listings, and squad bookings so families and friend groups come together.",
      'If you run European cultural events, festivals, folk evenings or community celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'oktoberfest',  label: 'Oktoberfest', blurb: 'German beer halls and brass.' },
      { slug: 'polish',       label: 'Polish',      blurb: 'Polka, pierogi, Wigilia.' },
      { slug: 'french',       label: 'French',      blurb: 'Chanson, Bastille Day, bistros.' },
      { slug: 'ukrainian',    label: 'Ukrainian',   blurb: 'Folk dance, Vyshyvanka, Malanka.' },
      { slug: 'scandinavian', label: 'Scandinavian', blurb: 'Midsummer, Christmas markets.' },
      { slug: 'czech',        label: 'Czech & German', blurb: 'Beer halls, classical, modern.' },
    ],
    cities: ['Melbourne', 'Sydney', 'Adelaide', 'Perth', 'London', 'Berlin', 'Paris', 'Toronto'],
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
      "Pacific culture spans Aotearoa Maori, Samoa, Tonga, Fiji, Cook Islands, Niue, Vanuatu and beyond. Polyfest in Auckland, Pasifika in Brisbane and Sydney, kapa haka competitions, Samoan flag day, Tongan and Fijian church-led celebrations. The communities are tight, the events are family-led, and the platforms have ignored them for too long.",
      "EventLinqs supports family ticket bundles, group church-led organising, multilingual listings (Te Reo Maori, Samoan, Tongan, Fijian, English), and transparent pricing.",
      'If you run Polyfest, Pasifika events, kapa haka or Pacific cultural celebrations, list with us.',
    ],
    subCultures: [
      { slug: 'polyfest',      label: 'Polyfest',      blurb: 'Auckland, March every year.' },
      { slug: 'pasifika',      label: 'Pasifika',      blurb: 'Sydney, Brisbane, Auckland.' },
      { slug: 'kapa-haka',     label: 'Kapa haka',     blurb: 'Te ao Maori performance.' },
      { slug: 'samoan',        label: 'Samoan',        blurb: 'Flag day, Lotu Tamaiti, fiafia.' },
      { slug: 'tongan',        label: 'Tongan',        blurb: 'Faka-Tonga, church concerts.' },
      { slug: 'fijian',        label: 'Fijian',        blurb: 'Meke, Diwali Fiji, Hindi Fiji.' },
    ],
    cities: ['Auckland', 'Sydney', 'Brisbane', 'Melbourne', 'Wellington', 'Christchurch'],
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
      "Gospel and worship music isn't one tradition. African gospel from Nigeria and Ghana. Pacific church choirs from Samoa and Tonga. Filipino praise and worship. Latin Christian rock. Black gospel from the United States. Every culture has its own gospel scene and they all sell tickets.",
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
    cities: ['Sydney', 'Melbourne', 'Auckland', 'London', 'Toronto', 'Atlanta', 'Houston', 'Los Angeles'],
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
      "Culture-specific comedy is its own genre. African comedians touring globally, South Asian stand-up filling theatres, Latin and Spanish-language clubs, Filipino improv troupes, Pacific stand-up nights. Plus the entire English-language comedy scene from open-mic to arena.",
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
    cities: ['Melbourne', 'Sydney', 'London', 'New York', 'Los Angeles', 'Toronto', 'Auckland'],
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
      "Wellness is wider than the white-women-on-mats stock photo. Yoga and Ayurveda from South Asia. Tai chi and qigong from East Asia. Pacific lomi lomi. African dance therapy. Latin curanderismo. The lineages are deep and the modern wellness scene draws from all of them.",
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
    cities: ['Melbourne', 'Sydney', 'Byron Bay', 'Bali', 'Auckland', 'Los Angeles', 'London'],
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
      "Pride is every culture and every culture has queer voices. Sydney Mardi Gras, ballroom voguing scenes from New York to Naarm, queer film festivals globally, drag brunch and dance party circuits in every city. The events are joyful, defiant and growing every year.",
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
    cities: ['Sydney', 'Melbourne', 'Auckland', 'London', 'Berlin', 'New York', 'San Francisco', 'Los Angeles'],
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
