import type { ReactNode } from 'react'
import { HERO_CAPTION_FADE, HERO_CAPTION_SCRIM } from './hero-photo-scrim'

/**
 * HERO CAPTION. The text block a hero paints on top of its photograph, sitting
 * on the one wash that is anchored to the text rather than to the band.
 *
 * The reasoning, the measurement that forced it and where 0.82 comes from are
 * all in `./hero-photo-scrim.ts`. What matters at a call site is only this: put
 * the eyebrow, the headline and the supporting copy inside this component and
 * the platform guarantees they clear their WCAG floor over any photograph. Do
 * not paint another navy gradient around it.
 *
 * THE WASH BLEEDS FULL WIDTH ON PURPOSE. A wash that stopped at the caption's
 * right edge would draw a visible vertical seam down the middle of the
 * photograph. Every hero band that uses this carries `overflow-hidden`, which is
 * what clips the bleed, and `scripts/guards/hero-text-over-a-photograph.mjs`
 * fails the build if a caller ever loses that clip.
 */
export function HeroCaption({
  children,
  className = '',
  contentClassName = '',
}: {
  children: ReactNode
  /** Layout classes for the text column itself, e.g. `max-w-2xl`. */
  className?: string
  /**
   * Classes for the element that DIRECTLY PARENTS the text, which is where any
   * child-stagger class has to go.
   *
   * WHY THIS PROP EXISTS. `.hero-enter` staggers its DIRECT children
   * (`html[data-motion="1"] .hero-enter > *`, globals.css). This component puts
   * two elements between its own className and the text: the wash, and the
   * layer the text rides on. So `hero-enter` written on `className` would
   * animate the wash as item one and the whole text block as item two, and the
   * headline, meta and CTA would arrive together instead of 70ms apart. It
   * would look almost right, which is the worst kind of wrong, and no contrast
   * drive could ever see it because the stagger is armed only under
   * `data-motion="1"`, which headless agents are deliberately never given.
   * `scripts/guards/hero-text-over-a-photograph.mjs` clause 5 fails the build
   * if a caller puts a stagger class on `className`.
   */
  contentClassName?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          top: `calc(-1 * ${HERO_CAPTION_FADE})`,
          /* Past the foot of the band and both edges of the viewport; the
           * band's own `overflow-hidden` is what trims it. */
          bottom: '-100vh',
          left: '-100vw',
          right: '-100vw',
          background: HERO_CAPTION_SCRIM,
        }}
      />
      {/* The text rides above its own wash. */}
      <div className={`relative ${contentClassName}`}>{children}</div>
    </div>
  )
}
