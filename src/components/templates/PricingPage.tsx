import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { PUBLIC_FEE_LABEL } from '@/lib/pricing/public-fee'

/**
 * PricingPage - /pricing
 *
 * The paid-ticket fee is stated as ONE definite number sourced from
 * `@/lib/pricing/public-fee` (2% + AUD 0.50), which mirrors the live AU / GLOBAL
 * `pricing_rules` baseline that payment-calculator.ts actually charges (the
 * payments lane must set the pricing_rules rows to 2.0 to match). No "from", no
 * "indicative", no "may vary" hedging: one fee for every event type.
 */

// ---- Pricing tier data ----

const TIERS = [
  {
    id: 'free',
    name: 'Free Events',
    price: 'Free forever',
    priceDetail: null,
    description:
      'Host any free event at zero cost. No platform fees. No hidden charges. Keep every dollar you collect.',
    features: [
      'Unlimited free events',
      'Unlimited free tickets',
      'All platform features included',
      'Real-time sales dashboard and scan app',
      'Guest list export and check-in tools',
    ],
    cta: null,
    highlighted: false,
  },
  {
    id: 'paid',
    name: 'Paid Events',
    price: PUBLIC_FEE_LABEL,
    priceDetail: 'per paid ticket sold. That is the whole fee.',
    description:
      'Transparent, industry-leading rates. Pass the fee to buyers or absorb it into your ticket price. Your choice.',
    features: [
      'All features from Free tier',
      'Squad booking and group ticketing',
      'Discount codes and tiered pricing',
      'Advanced sales analytics',
      'Dedicated payout support',
      'Multi-currency checkout',
    ],
    cta: { label: 'Start selling tickets', href: '/organisers/signup' },
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    priceDetail: 'contact us for a quote',
    description:
      'For venues, festivals, and high-volume organisers. Custom rates, dedicated support, and white-label options available.',
    features: [
      'Custom pricing for high volume',
      'Dedicated account manager',
      'White-label event pages (optional)',
      'Custom integrations and reporting',
      'Priority support SLA',
    ],
    cta: { label: 'Contact us', href: '/contact?topic=partnership' },
    highlighted: false,
  },
]

// ---- FAQ data ----

const FAQ = [
  {
    q: "What counts as a paid ticket?",
    a: "Any ticket with a price above zero is a paid ticket. Free tickets and complimentary tickets issued by the organiser are not charged a platform fee. Free events have zero platform fees permanently.",
  },
  {
    q: "Who pays the booking fee, the organiser or the buyer?",
    a: "You choose. When you create your event, you can set whether the booking fee is absorbed into your ticket price (organiser pays) or passed on as a separate line item at checkout (buyer pays). Either way, buyers always see the full amount before confirming their purchase. No surprises.",
  },
  {
    q: "What currencies do you support?",
    a: "You can price your event in Australian dollars, British pounds, US dollars, Canadian dollars, and Euros. Buyers outside your currency will see their card issuer's exchange rate applied by their bank. EventLinqs does not add a currency conversion fee.",
  },
  {
    q: "When do I get paid after my event?",
    a: "Payouts are initiated within 5 business days of your event ending, to your linked bank account. Bank processing typically adds 1 to 3 business days on top. Payouts require Stripe identity verification to be completed before your first payout can be sent.",
  },
  {
    q: "What payment methods do buyers use?",
    a: "Buyers can pay with Visa, Mastercard, and American Express credit and debit cards, as well as Apple Pay, Google Pay, and Stripe Link. Available methods vary slightly by device and browser.",
  },
  {
    q: "Do you charge a fee for refunds?",
    a: "EventLinqs does not charge a separate refund processing fee. If a refund is issued, the platform fee is refunded to the buyer. Payment processing fees charged by Stripe may not be recoverable in all cases. For events cancelled by the organiser, EventLinqs refunds the full amount including service fees.",
  },
]

