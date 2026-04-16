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
  /** Visual treatment. 'premium' adds gradient depth, grid overlay, and accent glow. Default 'default'. */
  variant?: 'default' | 'premium'
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
 *   <PageHero eyebrow="CATEGORY" title="Music" variant="premium" />
 */
export function PageHero({ eyebrow, title, subtitle, align = 'left', variant = 'default' }: PageHeroProps) {
  const isPremium = variant === 'premium'
  const alignCls = align === 'center' ? 'text-center' : 'text-left'
  const subtitleCls = align === 'center'
    ? 'mx-auto max-w-2xl'
    : 'max-w-2xl'
  const titleMaxWidth = isPremium ? 'max-w-4xl' : 'max-w-2xl'
  const titleStyle = isPremium ? { textShadow: '0 2px 24px rgb(0 0 0 / 0.35)' } : undefined

  return (
    <section
      className="relative bg-[var(--surface-dark)] text-[var(--text-on-dark)] py-24 md:py-32 lg:py-40 overflow-hidden"
      aria-labelledby="page-hero-heading"
    >
      {/* Premium background layers */}
      {isPremium && (
        <>
          {/* Radial gradient — accent glow top-right */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 80% 60% at 100% 0%, var(--brand-accent) 12%, transparent 60%)',
            }}
          />
          {/* Secondary radial — soft white glow bottom-left */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 60% 50% at 0% 100%, white 5%, transparent 50%)',
            }}
          />
          {/* Grid overlay */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '100px 100px',
            }}
          />
          {/* Thin accent bar at bottom */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 right-0"
            style={{
              height: '2px',
              background: 'linear-gradient(90deg, transparent, rgba(var(--brand-accent-rgb, 74 144 217) / 0.5) 50%, transparent)',
            }}
          />
        </>
      )}

      <div className={`relative mx-auto max-w-7xl px-4 md:px-6 lg:px-8 ${alignCls}`}>

        {eyebrow && (
          <p className="mb-4 font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
            {eyebrow}
          </p>
        )}

        <h1
          id="page-hero-heading"
          className={`font-display font-bold leading-[1.05] tracking-tight text-white text-4xl md:text-6xl lg:text-7xl ${titleMaxWidth}`}
          style={titleStyle}
        >
          {title}
        </h1>

        {subtitle && (
          <p className={`mt-5 text-lg md:text-xl text-white/70 ${subtitleCls}`}>
            {subtitle}
          </p>
        )}

      </div>
    </section>
  )
}
