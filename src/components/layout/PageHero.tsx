import type { ReactNode } from 'react'

interface PageHeroProps {
  /** Small uppercase label above the title, e.g. "LEGAL", "HELP" */
  eyebrow?: string
  /** The page H1 — required */
  title: string
  /** One-line supporting copy, max ~140 chars */
  subtitle?: string
  /** Text alignment. Default 'left'. */
  align?: 'left' | 'center'
}

/**
 * PageHero — the dark hero band at the top of every interior page.
 *
 * Provides consistent height, type scale, and brand rhythm across
 * /legal, /help, /contact, /about, /organiser, etc.
 *
 * Deliberately does NOT use <Section> because Section enforces
 * py-16 md:py-20 lg:py-24, while PageHero needs the taller
 * py-24 md:py-32 lg:py-40 to read as a true hero moment.
 *
 * Usage:
 *   <PageHero eyebrow="LEGAL" title="Privacy Policy" subtitle="Last updated 15 Apr 2026" />
 */
export function PageHero({ eyebrow, title, subtitle, align = 'left' }: PageHeroProps) {
  const alignCls = align === 'center' ? 'text-center' : 'text-left'
  const subtitleCls = align === 'center'
    ? 'mx-auto max-w-2xl'
    : 'max-w-2xl'

  return (
    <section
      className="bg-[var(--surface-dark)] text-[var(--text-on-dark)] py-24 md:py-32 lg:py-40"
      aria-labelledby="page-hero-heading"
    >
      <div className={`mx-auto max-w-7xl px-4 md:px-6 lg:px-8 ${alignCls}`}>

        {eyebrow && (
          <p className="mb-4 font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
            {eyebrow}
          </p>
        )}

        <h1
          id="page-hero-heading"
          className="font-display font-bold leading-[1.05] tracking-tight text-white text-4xl md:text-6xl lg:text-7xl"
        >
          {title}
        </h1>

        {subtitle && (
          <p className={`mt-5 text-lg md:text-xl text-[var(--text-on-dark)] opacity-70 ${subtitleCls}`}>
            {subtitle}
          </p>
        )}

      </div>
    </section>
  )
}
