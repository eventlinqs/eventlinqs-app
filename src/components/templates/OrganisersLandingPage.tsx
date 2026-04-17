import {
  Zap,
  BarChart3,
  Users,
  CheckCircle2,
} from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { ButtonPair } from '@/components/ui/ButtonPair'
import { helpTopics } from '@/lib/help-content'

/**
 * OrganisersLandingPage - /organisers
 *
 * Self-serve organiser landing page. Reflects Decision A (self-serve, no approval gates)
 * and Decision B (open to every community, culturally-rooted brand).
 *
 * Uses a custom hero section (rather than PageHero) to support the ButtonPair CTA.
 * The premium styling mirrors PageHero variant="premium".
 *
 * Session 2a: initial build.
 */

// Pull a subset of selling-tickets Q&As for the inline FAQ
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

const PILLARS = [
  {
    icon: Zap,
    title: 'All-in pricing',
    body: 'What the buyer sees at checkout is what they pay. No surprise fees at the final step. Fee caps protect buyer trust across every event on the platform.',
  },
  {
    icon: BarChart3,
    title: 'Real-time tools',
    body: 'Sales dashboard, guest list, check-in scan app, and payment integration. Everything you need to run the event day without a spreadsheet in sight.',
  },
  {
    icon: Users,
    title: 'Self-serve from day one',
    body: 'Sign up in minutes. Build your event. Submit for review. Go live. Most events are approved the same business day. No gatekeeping on organisers.',
  },
]

const HOW_IT_WORKS = [
  {
    step: 1,
    title: 'Create your organiser account',
    detail: 'Takes about 1 minute. Your name, your payout account, and you are in.',
  },
  {
    step: 2,
    title: 'Build your event',
    detail: 'Event title, description, ticket tiers, and pricing. Takes 5 to 15 minutes depending on complexity.',
  },
  {
    step: 3,
    title: 'Submit for review',
    detail: 'Every event is reviewed against our content and safety policy. Most are approved the same business day.',
  },
  {
    step: 4,
    title: 'Go live and sell tickets',
    detail: 'Your event page is live. Share it on WhatsApp, Instagram, or wherever your audience is. Payouts land within 5 business days of your event ending.',
  },
]

