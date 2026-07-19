import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { Reveal } from '@/components/ui/reveal'
import { HeroMedia, MarketingMedia } from '@/components/media'
import { OrganiserCommunityStrip } from '@/components/features/organisers/community-strip'
import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'
import { helpTopics } from '@/lib/help-content'
import { getLivePublicFee } from '@/lib/pricing/live-fee'
import { getEventFeeRates } from '@/lib/pricing/event-fee-config'
import { getPlatformStats } from '@/lib/stats/platform-stats'
import { PayoutCalculator } from '@/components/features/organisers/payout-calculator'
import { FOUNDING_OFFER } from '@/lib/organisers/founding-offer'
import { ORGANISER_TESTIMONIALS } from '@/lib/organisers/testimonials'
import {
  ORGANISER_HERO,
  ORGANISER_BANDS,
  ORGANISER_COMMUNITY_TILES,
} from '@/lib/images/organiser-photos'

/**
 * OrganisersLandingPage - /organisers (canonical; /for-organisers 308s in).
 *
 * $100K marketing-surface rebuild (Surface 6, 2026-06-07). Benchmarked frame
 * for frame against Eventbrite's organizer overview and surpassed with the
 * EventLinqs identity: navy/gold, full-bleed photographic hero, alternating
 * image+text feature bands, a real-truths stats band, a visual how-it-works,
 * the every-community tile grid (Phase B differentiator), a premium FAQ, and a
 * photographic closing CTA. Every image is a swappable slot from the licensed
 * platform photo library (src/lib/images/organiser-photos.ts).
 *
 * Motion: hero content staggers in once (LCP image static); below-fold bands
 * fade-rise via the shared Reveal primitive. Reduced-motion and headless audits
 * see the final state from first paint.
 */

// ── FAQ: a subset of the selling-tickets help topic ──────────────────────────
const SELLING_TICKETS_TOPIC = helpTopics.find(t => t.slug === 'selling-tickets')
const FAQ_QUESTIONS = [
  'What does it cost to sell tickets on EventLinqs?',
  'When do I receive my payout?',
  'Can I offer early bird pricing and multiple ticket tiers?',
  'Can I create discount codes?',
  'Can I set my own refund policy?',
  'Can I sell tickets at the door on the night?',
]
const FAQ_ARTICLES = SELLING_TICKETS_TOPIC
  ? SELLING_TICKETS_TOPIC.articles.filter(a => FAQ_QUESTIONS.includes(a.q))
  : []

// ── Real platform truths (no fabricated numbers, no fake logos) ──────────────
const STATS = [
  { stat: 'All-in', label: 'pricing', body: 'What buyers see at checkout is what they pay. Zero hidden fees, every event.' },
  { stat: '5 days', label: 'to payout', body: 'Your money lands within 5 business days of your event ending.' },
  { stat: 'Same day', label: 'to go live', body: 'Most events are approved the same business day. No gatekeeping on organisers.' },
  { stat: 'Every', label: 'community', body: 'Built for every event type and every community across Australia.' },
]

interface FeatureBand {
  eyebrow: string
  title: string
  body: string
  points: string[]
  image: { src: string; alt: string; objectPosition?: string }
  reverse?: boolean
}

// The discovery band: the first blade of the wedge, rendered directly
// after the stats band so the discovery pitch leads the page argument. Every
// point names a mechanism that exists on the platform today.
const DISCOVERY_BAND: FeatureBand = {
  eyebrow: 'Built-in discovery',
  title: 'We bring the audience, not just the checkout.',
  body: 'Every event you list goes into the discovery feed and out through push alerts to attendees who chose to hear about events like yours. Buyers see who else is going, and everyone who follows you gets your next event the moment it goes live.',
  points: [
    'A personalised discovery feed puts your event in front of the right people',
    'Push alerts land on lock screens, not in spam folders',
    'Who’s-going proof turns interest into tickets',
    'Followers get every event you publish, automatically',
  ],
  image: ORGANISER_BANDS.discovery,
}

