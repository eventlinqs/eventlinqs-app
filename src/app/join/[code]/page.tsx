import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/Button'
import { isFlagEnabled } from '@/lib/flags'
import { getInviteByCode, getFoundingCounts } from '@/lib/founding/invites'
import { getCity } from '@/lib/cities/data'

export const metadata: Metadata = {
  title: 'You are invited | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ code: string }> }

/** The invite cookie the signup flow reads to attribute a founding conversion. */
export const FOUNDING_INVITE_COOKIE = 'el_founding_invite'

/**
 * The warm founding-organiser landing. "[Organiser] invited you to
 * EventLinqs." Shows the real spots-remaining count, then drops the invite
 * code into a cookie and sends the visitor into signup. Only issuable for the
 * open cities, so the page always names a real, opening city.
 */
export default async function FoundingInvitePage({ params }: Props) {
  if (!(await isFlagEnabled('launch_kit'))) redirect('/')
  const { code } = await params

  const invite = await getInviteByCode(code)
  const counts = await getFoundingCounts()
  const cityName = invite ? (getCity(invite.citySlug)?.name ?? invite.citySlug) : ''

  const invalid = !invite || invite.status !== 'pending'

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        {invalid ? (
          <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
            <h1 className="font-display text-2xl font-bold text-ink-900">This invitation is not available</h1>
            <p className="mt-3 text-sm text-ink-600">
              It may have already been used, or it has been withdrawn. If you were expecting to join as a
              founding organiser, ask the person who invited you for a fresh link.
            </p>
            <Link
              href="/organisers"
              className="mt-6 inline-block rounded-full bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800"
            >
              See what organisers get
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gold-400/50 bg-white shadow-[var(--shadow-card)]">
            <div className="bg-[#0A1628] px-8 py-6">
              <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
                A founding invitation
              </p>
              <h1 className="mt-2 font-headline text-2xl font-extrabold leading-tight text-white sm:text-3xl">
                {invite!.inviterName} invited you to EventLinqs.
              </h1>
            </div>
            <div className="px-8 py-7">
              <p className="text-base leading-relaxed text-ink-700">
                You have been invited to join the first {String(50)} Founding Organisers in {cityName}. Founding
                Organisers pay no platform fee for 6 months, get their first event set up with the founder, and
                shape what we build next.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-gold-400/50 bg-gold-100/50 px-4 py-2 text-sm font-semibold text-ink-900">
                {counts.spotsRemaining > 0 ? (
                  <>{counts.spotsRemaining} of {String(50)} founding spots left</>
                ) : (
                  <>All {String(50)} founding spots are taken right now</>
                )}
              </div>
              <ul className="mt-6 space-y-2.5 text-[15px] text-ink-700">
                <li>6 months completely fee-free on every paid ticket</li>
                <li>3 more fee-free months for every organiser you refer</li>
                <li>Your first event set up with you, end to end</li>
                <li>The full launch kit: live page, QR poster, share cards, live reach</li>
              </ul>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button variant="primary" size="lg" href={`/organisers/signup?invite=${invite!.code}`}>
                  Claim your founding spot
                </Button>
                <Link href="/organisers" className="text-sm font-medium text-[var(--brand-accent-strong)] underline underline-offset-2 hover:text-ink-900">
                  See everything first
                </Link>
              </div>
              <SetInviteCookie code={invite!.code} />
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}

/** Server component that stamps the invite cookie so signup can attribute the
 * founding conversion. A first-party, short-lived, path-wide cookie. */
async function SetInviteCookie({ code }: { code: string }) {
  const store = await cookies()
  store.set(FOUNDING_INVITE_COOKIE, code, {
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
    sameSite: 'lax',
    httpOnly: false,
  })
  return null
}
