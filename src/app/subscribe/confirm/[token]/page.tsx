import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { contactAddress } from '@/lib/email/sender'
import { cityNewsletterConsentWording } from '@/lib/consent/wording'
import { maskAddress } from '@/lib/listings/claim'
import { readConfirmLink, type ConfirmLink } from '@/lib/newsletter/confirm'
import { CONFIRM_LINK_DAYS } from '@/lib/newsletter/confirm-token'
import { confirmCityGuideAction } from './actions'

export const metadata: Metadata = {
  title: 'Confirm your weekly guide | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

/**
 * Public, no-login confirmation of a city's weekly guide (Release 2, item 8: double opt in). Opening the page changes
 * nothing; it shows the person exactly what they asked for (the city, the words the panel showed, the address, masked
 * as the claim page masks it, since anyone holding the link sees this page) and one Confirm button, a server action.
 * Drawn on the digest unsubscribe page's pattern so the two ends of the list look like one thing.
 */
export default async function ConfirmCityGuidePage({ params }: Props) {
  const { token } = await params
  let link: ConfirmLink
  try {
    link = await readConfirmLink(createAdminClient(), token)
  } catch (error) {
    console.error('[subscribe/confirm] the link could not be checked:', error instanceof Error ? error.message : String(error))
    link = { state: 'unavailable' }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <nav className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-lg">
          <Link href="/" className="text-lg font-bold text-ink-900">EVENTLINQS</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
          {link.state === 'waiting' ? (
            <>
              <h1 className="font-display text-2xl font-bold text-ink-900">
                Confirm your weekly {link.request.cityName} guide
              </h1>
              <p className="mt-3 text-sm text-ink-600">You asked for this on EventLinqs:</p>
              <p className="mt-2 text-sm font-semibold text-ink-900">
                {cityNewsletterConsentWording(link.request.cityName)}
              </p>
              <p className="mt-3 text-sm text-ink-600">
                It goes to {maskAddress(link.request.email) ?? 'your address'}, and every edition carries a link to stop it.
              </p>
              <form action={confirmCityGuideAction.bind(null, token)} className="mt-6">
                <button
                  type="submit"
                  className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
                >
                  Confirm my weekly guide
                </button>
              </form>
            </>
          ) : link.state === 'confirmed' ? (
            <>
              <h1 className="font-display text-2xl font-bold text-ink-900">
                You are on the {link.request.cityName} list
              </h1>
              <p className="mt-3 text-sm text-ink-600">
                Your weekly guide starts with the next edition. Every edition carries a link to stop it whenever you like.
              </p>
              <Link
                href={`/city/${link.request.citySlug}`}
                className="mt-6 inline-block rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800"
              >
                See what&apos;s on in {link.request.cityName}
              </Link>
            </>
          ) : link.state === 'expired' ? (
            <>
              <h1 className="font-display text-2xl font-bold text-ink-900">This link has expired</h1>
              <p className="mt-3 text-sm text-ink-600">
                Confirmation links work for {CONFIRM_LINK_DAYS} days. Ask for the weekly guide again on your city&apos;s
                page and we will send a fresh one.
              </p>
              <Link
                href="/cities"
                className="mt-6 inline-block rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800"
              >
                Find your city
              </Link>
            </>
          ) : link.state === 'unavailable' ? (
            <>
              <h1 className="font-display text-2xl font-bold text-ink-900">We could not check this link just now</h1>
              <p className="mt-3 text-sm text-ink-600">
                Please try again shortly. If it keeps happening, contact us at {contactAddress('hello')}.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold text-ink-900">This link is not valid</h1>
              <p className="mt-3 text-sm text-ink-600">
                This confirmation link could not be read. It may have been copied only in part. Ask for the weekly guide
                again on your city&apos;s page and we will send a fresh one.
              </p>
              <Link
                href="/cities"
                className="mt-6 inline-block rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800"
              >
                Find your city
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
