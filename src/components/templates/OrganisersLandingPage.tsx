import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { Reveal } from '@/components/ui/reveal'
import { HeroMedia, MarketingMedia } from '@/components/media'
import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'
import { helpTopics } from '@/lib/help-content'
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

const BANDS: FeatureBand[] = [
  {
    eyebrow: 'Transparent fees',
    title: 'All-in pricing, so you keep more.',
    body: 'No surprise fees bolted on at the final step, the trick that loses buyers everywhere else. The price your audience sees is the price they pay, and fee caps protect their trust on every event you run.',
    points: [
      'One clear fee, shown from the first click',
      'Fee caps that protect buyer trust at scale',
      'No setup fees, no monthly fees, no lock-in',
    ],
    image: ORGANISER_BANDS.pricing,
  },
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
    eyebrow: 'Self-serve from day one',
    title: 'Sign up, build, and go live the same day.',
    body: 'No approval gate on organisers and no sales call to sit through. Create your account in about a minute, build your event, and most go live the same business day, ready to share wherever your audience already is.',
    points: [
      'Create an account in about a minute',
      'Build an event in 5 to 15 minutes',
      'Share to WhatsApp, Instagram, anywhere',
    ],
    image: ORGANISER_BANDS.selfServe,
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

export function OrganisersLandingPage() {
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
                Sell tickets. Keep more.
              </h1>
              <p className="mt-2 max-w-xl text-sm text-white/85 sm:text-base">
                All-in pricing your fans trust, real-time event-day tools, and a checkout they
                actually complete. Open to every organiser and every community in Australia.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button variant="primary" size="lg" href="/organisers/signup">
                  Start selling tickets
                </Button>
                <Button variant="secondary" size="lg" onSurface="dark" href="/pricing">
                  View pricing
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Stats / social-proof band (real platform truths) ──────────── */}
      <ContentSection surface="alt" width="wide" topBorder>
        <Reveal stagger as="div" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-[var(--surface-2)] lg:grid-cols-4">
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

      {/* ── 3-5. Alternating image+text feature bands ────────────────────── */}
      {BANDS.map(band => (
        <FeatureBandRow key={band.title} band={band} />
      ))}

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
            style={{ background: 'linear-gradient(90deg, transparent, rgba(212,164,55,0.45) 12%, rgba(212,164,55,0.45) 88%, transparent)' }}
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

        <Reveal
          stagger
          as="ul"
          className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 lg:gap-5"
        >
          {ORGANISER_COMMUNITY_TILES.map(tile => (
            <li key={tile.label}>
              {/* Card law: image alone, label below, never text on the image. */}
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl ring-1 ring-black/5">
                <MarketingMedia src={tile.src} alt={tile.alt} variant="tile" />
              </div>
              <p className="mt-2.5 font-display text-sm font-semibold text-[var(--text-primary)]">
                {tile.label}
              </p>
            </li>
          ))}
        </Reveal>

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
