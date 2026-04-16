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
 * CategoryHeroEmpty — full-bleed dark hero used when a category has no live events.
 *
 * Two modes:
 *   coverImage — shows <Image fill> + dark gradient overlay
 *   default    — CSS-only gradient pattern (brand accent radial + subtle grid)
 *
 * NOT a replacement for EmptyState (that primitive remains for placeholder pages).
 * This is specifically for category/filter contexts where we want a marketing
 * moment rather than a "nothing here" message.
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
  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-[var(--surface-dark)]"
      style={{ minHeight: 'clamp(420px, 60vh, 600px)' }}
    >
      {/* ── Background: image OR CSS pattern ─────────────────────── */}
      {coverImage ? (
        <>
          <Image
            src={coverImage}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 1280px"
            className="object-cover"
            aria-hidden="true"
          />
          {/* Dark gradient overlay for legibility */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to right, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.60) 60%, rgba(0,0,0,0.40) 100%)',
            }}
            aria-hidden="true"
          />
        </>
      ) : (
        /* CSS-only pattern — two radial glows + no image dependency */
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          {/* Brand accent radial glow — top-right */}
          <div
            className="absolute"
            style={{
              top: '-20%',
              right: '-10%',
              width: '60%',
              height: '60%',
              background: 'radial-gradient(circle, var(--brand-accent), transparent 85%)',
              opacity: 0.05,
            }}
          />
          {/* White glow — bottom-left */}
          <div
            className="absolute"
            style={{
              bottom: '-20%',
              left: '-10%',
              width: '50%',
              height: '50%',
              background: 'radial-gradient(circle, white, transparent 70%)',
              opacity: 0.04,
            }}
          />
          {/* Subtle 80px grid lines */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '80px 80px',
            }}
          />
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-start justify-center p-8 md:p-12 lg:p-16 max-w-3xl">
        {/* Eyebrow pill */}
        {eyebrow && (
          <span className="mb-6 inline-flex items-center rounded-full border border-[var(--brand-accent)]/30 bg-[var(--brand-accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
            {eyebrow}
          </span>
        )}

        {/* Headline */}
        <h2 className="mb-5 max-w-2xl text-3xl font-bold leading-[1.05] tracking-tight text-white md:text-5xl lg:text-6xl">
          {headline}
        </h2>

        {/* Subhead */}
        <p className="mb-8 max-w-xl text-lg leading-relaxed text-white/70 md:text-xl">
          {subhead}
        </p>

        {/* Action row */}
        <div className="mb-10 flex flex-col gap-3 sm:flex-row">
          <Button variant="primary" size="lg" href={primaryAction.href}>
            {primaryAction.label}
          </Button>
          {secondaryAction && (
            <Button variant="ghost" size="lg" onSurface="dark" href={secondaryAction.href}>
              {secondaryAction.label}
            </Button>
          )}
        </div>

        {/* Trust pillars */}
        {trustPillars && trustPillars.length > 0 && (
          <div className="flex flex-col gap-6 border-t border-white/10 pt-8 sm:flex-row sm:gap-8">
            {trustPillars.map((pillar) => {
              const Icon = pillar.icon
              return (
                <div key={pillar.label} className="flex items-center gap-2.5">
                  <Icon className="h-[18px] w-[18px] shrink-0 text-[var(--brand-accent)]" />
                  <span className="text-sm font-medium text-white/60">{pillar.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
