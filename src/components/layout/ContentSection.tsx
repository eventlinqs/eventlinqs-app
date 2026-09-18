import type { ReactNode } from 'react'
import { Reveal } from '@/components/ui/reveal'

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
}: ContentSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledby}
      /*
       * `cv-section` WAS ADDED HERE ON 19 SEPTEMBER 2026 AND REVERTED THE
       * SAME DAY, and the reason is recorded so the next session does not
       * spend the afternoon rediscovering it (close-out C8B.3).
       *
       * The homepage rails have carried `content-visibility: auto` with
       * `contain-intrinsic-size: auto 480px` since 6 September and no other
       * surface had it. Putting it on this component gave it to every
       * template that uses one, and it worked: on /city/melbourne style
       * recalculation fell to 104-130 ms against 171-231 ms across three
       * sessions of the tree without it, while the control page's did not
       * move.
       *
       * IT ALSO MADE THE PAGE GROW 45 TO 103 PER CENT UNDER THE READER. 480px
       * is a rail - a heading and one row of cards - and the sections this
       * component wraps are grids two and three times that, so the browser's
       * reserved estimate was wrong for nine sections at once and the
       * document's height climbed from 7,551px to 12,055px as it was scrolled.
       * Isolated on the same build by forcing the treatment off in the
       * browser: 59.6% with it, 0.0% without.
       *
       * What this needs is a per-section estimate, not the homepage's
       * constant. That is a measured job per template and it is not this one.
       */
      className={`relative ${surfaces[surface]} ${pads[pad]} ${className}`}
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
