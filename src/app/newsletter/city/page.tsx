import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { CityNewsletterCapture } from '@/components/features/city/city-newsletter-capture'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSupabaseServiceRoleKey } from '@/lib/supabase/env'
import { cityNewsletterConsentWording } from '@/lib/consent/wording'
import { NEWSLETTER_CITIES, maskEmail, newsletterCity, readNewsletterSubscriber, type NewsletterSubscriber } from '@/lib/newsletter/manage'
import { changeNewsletterCityAction } from './actions'

export const metadata: Metadata = {
  title: 'Manage your newsletter | EventLinqs',
  description: 'Choose the city your EventLinqs newsletter covers, or leave it in one press.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ t?: string; saved?: string; error?: string }> }

const ERRORS: Record<string, string> = {
  link: 'This link does not open anyone’s settings. Use the Manage preferences link at the foot of your latest edition, or subscribe below.',
  city: 'That city has no edition yet. Choose one of the four below.',
  busy: 'Too many changes from this network just now. Try again in a few minutes.',
  read: 'Your settings could not be read just now. Try again in a minute.',
  save: 'Your new city could not be saved just now. Nothing changed. Try again in a minute.',
  unsubscribed: 'You left the newsletter, so there is no city to change. Subscribe again below.',
}

const BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)] transition hover:bg-[var(--brand-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]'
const QUIET = 'font-semibold text-[var(--brand-accent-strong)] underline underline-offset-2'

/**
 * /newsletter/city, MANAGE PREFERENCES (every edition's footer link; the PM's order of 21 November 2026, about 03:30).
 * With the token their edition carries, a reader sees their city and moves it in one press, or leaves; without one, or
 * with one that names nobody, the page offers the one step subscribe and the signed in path, never a dead end.
 * Interests are not offered: no edition reads them yet, and a setting nothing reads is a control that does nothing.
 */
export default async function NewsletterManagePage({ searchParams }: Props) {
  const sp = await searchParams
  let reader: NewsletterSubscriber | null = null
  let unreadable = false
  if (sp.t && getSupabaseServiceRoleKey()) {
    try {
      reader = await readNewsletterSubscriber(createAdminClient(), sp.t)
    } catch (error) {
      unreadable = true
      console.error('[newsletter-manage] the reader could not be read:', error instanceof Error ? error.message : error)
    }
  }
  const error = unreadable ? ERRORS.read : sp.error ? ERRORS[sp.error] ?? null : sp.t && !reader ? ERRORS.link : null
  const saved = newsletterCity(sp.saved)
  const current = reader ? newsletterCity(reader.citySlug) : null

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main data-page="newsletter-manage" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">The EventLinqs newsletter</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink-900 sm:text-4xl">Manage your newsletter</h1>

        {error ? (
          <p role="alert" data-manage-error className="mt-6 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-700">
            {error}
          </p>
        ) : null}
        {saved && reader?.subscribed ? (
          <p role="status" data-manage-saved className="mt-6 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-700">
            Saved. Your next edition is for {saved.name}.
          </p>
        ) : null}

        {reader?.subscribed ? (
          <section data-manage="subscribed" aria-label="Your city" className="mt-8 rounded-2xl border border-ink-200 bg-white p-6 sm:p-8">
            <p className="text-sm text-ink-600">
              Sent to <span className="font-semibold text-ink-900">{maskEmail(reader.email)}</span>
              {current ? <>, for <span className="font-semibold text-ink-900">{current.name}</span></> : null}.
            </p>
            <h2 className="mt-6 font-display text-xl font-bold text-ink-900">Choose your city</h2>
            <form action={changeNewsletterCityAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="t" value={sp.t} />
              {NEWSLETTER_CITIES.map((c) => (
                <div key={c.slug} data-city={c.slug} className="rounded-xl border border-ink-200 p-4">
                  <p className="font-display text-base font-bold text-ink-900">{c.name}</p>
                  <p className="mt-1 text-sm text-ink-600">{cityNewsletterConsentWording(c.name)}</p>
                  {current?.slug === c.slug ? (
                    <p className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-ink-900">Your city now</p>
                  ) : (
                    <button type="submit" name="city" value={c.slug} className={`mt-3 ${BUTTON}`}>
                      Switch to {c.name}
                    </button>
                  )}
                </div>
              ))}
            </form>
            <p className="mt-8 text-sm text-ink-600">
              Want to leave instead?{' '}
              <Link href={`/unsubscribe/digest/${sp.t}`} className={QUIET}>
                Unsubscribe
              </Link>{' '}
              in one press. Your tickets and account are not affected.
            </p>
            <p className="mt-3 text-sm text-ink-600">
              Know someone who would like it?{' '}
              <Link href="/newsletter/refer" className={QUIET}>
                Share the newsletter
              </Link>
            </p>
          </section>
        ) : (
          <section data-manage="subscribe" aria-label="Subscribe" className="mt-8">
            <p className="max-w-2xl text-base text-ink-700">
              Every edition carries its own Manage preferences link at the foot, which opens your settings here. Not
              subscribed yet? Choose your city and it is done in one step.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {NEWSLETTER_CITIES.map((c) => (
                <div key={c.slug} data-city={c.slug} className="rounded-2xl border border-ink-200 bg-white p-5">
                  <CityNewsletterCapture cityName={c.name} tone="light" />
                </div>
              ))}
            </div>
            <p className="mt-8 text-sm text-ink-600">
              Signed in to EventLinqs?{' '}
              <Link href="/account/notifications" className={QUIET}>
                Manage every email in your account
              </Link>
              . Or read{' '}
              <Link href="/newsletter" className={QUIET}>
                about the newsletter
              </Link>
              .
            </p>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
