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

          {/*
            * THE SAME PHONE TREATMENT AS THE OTHER FOUR ORGANISER TABLES, AND
            * THE ONE OF THE FIVE THAT COULD NOT BE DRIVEN.
            *
            * `min-w-[480px]` inside a 356px box at 390 is the shape that was
            * MEASURED on the reach table hours earlier and failed: swiped to
            * the right edge to read Tickets, the PERFORMER scrolls off the
            * left, so three numbers sit on a phone with nobody's name against
            * them. This table is that table with one column fewer, so it is
            * rebuilt the same way rather than left as the one exception.
            *
            * WHY THERE IS NO DRIVEN PROOF OF THIS ONE, stated rather than
            * omitted: this whole surface renders only when `broadcast_artists`
            * is on, and that flag is OFF by a dated founder decision recorded
            * in src/lib/flags/broadcast.ts ("OFF at launch, deliberately").
            * The flag row lives in a TEST database three build lanes share.
            * Flipping a founder-decided switch to make a drive greener is not
            * a build lane's call, so this table is held by the registered
            * guard instead, and the absence of a screenshot is on the record.
            */}
          <div className="mt-6 rounded-xl border border-ink-200 bg-white max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent lg:overflow-x-auto">
            <div className="border-b border-ink-200 px-5 py-4 max-lg:border-b-0 max-lg:px-0">
              <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-900">
                Who filled the room
              </h2>
              <p className="mt-1 text-sm text-ink-600">
                Sales through each performer&apos;s own tracked link. Measured, never estimated.
              </p>
            </div>
            <table className="w-full text-sm max-lg:block lg:min-w-[480px]">
              <thead className="max-lg:hidden">
                <tr className="border-b border-ink-200 text-left text-ink-600">
                  <th scope="col" className="px-5 py-3 font-medium">Performer</th>
                  <th scope="col" className="px-5 py-3 font-medium">Clicks</th>
                  <th scope="col" className="px-5 py-3 font-medium">Orders</th>
                  <th scope="col" className="px-5 py-3 font-medium">Tickets</th>
                </tr>
              </thead>
              <tbody className="max-lg:block">
                {attribution.length === 0 ? (
                  <tr className="max-lg:block">
                    <td colSpan={4} className="px-5 py-6 text-ink-600 max-lg:block max-lg:px-0">
                      No performer-link activity yet. Hand each tagged artist their share link
                      above; their sales land here.
                    </td>
                  </tr>
                ) : (
                  attribution.map((row) => (
                    <tr
                      key={row.artistId}
                      className="border-b border-ink-200/60 last:border-b-0 max-lg:mt-3 max-lg:block max-lg:rounded-2xl max-lg:border max-lg:border-ink-200 max-lg:bg-white max-lg:px-4 max-lg:py-3"
                    >
                      <td className="px-5 py-3 font-semibold text-ink-900 max-lg:block max-lg:px-0 max-lg:py-0">{row.artistName}</td>
                      <td className="px-5 py-3 text-ink-900 max-lg:inline-block max-lg:px-0 max-lg:pb-0 max-lg:pr-4 max-lg:pt-2">
                        {row.clicks}
                        <span className="ml-1 text-xs text-ink-600 lg:hidden">clicks</span>
                      </td>
                      <td className="px-5 py-3 text-ink-900 max-lg:inline-block max-lg:px-0 max-lg:pb-0 max-lg:pr-4 max-lg:pt-2">
                        {row.conversions}
                        <span className="ml-1 text-xs text-ink-600 lg:hidden">orders</span>
                      </td>
                      <td className="px-5 py-3 font-semibold text-ink-900 max-lg:inline-block max-lg:px-0 max-lg:pb-0 max-lg:pt-2">
                        {row.tickets}
                        <span className="ml-1 text-xs font-normal text-ink-600 lg:hidden">tickets</span>
                      </td>
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
