import { Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { HeroMedia } from '@/components/media'

interface Props {
  communitySlug: string
  communityName: string
  organiserPersonas: string[]
  /**
   * Optional photographic backdrop (typically the community's first city's
   * landscape Pexels hero, parallel-fetched on the page). When present the
   * band renders the homepage photo + navy-overlay treatment (an allowed
   * dark surface). When null it renders the light navy-on-canvas band - no
   * flat dark panel - per the design system.
   */
  backdropImage?: string | null
}

/**
 * CommunityOrganiserCtaPanel - closer band for /community/[slug].
 *
 * Adaptive surface: a photographic backdrop drives the dark photo+overlay
 * treatment (homepage hero pattern); without one it renders light on canvas.
 * Persona pill cluster on the left, talk-to-us CTA on the right.
 */
export function CommunityOrganiserCtaPanel({
  communitySlug,
  communityName,
  organiserPersonas,
  backdropImage = null,
}: Props) {
  const isDark = Boolean(backdropImage)
  const c = {
    section: isDark
      ? 'bg-[var(--surface-dark)]'
      : 'border-t border-ink-100 bg-[var(--surface-1)]',
    eyebrow: isDark ? 'text-[var(--brand-accent)]' : 'text-[var(--brand-accent-strong)]',
    heading: isDark ? 'text-white' : 'text-[var(--text-primary)]',
    body: isDark ? 'text-white/75' : 'text-[var(--text-secondary)]',
    persona: isDark ? 'text-white/85' : 'text-ink-700',
    icon: isDark ? 'text-[var(--brand-accent)]' : 'text-[var(--brand-accent-strong)]',
  }

  return (
    <section className={`relative overflow-hidden py-10 md:py-12 lg:py-16 ${c.section}`}>
      {backdropImage && (
        <>
          <HeroMedia image={backdropImage} alt="" priority={false} />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(10,22,40,0.86) 0%, rgba(10,22,40,0.82) 50%, rgba(10,22,40,0.90) 100%)',
            }}
            aria-hidden
          />
          {/* Gold hairline reads only on the dark photographic treatment */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, var(--brand-accent) 50%, transparent 100%)',
              opacity: 0.6,
            }}
            aria-hidden
          />
        </>
      )}
      {/* Subtle warm gold tint - premium on either surface (Phase B touch) */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: '-20%',
          right: '-10%',
          width: '65%',
          height: '140%',
          background: 'radial-gradient(ellipse 70% 60% at 100% 50%, var(--brand-accent), transparent 60%)',
          opacity: isDark ? 0.10 : 0.05,
        }}
        aria-hidden
      />
      <div className="relative z-10 mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className={`mb-3 text-xs font-semibold uppercase tracking-[0.2em] ${c.eyebrow}`}>
              For organisers
            </p>
            <h2 className={`font-display text-2xl font-bold leading-tight sm:text-3xl ${c.heading}`}>
              Built for the people who run {communityName} events.
            </h2>
            <p className={`mt-3 text-sm leading-relaxed sm:text-base ${c.body}`}>
              Transparent fees, real human support, and a platform that respects the {communityName} community instead of treating it like an afterthought.
            </p>
            <div className="mt-6">
              <Button
                variant="primary"
                size="lg"
                onSurface={isDark ? 'dark' : 'light'}
                href={`/contact?topic=organiser&interest=${communitySlug}`}
              >
                Talk to us about your event
              </Button>
            </div>
          </div>
          <div>
            <p className={`mb-3 text-xs font-semibold uppercase tracking-[0.2em] ${c.eyebrow}`}>
              Built for
            </p>
            <ul role="list" className="flex flex-col gap-2">
              {organiserPersonas.map(persona => (
                <li
                  key={persona}
                  className={`flex items-start gap-2.5 text-sm leading-relaxed sm:text-base ${c.persona}`}
                >
                  <Users className={`mt-0.5 h-4 w-4 shrink-0 ${c.icon}`} aria-hidden />
                  {persona}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