// Band 1 (transparent fees) was promoted to a dedicated pricing-clarity band
// (PricingClarityBand) that shows the ACTUAL numbers, not just a promise.
const BANDS: FeatureBand[] = [
  {
    eyebrow: 'Event-day tools',
    title: 'Run the night without a spreadsheet in sight.',
    body: 'A live sales dashboard, your guest list, a fast door scanner, and payments built in. Everything you need to open doors with confidence and watch the room fill in real time.',
    points: [
      'Live sales and revenue dashboard',
      'Guest list and door check-in scan app',
      'Multiple tiers, early bird, and discount codes',
    ],
    image: ORGANISER_BANDS.tools,
    reverse: true,
  },
  {
    eyebrow: 'The launch kit',
    title: 'Publish, and your launch kit is in your hands.',
    body: 'Build your event and map your room in minutes, no approval gate and no sales call. The moment you publish, your complete launch kit is delivered: your live event page, a print-ready QR poster, your designed invitation card, one-tap tracked share links for every channel, and live reach numbers showing exactly where your buyers come from.',
    points: [
      'Build your event in 5 to 15 minutes, seat map included',
      'A4 QR poster and invitation card, generated for you',
      'Tracked share links for WhatsApp, Instagram, anywhere',
      'Live reach: every click and sale, attributed by channel',
      'Tag your lineup: each performer gets a profile, a place on your event page, and the exact tickets their sharing sold',
    ],
    image: ORGANISER_BANDS.selfServe,
  },
  {
    eyebrow: 'Data ownership',
    title: 'Your audience is yours to keep.',
    body: 'Every attendee relationship belongs to you, not to us. Export your full attendee list, names and emails included, any time as CSV, Excel, or a printable door list. Access is organiser-only. We never sell your list, never market another organiser to your buyers, and never withhold your data. Other platforms wall your audience off. Here you own it and you take it with you.',
    points: [
      'Full attendee list with names and emails',
      'Export as CSV, Excel, or a printable door list',
      'Email the attendees who opt in, consent recorded for you',
      'Organiser-only access, gated to you',
      'Portable forever, no withholding',
    ],
    image: ORGANISER_BANDS.dataOwnership,
    reverse: true,
  },
]

const HOW_IT_WORKS = [
  { step: 1, title: 'Create your account', detail: 'About a minute. Your name, your payout account, and you are in.' },
  { step: 2, title: 'Build your event', detail: 'Title, description, ticket tiers, and pricing. 5 to 15 minutes.' },
  { step: 3, title: 'Submit for review', detail: 'Checked against our content and safety policy. Most approved the same business day.' },
  { step: 4, title: 'Go live and sell', detail: 'Share your page anywhere. Payouts land within 5 business days of your event ending.' },
]

// ── Sub-components ───────────────────────────────────────────────────────────

function FeatureBandRow({ band }: { band: FeatureBand }) {
  return (
    <ContentSection surface={band.reverse ? 'alt' : 'base'} width="wide" reveal>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Image */}
        <div className={band.reverse ? 'lg:order-2' : ''}>
          <div className="relative aspect-[5/4] overflow-hidden rounded-2xl shadow-[0_24px_60px_-24px_rgba(10,22,40,0.35)] ring-1 ring-black/5">
            <MarketingMedia
              src={band.image.src}
              alt={band.image.alt}
              variant="band"
              objectPosition={band.image.objectPosition}
            />
          </div>
        </div>
        {/* Copy */}
        <div className={band.reverse ? 'lg:order-1' : ''}>
          <p className="mb-3 font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">
            {band.eyebrow}
          </p>
          <h2 className="font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-[var(--text-primary)] sm:text-4xl">
            {band.title}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
            {band.body}
          </p>
          <ul className="mt-6 space-y-3">
            {band.points.map(point => (
              <li key={point} className="flex items-start gap-3 text-[15px] text-[var(--text-primary)]">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-accent)]" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ContentSection>
  )
}

