import Link from 'next/link'
import { CityNewsletterCapture } from '@/components/features/city/city-newsletter-capture'
import { ExternalLink, Globe, Mail } from 'lucide-react'

interface Props {
  organiserName: string
  organiserSlug: string
  website: string | null
  email: string | null
}

/**
 * OrganiserContactPanel - light closer band for the organiser profile
 * page (Batch 8.2 OP9), rebuilt to the navy-on-canvas system (no flat
 * dark surfaces). Reuses CityNewsletterCapture in its light tone so the
 * email capture matches the city CTA panel exactly. External-link row
 * surfaces website + email (the organiser-managed contact channels we
 * have in the schema today; Instagram + TikTok come later when the M7
 * admin panel surfaces a typed social-links schema).
 */
export function OrganiserContactPanel({ organiserName, organiserSlug, website, email }: Props) {
  return (
    <section
      aria-labelledby="organiser-contact-heading"
      className="relative overflow-hidden border-t border-ink-100 bg-[var(--surface-1)] py-12 sm:py-16 lg:py-20"
    >
      {/* Subtle warm gold tint - premium and light (Phase B touch) */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: '-30%', right: '-8%', width: '55%', height: '160%',
          background: 'radial-gradient(ellipse 70% 60% at 100% 50%, var(--brand-accent), transparent 64%)',
          opacity: 0.05,
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
              Stay connected
            </p>
            <h2
              id="organiser-contact-heading"
              className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl"
            >
              Stay connected with {organiserName}.
            </h2>
            <p className="mt-3 text-sm text-[var(--text-secondary)] sm:text-base">
              Get notified the moment new events go live. One email per release. Unsubscribe anytime.
            </p>

            {(website || email) ? (
              <ul role="list" className="mt-6 space-y-2">
                {website ? (
                  <li>
                    <a
                      href={website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-ink-700 transition-colors hover:text-[var(--brand-accent-strong)]"
                    >
                      <Globe className="h-4 w-4" aria-hidden />
                      <span>{website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  </li>
                ) : null}
                {email ? (
                  <li>
                    <a
                      href={`mailto:${email}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-ink-700 transition-colors hover:text-[var(--brand-accent-strong)]"
                    >
                      <Mail className="h-4 w-4" aria-hidden />
                      <span>{email}</span>
                    </a>
                  </li>
                ) : null}
                {/* Real social links surface when M7 admin panel ships the
                 *  social-links schema; lucide-react doesn't ship an Instagram
                 *  glyph in the current pin, so we render via website + email
                 *  only for v1. */}
              </ul>
            ) : null}

            <div className="mt-8">
              <Link
                href={`/organisers/${organiserSlug}/contact`}
                className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-full border border-ink-300 bg-transparent px-6 text-sm font-semibold text-ink-900 transition hover:bg-ink-100"
              >
                Send a message
              </Link>
            </div>
          </div>

          <div className="flex items-center">
            <CityNewsletterCapture cityName={organiserName} tone="light" />
          </div>
        </div>
      </div>
    </section>
  )
}
