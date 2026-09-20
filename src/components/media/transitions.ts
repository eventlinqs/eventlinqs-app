/**
 * Centralised media transition timings.
 *
 * Brand-level changes (e.g. "make ken-burns 30% slower") need to touch one
 * file, not ten. CSS animations and JS-driven transitions reference these
 * constants.
 *
 * Critically: `kenburnsTransform` only ever applies AFTER the LCP image
 * commits - see HeroMedia for the deferred-mount pattern that protects LCP.
 *
 * See docs/MEDIA-ARCHITECTURE.md §10 / §5.2 for policy.
 */
export const MEDIA_TRANSITIONS = {
  /** Carousel slide crossfade duration (legacy SmartMedia, retained for parity) */
  carouselFadeMs: 900,
  /**
   * Hero carousel slide crossfade duration. Distinct from carouselFadeMs:
   * the hero stack uses a tighter 700ms fade so slide swaps feel snappier
   * against the priority-painted slide-0 LCP layer.
   */
  heroCarouselFadeMs: 700,
  /** Ken-burns scale animation duration */
  kenburnsMs: 4500,
  /** Slide rotation interval (carousel) */
  carouselIntervalMs: 4000,
  /** Card hover scale duration */
  cardHoverMs: 220,
  /** Easing - shared brand ease */
  ease: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
} as const

/*
 * THE AUDIT FLAG MOVED OUT OF THIS FILE on 20 September 2026 and is now
 * `AUDIT_FLAG` in src/lib/ui/audit-mode.ts, beside the predicate that reads it.
 *
 * It lived here and was exported to exactly one consumer, which then read it
 * off `document.body` while the flag is written to `documentElement`. A
 * constant that names the key without naming the ELEMENT is half a contract,
 * and the missing half cost six dead suppressions across the platform. The new
 * module exports the question (`isAuditRun()`) rather than the key, so a caller
 * cannot get the element wrong.
 */
