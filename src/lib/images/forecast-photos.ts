/**
 * Forecast tool marketing surface - photo slots.
 *
 * Close-out FT1, and Law 4: every marketing and landing surface carries
 * image-rich treatment, and a text-only one is a design defect by definition.
 * /forecast is reachable from /organisers and from the footer and is squarely a
 * page that sells the platform, so it gets a hero like the rest of them.
 *
 * Every image resolves through this map, so a photo-day swap is a one-line
 * change here and never touches the page template. Same shape and same licensed
 * library as `organiser-photos.ts`, which is the reference build for Law 4.
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

/**
 * The above-fold hero, and the choice is the argument the page is making: a
 * FULL ROOM. The question this tool answers is how many tickets it takes to
 * cover the night, so the picture beside the question is the answer somebody
 * wants, not a person at a laptop doing sums.
 */
export const FORECAST_HERO: PhotoSlot = spineSlot(
  'organisersSoldout',
  'A full house at an event on the night, seen from the stage',
  `${HERO}/afrobeats.jpg`,
  '50% 45%',
)
