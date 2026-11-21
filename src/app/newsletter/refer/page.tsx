import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { NewsletterShareButton } from '@/components/features/newsletter/newsletter-share-button'
import { getSiteUrl } from '@/lib/site-url'
import { NEWSLETTER_CITIES, newsletterShareUrl } from '@/lib/newsletter/manage'

export const metadata: Metadata = {
  title: 'Share the EventLinqs newsletter | EventLinqs',
  description: "Send a friend the newsletter: their city's best events every Wednesday and Friday, one step to join.",
  robots: { index: false, follow: true },
}

/**
 * /newsletter/refer, SHARE THE NEWSLETTER (every edition's 'Share EventLinqs' button; the PM's order of 21 November
 * 2026, about 03:30; found 404 on production at 14:58 that day). One link, the phone's share sheet or a copy, and the
 * cities a friend can choose.
 */
export default function NewsletterReferPage() {
  const url = newsletterShareUrl(getSiteUrl())
  const cities = NEWSLETTER_CITIES.map((c) => c.name)
  const list = `${cities.slice(0, -1).join(', ')} and ${cities[cities.length - 1]}`
  return (
    <PageShell staticSafe>
      <section data-page="newsletter-refer" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">The EventLinqs newsletter</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink-900 sm:text-4xl">Know someone who would love it?</h1>
        <p className="mt-4 text-base text-ink-700">
          Send them the newsletter. THE WEEK lands every Wednesday and THE WEEKEND every Friday at 7am, with the best
          events in {list}. They choose their city and join in one step.
        </p>
        <div className="mt-8 rounded-2xl border border-ink-200 bg-white p-6">
          <NewsletterShareButton url={url} />
          <p className="mt-4 break-all text-sm text-ink-600" data-share-url>
            {url}
          </p>
        </div>
        <p className="mt-8 text-sm text-ink-600">
          Not subscribed yourself?{' '}
          <Link href="/newsletter" className="font-semibold text-[var(--brand-accent-strong)] underline underline-offset-2">
            Choose your city
          </Link>
          .
        </p>
      </section>
    </PageShell>
  )
}
