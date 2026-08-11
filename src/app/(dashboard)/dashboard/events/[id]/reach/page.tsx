import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getOrganiserEvent } from '@/lib/reporting/attendees'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { fetchReachSummary } from '@/lib/broadcast/reach'
import {
  buildShortUrl,
  getOrCreateShareLink,
  type ShareChannel,
} from '@/lib/broadcast/share-links'
import { ShareKit } from '@/components/broadcast/share-kit'
import { ReachEmptyState } from '@/components/broadcast/reach-empty-state'
import { getRequestOrigin } from '@/lib/site-origin'

export const metadata: Metadata = {
  title: 'Reach | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

/** The channels the organiser share kit pre-mints. */
const KIT_CHANNELS: readonly ShareChannel[] = [
  'whatsapp',
  'instagram',
  'facebook',
  'x',
  'linkedin',
  'email',
  'copy',
]

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
  messenger: 'Messenger',
  email: 'Email',
  sms: 'SMS',
  copy: 'Copied links',
  native: 'Share sheet',
  qr: 'Poster QR',
  other: 'Other',
}

/**
 * The reach panel: tickets and orders by channel, then clicks and views, plus
 * the share kit.
 *
 * Ordered hardest first, deliberately. A ticket and an order require a real
 * payment against a real order row and cannot be forged. A click is a request,
 * and a request is a string the client chooses: preview crawlers are filtered
 * and repeat taps are de-duplicated, but it stays an estimate and the panel
 * says so rather than presenting all four as the same kind of fact. The one
 * claim this product makes that the incumbents cannot match is measurement
 * against real ticket sales, so the softest number must not lead the screen
 * that claim is made on.
 */
export default async function ReachPage({ params }: Props) {
  const { id } = await params

  const event = await getOrganiserEvent(id)
  if (!event) notFound()

  const shareOn = await isFeatureEnabled('broadcast_share')

  const summary = shareOn
    ? await fetchReachSummary(id)
    : { totals: { views: 0, clicks: 0, conversions: 0, tickets: 0 }, byChannel: [], linkCount: 0 }

  // Request origin: handed-out links must point at the deployment that
  // minted them (identical on production, self-referential on staging).
  const origin = await getRequestOrigin()
  const kitLinks: { channel: ShareChannel; url: string }[] = []
  if (shareOn) {
    for (const channel of KIT_CHANNELS) {
      const link = await getOrCreateShareLink({
        eventId: id,
        channel,
        createdBy: event.userId,
        eventSlug: event.slug,
      })
      if (link) kitLinks.push({ channel, url: buildShortUrl(origin, link.code) })
    }
  }

  // Hardest number first. A ticket and an order require a real payment against
  // a real order row and cannot be forged; a click is a request and a request
  // is soft. This panel used to run views-first, which put the softest number
  // in the lead position on the one screen that has to be trusted.
  const stats = [
    { label: 'Tickets sold from links', value: summary.totals.tickets, hard: true },
    { label: 'Orders from links', value: summary.totals.conversions, hard: true },
    { label: 'Link clicks', value: summary.totals.clicks, hard: false },
    { label: 'Link views', value: summary.totals.views, hard: false },
  ]
  const nothingHasTravelled = stats.every(stat => stat.value === 0)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={`/dashboard/events/${id}`} className="text-sm text-ink-600 hover:text-ink-900">
          ← Back to event
        </Link>
        <h1 className="text-2xl font-bold text-ink-900">Reach</h1>
        <span className="text-sm text-ink-400">·</span>
        <span className="text-sm text-ink-600">{event.title}</span>
      </div>

      {!shareOn ? (
        <div className="rounded-xl border border-ink-200 bg-white px-5 py-6">
          <p className="text-sm text-ink-600">
            Share tooling is switched off on this platform right now. Your event page and
            ticket sales are unaffected.
          </p>
        </div>
      ) : (
        <>
          {nothingHasTravelled ? (
            <div className="mb-6 rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-card)]">
              <ReachEmptyState
                shareHref={`/dashboard/events/${id}/reach#share-kit`}
                posterHref={`/api/organiser/events/${id}/poster`}
              />
            </div>
          ) : (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl border border-ink-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-600">
                    {s.label}
                  </p>
                  <p
                    className={`mt-2 text-2xl font-bold ${
                      s.hard ? 'text-[var(--brand-accent-strong)]' : 'text-ink-900'
                    }`}
                  >
                    {s.value}
                  </p>
                  {!s.hard && <p className="mt-1 text-[11px] text-ink-500">Close estimate</p>}
                </div>
              ))}
            </div>
          )}

          {/* The per-channel table only exists once there is a channel to
              compare. At zero the empty state above already says everything
              this table's own empty row was saying, and saying it twice on one
              screen reads as two failures rather than one beginning. */}
          {summary.byChannel.length > 0 && (
            <div className="mb-6 overflow-x-auto rounded-xl border border-ink-200 bg-white">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-ink-600">
                    <th scope="col" className="px-5 py-3 font-medium">Channel</th>
                    <th scope="col" className="px-5 py-3 font-medium">Tickets</th>
                    <th scope="col" className="px-5 py-3 font-medium">Orders</th>
                    <th scope="col" className="px-5 py-3 font-medium">Clicks</th>
                    <th scope="col" className="px-5 py-3 font-medium">Views</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byChannel.map((row) => (
                    <tr key={row.channel} className="border-b border-ink-200/60 last:border-b-0">
                      <td className="px-5 py-3 font-semibold text-ink-900">
                        {CHANNEL_LABELS[row.channel] ?? row.channel}
                      </td>
                      <td className="px-5 py-3 font-semibold text-[var(--brand-accent-strong)]">
                        {row.tickets}
                      </td>
                      <td className="px-5 py-3 font-semibold text-[var(--brand-accent-strong)]">
                        {row.conversions}
                      </td>
                      <td className="px-5 py-3 text-ink-900">{row.clicks}</td>
                      <td className="px-5 py-3 text-ink-900">{row.views}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div id="share-kit">
            <ShareKit links={kitLinks} posterHref={`/api/organiser/events/${id}/poster`} />
          </div>

          <p className="mt-4 max-w-2xl text-xs text-ink-600">
            Numbers here count only activity through tracked share links, deduplicated and
            measured on the platform. Direct search and browse traffic is not estimated:
            what you see is what was measured.
          </p>
        </>
      )}
    </div>
  )
}
