/**
 * hero-categories.ts — Tier-1 category data model.
 *
 * Two-tier category architecture:
 *   Tier 1 — Hero categories: dedicated /categories/[slug] landing pages.
 *   Tier 2 — Filter-only categories: /events?category=[slug], no landing page.
 *
 * This file owns all Tier-1 content. It is the single source of truth for
 * hero category copy, metadata, and SEO keywords.
 */

export type HeroCategorySlug =
  | 'afrobeats'
  | 'amapiano'
  | 'gospel'
  | 'owambe'
  | 'caribbean'
  | 'heritage-and-independence'
  | 'networking'

export interface HeroCategory {
  slug: HeroCategorySlug
  displayName: string
  eyebrowLabel: string
  tagline: string
  heroHeadline: string
  heroBody: string
  storyHeadline: string
  storyParagraphs: string[]
  valuePillars: { icon: string; title: string; body: string }[]
  sampleOrganiserPersonas: string[]
  relatedCities: string[]
  accentColor?: string
  keywords: string[]
}

export const heroCategories: Record<HeroCategorySlug, HeroCategory> = {
  afrobeats: {
    slug: 'afrobeats',
    displayName: 'Afrobeats',
    eyebrowLabel: 'AFROBEATS',
    tagline: 'Where Afrobeats lives in your city.',
    heroHeadline: 'The sound of the diaspora. The energy of every weekend.',
    heroBody:
      'From Lagos to Naarm, London to Toronto — Afrobeats is the heartbeat of every diaspora dance floor. EventLinqs is built for the promoters, DJs, and crews making it happen.',
    storyHeadline: 'Afrobeats on EventLinqs',
    storyParagraphs: [
      "Afrobeats isn't just a genre — it's a global movement, and the diaspora is its engine. Every weekend, in every city with a Nigerian, Ghanaian, or pan-African community, there's an Afrobeats night happening. The promoters running these events are professional, the crowds are loyal, and the experience deserves a ticketing platform that respects both.",
      "EventLinqs gives Afrobeats organisers what Eventbrite and Ticketmaster don't: transparent fees, WhatsApp-first share flows, squad bookings so the whole crew comes together, and real human support when you need it. No platform tax disguised as a \"convenience fee.\" No bot-scalped tickets. No questions about whether your community is \"big enough\" to matter.",
      'If you run Afrobeats nights, festivals, concerts, or club takeovers — list with us. The first event is on us.',
    ],
    valuePillars: [
      { icon: 'Users', title: 'Squad bookings', body: 'Buy 4, 6, or 10 tickets in one tap. Friends pay their share. Everyone gets their own QR.' },
      { icon: 'Heart', title: 'Free events stay free', body: 'Zero platform fees on free events. Forever.' },
      { icon: 'Zap', title: 'Live in 5 minutes', body: 'Set up an event, take payments, share to WhatsApp — fast.' },
    ],
    sampleOrganiserPersonas: [
      'Independent promoters running monthly Afrobeats nights',
      'Festival organisers booking African and diaspora artists',
      'University African society party committees',
      'DJ collectives building community dance floors',
    ],
    relatedCities: ['Melbourne', 'Sydney', 'Brisbane', 'Perth', 'London', 'Toronto', 'Houston'],
    keywords: ['Afrobeats events', 'Afrobeats Melbourne', 'Afrobeats Sydney', 'Afrobeats London', 'Nigerian events', 'Ghanaian events', 'African club night', 'diaspora events'],
  },

  amapiano: {
    slug: 'amapiano',
    displayName: 'Amapiano',
    eyebrowLabel: 'AMAPIANO',
    tagline: "South Africa's sound. The world's dance floor.",
    heroHeadline: "The log drum heard 'round the world.",
    heroBody:
      'Born in Pretoria. Played in Lagos. Loved in Naarm. Amapiano is the genre rewriting global dance music — and the EventLinqs platform is built for the parties driving it forward.',
    storyHeadline: 'Amapiano on EventLinqs',
    storyParagraphs: [
      "Amapiano went from South African townships to global dance floors in five years. By 2026 it's the sound of every serious diaspora party — DJ Maphorisa, Kabza De Small, Uncle Waffles soundtracking nights from Soweto to Sydney. The scene is growing faster than the platforms serving it.",
      "EventLinqs is built for Amapiano organisers who want to run real events without giving 30% to a platform that doesn't understand the culture. Yanos nights, festival sets, all-day parties, log drum tours — set them up in minutes, share them where your audience actually lives, and get paid in 7 days.",
      "If you're running the Amapiano scene in your city, this is your home base.",
    ],
    valuePillars: [
      { icon: 'Globe2', title: 'Global from day one', body: 'Multi-currency support so your London fans can buy as easily as your Joburg ones.' },
      { icon: 'Users', title: 'Group bookings', body: 'Yanos is a team sport. Book the whole crew with one payment.' },
      { icon: 'Sparkles', title: 'Built for the moment', body: "Live ticket counts, social proof, urgency that feels like the dance floor." },
    ],
    sampleOrganiserPersonas: [
      'Amapiano DJ collectives running monthly takeovers',
      'South African diaspora promoters booking SA artists abroad',
      'All-day Yanos festival organisers',
      'Club nights mixing Amapiano with Afrobeats and Afro-house',
    ],
    relatedCities: ['Johannesburg', 'Cape Town', 'Melbourne', 'Sydney', 'London', 'Toronto'],
    keywords: ['Amapiano events', 'Amapiano Melbourne', 'Yanos party', 'South African events', 'Amapiano festival', 'Amapiano DJ night'],
  },

  gospel: {
    slug: 'gospel',
    displayName: 'Gospel',
    eyebrowLabel: 'GOSPEL',
    tagline: 'Worship, gathered.',
    heroHeadline: 'The choir that travels with you.',
    heroBody:
      'From church anniversary celebrations to gospel concert tours, the African and Caribbean diaspora carries its faith into every city. EventLinqs handles the ticketing so the worship can be the focus.',
    storyHeadline: 'Gospel on EventLinqs',
    storyParagraphs: [
      "Diaspora gospel is a category that mainstream ticketing platforms barely recognise. Yet every weekend across Australia, the UK, Canada, and the US, there are church anniversary services, gospel concerts, choir tours, women's conferences, and faith-rooted celebrations selling out venues.",
      'EventLinqs treats gospel events with the seriousness they deserve. Donation-friendly ticketing, group seating for whole congregations, free events with zero platform fees, and family bookings that actually work for the way our communities show up — together.',
      'Pastor, choir director, conference organiser, gospel promoter — your event has a home here.',
    ],
    valuePillars: [
      { icon: 'Heart', title: 'Free events forever free', body: 'Sunday service announcements, free conferences, free worship nights — zero platform fees.' },
      { icon: 'Users', title: 'Family seating', body: 'Reserve a row for the family. Reserve a section for the youth ministry.' },
      { icon: 'Sparkles', title: 'Donation tickets', body: 'Pay-what-you-can ticket tiers built in.' },
    ],
    sampleOrganiserPersonas: [
      'Church anniversary and milestone celebrations',
      'Gospel artist tours and concerts',
      "Women's conferences and youth gatherings",
      'Choir and praise team showcases',
    ],
    relatedCities: ['Melbourne', 'Sydney', 'London', 'Birmingham', 'Toronto', 'Houston', 'Atlanta'],
    keywords: ['Gospel events', 'gospel concert', 'church anniversary', 'African gospel', 'gospel tour', 'praise night', 'gospel Melbourne'],
  },

  owambe: {
    slug: 'owambe',
    displayName: 'Owambe',
    eyebrowLabel: 'OWAMBE',
    tagline: 'Where the celebration begins.',
    heroHeadline: 'Aso ebi ready. Tickets sorted.',
    heroBody:
      'Owambe is a way of life — the Nigerian art of throwing the celebration that people talk about for years. EventLinqs handles the tickets so you can handle the vibes.',
    storyHeadline: 'Owambe on EventLinqs',
    storyParagraphs: [
      'Owambe — the Yoruba word for "it is there" — is the celebration culture that has defined Nigerian and West African gatherings for generations. Weddings, milestone birthdays, traditional ceremonies, anniversary parties, baby showers, naming ceremonies. The food is endless. The aso ebi is colour-coordinated. The dance floor never closes.',
      'For ticketed Owambe — wedding receptions where the venue requires a guest count, milestone birthday parties, paid anniversary celebrations — EventLinqs gives you the tools to manage RSVPs, control numbers, share invites on WhatsApp, and collect payments without losing the warmth of the occasion.',
      'No more shared spreadsheets. No more chasing payments. Just elegant invites, clean ticketing, and a celebration that actually starts on time.',
    ],
    valuePillars: [
      { icon: 'Sparkles', title: 'Elegant invites', body: 'Beautiful event pages that match the energy of the celebration.' },
      { icon: 'Users', title: 'RSVP control', body: 'Cap the guest list. Manage plus-ones. Send updates to ticket holders.' },
      { icon: 'Heart', title: 'WhatsApp first', body: 'Share invites where your aunties already are.' },
    ],
    sampleOrganiserPersonas: [
      'Wedding planners managing ticketed receptions',
      'Family milestone celebrations (50th, 60th, 70th birthdays)',
      'Traditional ceremony organisers',
      'Anniversary and naming ceremony hosts',
    ],
    relatedCities: ['Lagos', 'Melbourne', 'Sydney', 'London', 'Birmingham', 'Toronto', 'Houston'],
    keywords: ['Owambe', 'Nigerian wedding', 'Yoruba celebration', 'African milestone party', 'aso ebi event', 'Nigerian party Melbourne', 'African wedding reception'],
  },

  caribbean: {
    slug: 'caribbean',
    displayName: 'Caribbean',
    eyebrowLabel: 'CARIBBEAN',
    tagline: 'Soca, dancehall, reggae, and everything in between.',
    heroHeadline: 'The Caribbean takes the room. Every time.',
    heroBody:
      'From Notting Hill Carnival to Caribana to your local fete — Caribbean culture sets the global standard for how to throw a party. EventLinqs is built for the promoters keeping the tradition alive.',
    storyHeadline: 'Caribbean on EventLinqs',
    storyParagraphs: [
      "The Caribbean diaspora throws some of the most influential parties on earth. Soca fetes, dancehall nights, reggae concerts, Carnival after-parties, Caribbean Independence celebrations, J'ouvert mornings — these aren't just events, they're cultural institutions.",
      "EventLinqs is for the Caribbean promoters running these scenes in Melbourne, Sydney, London, Toronto, New York, and beyond. Transparent fees that don't insult the value you bring. Squad bookings so the whole massive comes through together. Real human support that understands the difference between a soca fete and a sit-down concert.",
      'Trinidad to Tottenham, Jamaica to Naarm — your scene has a home here.',
    ],
    valuePillars: [
      { icon: 'Users', title: 'Squad pricing', body: 'Group tickets for the whole crew, with discounts that make sense for fete culture.' },
      { icon: 'Globe2', title: 'Global, multi-currency', body: 'London promoter, Trinidad audience? Sorted.' },
      { icon: 'Zap', title: 'Last-minute friendly', body: 'Mobile-first checkout for the door-rush ticket buyers.' },
    ],
    sampleOrganiserPersonas: [
      'Soca and dancehall night promoters',
      'Carnival after-party organisers',
      'Caribbean Independence celebration committees',
      'Reggae and dub event series',
    ],
    relatedCities: ['Melbourne', 'Sydney', 'London', 'Birmingham', 'Toronto', 'New York', 'Miami'],
    keywords: ['Caribbean events', 'soca fete', 'dancehall night', 'reggae concert', 'Carnival after party', 'Caribbean independence', 'Caribbean Melbourne', 'Caribbean London'],
  },

  'heritage-and-independence': {
    slug: 'heritage-and-independence',
    displayName: 'Heritage & Independence',
    eyebrowLabel: 'HERITAGE & INDEPENDENCE',
    tagline: 'Celebrating the cultures that made us.',
    heroHeadline: 'Independence Day, every weekend, somewhere.',
    heroBody:
      "Nigerian Independence. Ghanaian Independence. Jamaican Independence. New Year galas. Heritage festivals. The diaspora doesn't wait for one day a year — and EventLinqs is built for the organisers keeping these moments alive.",
    storyHeadline: 'Heritage & Independence on EventLinqs',
    storyParagraphs: [
      "Across the diaspora, every nation's Independence Day becomes a season — concerts, galas, family festivals, cultural exhibitions, parade after-parties. Heritage events, cultural anniversaries, language and dress celebrations, New Year galas tied to specific homelands. These are the events that anchor diaspora identity.",
      "They're also some of the hardest events to organise. Big guest lists, multi-generational audiences, cultural protocols, sponsorship coordination. EventLinqs handles the ticketing infrastructure so you can focus on the cultural curation.",
      'Whether it\'s a 200-person community gala or a 5,000-person Independence Day festival, the platform scales with the celebration.',
    ],
    valuePillars: [
      { icon: 'Sparkles', title: 'Multi-tier ticketing', body: 'Early bird, general, VIP, table sponsorship — built in.' },
      { icon: 'Users', title: 'Family-friendly bookings', body: 'Adults, children, seniors — pricing that reflects how families actually attend.' },
      { icon: 'Heart', title: 'Sponsor coordination', body: 'Tools for managing sponsor tickets and table allocations.' },
    ],
    sampleOrganiserPersonas: [
      'Independence Day celebration committees',
      'Cultural association annual galas',
      'Heritage festival organisers',
      'New Year diaspora gala hosts',
    ],
    relatedCities: ['Melbourne', 'Sydney', 'London', 'Birmingham', 'Toronto', 'New York'],
    keywords: ['Independence day celebration', 'Nigerian independence', 'Ghanaian independence', 'Jamaican independence', 'cultural gala', 'heritage festival', 'diaspora celebration', 'African festival Melbourne'],
  },

  networking: {
    slug: 'networking',
    displayName: 'Networking',
    eyebrowLabel: 'NETWORKING',
    tagline: 'Where the diaspora does business.',
    heroHeadline: 'The room where it happens.',
    heroBody:
      "Diaspora founders, professionals, women's networks, and industry circles need a ticketing platform that takes business events as seriously as music ones. EventLinqs does.",
    storyHeadline: 'Networking on EventLinqs',
    storyParagraphs: [
      "Diaspora business is some of the fastest-growing economic activity in the global Black community. Founders, executives, professionals, women's networks, industry-specific circles — running breakfasts, panel events, conferences, workshops, and mixers across every major city.",
      "These events deserve clean ticketing, professional event pages, attendee management, and the kind of polished checkout experience that doesn't make your CFO attendees roll their eyes. EventLinqs provides that — at a fraction of what corporate event platforms charge.",
      "Whether it's an African Professionals breakfast, a women in tech panel, a founder mixer, or a multi-day diaspora business summit — list it here.",
    ],
    valuePillars: [
      { icon: 'Sparkles', title: 'Professional event pages', body: 'Clean, corporate-friendly templates for serious business events.' },
      { icon: 'Users', title: 'Attendee management', body: 'Export attendee lists, send updates, manage RSVPs at scale.' },
      { icon: 'Wallet', title: 'Sponsor invoicing', body: 'Custom ticket tiers for sponsors, partners, and corporate purchases.' },
    ],
    sampleOrganiserPersonas: [
      'African and Caribbean professional associations',
      'Diaspora founder and startup events',
      'Women in business breakfasts and panels',
      'Industry-specific diaspora networks (tech, finance, healthcare)',
    ],
    relatedCities: ['Melbourne', 'Sydney', 'London', 'Toronto', 'New York', 'Washington DC'],
    keywords: ['African professionals', 'diaspora networking', 'African business event', 'African women event', 'diaspora founder event', 'Black professional networking', 'African business Melbourne'],
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isHeroCategorySlug(slug: string): slug is HeroCategorySlug {
  return slug in heroCategories
}

export function getHeroCategory(slug: string): HeroCategory | null {
  if (!isHeroCategorySlug(slug)) return null
  return heroCategories[slug]
}

export function getAllHeroCategories(): HeroCategory[] {
  return Object.values(heroCategories)
}

/**
 * Returns a human-readable display name for any category slug.
 * Handles hero slugs (from heroCategories) and Tier-2 slugs (title-cased from slug).
 *
 * Used for contact form pre-fill and events page empty state copy.
 */
export function getCategoryDisplayName(slug: string): string {
  if (isHeroCategorySlug(slug)) {
    return heroCategories[slug].displayName
  }
  // Tier-2: convert slug to title case
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    // Handle common ampersand patterns
    .replace(/\bAnd\b/g, '&')
}
