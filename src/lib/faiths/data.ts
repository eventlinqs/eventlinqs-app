/**
 * Faith Communities registry - the Faith dimension of Community Taxonomy
 * v2 (founder Decision D, locked 2026-05-16).
 *
 * Faith is a separate, opt-in axis from Community Heritage. An event can
 * carry a heritage AND a faith (a Diwali gala is heritage:indian +
 * faith:hindu) and surfaces on both /community/[slug] and /faith/[slug].
 *
 * Five faiths get dedicated /faith/[slug] landings: Christian, Muslim,
 * Hindu, Buddhist, Jewish. Smaller faiths (Sikh, Baha'i and others)
 * resolve as filter-only metadata until inventory justifies a dedicated
 * page; they are listed in SMALLER_FAITHS for the filter UI but have no
 * landing.
 *
 * Voice: Australian English, no em-dashes, no exclamation marks.
 * Source of truth for the faith taxonomy: this file.
 */

export type FaithSlug = 'christian' | 'muslim' | 'hindu' | 'buddhist' | 'jewish'

export interface FaithMoment {
  label: string
  blurb: string
}

export interface FaithContent {
  slug: FaithSlug
  displayName: string
  order: number
  /** Census share line (ABS 2021), shown as a quiet stat. */
  censusNote: string
  tagline: string
  heroHeadline: string
  heroBody: string
  storyParagraphs: string[]
  /** Major community moments to highlight on the landing. */
  moments: FaithMoment[]
  /** Heritages this faith most commonly intersects (cross-link rail). */
  relatedCommunities: string[]
  organiserPersonas: string[]
  keywords: string[]
}

/** Smaller faiths: filter-only in v2, no dedicated landing yet. */
export const SMALLER_FAITHS: { slug: string; label: string }[] = [
  { slug: 'sikh', label: 'Sikh' },
  { slug: 'bahai', label: "Baha'i" },
  { slug: 'spiritual', label: 'Spiritual & Interfaith' },
]

