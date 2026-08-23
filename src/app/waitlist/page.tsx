import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { HeroMedia, MarketingMedia } from '@/components/media'
import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'
import { Button } from '@/components/ui/Button'
import { isFlagEnabled } from '@/lib/flags'
import { getCityPhoto } from '@/lib/images/city-photo'
import { WAITLIST_HERO, WAITLIST_ORGANISER_BAND } from '@/lib/images/waitlist-photos'
import { getWaitlistCities } from '@/lib/waitlist/city-waitlist'
import { WaitlistClient, type WaitlistCityWithImage } from './waitlist-client'

export const metadata: Metadata = {
  title: 'Local event alerts | EventLinqs',
  description:
    'EventLinqs is open in every Australian city and state today. Pick your city and we will email you when there is something on near you.',
  alternates: { canonical: '/waitlist' },
}

export const revalidate = 3600

/**
 * Local event alerts, nationwide.
 *
 * This route used to be the CITY WAITLIST: a launch queue whose hero read
 * "Your city is on the way" and whose promise was one email "when your city
 * opens". The founder ruling of 2026-08-23 opened every city and state from
 * day one, which made that promise both false and unfulfillable.
 *
 * The URL is deliberately KEPT rather than removed or redirected: it may
 * already be printed on posters and shared in DMs, and a dead link is worse
 * than a repurposed page. What it captures now is a person's city so we can
 * tell them when something is on near them, which is the demand engine's job
 * and feeds the same audience as the digest opt-in at checkout.
 *
 * NO CADENCE IS PROMISED ANYWHERE ON THIS PAGE. A weekly rhythm is not one the
 * platform can honour yet and a thin digest burns the subscriber, so the
 * promise is "when there is something on", and it tightens to a rhythm on its
 * own once there is enough to send.
 */
export default async function WaitlistPage() {
  if (!(await isFlagEnabled('launch_kit'))) {
    redirect('/')
  }

  const cities = getWaitlistCities()
  const withImages: WaitlistCityWithImage[] = await Promise.all(
    cities.map(async city => ({
      ...city,
      image: await getCityPhoto(city.slug),
    })),
  )

  return (
    <PageShell>
      {/* ── 1. Full-bleed photographic hero ──────────────────────────────── */}
      <section aria-labelledby="waitlist-hero-heading" className="relative overflow-hidden">
        <HeroPresenceMarker />
        <div className="hero-marketing relative w-full">
          <HeroMedia
            image={WAITLIST_HERO.src}
            alt={WAITLIST_HERO.alt}
            objectPosition={WAITLIST_HERO.objectPosition}
            priority
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, rgba(10,22,40,0.84) 0%, rgba(10,22,40,0.54) 20%, rgba(10,22,40,0.24) 44%, rgba(10,22,40,0.06) 68%, rgba(10,22,40,0) 88%)',
            }}
          />
          <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-6 pb-8 pt-20 sm:px-8 sm:pb-10 lg:px-12 lg:pb-12">
            <div className="hero-enter max-w-2xl">
              <p
                className="type-micro font-display uppercase tracking-[0.18em] text-[var(--brand-accent)]"
                style={{ fontWeight: 600 }}
              >
                EventLinqs across Australia
              </p>
              <h1
                id="waitlist-hero-heading"
                className="mt-2 font-headline text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl"
              >
                What&rsquo;s on near you.
              </h1>
              <p className="mt-2 max-w-xl text-sm text-white/85 sm:text-base">
                EventLinqs is open in every Australian city and state today. Pick your city and
                we&rsquo;ll email you when there&rsquo;s something on near you.
              </p>
              <div className="mt-5">
                <Button variant="primary" size="lg" href="#choose-your-city">
                  Choose your city
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. City chooser + join form ──────────────────────────────────── */}
      <ContentSection surface="base" width="wide" reveal>
        <div id="choose-your-city" className="max-w-2xl scroll-mt-24">
          <p className="mb-3 font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">
            Local alerts
          </p>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Every city in Australia. Pick yours.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
            We email you when there is something on near you, nothing else, and one click stops
            it. Organisers who sign up are candidates for the invite-only Founding Organiser
            programme.
          </p>
        </div>
        <div className="mt-10">
          <WaitlistClient cities={withImages} />
        </div>
      </ContentSection>

      {/* ── 3. Organiser invitation band (image-rich, Law 4) ─────────────── */}
      <ContentSection surface="alt" width="wide" topBorder reveal>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <div className="relative aspect-[5/4] overflow-hidden rounded-2xl shadow-[0_24px_60px_-24px_rgba(10,22,40,0.35)] ring-1 ring-black/5">
              <MarketingMedia
                src={WAITLIST_ORGANISER_BAND.src}
                alt={WAITLIST_ORGANISER_BAND.alt}
                variant="band"
                objectPosition={WAITLIST_ORGANISER_BAND.objectPosition}
              />
            </div>
          </div>
          <div>
            <p className="mb-3 font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">
              Run events?
            </p>
            <h2 className="font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-[var(--text-primary)] sm:text-4xl">
              You can sell today, anywhere in Australia.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
              Every city, every state, from day one. Build your event, map your room, and get
              your complete promo kit, in minutes, free. There is no queue and no city to wait
              for.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button variant="primary" size="lg" href="/organisers/signup">
                Build your event free
              </Button>
              <Button variant="secondary" size="lg" href="/organisers">
                See the organiser tools
              </Button>
            </div>
          </div>
        </div>
      </ContentSection>
    </PageShell>
  )
}
