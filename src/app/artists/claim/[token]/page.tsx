import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { ClaimInviteButton } from '@/components/broadcast/claim-invite-button'

export const metadata: Metadata = {
  title: 'Claim your artist profile | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

/**
 * The guest-performer claim page (SPEC 4.2): an organiser invited this
 * performer by link; claiming confirms the lineup tag and hands the
 * performer their artist profile (when unowned). One deliberate press,
 * signed in, single-use token.
 */
export default async function ClaimInvitePage({ params }: Props) {
  const { token } = await params
  if (!(await isFeatureEnabled('broadcast_artists'))) notFound()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) notFound()

  const admin = createAdminClient()
  const { data: tag } = await admin
    .from('event_artists')
    .select('id, artist:artists(name), event:events(title, slug)')
    .eq('invite_token', token)
    .maybeSingle()

  const artistName =
    (tag as { artist?: { name?: string } | null } | null)?.artist?.name ?? null
  const eventTitle =
    (tag as { event?: { title?: string } | null } | null)?.event?.title ?? null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-canvas">
      <nav className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-lg">
          <Link href="/" className="text-lg font-bold text-ink-900">EVENTLINQS</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
          {!tag ? (
            <>
              <h1 className="font-display text-2xl font-bold text-ink-900">
                This invite is not valid
              </h1>
              <p className="mt-3 text-sm text-ink-600">
                It may have already been claimed. Ask the organiser who invited you for a fresh
                link, or contact hello@eventlinqs.com.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-800">
                You are on the lineup
              </p>
              <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">
                {artistName ?? 'Your artist profile'}
              </h1>
              <p className="mt-3 text-sm text-ink-600">
                {eventTitle
                  ? `The organiser of ${eventTitle} tagged you as a performer.`
                  : 'An organiser tagged you as a performer.'}{' '}
                Claim your artist profile to appear on the event page, share your own tracked
                link, and see exactly how many people you bring through the door: numbers you
                can show the next organiser who books you.
              </p>
              <div className="mt-6">
                {user ? (
                  <ClaimInviteButton token={token} />
                ) : (
                  <Link
                    href={`/login?redirect=${encodeURIComponent(`/artists/claim/${token}`)}`}
                    className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
                  >
                    Sign in to claim
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
