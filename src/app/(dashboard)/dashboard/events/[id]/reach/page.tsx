import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getOrganiserEvent } from '@/lib/reporting/attendees'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { fetchReachSummary } from '@/lib/broadcast/reach'
import { fetchSalesAttribution } from '@/lib/broadcast/sales-attribution'
import { fetchReferralCoefficient } from '@/lib/growth/referral-coefficient'
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
  digest: 'Weekly city email',
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

  /*
   * THE DENOMINATOR. Everything above counts activity on TRACKED LINKS, which
   * left the organiser with a numerator and no total: "12 tickets from shares"
   * says nothing until you know whether the event sold 20 or 500.
   *
   * fetchSalesAttribution reads the ORDER LEDGER and lays the attribution over
   * it, so every sold order lands in exactly one of three buckets and the three
   * must sum to the ledger. When they do not, it reports `reconciles: false` and
   * the panel shows the discrepancy instead of a percentage. A share-of-sales
   * figure that does not tie to the books is worse than none, because it gets
   * quoted.
   */
  const attribution = await fetchSalesAttribution(id)

  /*
   * AQ2. "the referral coefficient computed and reported per event".
   *
   * Beside the attribution rather than instead of it, because they answer
   * different questions. The split above says where the sales came FROM; this
   * says whether the people who bought are BRINGING anybody, which is the only
   * acquisition number on this platform whose cash cost is zero.
   */
  const referral = await fetchReferralCoefficient(id)

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
    { key: 'tickets', label: 'Tickets sold from links', value: summary.totals.tickets, hard: true },
    { key: 'conversions', label: 'Orders from links', value: summary.totals.conversions, hard: true },
    { key: 'clicks', label: 'Link clicks', value: summary.totals.clicks, hard: false },
    { key: 'views', label: 'Link views', value: summary.totals.views, hard: false },
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

      {/*
        WHERE THE SALES CAME FROM. This sits above the link stats because it is
        the question the organiser actually has, and because it is the only
        number on the screen with a denominator behind it.
      */}
      {/*
        EXTERNALLY TICKETED: say what we cannot see, in the organiser's words.

        Founder ruling 15 August 2026, non-negotiable 2. The sales block below is
        already gated on `totals.tickets > 0`, and an external event has zero, so
        no percentage could render either way. That silence is not enough on its
        own: an organiser looking at a page of click counts with no sales section
        is entitled to know WHY, and to know it from a sentence rather than by
        inferring it from an absence.

        It says what is true and stops. No call to action sits beside it, because
        the honest limitation is not a sales opportunity.
      */}
      {attribution.externallyTicketed && (
        <div className="mb-6 rounded-xl border border-ink-200 bg-white px-5 py-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            What these numbers are
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-700">
            Your tickets are sold on another site, so everything on this page counts
            people ARRIVING, not buying. We can see who clicked your links and which
            channel they came from. We cannot see who bought, because that happens
            somewhere we have no access to, and we will not estimate it.
          </p>
        </div>
      )}

      {attribution.totals.tickets > 0 && (
        <div className="mb-6 rounded-xl border border-ink-200 bg-white px-5 py-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Where these sales came from
          </h2>

          {!attribution.reconciles ? (
            /*
             * REFUSE RATHER THAN GUESS. If the buckets do not sum to the ledger,
             * no percentage is shown at all. Showing one anyway is how a wrong
             * number ends up in a pitch deck.
             */
            <p className="mt-3 text-sm text-ink-700">
              These figures do not currently balance against your order records, so no
              split is shown. {attribution.totals.tickets} ticket
              {attribution.totals.tickets === 1 ? '' : 's'} sold in total.
              {attribution.discrepancy.tickets !== 0 && (
                <> {Math.abs(attribution.discrepancy.tickets)} unaccounted for.</>
              )}
            </p>
          ) : (
            <>
              <p className="mt-3 text-3xl font-bold text-ink-900">
                {attribution.organiserSharedPercent}%
                <span className="ml-2 text-base font-normal text-ink-600">
                  through links you shared
                </span>
              </p>
              <p className="mt-1 text-sm text-ink-600">
                {attribution.buckets.organiserShared.tickets} of {attribution.totals.tickets} ticket
                {attribution.totals.tickets === 1 ? '' : 's'} sold.
                {attribution.buckets.platformChannel.tickets > 0 && (
                  <>
                    {' '}
                    {attribution.buckets.platformChannel.tickets} came through an EventLinqs
                    channel.
                  </>
                )}
              </p>
              <p className="mt-3 text-xs text-ink-500">
                The remaining {attribution.buckets.untracked.tickets} reached your event without a
                tracked link: through search, the EventLinqs feed, or by typing the address. We do
                not claim those as ours, because we cannot prove where they came from.
              </p>
            </>
          )}
        </div>
      )}

      {/*
        AQ2's coefficient. It is shown even at zero, and especially at zero: an
        organiser whose buyers bring nobody needs to know that more than one
        whose buyers do. What it never does is print a 0.00 with no explanation
        beside it, because a bare zero reads as a broken number rather than as
        an answer.
      */}
      {!attribution.externallyTicketed && (
        <div
          className="rounded-xl border border-ink-200 bg-white px-5 py-6"
          data-referral-coefficient={referral.coefficient === null ? 'unknown' : referral.coefficient.toFixed(2)}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
            What your buyers bring
          </p>
          <p className="mt-3 text-3xl font-bold text-ink-900">
            {referral.coefficient === null ? 'No sales yet' : referral.coefficient.toFixed(2)}
            {referral.coefficient !== null && (
              <span className="ml-2 text-base font-normal text-ink-600">
                new buyers per buyer
              </span>
            )}
          </p>
          <p className="mt-1 text-sm text-ink-600">{referral.sentence}</p>
          {referral.fromAnUnknownSharer > 0 && (
            <p className="mt-3 text-xs text-ink-500">
              A further {referral.fromAnUnknownSharer} sale
              {referral.fromAnUnknownSharer === 1 ? '' : 's'} came through a share link whose sharer
              was not signed in, so we cannot show they hold a ticket and they are not counted
              above. Counting them all would put it at{' '}
              {referral.coefficientUpperBound === null
                ? 'no higher figure we can state'
                : referral.coefficientUpperBound.toFixed(2)}
              , which is a ceiling rather than a better guess.
            </p>
          )}
        </div>
      )}

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
                <div
                  key={s.label}
                  className="rounded-xl border border-ink-200 bg-white px-4 py-4"
                  /*
                   * READABLE BY A DRIVE, because the claim these four numbers
                   * make is "every tracked row, not the first thousand", and the
                   * only way to prove that is to put more than a thousand rows
                   * on a real event and read what this panel says. Matching on
                   * the label text instead would pin the copy, and the copy is
                   * the one thing here that is allowed to change.
                   */
                  data-reach-stat={s.key}
                  data-reach-value={s.value}
                >
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
            /*
              * A SWIPEABLE TABLE IS NOT THE SAME THING AS A READABLE ONE.
              *
              * MEASURED, 21 September 2026: `min-w-[560px]` inside an
              * `overflow-x-auto` box 356px wide at 390. Nothing was clipped
              * and nothing was unreachable, so every width check the platform
              * already runs passed it. Swipe to the right edge, which is the
              * only way to read Clicks and Views, and the CHANNEL scrolls off
              * the left: "Email" measured at x -187 to -47, entirely off the
              * phone. Four numbers, no row label, no column headings still on
              * screen. At 768 it was half off, at -81 of a box starting at 264.
              *
              * Below `lg` each channel is therefore its own card with its four
              * numbers labelled, and the table stays a table from `lg` up
              * where the columns fit. One DOM, CSS only, same as the events
              * list and the discount codes.
              */
            <div className="mb-6 rounded-xl border border-ink-200 bg-white max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent lg:overflow-x-auto">
              <table className="w-full text-sm max-lg:block lg:min-w-[560px]">
                <thead className="max-lg:hidden">
                  <tr className="border-b border-ink-200 text-left text-ink-600">
                    <th scope="col" className="px-5 py-3 font-medium">Channel</th>
                    <th scope="col" className="px-5 py-3 font-medium">Tickets</th>
                    <th scope="col" className="px-5 py-3 font-medium">Orders</th>
                    <th scope="col" className="px-5 py-3 font-medium">Clicks</th>
                    <th scope="col" className="px-5 py-3 font-medium">Views</th>
                  </tr>
                </thead>
                <tbody className="max-lg:block">
                  {summary.byChannel.map((row) => (
                    <tr
                      key={row.channel}
                      className="border-b border-ink-200/60 last:border-b-0 max-lg:mt-3 max-lg:block max-lg:rounded-2xl max-lg:border max-lg:border-ink-200 max-lg:bg-white max-lg:px-4 max-lg:py-3"
                    >
                      <td className="px-5 py-3 font-semibold text-ink-900 max-lg:block max-lg:px-0 max-lg:py-0">
                        {CHANNEL_LABELS[row.channel] ?? row.channel}
                      </td>
                      <td className="px-5 py-3 font-semibold text-[var(--brand-accent-strong)] max-lg:inline-block max-lg:px-0 max-lg:pb-0 max-lg:pr-4 max-lg:pt-2">
                        {row.tickets}
                        <span className="ml-1 text-xs font-normal text-ink-600 lg:hidden">tickets</span>
                      </td>
                      <td className="px-5 py-3 font-semibold text-[var(--brand-accent-strong)] max-lg:inline-block max-lg:px-0 max-lg:pb-0 max-lg:pr-4 max-lg:pt-2">
                        {row.conversions}
                        <span className="ml-1 text-xs font-normal text-ink-600 lg:hidden">orders</span>
                      </td>
                      <td className="px-5 py-3 text-ink-900 max-lg:inline-block max-lg:px-0 max-lg:pb-0 max-lg:pr-4 max-lg:pt-2">
                        {row.clicks}
                        <span className="ml-1 text-xs text-ink-600 lg:hidden">clicks</span>
                      </td>
                      <td className="px-5 py-3 text-ink-900 max-lg:inline-block max-lg:px-0 max-lg:pb-0 max-lg:pt-2">
                        {row.views}
                        <span className="ml-1 text-xs text-ink-600 lg:hidden">views</span>
                      </td>
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
