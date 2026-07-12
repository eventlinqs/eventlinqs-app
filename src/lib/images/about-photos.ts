/**
 * About page - photo slots (Law 4: marketing surfaces are image-rich).
 *
 * Every image on /about resolves through this map, so photo-day swaps are a
 * one-line change here and never touch the page template. Sources are the
 * licensed platform photo library (`public/images/hero/*`, Pexels licence,
 * see attribution.json), the same set the organiser surface uses.
 */

import { getSpineHero } from './spine'

export interface PhotoSlot {
  src: string
  alt: string
  objectPosition?: string
}

const HERO = '/images/hero'

function spineSlot(
  name: Parameters<typeof getSpineHero>[0],
  alt: string,
  fallbackSrc: string,
  fallbackFocal: string,
): PhotoSlot {
  const spine = getSpineHero(name)
  return {
    src: spine?.src ?? fallbackSrc,
    alt,
    objectPosition: spine?.objectPosition ?? fallbackFocal,
  }
}

export const ABOUT_PHOTOS: Record<'hero' | 'storyBand', PhotoSlot> = {
  // The multicommunity festival crowd: the platform itself, not any one scene.
  hero: {
    src: `${HERO}/afrobeats.jpg`,
    alt: 'A festival crowd celebrating together at an Australian community event',
    objectPosition: '50% 32%',
  },
  // Launch-face finalisation 2026-07-12: the story band is the LICENSED
  // premium spine shot (golden-hour crowd singing together - Australia and
  // the breadth of community in one frame), replacing the bundled raster.
  // Faces sit mid-frame at this focal point; the cinematic scrim rides on
  // top in the page template.
  storyBand: spineSlot(
    'supportingCrowd',
    'A golden-hour crowd singing together at an Australian community event',
    `${HERO}/caribbean-carnival.jpg`,
    '50% 42%',
  ),
}
