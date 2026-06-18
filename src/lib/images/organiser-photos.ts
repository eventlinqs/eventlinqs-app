/**
 * Organiser marketing surface - photo slots.
 *
 * Every image on /organisers resolves through this map, so photo-day swaps
 * are a one-line change here and never touch the page template. Sources are
 * the licensed platform photo library (`public/images/hero/*`, Pexels licence,
 * see attribution.json). Founder-authorised for every organiser image slot
 * until the bespoke organiser shoot lands.
 *
 * Paths point at the .jpg origin; next/image re-encodes to AVIF/WebP via the
 * media components. Alt text is the licensed caption, trimmed to Australian
 * English and community-first language.
 */

export interface PhotoSlot {
  src: string
  alt: string
  /** Cover-crop focal point. Defaults handled by the media component. */
  objectPosition?: string
}

const HERO = '/images/hero'

/** Above-fold full-bleed hero (HeroMedia, the one priority image on the page). */
export const ORGANISER_HERO: PhotoSlot = {
  src: `${HERO}/afrobeats.jpg`,
  alt: 'Organisers and a crowd sharing a vibrant outdoor festival night',
  objectPosition: '50% 45%',
}

/** Alternating image+text feature bands. */
export const ORGANISER_BANDS: {
  pricing: PhotoSlot
  tools: PhotoSlot
  selfServe: PhotoSlot
} = {
  pricing: {
    src: `${HERO}/owambe.jpg`,
    alt: 'Guests raising a toast together at a celebration',
    objectPosition: '50% 50%',
  },
  tools: {
    src: `${HERO}/bollywood.jpg`,
    alt: 'A packed dance floor under stage lighting at a live event',
    objectPosition: '50% 45%',
  },
  selfServe: {
    src: `${HERO}/amapiano.jpg`,
    alt: 'An outdoor dance performance in full flow before a crowd',
    objectPosition: '50% 40%',
  },
}

/**
 * Every-community tile grid (Phase B differentiator). One tile per community
 * or event family, each backed by a library photo. Labels are community-first
 * and verified against the EventLinqs scene layer.
 */
export interface CommunityTile extends PhotoSlot {
  label: string
}

export const ORGANISER_COMMUNITY_TILES: CommunityTile[] = [
  { label: 'Afrobeats nights', src: `${HERO}/afrobeats.jpg`, alt: 'Crowd enjoying an outdoor Afrobeats festival' },
  { label: 'Amapiano & dance', src: `${HERO}/amapiano.jpg`, alt: 'Outdoor dance performance in cultural attire' },
  { label: 'Owambe & celebrations', src: `${HERO}/owambe.jpg`, alt: 'Family toasting together in traditional-patterned dress' },
  { label: 'Caribbean & carnival', src: `${HERO}/caribbean-carnival.jpg`, alt: 'Colourful Afro-Caribbean street carnival' },
  { label: 'South Asian & Bollywood', src: `${HERO}/bollywood.jpg`, alt: 'Lively crowd dancing under vibrant lighting' },
  { label: 'Latin & salsa', src: `${HERO}/latin.jpg`, alt: 'Colourful dancers in a Latin street parade' },
  { label: 'Filipino fiestas', src: `${HERO}/filipino.jpg`, alt: 'Festival parade with traditional Filipino costumes' },
  { label: 'Lunar & East Asian', src: `${HERO}/lunar.jpg`, alt: 'Lanterns lighting up a Lunar New Year celebration' },
  { label: 'Gospel & worship', src: `${HERO}/gospel.jpg`, alt: 'A quiet moment of faith and devotion' },
  { label: 'Comedy nights', src: `${HERO}/comedy.jpg`, alt: 'A performer on stage at a comedy night' },
]
