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
import { getSiteUrl } from '@/lib/site-url'

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
 * Reach panel v1 (SPEC section 2.5): views, clicks, and tickets by channel,
 * plus the share kit. Only measured numbers are shown: the panel is the
 * "tools to expand your reach" pitch made visible and honest.
 */
export default async function ReachPage({ params }: Props) {
  const { id } = await params

  const event = await getOrganiserEvent(id)
  if (!event) notFound()

  const shareOn = await isFeatureEnabled('broadcast_share')

  const summary = shareOn
    ? await fetchReachSummary(id)
    : { totals: { views: 0, clicks: 0, conversions: 0, tickets: 0 }, byChannel: [], linkCount: 0 }

  const origin = getSiteUrl()
  const kitLinks: { channel: ShareChannel; url: string }[] = []
  if (shareOn) {
    for (const channel of KIT_CHANNELS) {
      const link = await getOrCreateShareLink({
        eventId: id,
        channel,
        createdBy: event.userId,
      })
      if (link) kitLinks.push({ channel, url: buildShortUrl(origin, link.code) })
    }
  }

  const stats = [
    { label: 'Link views', value: summary.totals.views },
    { label: 'Link clicks', value: summary.totals.clicks },
    { label: 'Orders from links', value: summary.totals.conversions },
    { label: 'Tickets from links', value: summary.totals.tickets },
  ]

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
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-ink-200 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-600">
                  {s.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-ink-900">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="mb-6 overflow-x-auto rounded-xl border border-ink-200 bg-white">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-ink-600">
                  <th scope="col" className="px-5 py-3 font-medium">Channel</th>
                  <th scope="col" className="px-5 py-3 font-medium">Views</th>
                  <th scope="col" className="px-5 py-3 font-medium">Clicks</th>
                  <th scope="col" className="px-5 py-3 font-medium">Orders</th>
                  <th scope="col" className="px-5 py-3 font-medium">Tickets</th>
                </tr>
              </thead>
              <tbody>
                {summary.byChannel.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-ink-600">
                      No tracked activity yet. Share a link from the kit below, or put the QR
                      poster up where your people are: every view, click, and sale lands here.
                    </td>
                  </tr>
                ) : (
                  summary.byChannel.map((row) => (
                    <tr key={row.channel} className="border-b border-ink-200/60 last:border-b-0">
                      <td className="px-5 py-3 font-semibold text-ink-900">
                        {CHANNEL_LABELS[row.channel] ?? row.channel}
                      </td>
                      <td className="px-5 py-3 text-ink-900">{row.views}</td>
                      <td className="px-5 py-3 text-ink-900">{row.clicks}</td>
                      <td className="px-5 py-3 text-ink-900">{row.conversions}</td>
                      <td className="px-5 py-3 font-semibold text-ink-900">{row.tickets}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <ShareKit links={kitLinks} posterHref={`/api/organiser/events/${id}/poster`} />

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
