/**
 * Centralised media transition timings.
 *
 * Brand-level changes (e.g. "make ken-burns 30% slower") need to touch one
 * file, not ten. CSS animations and JS-driven transitions reference these
 * constants.
 *
 * Critically: `kenburnsTransform` only ever applies AFTER the LCP image
 * commits — see HeroMedia for the deferred-mount pattern that protects LCP.
 *
 * See docs/MEDIA-ARCHITECTURE.md §10 / §5.2 for policy.
 */
export const MEDIA_TRANSITIONS = {
  /** Carousel slide crossfade duration */
  carouselFadeMs: 900,
  /** Ken-burns scale animation duration */
  kenburnsMs: 4500,
  /** Slide rotation interval (carousel) */
  carouselIntervalMs: 4000,
  /** Card hover scale duration */
  cardHoverMs: 220,
  /** Easing — shared brand ease */
  ease: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
} as const

export const MEDIA_AUDIT_FLAG = 'headless'