const FAITHS: Record<FaithSlug, FaithContent> = {
  christian: {
    slug: 'christian',
    displayName: 'Christian',
    order: 1,
    censusNote: 'Australia largest religion (ABS 2021: 43.9%).',
    tagline: 'Worship, gospel, choir and community.',
    heroHeadline: 'Christian events, across every community.',
    heroBody:
      'Gospel and worship nights, choir showcases, Easter and Christmas services, conferences and community celebrations. Worship music crosses every heritage and EventLinqs supports them all.',
    storyParagraphs: [
      'Where Lagos meets Atlanta meets Samoa under the same praise break. Christian events span African gospel concerts, Pacific church choirs, Filipino praise nights, Latin Christian festivals, Black gospel and Caribbean gospel. Easter and Christmas fill halls across every community. Faith is a dimension, not a heritage, so a Nigerian gospel night is heritage:African and faith:Christian at once.',
      'EventLinqs supports churches and choirs with not-for-profit pricing, recurring weekly service ticket flows, multi-language listings, and family bundles.',
      'If you run gospel concerts, worship nights, choir showcases or church festivals, list with us.',
    ],
    moments: [
      { label: 'Easter', blurb: 'Holy Week, midnight liturgy, community feasts.' },
      { label: 'Christmas', blurb: 'Carols by candlelight, services, family.' },
      { label: 'Gospel & Worship', blurb: 'Choir showcases, praise nights, tours.' },
      { label: 'Conferences', blurb: 'Conventions, revivals, bootcamps.' },
    ],
    relatedCommunities: ['african', 'pacific-pasifika', 'filipino', 'caribbean'],
    organiserPersonas: [
      'Church choir directors booking concerts',
      'Gospel festival and worship-night organisers',
      'Christian music tour promoters',
      'Parish and community event committees',
    ],
    keywords: ['gospel events', 'worship night', 'church concert', 'Christian festival', 'choir showcase', 'Easter Christmas events'],
  },
  muslim: {
    slug: 'muslim',
    displayName: 'Muslim',
    order: 2,
    censusNote: 'ABS 2021: 3.2% (813,392 people).',
    tagline: 'Ramadan, Eid, and the whole community.',
    heroHeadline: 'Muslim events, across every community.',
    heroBody:
      'Ramadan iftars and night markets, Eid al-Fitr and Eid al-Adha celebrations, nasheed and community festivals across the Arab, Turkish, South Asian, African and Southeast Asian communities.',
    storyParagraphs: [
      'Where the iftar table opens at sunset and does not really close. Muslim events span Ramadan night markets and community iftars, Eid al-Fitr and Eid al-Adha festivals that fill showgrounds, nasheed concerts, and community celebrations across many heritages. Faith sits alongside heritage, so a Lebanese Eid festival is heritage:Lebanese & Levantine and faith:Muslim at once.',
      'EventLinqs supports community committees with festival multi-day passes, family bundles, multilingual listings, and transparent pricing.',
      'If you run iftars, Eid festivals, nasheed nights or community events, list with us.',
    ],
    moments: [
      { label: 'Ramadan', blurb: 'Iftar gatherings, night markets, taraweeh.' },
      { label: 'Eid al-Fitr', blurb: 'Feasts, family, community celebration.' },
      { label: 'Eid al-Adha', blurb: 'Festival of sacrifice, four days of community.' },
      { label: 'Mawlid & Nasheed', blurb: 'Devotional concerts and community nights.' },
    ],
    relatedCommunities: ['lebanese-levantine', 'arab', 'turkish', 'other-south-asian'],
    organiserPersonas: [
      'Mosque and community-association event committees',
      'Ramadan night-market and iftar organisers',
      'Eid festival organisers',
      'Nasheed concert promoters',
    ],
    keywords: ['Eid festival', 'Ramadan night market', 'iftar Sydney', 'Muslim community events', 'nasheed concert', 'Eid al-Fitr'],
  },
  hindu: {
    slug: 'hindu',
    displayName: 'Hindu',
    order: 3,
    censusNote: 'Fastest-growing major religion (ABS 2021: 2.7%, +55%).',
    tagline: 'Diwali, Holi, Navratri and the festival calendar.',
    heroHeadline: 'Hindu events, across every community.',
    heroBody:
      'Diwali festivals of light, Holi colour parties, Navratri and garba nights, temple celebrations and community galas across the Indian, Nepali, Sri Lankan and Fijian communities.',
    storyParagraphs: [
      'Where the diyas go out and the colours never quite come off. Hindu events span Diwali festivals that fill showgrounds, Holi colour parties, nine nights of Navratri garba, temple celebrations and community galas. Hinduism is the fastest-growing major religion in Australia. Faith sits alongside heritage, so a Diwali Mela is heritage:Indian and faith:Hindu at once.',
      'EventLinqs supports family bundles, festival multi-day passes, group payments, and transparent pricing.',
      'If you run Diwali, Holi, Navratri or temple events, list with us.',
    ],
    moments: [
      { label: 'Diwali', blurb: 'Festival of lights, five nights, lamps and sweets.' },
      { label: 'Holi', blurb: 'Festival of colours, powder, music.' },
      { label: 'Navratri', blurb: 'Nine nights of garba and raas.' },
      { label: 'Temple & Puja', blurb: 'Community celebrations and galas.' },
    ],
    relatedCommunities: ['indian', 'other-south-asian', 'pacific-pasifika'],
    organiserPersonas: [
      'Temple and Hindu society committees',
      'Diwali and Holi festival organisers',
      'Navratri and garba night promoters',
      'Community gala organisers',
    ],
    keywords: ['Diwali festival', 'Holi party Sydney', 'Navratri garba Melbourne', 'Hindu temple events', 'festival of lights', 'Hindu community'],
  },
  buddhist: {
    slug: 'buddhist',
    displayName: 'Buddhist',
    order: 4,
    censusNote: 'A significant minority faith (ABS 2021).',
    tagline: 'Vesak, lantern festivals and quiet practice.',
    heroHeadline: 'Buddhist events, across every community.',
    heroBody:
      'Vesak celebrations, lantern festivals, temple open days, meditation retreats and community days across the Vietnamese, Chinese, Thai, Sri Lankan and Tibetan communities.',
    storyParagraphs: [
      'Where the lanterns rise and the hall goes quiet on cue. Buddhist events span Vesak celebrations marking the Buddha birth, enlightenment and passing, lantern festivals, temple open days, meditation retreats, and community days across many heritages. Faith sits alongside heritage, so a Vietnamese Vesak is heritage:Vietnamese and faith:Buddhist at once.',
      'EventLinqs supports temple committees with community pricing, retreat passes, family bundles, and transparent fees.',
      'If you run Vesak, lantern festivals, temple days or retreats, list with us.',
    ],
    moments: [
      { label: 'Vesak', blurb: 'Buddha day, lanterns, community.' },
      { label: 'Lantern Festivals', blurb: 'Light offerings and processions.' },
      { label: 'Temple Open Days', blurb: 'Community days, blessings, food.' },
      { label: 'Retreats', blurb: 'Meditation and practice intensives.' },
    ],
    relatedCommunities: ['vietnamese', 'chinese', 'other-east-southeast-asian', 'other-south-asian'],
    organiserPersonas: [
      'Temple and Buddhist society committees',
      'Vesak and lantern festival organisers',
      'Meditation retreat organisers',
      'Community-day and blessing organisers',
    ],
    keywords: ['Vesak Sydney', 'Buddhist lantern festival', 'temple open day', 'meditation retreat', 'Buddhist community events', 'Buddha day'],
  },
  jewish: {
    slug: 'jewish',
    displayName: 'Jewish',
    order: 5,
    censusNote: 'An established minority faith (ABS 2021).',
    tagline: 'Hanukkah, Passover, and community life.',
    heroHeadline: 'Jewish events, faith and community.',
    heroBody:
      'Hanukkah candle-lightings, Passover seders, High Holy Days, Jewish film and food festivals, klezmer concerts and community celebrations.',
    storyParagraphs: [
      'Where the menorah is lit one night at a time and the table is long. Jewish events span Hanukkah candle-lightings and parties, communal Passover seders, High Holy Days, Jewish film and food festivals, and klezmer concerts. Faith sits alongside heritage as its own community here.',
      'EventLinqs supports community organisations with family bundles, festival passes, accessible pricing, and transparent fees.',
      'If you run Hanukkah, Passover, film festivals or community events, list with us.',
    ],
    moments: [
      { label: 'Hanukkah', blurb: 'Eight nights of light, latkes, community.' },
      { label: 'Passover', blurb: 'Communal seders and the festival of freedom.' },
      { label: 'High Holy Days', blurb: 'Rosh Hashanah and Yom Kippur.' },
      { label: 'Film & Klezmer', blurb: 'Festivals, concerts, food.' },
    ],
    relatedCommunities: ['other-european', 'arab'],
    organiserPersonas: [
      'Community centre and synagogue event committees',
      'Jewish film and food festival organisers',
      'Klezmer and community concert promoters',
      'Community celebration organisers',
    ],
    keywords: ['Hanukkah Sydney', 'Passover seder', 'Jewish film festival', 'klezmer concert', 'Jewish community events', 'High Holy Days'],
  },
}