// ── Pricing-clarity band: the ACTUAL fee, read live from pricing_rules via
//    getLivePublicFee (displayed == charged), never invented. Two cards: free
//    events free, paid tickets one clear fee. The "what it costs" in one glance.
function PricingClarityBand({
  feeLabel,
  rates,
}: {
  feeLabel: string
  rates: Awaited<ReturnType<typeof getEventFeeRates>>
}) {
  const FREE_POINTS = ['Unlimited free events and free tickets', 'All platform features included', 'No card required to start']
  const PAID_POINTS = ['Pass it on at checkout or absorb it, your choice', 'No setup fees, no monthly fees, no lock-in', 'Multi-currency checkout, payouts via Stripe']
  return (
    <ContentSection surface="base" width="wide" topBorder reveal>
      <div className="max-w-2xl">
        <p className="mb-3 font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">
          Pricing
        </p>
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          Simple pricing. No surprises.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
          Free events are free, forever. For paid tickets, one clear fee shown from the first
          click. What your fans see at checkout is what they pay.
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-7">
          <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]">Free events</p>
          <p className="mt-3">
            <span className="font-display text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">Free forever</span>
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Zero platform fees on every free event.</p>
          <ul className="mt-5 flex-1 space-y-2.5">
            {FREE_POINTS.map(p => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-accent-strong)]" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        {/* Paid (highlighted) */}
        <div className="flex flex-col rounded-2xl border border-[var(--brand-accent)]/50 bg-[var(--brand-accent)]/5 p-7 ring-1 ring-[var(--brand-accent)]/20">
          <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]">Paid events</p>
          <p className="mt-3">
            <span className="font-display text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">{feeLabel}</span>
            <span className="ml-2 text-sm text-[var(--text-secondary)]">per paid ticket sold. That is the whole fee.</span>
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Everything in Free, plus paid-ticket selling.</p>
          <ul className="mt-5 flex-1 space-y-2.5">
            {PAID_POINTS.map(p => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-accent-strong)]" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* The signature element: a live payout calculator running the SAME pure
          fee math the checkout charges, on the SAME live rates. No competitor
          shows an organiser their exact numbers before signup; we do. */}
      <div className="mt-10">
        <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
          See your exact numbers
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
          Type your ticket price. This is the same maths and the same live rates
          the checkout uses, so what you see here is what happens on the night.
        </p>
        <div className="mt-5">
          <PayoutCalculator rates={rates} />
        </div>
      </div>

      <div className="mt-6">
        <Link
          href="/pricing"
          className="text-sm font-medium text-[var(--brand-accent-strong)] underline underline-offset-2 transition-colors hover:text-[var(--text-primary)]"
        >
          See full pricing and FAQ &rsaquo;
        </Link>
      </div>
    </ContentSection>
  )
}

// ── Live-proof strip: honest counts straight from the catalogue ─────────────
// Renders ONLY when the read is live and the numbers stand on their own
// (a thin count argues against the platform, so below the floor the strip
// simply does not exist). Composition is adaptive: each clause joins only
// when its own number clears its floor.
function LiveProofStrip({
  eventsListed,
  organisers,
  cities,
}: {
  eventsListed: number
  organisers: number | null
  cities: number | null
}) {
  const clauses: string[] = [`${eventsListed} events live right now`]
  if (cities !== null && cities >= 5) clauses.push(`across ${cities} Australian cities`)
  if (organisers !== null && organisers >= 10) clauses.push(`from ${organisers} organisers`)
  return (
    <div className="border-b border-ink-100 bg-[var(--surface-0)]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3.5 sm:px-6 lg:px-8">
        <p className="flex items-center gap-2.5 text-sm font-medium text-[var(--text-primary)]">
          <span aria-hidden className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" />
          </span>
          {clauses.join(', ')}
        </p>
        <Link
          href="/events"
          className="text-sm font-semibold text-[var(--brand-accent-strong)] transition-colors hover:text-[var(--text-primary)]"
        >
          See what&rsquo;s on &rsaquo;
        </Link>
      </div>
    </div>
  )
}

