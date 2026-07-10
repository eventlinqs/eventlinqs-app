/**
 * National waitlist surface - photo slots.
 *
 * Same contract as organiser-photos.ts: every image on /waitlist resolves
 * through this map, so photo-day swaps are a one-line change here and never
 * touch the page template. Sources are the licensed platform photo library
 * with bundled fallbacks.
 */
import { getSpineHero } from './spine'
import type { PhotoSlot } from './organiser-photos'

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

/** Above-fold full-bleed hero (the one priority image on the page). */
export const WAITLIST_HERO: PhotoSlot = spineSlot(
  'supportingCrowd',
  'A full crowd at a live Australian event',
  `${HERO}/caribbean-carnival.jpg`,
  '50% 40%',
)

/** The organiser invitation band at the foot of the page. */
export const WAITLIST_ORGANISER_BAND: PhotoSlot = spineSlot(
  'supportingOrganiser',
  'An organiser celebrating a successful, well-attended event',
  `${HERO}/owambe.jpg`,
  '50% 50%',
)
