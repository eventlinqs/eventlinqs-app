import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/Button'
import { isFlagEnabled } from '@/lib/flags'
import { getInviteByCode } from '@/lib/founding/invites'
import { getCity } from '@/lib/cities/data'
import { FOUNDING_INITIAL_MONTHS, FOUNDING_TERMS } from '@/lib/payments/founding-waiver'
import { SetInviteCookie } from './set-invite-cookie'

export const metadata: Metadata = {
  title: 'You are invited | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ code: string }> }

/**
 * The warm referral landing. "[Organiser] invited you to EventLinqs." States
 * the offer every organiser holds from registration, then drops the invite
 * code into a cookie and sends the visitor into signup.
 *
 * LAW 24 as ruled (26 September 2026): the invitation grants nothing the
 * visitor would not get by registering without it. It exists only as the
 * referral mechanism, so the inviter earns their extra months when this
 * organiser sells a ticket. The offer sentences are rendered from the one
 * module that holds them. "Your first event set up with you, end to end" was
 * removed that day: it cannot be true for every organiser in the country.
 */
export default async function FoundingInvitePage({ params }: Props) {
  if (!(await isFlagEnabled('launch_kit'))) redirect('/')
  const { code } = await params

  const invite = await getInviteByCode(code)
  const cityName = invite ? (getCity(invite.citySlug)?.name ?? invite.citySlug) : ''

  const invalid = !invite || invite.status !== 'pending'

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        {invalid ? (
          <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
            <h1 className="font-display text-2xl font-bold text-ink-900">This invitation is not available</h1>
            <p className="mt-3 text-sm text-ink-600">
              It may have already been used, or it has been withdrawn. You do not need it to join:{' '}
              {FOUNDING_TERMS.initial} {FOUNDING_TERMS.badge}
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
                An organiser referral
              </p>
              <h1 className="mt-2 font-headline text-2xl font-extrabold leading-tight text-white sm:text-3xl">
                {invite!.inviterName} invited you to EventLinqs.
              </h1>
            </div>
            <div className="px-8 py-7">
              <p className="text-base leading-relaxed text-ink-700">
                {invite!.inviterName} referred you from {cityName}. {FOUNDING_TERMS.initial}{' '}
                {FOUNDING_TERMS.badge} {FOUNDING_TERMS.after}
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-gold-400/50 bg-gold-100/50 px-4 py-2 text-sm font-semibold text-ink-900">
                {FOUNDING_INITIAL_MONTHS} months fee-free from the day you register
              </div>
              <ul className="mt-6 space-y-2.5 text-[15px] text-ink-700">
                <li>{FOUNDING_INITIAL_MONTHS} months completely fee-free on every paid ticket</li>
                <li>{FOUNDING_TERMS.referral}</li>
                <li>The full launch kit: live page, QR poster, share cards, live reach</li>
              </ul>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button variant="primary" size="lg" href={`/organisers/signup?invite=${invite!.code}`}>
                  Create your organiser account
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
