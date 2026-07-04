import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { EnableAlerts } from '@/components/notifications/enable-alerts'
import { ChannelPrefs } from '@/components/notifications/channel-prefs'
import { DigestPrefs } from '@/components/notifications/digest-prefs'
import { FollowButton } from '@/components/features/follow/follow-button'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { normaliseConsentEmail } from '@/lib/consent/wording'

export const metadata: Metadata = {
  title: 'Notifications | EventLinqs',
  description: 'Choose how EventLinqs keeps you posted: push, email, the weekly digest, and who you follow.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * The notification preference centre (Broadcast Layer SPEC 3.5): one clean
 * screen governing push, email and quiet hours, the weekly digest, and
 * follows. A trust surface: everything here is honest, instant, and
 * reversible.
 */
export default async function NotificationsSettingsPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    redirect('/login?next=/account/notifications')
  }
  const user = data.user

  const [digestOn, followOn] = await Promise.all([
    isFeatureEnabled('broadcast_digest'),
    isFeatureEnabled('broadcast_follow'),
  ])

  const admin = createAdminClient()

  // Digest consent state for this user's email (service role read: email is
  // the durable consent key across guest and member purchases).
  let digestConsented = false
  let digestCity: string | null = null
  let cities: { slug: string; name: string }[] = []
  if (digestOn && user.email) {
    const [{ data: consent }, { data: cityRows }] = await Promise.all([
      admin
        .from('marketing_consents')
        .select('status, city_slug')
        .eq('email', normaliseConsentEmail(user.email))
        .maybeSingle(),
      admin
        .from('cities')
        .select('slug, name')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
    ])
    digestConsented = consent?.status === 'granted'
    digestCity = consent?.city_slug ?? null
    cities = (cityRows ?? []) as { slug: string; name: string }[]
  }

  // Followed organisers and artists (for the follows section).
  let followedOrganisations: { id: string; name: string }[] = []
  let followedArtists: { id: string; name: string }[] = []
  if (followOn) {
    const [{ data: orgFollows }, { data: artistFollows }] = await Promise.all([
      supabase
        .from('saved_organisers')
        .select('organisation:organisations(id, name)')
        .eq('user_id', user.id),
      supabase
        .from('follows')
        .select('followable_id')
        .eq('user_id', user.id)
        .eq('followable_type', 'artist'),
    ])
    // PostgREST may type (and in ambiguous-FK cases return) the to-one join
    // as an array; normalise both shapes to one object or drop the row.
    followedOrganisations = ((orgFollows ?? []) as unknown as {
      organisation: { id: string; name: string } | { id: string; name: string }[] | null
    }[])
      .map((r) => (Array.isArray(r.organisation) ? r.organisation[0] ?? null : r.organisation))
      .filter((o): o is { id: string; name: string } => !!o)
    const artistIds = ((artistFollows ?? []) as { followable_id: string }[]).map((r) => r.followable_id)
    if (artistIds.length > 0) {
      const { data: artists } = await admin
        .from('artists')
        .select('id, name')
        .in('id', artistIds)
      followedArtists = (artists ?? []) as { id: string; name: string }[]
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <Link href="/account" className="text-sm font-medium text-gold-800 underline hover:text-gold-700">
            Back to your account
          </Link>
          <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink-900 sm:text-4xl">
            Notifications
          </h1>
          <p className="mt-3 text-base text-ink-600">
            Choose how we keep you posted. Everything here is optional, instant, and yours to
            change any time.
          </p>

          <div className="mt-8 space-y-6">
            <EnableAlerts />
            <ChannelPrefs />
            {digestOn && (
              <DigestPrefs consented={digestConsented} citySlug={digestCity} cities={cities} />
            )}
            {followOn && (
              <div className="rounded-xl border border-ink-200 bg-white p-6">
                <h2 className="text-base font-semibold text-ink-900">Following</h2>
                <p className="mt-1 text-sm text-ink-600">
                  You hear first when anyone you follow announces something new.
                </p>
                {followedOrganisations.length === 0 && followedArtists.length === 0 ? (
                  <p className="mt-4 text-sm text-ink-600">
                    You are not following anyone yet. Find an organiser on any event page and tap
                    Follow.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y divide-ink-200/60">
                    {followedOrganisations.map((org) => (
                      <li key={org.id} className="flex items-center justify-between gap-3 py-3">
                        <span className="text-sm font-medium text-ink-900">{org.name}</span>
                        <FollowButton type="organiser" id={org.id} variant="outline" />
                      </li>
                    ))}
                    {followedArtists.map((artist) => (
                      <li key={artist.id} className="flex items-center justify-between gap-3 py-3">
                        <span className="text-sm font-medium text-ink-900">{artist.name}</span>
                        <FollowButton type="artist" id={artist.id} variant="outline" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
