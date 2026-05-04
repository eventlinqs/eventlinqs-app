interface PageHeroProps {
  /** Small uppercase label above the title, e.g. "LEGAL", "HELP" */
  eyebrow?: string
  /** The page H1 - required */
  title: string
  /** One-line supporting copy, max ~140 chars */
  subtitle?: string
  /** Text alignment. Default 'left'. */
  align?: 'left' | 'center'
  /** Visual treatment. 'premium' adds a thin gold accent rule. Default 'default'. */
  variant?: 'default' | 'premium'
}

/**
 * PageHero - light-surface page hero band for interior marketing pages.
 *
 * Batch 4 rebuild (2026-05-04): the prior implementation was a dark
 * navy band with a radial gold ellipse + grid overlay. The founder
 * audit on live production rejected this treatment as "yellow blob
 * over black hero" and demanded a light-surface, Ticketmaster-grade
 * page hero with bold typography against the canvas.
 *
 * Design DNA (per DESIGN-SYSTEM.md and Ticketmaster.com.au reference):
 *   - light canvas surface, no painted background
 *   - bold display H1 in primary text colour
 *   - small accent eyebrow above the title
 *   - subtitle in secondary text colour
 *   - 'premium' variant adds a thin gold rule along the bottom edge
 *     to mark the most-prominent pages (e.g. /pricing, /organisers)
 *
 * Used by: /pricing, /organisers, /about, /blog, /press, /careers,
 * /help, /help/[slug], /contact, /legal/*, /partners.
 */
export function PageHero({ eyebrow, title, subtitle, align = 'left', variant = 'default' }: PageHeroProps) {
  const isPremium = variant === 'premium'
  const alignCls = align === 'center' ? 'text-center' : 'text-left'
  const subtitleCls = align === 'center' ? 'mx-auto max-w-2xl' : 'max-w-2xl'

  return (
    <section
      className="relative bg-[var(--surface-0)] py-16 md:py-20 lg:py-24"
      aria-labelledby="page-hero-heading"
    >
      <div className={`relative mx-auto max-w-7xl px-4 md:px-6 lg:px-8 ${alignCls}`}>
        {eyebrow && (
          <p className="mb-3 font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">
            {eyebrow}
          </p>
        )}

        <h1
          id="page-hero-heading"
          className={`font-display font-extrabold leading-[1.05] tracking-tight text-[var(--text-primary)] text-4xl sm:text-5xl lg:text-6xl ${align === 'center' ? 'mx-auto max-w-4xl' : 'max-w-3xl'}`}
        >
          {title}
        </h1>

        {subtitle && (
          <p className={`mt-5 text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg ${subtitleCls}`}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Bottom rule: subtle on default, gold accent on premium */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px"
        style={{
          background: isPremium
            ? 'linear-gradient(90deg, transparent 0%, var(--brand-accent) 50%, transparent 100%)'
            : 'var(--surface-2)',
          opacity: isPremium ? 0.6 : 1,
        }}
      />
    </section>
  )
}
