import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { redirect } from 'next/navigation'
import { recordAuditEvent } from '@/lib/admin/audit'
import { AdminStatTile } from '@/components/admin/admin-stat-tile'
import { readAttributionForOrder, readAttributionSummary } from '@/lib/attribution/read'
import { RUNG_NAME, type Rung } from '@/lib/attribution/resolve'
import { REVERSAL_REASON_SENTENCE, type ReversalReason } from '@/lib/attribution/reversal'
import { formatPlatformDateTime } from '@/lib/dates/event-time'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Attribution | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * WHY THIS SALE IS, OR IS NOT, ON AN INVOICE.
 *
 * Close-out GA3 step 11. This is the screen a fee argument is settled on, so it
 * is a STATEMENT rather than a debug dump: the decision first, in one sentence
 * anybody can read, then the rung and the model that produced it, then the
 * clicks that were considered including the ones that lost, then the reversal
 * if there is one, then whether it is billable and why.
 *
 * IT LOOKS ONE ORDER UP BY ITS REFERENCE, because that is the number a client
 * quotes. A list of every attribution would be a report; this is the answer to
 * a question somebody asked about one sale.
 *
 * NO CLIENT JAVASCRIPT. The lookup is a plain GET form, so the address bar
 * carries the order and the page can be sent to somebody. The admin console has
 * one dark surface and no theme switch, and this is built to it rather than
 * inventing a second theme on one screen.
 */

type Props = { searchParams: Promise<{ order?: string }> }

function rungLabel(rung: Rung): string {
  return `${rung}, ${RUNG_NAME[rung]}`
}

export default async function AdminAttributionPage({ searchParams }: Props) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.attribution.view', session })

  const { order: reference } = await searchParams
  const lookup = (reference ?? '').trim()
  const [summary, found] = await Promise.all([
    readAttributionSummary(),
    lookup ? readAttributionForOrder(lookup) : Promise.resolve(null),
  ])

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Attribution</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Which campaign produced a sale, on what evidence, and whether it may be charged for.
          Every order carries exactly one stored decision, including the orders no campaign
          produced, which say so.
        </p>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatTile
          label="Orders with a decision"
          value={summary.attributions}
          hint={`of ${summary.orders} orders on the platform`}
          status={summary.attributions === summary.orders ? 'ok' : 'warn'}
        />
        <AdminStatTile
          label="Credited to a campaign"
          value={summary.attributed}
          hint="on any rung, before billing is considered"
        />
        <AdminStatTile
          label="Chargeable"
          value={summary.billable}
          hint="tied to a click by an identifier or an identity, nothing reversed"
        />
        <AdminStatTile
          label="Reversed"
          value={summary.reversed}
          hint={summary.reversed > 0 ? 'taken back after the sale' : 'nothing has been taken back'}
          status={summary.reversed > 0 ? 'warn' : 'ok'}
        />
      </div>

      <section className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">Look up an order</h2>
        <p className="mt-1 text-sm text-white/60">
          Enter the order reference a client or a buyer quoted. The method is {summary.modelName}{' '}
          {summary.modelVersion}, and the attribution window is {summary.windowDays} days unless a
          campaign sets its own.
        </p>
        <form method="get" className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-2 block text-xs uppercase tracking-wider text-white/50">Order reference</span>
            <input
              type="text"
              name="order"
              defaultValue={lookup}
              placeholder="EL-XXXXXXXX"
              className="w-full min-w-0 rounded-lg border border-white/10 bg-[#0A1628] px-4 py-3 font-mono text-sm text-white placeholder:text-white/30 focus:border-[var(--brand-accent)] focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="min-h-[44px] rounded-lg bg-[var(--brand-accent)] px-6 py-3 text-sm font-semibold text-[#0A1628] transition hover:brightness-110"
          >
            Look it up
          </button>
        </form>
      </section>

      {lookup && !found && (
        <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-8 text-center">
          <h2 className="font-display text-xl font-semibold text-white">No order with that reference</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-white/60">
            Nothing on this platform is numbered {lookup}. An order reference looks like EL followed
            by eight characters, and it is on the buyer&apos;s confirmation and on the order in the admin
            orders list.
          </p>
        </section>
      )}

      {found && (
        <div className="space-y-6">
          <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-white">{found.orderReference}</h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  found.billable
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : 'bg-white/[0.06] text-white/60'
                }`}
              >
                {found.billable ? 'Chargeable' : 'Not chargeable'}
              </span>
            </div>
            <p className="mt-4 text-base leading-relaxed text-white/85">{found.explanation}</p>
            <p className="mt-3 text-sm text-white/55">{found.billableSentence}</p>
          </section>

          <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <h3 className="font-display text-base font-semibold text-white">How it was decided</h3>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
                <dt className="text-white/55">Decision</dt>
                <dd className="text-right text-white/90">{found.decision === 'attributed' ? 'Credited' : 'Nothing credited'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
                <dt className="text-white/55">Rung</dt>
                <dd className="text-right text-white/90">{rungLabel(found.rung)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
                <dt className="text-white/55">Method</dt>
                <dd className="text-right text-white/90">
                  {found.modelName} {found.modelVersion}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
                <dt className="text-white/55">Confidence</dt>
                <dd className="text-right text-white/90">{found.confidence}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
                <dt className="text-white/55">Campaign</dt>
                <dd className="text-right text-white/90">{found.campaignName ?? 'None'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
                <dt className="text-white/55">Channel</dt>
                <dd className="text-right text-white/90">{found.channelName ?? 'None'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
                <dt className="text-white/55">Partner</dt>
                <dd className="text-right text-white/90">{found.partnerName ?? 'None'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
                <dt className="text-white/55">Sent to</dt>
                <dd className="text-right text-white/90">
                  {found.recipientLabel ?? 'Nobody in particular'}
                  {found.forwarded ? ', and passed on' : ''}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
                <dt className="text-white/55">Decided</dt>
                <dd className="text-right text-white/90">{formatPlatformDateTime(found.resolvedAt)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
                <dt className="text-white/55">Order state</dt>
                <dd className="text-right text-white/90">{found.orderStateSentence}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <h3 className="font-display text-base font-semibold text-white">Clicks considered</h3>
            <p className="mt-1 text-sm text-white/60">
              {found.candidateClicks.length === 0
                ? 'No campaign click was on record for this event when the decision was made.'
                : 'Every click that was weighed, including the ones that did not win, newest first.'}
            </p>
            {found.candidateClicks.length > 0 && (
              <ul className="mt-4 space-y-3">
                {found.candidateClicks.map(click => (
                  <li
                    key={click.clickId}
                    className="rounded-lg border border-white/[0.06] bg-[#0A1628] px-4 py-3 text-sm"
                  >
                    <p className="text-white/85">{click.sentence}</p>
                    <p className="mt-1 font-mono text-xs text-white/40">{click.clickId}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
            <h3 className="font-display text-base font-semibold text-white">Reversals</h3>
            {found.reversals.length === 0 ? (
              <p className="mt-1 text-sm text-white/60">
                Nothing has been taken back on this sale.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {found.reversals.map(reversal => (
                  <li
                    key={reversal.id}
                    className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm"
                  >
                    <p className="text-white/85">
                      {REVERSAL_REASON_SENTENCE[reversal.reason as ReversalReason] ?? reversal.reason}
                    </p>
                    <p className="mt-1 text-xs text-white/50">
                      {reversal.amountLabel} on {formatPlatformDateTime(reversal.reversedAt)}, recorded by{' '}
                      {reversal.source}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