// ── Founding Organiser offer (config-driven slot) ────────────────────────────
// Content and visibility live in src/lib/organisers/founding-offer.ts so the
// founder can retire or reword the offer without touching this template.
function FoundingOfferBand() {
  if (!FOUNDING_OFFER.enabled) return null
  return (
    <ContentSection surface="base" width="wide" reveal>
      {/* Dark from a PHOTOGRAPH + navy scrim (the hero pattern), never a flat
          painted dark surface (founder-locked light-and-airy boundary). */}
      <div className="relative overflow-hidden rounded-card border border-[var(--brand-accent)]/40 shadow-[var(--shadow-modal)]">
        <div className="absolute inset-0">
          <MarketingMedia
            src={ORGANISER_BANDS.founding.src}
            alt=""
            variant="band"
            objectPosition={ORGANISER_BANDS.founding.objectPosition}
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(100deg, rgba(10,22,40,0.94) 0%, rgba(10,22,40,0.88) 55%, rgba(10,22,40,0.72) 100%)',
            }}
          />
        </div>
        <div className="relative grid gap-8 p-8 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12 lg:p-12">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
              {FOUNDING_OFFER.eyebrow}
            </p>
            <h2 className="mt-3 font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-4xl">
              {FOUNDING_OFFER.title}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/85">
              {FOUNDING_OFFER.body}
            </p>
            <ul className="mt-6 space-y-3">
              {FOUNDING_OFFER.points.map(point => (
                <li key={point} className="flex items-start gap-3 text-[15px] text-white/90">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-accent)]" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <Button variant="primary" size="lg" href={FOUNDING_OFFER.ctaHref}>
              {FOUNDING_OFFER.ctaLabel}
            </Button>
            <p className="max-w-xs text-xs leading-relaxed text-white/60 lg:text-right">
              {FOUNDING_OFFER.note}
            </p>
          </div>
        </div>
      </div>
    </ContentSection>
  )
}

