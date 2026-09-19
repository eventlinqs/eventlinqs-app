import { getSpineHero } from './spine'

/**
 * The "what is on this weekend" surface - photo slots.
 *
 * Law 4, and the premium bar in the `competitor-benchmark` skill: every public
 * landing carries image-rich treatment and a text-only one is a design defect by
 * definition. Same shape and same licensed library as `forecast-photos.ts` and
 * `organiser-photos.ts`, which is the reference build, so a photo-day swap is a
 * one-line change here and never touches the template.
 *
 * WHY `supportingCrowd` AND NOT ONE OF THE THREE HOMEPAGE HEROES. The commonest
 * way on to this page is the "View all" beneath the homepage rail called "On
 * this weekend". A visitor who has just scrolled past a homepage hero and then
 * lands on the same photograph one click later reads it as the same page, so the
 * three `homepage*` slots are deliberately not used here. The crowd singalong at
 * golden hour is what a weekend looks like and it is not the picture they just
 * came from.
 */

export interface PhotoSlot {
  src: string
  alt: string
  objectPosition?: string
}

/**
 * The above-fold hero.
 *
 * The bundled fallback is the daytime festival raster rather than
 * `afrobeats.jpg`, which is what most of these configs fall back to. That
 * default is right on a page about an African community landing and wrong here,
 * and `PhotographicCategoryHero` carries the reason in its own header: a
 * confidently wrong photograph is a worse failure than a missing one.
 */
export const WEEKEND_HERO: PhotoSlot = (() => {
  const spine = getSpineHero('supportingCrowd')
  return {
    src: spine?.src ?? '/images/hero/homepage-day-festival.jpg',
    alt: 'A crowd singing along at an outdoor event at golden hour',
    /*
     * 68% ACROSS, NOT THE HERO ROLE DEFAULT OF 50%, AND IT WAS MEASURED.
     *
     * The subject of this photograph - the raised hands and the silhouetted
     * crowd - sits in the RIGHT THIRD of the frame. At 1440 the hero box is wide
     * enough that it barely matters, and the champion and the challenger are
     * indistinguishable. At 390 the box is tall and narrow, and the role default
     * cropped onto the soft bokeh on the left: a hero with no subject in it, on
     * the viewport that matters most.
     *
     * Champion and challenger, captured on one build:
     *   C:\dev\EVIDENCE\AQ3-WEEKEND\hero-champion-390.png   50% 42%, no subject
     *   C:\dev\EVIDENCE\AQ3-WEEKEND\hero-challenger-390.png 68% 45%, hands in frame
     *   ...-champion-1440.png and ...-challenger-1440.png, indistinguishable
     *
     * Better at 390, level at 1440, nothing worse: the challenger lands.
     */
    objectPosition: '68% 45%',
  }
})()
