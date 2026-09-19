import type { CSSProperties, ReactNode } from 'react'
import { Reveal } from '@/components/ui/reveal'
import type { IntrinsicSize } from '@/lib/ui/event-grid-intrinsic'

type SurfaceName = 'base' | 'alt' | 'dark'
type WidthName = 'prose' | 'default' | 'wide'
type PadName = 'default' | 'rail'

// Vertical rhythm presets. 'default' is the interior-page band rhythm (unchanged).
// 'rail' matches the homepage SECTION_RAIL beat (py-6 sm:py-8) so a band stacked
// among rails produces the same 64px seam as every rail - no oversized gap.
const pads: Record<PadName, string> = {
  default: 'py-16 md:py-20 lg:py-24',
  rail: 'py-6 sm:py-8',
}

interface ContentSectionProps {
  surface?: SurfaceName
  /** Controls the max-width of the inner container. Default 'default'. */
  width?: WidthName
  /** Vertical padding rhythm. Default 'default'; 'rail' matches SECTION_RAIL. */
  pad?: PadName
  children: ReactNode
  /** Optional section id for anchor links / in-page nav */
  id?: string
  /** aria-labelledby for accessible section labelling */
  'aria-labelledby'?: string
  className?: string
  /** Renders a subtle accent gradient line at the top of the section. Default false. */
  topBorder?: boolean
  /**
   * Fade-rise the section content on scroll-in (Motion law). Use on below-fold
   * interior sections. No-ops without JS / under reduced-motion / for headless
   * audits (the shared Reveal primitive is gated by html[data-motion=1]).
   */
  reveal?: boolean
  /**
   * Skip layout, style and paint for this section until it approaches the
   * viewport (`cv-section`: content-visibility: auto with an intrinsic size
   * of 480px). DEFAULT TRUE, and the default is a measurement rather than an
   * opinion.
   *
   * Every section on /city/melbourne is 439 to 670px tall except one, and
   * 480px is a rail: a heading and one row of cards. Sweeping every
   * ContentSection-bearing route at 390 on 19 September 2026 found only FIVE
   * sections over 1,500px on the whole platform - the city's "all events"
   * grid (9,067px), the category's (9,043px), the suburb's (3,535px), the
   * careers pitch (1,519px) and the waitlist's city chooser (2,469px).
   *
   * THREE OF THOSE FIVE NO LONGER USE THIS FLAG, and nor does the
   * community-by-city twin of the first. Later the same day their height
   * turned out to be COMPUTABLE - `n` cards in 1, 2 or 3 columns - so they
   * declare it through `intrinsicSize` below and skip layout like everything
   * else. What is left opting out by measurement is the careers pitch and the
   * waitlist's city chooser: neither is a grid of anything, so neither has a
   * height anybody can derive.
   *
   * WHY IT MATTERS THAT THEY DO. With the treatment on all of them,
   * /city/melbourne grew from 7,551px to 12,055px as it was scrolled - the
   * reserved estimate was wrong for nine sections at once and the scrollbar
   * rescaled under the reader the whole way down. That is measured in
   * scripts/verify/below-fold-sections-drive.mjs, which is what a new tall
   * section should be run against before it is added without this flag.
   */
  skipOffscreen?: boolean
  /**
   * The ROWS this section's grid will have at each column band, which is all
   * the stylesheet needs to compute its height. Supplied by
   * `eventGridIntrinsicSize(n)` for the nine event grids, whose height is `n`
   * cards in 1, 2 or 3 columns and is therefore computable at render time
   * rather than guessed at 480px.
   *
   * When present it REPLACES `skipOffscreen`: the section carries
   * `.cv-measured` and reserves its own declared height instead of the rail
   * step. When it is `null` - which is what the estimator returns for an empty
   * grid, because a section with no events renders the shared empty state and
   * not cards - `skipOffscreen` governs as before.
   *
   * The measurement, the formula and the three things it cannot know are in
   * src/lib/ui/event-grid-intrinsic.ts. Proven by
   * scripts/verify/event-grid-intrinsic-drive.mjs.
   */
  intrinsicSize?: IntrinsicSize | null
}

const surfaces: Record<SurfaceName, string> = {
  base: 'bg-[var(--surface-0)] text-[var(--text-primary)]',
  alt:  'bg-[var(--surface-1)] text-[var(--text-primary)]',
  dark: 'bg-[var(--surface-dark)] text-[var(--text-on-dark)]',
}

/**
 * max-w values:
 *   prose   → max-w-3xl  (~672px)  - long-form reading (legal, help, articles)
 *   default → max-w-6xl  (~1152px) - standard content, most interior sections
 *   wide    → max-w-7xl  (1400px)  - full-width grids, matching homepage sections
 *             (the sitewide page width; see globals.css `--container-7xl`)
 */
const widths: Record<WidthName, string> = {
  prose:   'max-w-3xl',
  default: 'max-w-6xl',
  wide:    'max-w-7xl',
}

/**
 * ContentSection - replaces raw <section> on interior pages.
 *
 * Enforces consistent vertical rhythm (py-16 → py-20 → py-24) and
 * horizontal padding across breakpoints, with three width presets.
 *
 * Usage:
 *   <ContentSection surface="alt" width="prose">
 *     <Prose>...</Prose>
 *   </ContentSection>
 */
export function ContentSection({
  surface = 'base',
  width = 'default',
  pad = 'default',
  children,
  id,
  'aria-labelledby': ariaLabelledby,
  className = '',
  topBorder = false,
  reveal = false,
  skipOffscreen = true,
  intrinsicSize = null,
}: ContentSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledby}
      /* Three integers, not three calc() strings. The formula they multiply
       * is in globals.css; sending it per page measured 470 bytes per
       * document across the markup and the flight payload. */
      style={
        intrinsicSize
          ? ({
              '--cv-r-base': intrinsicSize.base,
              '--cv-r-md': intrinsicSize.md,
              '--cv-r-lg': intrinsicSize.lg,
            } as CSSProperties)
          : undefined
      }
      /*
       * `cv-section` here is the treatment the homepage rails have carried
       * since close-out C8 (6 September 2026). It reached no other surface
       * until 19 September, when /city/melbourne was measured rendering
       * 1,866 nodes across 11 sections with none of it and spending 705 ms
       * in Style & Layout before it could paint.
       *
       * It is ON by default and OFF for the sections on the platform that are
       * too tall for a 480px estimate - see `skipOffscreen` above, where the
       * measurement and the failure it prevents are written down.
       *
       * `.cv-measured` (19 September 2026) is the third state and it wins:
       * a section that KNOWS its height reserves that, and the four "all
       * events" grids know theirs. See `intrinsicSize`.
       */
      className={`${intrinsicSize ? 'cv-measured ' : skipOffscreen ? 'cv-section ' : ''}relative ${surfaces[surface]} ${pads[pad]} ${className}`}
    >
      {topBorder && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-0 top-0"
          style={{
            height: '1px',
            // Brand gold accent (was off-brand blue rgba(74,144,217); #4A90D9).
            background: 'linear-gradient(90deg, transparent, rgba(212, 160, 23, 0.30) 50%, transparent)',
          }}
        />
      )}
      <div className={`mx-auto ${widths[width]} px-4 md:px-6 lg:px-8`}>
        {reveal ? <Reveal>{children}</Reveal> : children}
      </div>
    </section>
  )
}