export function PricingPage() {
  return (
    <PageShell>

      {/* -- 1. Hero ------------------------------------------------- */}
      <PageHero
        eyebrow="PRICING"
        title="Simple. Transparent. Fair."
        subtitle="No upfront fees. No surprise charges. Pay only when you sell paid tickets."
        align="center"
        variant="premium"
      />

      {/* -- 2. Pricing tiers ---------------------------------------- */}
      {/* Tinted band so the white tier cards have contrast and elevation,
          mirroring Eventbrite's tinted pricing bands (2026 competitor mirror)
          instead of white cards floating on a white surface. */}
      <ContentSection surface="alt" width="wide" topBorder>
        <h2 className="sr-only">Pricing tiers</h2>
        <div className="group/cards grid grid-cols-1 gap-6 md:grid-cols-3">
          {TIERS.map(tier => (
            <div
              key={tier.id}
              className={[
                'flex flex-col rounded-2xl border p-7 transition-all duration-200',
                'group-hover/cards:opacity-60 hover:!opacity-100 hover:-translate-y-0.5 hover:border-[var(--brand-accent)] hover:shadow-xl',
                tier.highlighted
                  ? 'border-[var(--brand-accent)]/50 bg-[var(--brand-accent)]/5 shadow-lg ring-1 ring-[var(--brand-accent)]/20'
                  : 'border-[var(--surface-2)] bg-[var(--surface-0)]',
              ].join(' ')}
            >
              {tier.highlighted && (
                <div className="mb-4 inline-flex items-center rounded-full bg-[var(--brand-accent)]/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[var(--brand-accent-strong)]">
                  Most popular
                </div>
              )}

              <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
                {tier.name}
              </h3>

              <div className="mt-3">
                <span className="font-display text-3xl font-extrabold text-[var(--text-primary)]">
                  {tier.price}
                </span>
                {tier.priceDetail && (
                  <span className="ml-2 text-sm text-[var(--text-secondary)]">
                    {tier.priceDetail}
                  </span>
                )}
              </div>

              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {tier.description}
              </p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {tier.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-accent)]"
                      aria-hidden="true"
                    />
                    {f}
                  </li>
                ))}
              </ul>

              {tier.cta && (
                <div className="mt-8">
                  <Button
                    href={tier.cta.href}
                    variant={tier.highlighted ? 'primary' : 'secondary'}
                    size="md"
                    className="w-full"
                  >
                    {tier.cta.label}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Fee promise. text-secondary (not muted) so it clears AA contrast on
            the tinted band - muted only passes on the white surface. */}
        <p className="mt-6 text-center text-xs text-[var(--text-secondary)]">
          Free events always have zero platform fees. The paid-ticket fee is the same for
          every event type. No setup fees, no monthly fees, no card required until you sell
          a paid ticket.
        </p>
      </ContentSection>

      {/* -- 3. FAQ -------------------------------------------------- */}
      <ContentSection surface="alt" width="prose">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
          Pricing FAQ
        </p>
        <h2 className="mb-8 font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          Common pricing questions
        </h2>

        <div className="space-y-3">
          {FAQ.map((item, i) => (
            <details
              key={i}
              className="group rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] open:shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 [&::-webkit-details-marker]:hidden">
                <span className="font-display text-base font-semibold text-[var(--text-primary)]">
                  {item.q}
                </span>
                <svg
                  className="h-5 w-5 shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="border-t border-[var(--surface-2)] px-6 pb-6 pt-4">
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                  {item.a}
                </p>
              </div>
            </details>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/help/payments-and-payouts"
            className="text-sm font-medium text-[var(--brand-accent-strong)] underline underline-offset-2 hover:text-[var(--brand-accent)] transition-colors"
          >
            More payment and payout questions &rsaquo;
          </Link>
        </div>
      </ContentSection>

      {/* -- 4. Final CTA band (light canvas, navy-on-canvas) -------- */}
      <section className="relative overflow-hidden border-t border-ink-100 bg-[var(--surface-1)] py-20 md:py-28">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, var(--brand-accent) 50%, transparent 100%)',
            opacity: 0.7,
          }}
          aria-hidden="true"
        />
        {/* Subtle warm gold tint - premium and light (Phase B touch) */}
        <div
          className="pointer-events-none absolute"
          style={{
            top: '-30%', right: '-10%', width: '60%', height: '160%',
            background: 'radial-gradient(ellipse 70% 60% at 100% 50%, var(--brand-accent), transparent 62%)',
            opacity: 0.06,
          }}
          aria-hidden="true"
        />
        <div className="relative z-10 mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-8 text-center">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold leading-tight text-[var(--text-primary)] sm:text-4xl">
                Ready to see it in action?
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
                Sign up and build your first event in minutes. No credit card required until you
                sell a ticket.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button variant="primary" size="lg" href="/organisers/signup">
                Start selling tickets
              </Button>
              <Button variant="secondary" size="lg" href="/contact?topic=organiser">
                Talk to us
              </Button>
            </div>
          </div>
        </div>
      </section>

    </PageShell>
  )
}