// ── Testimonials (config-driven slot, hidden while empty) ────────────────────
// Renders nothing until real organisers say real things: the honest state for
// a launching platform. Content lives in src/lib/organisers/testimonials.ts.
function TestimonialsBand() {
  if (ORGANISER_TESTIMONIALS.length === 0) return null
  return (
    <ContentSection surface="alt" width="wide" topBorder reveal>
      <div className="max-w-2xl">
        <p className="mb-3 font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">
          From organisers
        </p>
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          Organisers on EventLinqs.
        </h2>
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {ORGANISER_TESTIMONIALS.map(t => (
          <figure
            key={`${t.name}-${t.organisation}`}
            className="flex flex-col rounded-card border border-[var(--surface-2)] bg-[var(--surface-0)] p-7 shadow-[var(--shadow-card)]"
          >
            <blockquote className="flex-1 text-base leading-relaxed text-[var(--text-primary)]">
              &ldquo;{t.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-5 border-t border-ink-100 pt-4">
              <p className="font-display text-sm font-bold text-[var(--text-primary)]">{t.name}</p>
              <p className="text-sm text-[var(--text-secondary)]">
                {t.role}, {t.organisation}
              </p>
            </figcaption>
          </figure>
        ))}
      </div>
    </ContentSection>
  )
}

export async function OrganisersLandingPage() {
  // Live fee from pricing_rules (same source the calculator charges), static
  // fallback inside getLivePublicFee. Displayed == charged. The full rate set
  // feeds the payout calculator; the live counts feed the proof strip.
  const [fee, rates, stats] = await Promise.all([
    getLivePublicFee(),
    getEventFeeRates({}),
    getPlatformStats(),
  ])
  const showLiveProof =
    stats.source === 'live' && stats.eventsListed !== null && stats.eventsListed >= 50
  return (
    <PageShell>

      {/* ── 1. Full-bleed photographic hero ──────────────────────────────── */}
      <section aria-labelledby="organisers-hero-heading" className="relative overflow-hidden">
        <HeroPresenceMarker />
        {/* Hero scale: marketing tier (homepage scale). A marketing hero may not
            exceed the homepage hero (Design system: Hero scale law) - this was
            an 82vh full-viewport hero that read as a generic template next to
            the platform's ~48vh chrome. */}
        <div className="hero-marketing relative w-full">
          <HeroMedia image={ORGANISER_HERO.src} alt={ORGANISER_HERO.alt} objectPosition={ORGANISER_HERO.objectPosition} priority />
          {/* Same restrained bottom-up navy scrim as the homepage hero. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, rgba(10,22,40,0.80) 0%, rgba(10,22,40,0.40) 42%, rgba(10,22,40,0.06) 78%, rgba(10,22,40,0.00) 100%)',
            }}
          />
          <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-6 pb-8 pt-20 sm:px-8 sm:pb-10 lg:px-12 lg:pb-12">
            <div className="hero-enter max-w-2xl">
              <p
                className="type-micro font-display uppercase tracking-[0.18em] text-[var(--brand-accent)]"
                style={{ fontWeight: 600 }}
              >
                For event organisers
              </p>
              <h1
                id="organisers-hero-heading"
                className="mt-2 font-headline text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl"
              >
                Build your event, map your room, get your complete promo kit.
              </h1>
              <p className="mt-2 text-sm font-semibold text-white sm:text-base">
                In minutes. Free.
              </p>
              {/* Hidden on the smallest screens: the fixed hero height fits
                  headline + fee line + CTAs at 390; the supporting copy
                  re-enters immediately in the bands below. */}
              <p className="mt-2 hidden max-w-xl text-sm text-white/85 sm:block sm:text-base">
                Then tools to expand your reach: tracked share links, a discovery
                feed, and push alerts reach a local audience that is actually
                looking, and your attendee list stays yours.
              </p>
              {/* Cost in one glance, above the fold (exact fee from the pricing
                  source, never invented). */}
              <p className="mt-3 text-sm font-semibold text-white">
                Free events are free.
                <span className="font-normal text-white/85"> Paid tickets {fee.label} each.</span>
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button variant="primary" size="lg" href="/organisers/signup">
                  Build your event free
                </Button>
                <Button variant="secondary" size="lg" onSurface="dark" href="/pricing">
                  View pricing
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Live proof strip (honest counts, hidden below the floor) ──── */}
      {showLiveProof && (
        <LiveProofStrip
          eventsListed={stats.eventsListed as number}
          organisers={stats.organisers}
          cities={stats.cities}
        />
      )}

      {/* ── 3. Stats / social-proof band (real platform truths) ──────────── */}
      <ContentSection surface="alt" width="wide" topBorder>
        <Reveal stagger as="div" className="grid grid-cols-2 gap-px overflow-hidden rounded-card bg-[var(--surface-2)] lg:grid-cols-4">
          {STATS.map(({ stat, label, body }) => (
            <div key={stat} className="bg-[var(--surface-0)] p-6 sm:p-8">
              <p className="font-display text-3xl font-extrabold leading-none tracking-tight text-[var(--brand-accent-strong)] sm:text-4xl">
                {stat}
              </p>
              <p className="mt-1 font-display text-sm font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]">
                {label}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {body}
              </p>
            </div>
          ))}
        </Reveal>
      </ContentSection>

      {/* ── 4. The demand engine (blade one of the wedge) ────────────────── */}
      <FeatureBandRow band={DISCOVERY_BAND} />

      {/* ── 5. Pricing clarity + live payout calculator ──────────────────── */}
      <PricingClarityBand feeLabel={fee.label} rates={rates} />

      {/* ── 6. Founding Organiser offer (config-driven) ──────────────────── */}
      <FoundingOfferBand />

      {/* ── 7-9. Alternating image+text feature bands ─────────────────────── */}
      {BANDS.map(band => (
        <FeatureBandRow key={band.title} band={band} />
      ))}

      {/* ── 10. Testimonials (hidden until real quotes exist) ────────────── */}
      <TestimonialsBand />

      {/* ── 6. Visual how-it-works ───────────────────────────────────────── */}
      <ContentSection surface="alt" width="wide" topBorder reveal>
        <div className="max-w-2xl">
          <p className="mb-3 font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">
            How it works
          </p>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            From sign-up to sold out in four steps.
          </h2>
        </div>

        <div className="relative mt-12">
          {/* Connecting thread (desktop). Sibling of the <ol> so the list only
              contains <li> children (valid nesting, no hydration mismatch). */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 top-6 hidden h-px lg:block"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(212,160,23,0.45) 12%, rgba(212,160,23,0.45) 88%, transparent)' }}
          />
          <Reveal stagger as="ol" className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {HOW_IT_WORKS.map(({ step, title, detail }) => (
              <li key={step} className="relative">
                <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--brand-accent)]/40 bg-[var(--surface-0)] font-display text-lg font-bold text-[var(--brand-accent-strong)] shadow-sm">
                  {step}
                </div>
                <h3 className="mt-5 font-display text-lg font-bold text-[var(--text-primary)]">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {detail}
                </p>
              </li>
            ))}
          </Reveal>
        </div>
      </ContentSection>

      {/* ── 7. Every-community tile grid (Phase B differentiator) ────────── */}
      <ContentSection surface="base" width="wide">
        <Reveal className="max-w-2xl">
          <p className="mb-3 font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">
            Who it is for
          </p>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Open to every community.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
            One platform for every scene Australia turns out for. Whatever you run, your audience
            and your tools are already here.
          </p>
        </Reveal>

        {/* Interactive-affordance law: every tile is a real working link into an
            existing scene/community/category page (no dead-end tiles). */}
        <OrganiserCommunityStrip />

        <Reveal>
          <p className="mt-8 max-w-3xl text-[15px] leading-relaxed text-[var(--text-secondary)]">
            And every event beyond a scene: weddings, birthdays and family milestones, corporate
            events and conferences, community festivals, faith gatherings, and networking nights.
            If it brings people together, it belongs here.
          </p>
        </Reveal>
      </ContentSection>

      {/* ── 8. Premium FAQ ───────────────────────────────────────────────── */}
      {FAQ_ARTICLES.length > 0 && (
        <ContentSection surface="alt" width="prose" topBorder reveal>
          <p className="mb-3 font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">
            Common questions
          </p>
          <h2 className="mb-8 font-display text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Organiser FAQ
          </h2>
          <div className="space-y-3">
            {FAQ_ARTICLES.map((article, i) => (
              <details
                key={i}
                className="group rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-shadow open:shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 [&::-webkit-details-marker]:hidden">
                  <span className="font-display text-base font-semibold text-[var(--text-primary)]">
                    {article.q}
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
                    {article.a}
                  </p>
                </div>
              </details>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/help/selling-tickets"
              className="text-sm font-medium text-[var(--brand-accent-strong)] underline underline-offset-2 transition-colors hover:text-[var(--text-primary)]"
            >
              See all organiser help articles &rsaquo;
            </Link>
          </div>
        </ContentSection>
      )}

      {/* ── 9. Photographic closing CTA band ─────────────────────────────── */}
      <section aria-labelledby="organisers-cta-heading" className="relative overflow-hidden">
        <div className="relative min-h-[420px] w-full py-24 sm:py-28">
          <HeroMedia
            image={ORGANISER_COMMUNITY_TILES[3].src}
            alt=""
            objectPosition="50% 50%"
            priority={false}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(10,22,40,0.78) 0%, rgba(10,22,40,0.72) 50%, rgba(10,22,40,0.88) 100%)',
            }}
          />
          <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-5 text-center sm:px-6">
            <p className="mb-4 font-display text-xs font-bold uppercase tracking-[0.24em] text-[var(--brand-accent)]">
              Ready to go
            </p>
            <h2
              id="organisers-cta-heading"
              className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl"
            >
              Ready to sell tickets?
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
              Sign up in minutes. No upfront fees, no approval gate. Build your first event and
              start selling straight away.
            </p>
            <div className="mt-8">
              <Button variant="primary" size="lg" href="/organisers/signup">
                Start selling tickets
              </Button>
            </div>
          </div>
        </div>
      </section>

    </PageShell>
  )
}
