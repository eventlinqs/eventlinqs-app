import type { ReactNode } from 'react'

type SurfaceName = 'base' | 'alt' | 'dark'

const surfaces: Record<SurfaceName, string> = {
  base: 'bg-[var(--surface-0)] text-[var(--text-primary)]',
  alt:  'bg-[var(--surface-1)] text-[var(--text-primary)]',
  dark: 'bg-[var(--surface-dark)] text-[var(--text-on-dark)]',
}

export function Section({
  surface = 'base',
  children,
  className = '',
  id,
  'aria-labelledby': ariaLabelledby,
}: {
  surface?: SurfaceName
  children: ReactNode
  className?: string
  id?: string
  'aria-labelledby'?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledby}
      className={`${surfaces[surface]} py-16 md:py-20 lg:py-24 ${className}`}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        {children}
      </div>
    </section>
  )
}
