import { Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  cultureSlug: string
  cultureName: string
  organiserPersonas: string[]
}

/**
 * CultureOrganiserCtaPanel - dark band closer for /culture/[slug].
 *
 * Mirrors the existing CategoryLandingPage final CTA but rebuilt with
 * the persona pill cluster on the left and the talk-to-us CTA on the
 * right so the page closes with a clear organiser conversion path.
 */
export function CultureOrganiserCtaPanel({ cultureSlug, cultureName, organiserPersonas }: Props) {
  return (
    <section className="relative overflow-hidden bg-[var(--surface-dark)] py-16 md:py-20 lg:py-24">
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
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
              For organisers
            </p>
            <h2 className="font-display text-3xl font-bold leading-tight text-white sm:text-4xl">
              Built for the people who run {cultureName} events.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/65 sm:text-lg">
              Transparent fees, real human support, and a platform that respects the culture instead of treating it like an afterthought.
            </p>
            <div className="mt-8">
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
            <ul role="list" className="flex flex-col gap-2.5">
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