export function getFaith(slug: string): FaithContent | null {
  return FAITHS[slug as FaithSlug] ?? null
}

export function isFaithSlug(slug: string): slug is FaithSlug {
  return slug in FAITHS
}

export function getAllFaiths(): FaithContent[] {
  return Object.values(FAITHS).sort((a, b) => a.order - b.order)
}

export const FAITH_SLUGS: FaithSlug[] = getAllFaiths().map(f => f.slug)

/**
 * Faith -> event-tag bridge. Mirrors the heritage tag-bridge: resolves a
 * faith to identifying tokens in the event `tags` jsonb array. Tokens
 * are faith-distinctive only; heritage tokens are excluded so the axes
 * stay orthogonal.
 */
export const FAITH_TO_TAGS: Record<FaithSlug, string[]> = {
  christian: ['gospel', 'worship', 'christian', 'choir', 'praise', 'church', 'easter', 'christmas'],
  muslim: ['muslim', 'islamic', 'eid', 'ramadan', 'iftar', 'nasheed', 'mawlid'],
  hindu: ['hindu', 'diwali', 'holi', 'navratri', 'puja', 'mandir', 'deepavali'],
  buddhist: ['buddhist', 'vesak', 'wesak', 'dharma', 'sangha'],
  jewish: ['jewish', 'hanukkah', 'chanukah', 'passover', 'seder', 'shabbat', 'klezmer'],
}

export function getFaithTags(faith: FaithSlug): string[] {
  return FAITH_TO_TAGS[faith] ?? []
}

export function buildFaithTagOrFilter(faith: FaithSlug): string | null {
  const tokens = getFaithTags(faith)
  if (tokens.length === 0) return null
  return tokens.map(t => `tags.cs.["${t}"]`).join(',')
}
