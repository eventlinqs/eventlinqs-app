import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrganiserEvent } from '@/lib/reporting/attendees'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { fetchEventLineup, fetchEventArtistAttribution } from '@/lib/broadcast/artists'
import { buildShortUrl, getOrCreateShareLink } from '@/lib/broadcast/share-links'
import { LineupManager, type LineupEntry } from '@/components/broadcast/lineup-manager'
import { getSiteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: 'Lineup | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

/**
 * The organiser lineup surface (SPEC 4.2 and the organiser side of 4.4):
 * tag performers, invite guests by link, hand each artist their tracked
 * share link, and see exactly who filled the room by performer.
 */
export default async function LineupPage({ params }: Props) {
  const { id } = await params

  const event = await getOrganiserEvent(id)
  if (!event) notFound()

  const artistsOn = await isFeatureEnabled('broadcast_artists')

  let entries: LineupEntry[] = []
  let attribution: Awaited<ReturnType<typeof fetchEventArtistAttribution>> = []
  if (artistsOn) {
    const admin = createAdminClient()
    const origin = getSiteUrl()
    const lineup = await fetchEventLineup(admin, id)
    entries = []
    for (const row of lineup) {
      // Each tagged artist gets their own tracked link (channel 'other',
      // artist-scoped), minted once and reused, so the organiser can hand
      // it over the moment the tag lands.
      let shareUrl: string | null = null
      if (row.status === 'confirmed') {
        const link = await getOrCreateShareLink({
          eventId: id,
          channel: 'other',
          artistId: row.artist.id,
          createdBy: event.userId,
        })
        shareUrl = link ? buildShortUrl(origin, link.code) : null
      }
      entries.push({
        artistId: row.artist.id,
        artistSlug: row.artist.slug,
        artistName: row.artist.name,
        status: row.status,
        inviteUrl: row.inviteToken ? `${origin}/artists/claim/${row.inviteToken}` : null,
        shareUrl,
      })
    }
    attribution = await fetchEventArtistAttribution(admin, id)
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={`/dashboard/events/${id}`} className="text-sm text-ink-600 hover:text-ink-900">
          ← Back to event
        </Link>
        <h1 className="text-2xl font-bold text-ink-900">Lineup</h1>
        <span className="text-sm text-ink-400">·</span>
        <span className="text-sm text-ink-600">{event.title}</span>
      </div>

      {!artistsOn ? (
        <div className="rounded-xl border border-ink-200 bg-white px-5 py-6">
          <p className="text-sm text-ink-600">
            Performer tagging is not switched on yet. Your event page and ticket sales are
            unaffected.
          </p>
        </div>
      ) : (
        <>
          <LineupManager eventId={id} entries={entries} />

          <div className="mt-6 overflow-x-auto rounded-xl border border-ink-200 bg-white">
            <div className="border-b border-ink-200 px-5 py-4">
              <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-900">
                Who filled the room
              </h2>
              <p className="mt-1 text-sm text-ink-600">
                Sales through each performer&apos;s own tracked link. Measured, never estimated.
              </p>
            </div>
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-ink-600">
                  <th scope="col" className="px-5 py-3 font-medium">Performer</th>
                  <th scope="col" className="px-5 py-3 font-medium">Clicks</th>
                  <th scope="col" className="px-5 py-3 font-medium">Orders</th>
                  <th scope="col" className="px-5 py-3 font-medium">Tickets</th>
                </tr>
              </thead>
              <tbody>
                {attribution.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-ink-600">
                      No performer-link activity yet. Hand each tagged artist their share link
                      above; their sales land here.
                    </td>
                  </tr>
                ) : (
                  attribution.map((row) => (
                    <tr key={row.artistId} className="border-b border-ink-200/60 last:border-b-0">
                      <td className="px-5 py-3 font-semibold text-ink-900">{row.artistName}</td>
                      <td className="px-5 py-3 text-ink-900">{row.clicks}</td>
                      <td className="px-5 py-3 text-ink-900">{row.conversions}</td>
                      <td className="px-5 py-3 font-semibold text-ink-900">{row.tickets}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
