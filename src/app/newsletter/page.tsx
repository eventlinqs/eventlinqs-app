import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { HeroMedia } from '@/components/media/HeroMedia'
import { HeroCaption } from '@/components/media/hero-caption'
import { CityTileImage } from '@/components/media/CityTileImage'
import { CityNewsletterCapture } from '@/components/features/city/city-newsletter-capture'
import { getSpineCity } from '@/lib/images/spine'
import { getCityHeroPhoto } from '@/lib/images/city-photo'
import { NEWSLETTER_CITIES } from '@/lib/newsletter/manage'

export const metadata: Metadata = {
  title: 'The EventLinqs newsletter: your city’s best events, twice a week | EventLinqs',
  description:
    'THE WEEK every Wednesday and THE WEEKEND every Friday at 7am: the best events in Melbourne, Geelong, Ballarat and Bendigo, picked for you. Free, one step to join, one press to leave.',
  alternates: { canonical: '/newsletter' },
}

/** One read of the cities' photographs; the page is the same for every visitor. */
export const revalidate = 3600

const EDITIONS: readonly { readonly name: string; readonly when: string; readonly what: string }[] = [
  { name: 'THE WEEK', when: 'Every Wednesday, 7am', what: 'The week ahead in your city: the nights worth booking now, the free things to do, and what has just gone on sale.' },
  { name: 'THE WEEKEND', when: 'Every Friday, 7am', what: 'This weekend, picked: the one not to miss, the best free day out, a hidden gem and one worth the drive.' },
]

const QUIET = 'font-semibold text-[var(--brand-accent-strong)] underline underline-offset-2'

/**
 * /newsletter, THE NEWSLETTER'S OWN PAGE (law 45: THE WEEK on Wednesday 07:00 and THE WEEKEND on Friday 07:00 per city;
 * the PM's order of 21 November 2026, about 03:30; found 404 on production at 14:58 that day). What each edition is, the
 * four cities that have one, and the one step subscribe the city guide uses (law 50: the press subscribes; consent is
 * recorded at the press by /api/newsletter/subscribe). Law 4: photographic, the platform's own licensed city
 * photographs (src/lib/images/spine.ts and city-photo.ts), each tile opening its city's guide.
 */
export default async function NewsletterPage() {
  const hero = getSpineCity('melbourne')
  const photos = await Promise.all(NEWSLETTER_CITIES.map(async (c) => ({ ...c, image: await getCityHeroPhoto(c.slug) })))
  return (
    <PageShell staticSafe>
      <section aria-labelledby="newsletter-hero-heading" className="hero-marketing relative flex items-end overflow-hidden bg-[var(--color-navy-950)]">
        {hero ? <HeroMedia image={hero.src} alt="Melbourne's skyline at sunrise" objectPosition="50% 45%" /> : null}
        <div className="hero-scrim-top" aria-hidden />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
          <HeroCaption className="max-w-2xl" contentClassName="hero-enter">
            <p className="type-eyebrow font-display text-[var(--brand-accent)]">The EventLinqs newsletter</p>
            <h1 id="newsletter-hero-heading" className="mt-3 font-headline text-3xl font-extrabold tracking-[-0.015em] text-white sm:text-4xl lg:text-5xl">
              Your city&apos;s best events, in your inbox
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
              Two short editions a week, picked from every event listed in your city. Free, and one press to leave.
            </p>
          </HeroCaption>
        </div>
      </section>

      <section aria-label="The two editions" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-2">
          {EDITIONS.map((e) => (
            <div key={e.name} data-edition={e.name} className="rounded-2xl border border-ink-200 bg-white p-6">
              <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">{e.when}</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-ink-900">{e.name}</h2>
              <p className="mt-2 text-base text-ink-700">{e.what}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="newsletter-cities-heading" className="border-t border-ink-200 bg-[var(--surface-1)]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <h2 id="newsletter-cities-heading" className="type-rail-heading font-display uppercase text-ink-900">
            Choose your city
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {photos.map((c) => (
              <div key={c.slug} data-city={c.slug} className="flex flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white">
                <Link href={`/city/${c.slug}`} className="group block" aria-label={`What's on in ${c.name}`}>
                  <span className="relative block aspect-[16/10] w-full overflow-hidden bg-ink-200">
                    {c.image ? <CityTileImage src={c.image} alt={`${c.name}`} layout="grid-two-three-four" /> : null}
                  </span>
                  <span className="block px-5 pt-4 font-display text-lg font-bold text-ink-900 group-hover:underline">{c.name}</span>
                </Link>
                <div className="px-5 pb-5 pt-2">
                  <CityNewsletterCapture cityName={c.name} tone="light" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Already subscribed" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="text-base text-ink-700">
          Already subscribed? The Manage preferences link at the foot of every edition opens{' '}
          <Link href="/newsletter/city" className={QUIET}>
            your settings
          </Link>
          , where you can move to another city. Know someone who would like it?{' '}
          <Link href="/newsletter/refer" className={QUIET}>
            Share the newsletter
          </Link>
          .
        </p>
      </section>
    </PageShell>
  )
}
