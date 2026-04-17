import { CheckCircle2 } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'

/**
 * PricingPage - /pricing
 *
 * NOTE ON FEE NUMBERS: The placeholder rates below ("From 2.9% + AUD 0.59 per paid ticket")
 * need to be reviewed and confirmed by Lawal before launch. The actual fee structure is
 * database-driven via the pricing_rules table and payment-calculator.ts. The copy on this
 * page should reflect whatever rates are configured in the admin panel once those are locked.
 *
 * Session 2a: initial build.
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
    // NOTE: Placeholder rate. Update to reflect pricing_rules config before launch.
    price: 'From 2.9% + AUD 0.59',
    priceDetail: 'per paid ticket sold',
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
      <ContentSection surface="base" width="wide">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {TIERS.map(tier => (
            <div
              key={tier.id}
              className={[
                'flex flex-col rounded-2xl border p-7',
                tier.highlighted
                  ? 'border-[var(--brand-accent)]/50 bg-[var(--brand-accent)]/5 shadow-lg ring-1 ring-[var(--brand-accent)]/20'
                  : 'border-[var(--surface-2)] bg-[var(--surface-0)]',
              ].join(' ')}
            >
              {tier.highlighted && (
                <div className="mb-4 inline-flex items-center rounded-full bg-[var(--brand-accent)]/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[var(--brand-accent)]">
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

        {/* Disclaimer note */}
        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          All fees shown are indicative. Actual rates are configured in the organiser dashboard
          and may vary by event type. Free events always have zero platform fees.
        </p>
      </ContentSection>

      {/* -- 3. FAQ -------------------------------------------------- */}
      <ContentSection surface="alt" width="prose">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
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
          <a
            href="/help/payments-and-payouts"
            className="text-sm font-medium text-[var(--brand-accent)] underline underline-offset-2 hover:text-[var(--brand-accent-hover)] transition-colors"
          >
            More payment and payout questions &rsaquo;
          </a>
        </div>
      </ContentSection>

      {/* -- 4. Final CTA band --------------------------------------- */}
      <section className="relative overflow-hidden bg-[var(--surface-dark)] py-20 md:py-28">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, var(--brand-accent) 50%, transparent 100%)',
            opacity: 0.6,
          }}
          aria-hidden="true"
        />
        <div className="relative z-10 mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-8 text-center">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold leading-tight text-white sm:text-4xl">
                Ready to see it in action?
              </h2>
              <p className="mt-4 text-base leading-relaxed text-white/65">
                Sign up and build your first event in minutes. No credit card required until you
                sell a ticket.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button variant="primary" size="lg" onSurface="dark" href="/organisers/signup">
                Start selling tickets
              </Button>
              <Button variant="secondary" size="lg" onSurface="dark" href="/contact?topic=organiser">
                Talk to us
              </Button>
            </div>
          </div>
        </div>
      </section>

    </PageShell>
  )
}
