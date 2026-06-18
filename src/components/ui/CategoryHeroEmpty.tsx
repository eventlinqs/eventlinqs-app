import Image from 'next/image'
import type { ComponentType } from 'react'
import { Button } from './Button'

interface TrustPillar {
  icon: ComponentType<{ className?: string }>
  label: string
}

interface CategoryHeroEmptyProps {
  eyebrow?: string
  headline: string
  subhead: string
  primaryAction: { label: string; href: string }
  secondaryAction?: { label: string; href: string }
  trustPillars?: TrustPillar[]
  coverImage?: string
}

/**
 * CategoryHeroEmpty - marketing hero used when a category has no live events.
 *
 * Two modes:
 *   coverImage - full-bleed PHOTOGRAPH with a dark navy overlay and white text,
 *                exactly the locked homepage hero pattern (kept).
 *   default    - LIGHT canvas card, navy-on-canvas with a restrained warm gold
 *                wash (no flat dark surface, per the CLAUDE.md light/airy law).
 *
 * NOT a replacement for EmptyState (that primitive remains for placeholder
 * pages). This is the category/filter marketing moment, not a "nothing here".
 */
export function CategoryHeroEmpty({
  eyebrow,
  headline,
  subhead,
  primaryAction,
  secondaryAction,
  trustPillars,
  coverImage,
}: CategoryHeroEmptyProps) {
  // Darkness is only allowed when it comes from a photograph + overlay. The
  // imageless default is a light canvas surface with navy text.
  const onPhoto = !!coverImage
  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${onPhoto ? 'bg-[var(--color-navy-950)]' : 'border border-ink-100 bg-[var(--surface-1)]'}`}
      style={{ minHeight: 'clamp(420px, 60vh, 600px)' }}
    >
      {/* ── Background: photograph OR light canvas pattern ───────── */}
      {onPhoto ? (
        <>
          <Image
            src={coverImage}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 1280px"
            className="object-cover"
            aria-hidden="true"
          />
          {/* Dark navy overlay for white-text legibility (homepage pattern). */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to right, rgba(10,22,40,0.82) 0%, rgba(10,22,40,0.62) 60%, rgba(10,22,40,0.42) 100%)',
            }}
            aria-hidden="true"
          />
        </>
      ) : (
        /* Light canvas: a restrained warm gold wash, no flat dark fill. */
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute"
            style={{
              top: '-25%',
              right: '-10%',
              width: '65%',
              height: '150%',
              background: 'radial-gradient(ellipse 70% 60% at 100% 50%, var(--brand-accent), transparent 62%)',
              opacity: 0.07,
            }}
          />
          {/* Faint navy grid for texture, barely-there. */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(rgba(10,22,40,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(10,22,40,0.035) 1px, transparent 1px)',
              backgroundSize: '80px 80px',
            }}
          />
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-start justify-center p-8 md:p-12 lg:p-16 max-w-3xl">
        {/* Eyebrow pill */}
        {eyebrow && (
          <span className="mb-6 inline-flex items-center rounded-full border border-[var(--brand-accent)]/30 bg-[var(--brand-accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            {eyebrow}
          </span>
        )}

        {/* Headline */}
        <h2 className={`mb-5 max-w-2xl text-3xl font-bold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl ${onPhoto ? 'text-white' : 'text-[var(--text-primary)]'}`}>
          {headline}
        </h2>

        {/* Subhead */}
        <p className={`mb-8 max-w-xl text-lg leading-relaxed md:text-xl ${onPhoto ? 'text-white/70' : 'text-[var(--text-secondary)]'}`}>
          {subhead}
        </p>

        {/* Action row */}
        <div className="mb-10 flex flex-col gap-3 sm:flex-row">
          <Button variant="primary" size="lg" href={primaryAction.href}>
            {primaryAction.label}
          </Button>
          {secondaryAction && (
            <Button variant="ghost" size="lg" onSurface={onPhoto ? 'dark' : undefined} href={secondaryAction.href}>
              {secondaryAction.label}
            </Button>
          )}
        </div>

        {/* Trust pillars */}
        {trustPillars && trustPillars.length > 0 && (
          <div className={`flex flex-col gap-6 border-t pt-8 sm:flex-row sm:gap-8 ${onPhoto ? 'border-white/10' : 'border-ink-100'}`}>
            {trustPillars.map((pillar) => {
              const Icon = pillar.icon
              return (
                <div key={pillar.label} className="flex items-center gap-2.5">
                  <Icon className="h-[18px] w-[18px] shrink-0 text-[var(--brand-accent)]" />
                  <span className={`text-sm font-medium ${onPhoto ? 'text-white/60' : 'text-[var(--text-secondary)]'}`}>{pillar.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
