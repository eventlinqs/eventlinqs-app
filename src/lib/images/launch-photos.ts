/**
 * The public composer surface - photo slots.
 *
 * Law 4: every image on /launch resolves through this per-page config, so a
 * photo-day swap is a one-line change here and never touches the template.
 * Sources are the licensed platform photo library (spine first, bundled raster
 * as the fallback when the spine URL cannot be built at build time).
 *
 * Law 6: this is EventLinqs' OWN marketing photography. Nothing here is
 * generated, and nothing here ever renders into an organiser's artefact - an
 * organiser's kit uses their artwork, or the typographic composition when they
 * have none.
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

/**
 * The above-fold hero. Owns the LCP as a single priority raster and never
 * animates (Hero and LCP integrity): only the hero CONTENT staggers in.
 */
export const LAUNCH_HERO: PhotoSlot = spineSlot(
  'organisersStage',
  'An organiser setting up the room before doors open',
  `${HERO}/afrobeats.jpg`,
  '50% 45%',
)