export function OrganisersLandingPage() {
  return (
    <PageShell>

      {/* -- 1. Custom hero (premium styling, ButtonPair CTA) -------- */}
      <section
        className="relative bg-[var(--color-navy-950)] text-white py-24 md:py-32 lg:py-40 overflow-hidden"
        aria-labelledby="organisers-hero-heading"
      >
        {/* Radial gradient - accent glow top-right */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(ellipse 80% 60% at 100% 0%, var(--color-gold-400, #E8B738) 12%, transparent 60%)',
          }}
        />
        {/* Secondary radial - soft white glow bottom-left */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(ellipse 60% 50% at 0% 100%, white 5%, transparent 50%)',
          }}
        />
        {/* Grid overlay */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '100px 100px',
          }}
        />
        {/* Thin accent bar at bottom */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0"
          style={{
            height: '2px',
            backgroundImage: 'linear-gradient(90deg, transparent, rgba(232, 183, 56, 0.5) 50%, transparent)',
          }}
        />

        <div className="relative z-10 mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
          <p className="mb-4 font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-gold-400)]">
            For Event Organisers
          </p>
          <h1
            id="organisers-hero-heading"
            className="font-display font-bold leading-[1.05] tracking-tight text-white text-4xl md:text-6xl lg:text-7xl max-w-4xl"
            style={{ textShadow: '0 2px 24px rgb(0 0 0 / 0.35)' }}
          >
            Sell tickets. Keep more.
          </h1>
          <p className="mt-5 text-lg md:text-xl text-white/70 max-w-2xl">
            Transparent fees, real-time analytics, squad booking, and a checkout your fans will
            actually complete. Built for organisers who take their events seriously.
          </p>
          <div className="mt-8">
            <ButtonPair
              primary={
                <Button variant="primary" size="lg" onSurface="dark" href="/organisers/signup">
                  Start selling tickets
                </Button>
              }
              secondary={
                <Button variant="secondary" size="lg" onSurface="dark" href="/pricing">
                  View pricing
                </Button>
              }
            />
          </div>
        </div>
      </section>

      {/* -- 2. Value pillars ---------------------------------------- */}
      <ContentSection surface="alt" width="default" topBorder>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-accent)]/10 transition-colors group-hover:bg-[var(--brand-accent)]/15">
                <Icon className="h-6 w-6 text-[var(--brand-accent)]" aria-hidden="true" />
              </div>
              <h3 className="mt-4 inline-block border-b-2 border-[var(--brand-accent)]/30 pb-0.5 text-base font-semibold text-[var(--text-primary)] transition-colors group-hover:border-[var(--brand-accent)]/70">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {body}
              </p>
            </div>
          ))}
        </div>
      </ContentSection>

      {/* -- 3. How it works ----------------------------------------- */}
      <ContentSection surface="base" width="default">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
            How it works
          </p>
          <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            From sign-up to sold out in four steps.
          </h2>
        </div>

        <ol className="mt-10 space-y-8 md:space-y-0 md:grid md:grid-cols-2 md:gap-8 lg:grid-cols-4 lg:gap-6">
          {HOW_IT_WORKS.map(({ step, title, detail }) => (
            <li key={step} className="flex gap-4 md:flex-col md:gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent)]/10 text-sm font-bold text-[var(--brand-accent)]">
                {step}
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                  {title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </ContentSection>

      {/* -- 4. Open to every community ------------------------------ */}
      <ContentSection surface="alt" width="default">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
            Who can use EventLinqs
          </p>
          <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            Open to every community.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
            EventLinqs was built with African culture and diaspora communities in mind, and that
            shows in everything we do. But our platform is open to every organiser and every
            community. Weddings, birthday parties, cultural festivals, concerts, corporate events,
            conferences, faith events. If it brings people together, it belongs here.
          </p>

          <ul className="mt-6 space-y-2">
            {[
              'Afrobeats and Amapiano nights',
              'Gospel concerts and faith events',
              'Owambe celebrations and cultural ceremonies',
              'Caribbean fetes and independence galas',
              'Diaspora business summits and networking events',
              'Weddings, birthdays, and family milestones',
              'Corporate events and conferences',
              'Any event that brings a community together',
            ].map(item => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-accent)]"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </ContentSection>

      {/* -- 5. FAQ -------------------------------------------------- */}
      {FAQ_ARTICLES.length > 0 && (
        <ContentSection surface="base" width="prose">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
            Common questions
          </p>
          <h2 className="mb-8 font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            Organiser FAQ
          </h2>
          <div className="space-y-3">
            {FAQ_ARTICLES.map((article, i) => (
              <details
                key={i}
                className="group rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] open:shadow-sm"
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
            <a
              href="/help/selling-tickets"
              className="text-sm font-medium text-[var(--brand-accent)] underline underline-offset-2 hover:text-[var(--brand-accent-hover)] transition-colors"
            >
              See all organiser help articles &rsaquo;
            </a>
          </div>
        </ContentSection>
      )}

      {/* -- 6. Final CTA band --------------------------------------- */}
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
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
                Ready to go
              </p>
              <h2 className="font-display text-3xl font-bold leading-tight text-white sm:text-4xl">
                Ready to sell tickets?
              </h2>
              <p className="mt-4 text-base leading-relaxed text-white/65">
                Sign up in minutes. No upfront fees. No approval gate on organisers. Start
                building your first event straight away.
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              onSurface="dark"
              href="/organisers/signup"
            >
              Start selling tickets
            </Button>
          </div>
        </div>
      </section>

    </PageShell>
  )
}
