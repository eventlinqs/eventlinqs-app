import type { ReactNode } from 'react'

type SurfaceName = 'base' | 'alt' | 'dark'
type WidthName = 'prose' | 'default' | 'wide'

interface ContentSectionProps {
  surface?: SurfaceName
  /** Controls the max-width of the inner container. Default 'default'. */
  width?: WidthName
  children: ReactNode
  /** Optional section id for anchor links / in-page nav */
  id?: string
  /** aria-labelledby for accessible section labelling */
  'aria-labelledby'?: string
  className?: string
}

const surfaces: Record<SurfaceName, string> = {
  base: 'bg-[var(--surface-0)] text-[var(--text-primary)]',
  alt:  'bg-[var(--surface-1)] text-[var(--text-primary)]',
  dark: 'bg-[var(--surface-dark)] text-[var(--text-on-dark)]',
}

/**
 * max-w values:
 *   prose   → max-w-3xl  (~672px)  — long-form reading (legal, help, articles)
 *   default → max-w-6xl  (~1152px) — standard content, most interior sections
 *   wide    → max-w-7xl  (~1280px) — full-width grids, matching homepage sections
 */
const widths: Record<WidthName, string> = {
  prose:   'max-w-3xl',
  default: 'max-w-6xl',
  wide:    'max-w-7xl',
}

/**
 * ContentSection — replaces raw <section> on interior pages.
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
  children,
  id,
  'aria-labelledby': ariaLabelledby,
  className = '',
}: ContentSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledby}
      className={`${surfaces[surface]} py-16 md:py-20 lg:py-24 ${className}`}
    >
      <div className={`mx-auto ${widths[width]} px-4 md:px-6 lg:px-8`}>
        {children}
      </div>
    </section>
  )
}
