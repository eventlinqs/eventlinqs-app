/**
 * About page - photo slots (Law 4: marketing surfaces are image-rich).
 *
 * Every image on /about resolves through this map, so photo-day swaps are a
 * one-line change here and never touch the page template. Sources are the
 * licensed platform photo library (`public/images/hero/*`, Pexels licence,
 * see attribution.json), the same set the organiser surface uses.
 */

export interface PhotoSlot {
  src: string
  alt: string
  objectPosition?: string
}

const HERO = '/images/hero'

export const ABOUT_PHOTOS: Record<'hero' | 'storyBand', PhotoSlot> = {
  // The multicommunity festival crowd: the platform itself, not any one scene.
  hero: {
    src: `${HERO}/afrobeats.jpg`,
    alt: 'A festival crowd celebrating together at an Australian community event',
    objectPosition: '50% 32%',
  },
  // The warm celebration band under the mission: community joy up close.
  storyBand: {
    src: `${HERO}/owambe.jpg`,
    alt: 'Guests dancing together at a community celebration',
    objectPosition: '50% 38%',
  },
}
