import { Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { HeroMedia } from '@/components/media'

interface Props {
  cultureSlug: string
  cultureName: string
  organiserPersonas: string[]
  /**
   * Optional photographic backdrop (typically the culture's first city's
   * landscape Pexels hero, parallel-fetched on the page). Falls back to
   * the dark navy panel when null. Image sits behind a strong dark
   * overlay (~0.80) so the text stays AA-readable regardless of subject.
   */
  backdropImage?: string | null
}

/**
 * CultureOrganiserCtaPanel - dark band closer for /culture/[slug].
 *
 * Batch 5.5: ~30% shorter (py-10/12/16 vs py-16/20/24) with optional
 * photographic backdrop + strong dark overlay. Persona pill cluster on
 * the left, talk-to-us CTA on the right.
 */
export function CultureOrganiserCtaPanel({
  cultureSlug,
  cultureName,
  organiserPersonas,
  backdropImage = null,
}: Props) {
  return (
    <section className="relative overflow-hidden bg-[var(--surface-dark)] py-10 md:py-12 lg:py-16">
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
        </>
      )}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, var(--brand-accent) 50%, transparent 100%)',
          opacity: 0.6,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute"
        style={{
          top: '-20%',
          right: '-10%',
          width: '65%',
          height: '140%',
          background: 'radial-gradient(ellipse 70% 60% at 100% 50%, var(--brand-accent), transparent 60%)',
          opacity: 0.10,
        }}
        aria-hidden
      />
      <div className="relative z-10 mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
              For organisers
            </p>
            <h2 className="font-display text-2xl font-bold leading-tight text-white sm:text-3xl">
              Built for the people who run {cultureName} events.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/75 sm:text-base">
              Transparent fees, real human support, and a platform that respects the {cultureName} community instead of treating it like an afterthought.
            </p>
            <div className="mt-6">
              <Button
                variant="primary"
                size="lg"
                onSurface="dark"
                href={`/contact?topic=organiser&interest=${cultureSlug}`}
              >
                Talk to us about your event
              </Button>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
              Built for
            </p>
            <ul role="list" className="flex flex-col gap-2">
              {organiserPersonas.map(persona => (
                <li
                  key={persona}
                  className="flex items-start gap-2.5 text-sm leading-relaxed text-white/85 sm:text-base"
                >
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-accent)]" aria-hidden />
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
