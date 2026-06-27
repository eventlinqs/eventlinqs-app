import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readVenueAdminDetail } from '@/lib/admin/venues'
import { formatMoneyDisplay } from '@/lib/money/format'
import { ConfirmSubmitButton } from '@/components/admin/confirm-submit-button'
import { enrolVenueAction, unenrolVenueAction, triggerVenuePayoutAction } from '../actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Venue revenue detail | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ status?: string; amount?: string }>

const PAYOUT_BANNERS: Record<string, { tone: 'ok' | 'warn' | 'err'; text: string }> = {
  payout_paid: { tone: 'ok', text: 'Venue payout sent for this event.' },
  payout_nothing: { tone: 'warn', text: 'Nothing payable for that event right now.' },
  payout_not_ready: { tone: 'err', text: 'The venue has no payout-ready Stripe connected account yet.' },
  payout_error: { tone: 'err', text: 'The payout could not be completed. Check the logs and try again.' },
}
const BANNER_CLASS: Record<'ok' | 'warn' | 'err', string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  err: 'border-red-500/30 bg-red-500/10 text-red-200',
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#131A2A] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-white/45">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
    </div>
  )
}

export default async function AdminVenueDetailPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.venues.manage')) redirect('/admin')

  const { id } = await params
  const { status, amount } = await searchParams
  const venue = await readVenueAdminDetail(id)
  if (!venue) notFound()
  await recordAuditEvent({ action: 'admin.venue.detail.view', targetType: 'venue', targetId: id, session })

  const banner = status ? PAYOUT_BANNERS[status] : undefined
  const enrolled = venue.status === 'enrolled'

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-white/50">
        <Link href="/admin/venues" className="hover:text-white">Venue revenue</Link>
        <span aria-hidden className="px-2">/</span>
        <span className="text-white/80">{venue.name}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{venue.name}</h1>
          <p className="mt-1 text-sm text-white/55">
            {venue.organisationName ?? venue.organisationId}{venue.city ? ` | ${venue.city}` : ''}
            {' | '}{enrolled ? 'Enrolled' : venue.status === 'suspended' ? 'Suspended' : 'Not enrolled'}
            {venue.enrolledAt ? ` since ${new Date(venue.enrolledAt).toLocaleDateString('en-AU')}` : ''}
          </p>
          <p className="mt-1 text-xs text-white/40">
            Payout account: {venue.stripeAccountId ? `${venue.stripeAccountId.slice(0, 12)}...` : 'not connected'}
            {' | '}payouts {venue.stripePayoutsEnabled ? 'enabled' : 'not enabled'}
          </p>
        </div>
        {enrolled ? (
          <form action={unenrolVenueAction}>
            <input type="hidden" name="venueId" value={venue.id} />
            <ConfirmSubmitButton
              confirmMessage={`Un-enrol ${venue.name}? Future tickets stop accruing a share. Past share is unaffected.`}
              className="rounded-md border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/[0.06]"
            >
              Un-enrol
            </ConfirmSubmitButton>
          </form>
        ) : (
          <form action={enrolVenueAction}>
            <input type="hidden" name="venueId" value={venue.id} />
            <button type="submit" className="rounded-md bg-[#C9A227] px-4 py-2 text-sm font-semibold text-[#0A0F1A] transition hover:bg-[#dab43a]">
              Enrol venue
            </button>
          </form>
        )}
      </header>

      {banner && (
        <div role={banner.tone === 'ok' ? 'status' : 'alert'} className={`mb-6 rounded-md border px-4 py-3 text-sm ${BANNER_CLASS[banner.tone]}`}>
          {banner.text}{status === 'payout_paid' && amount ? ` ${formatMoneyDisplay(Number(amount), venue.currency)}.` : ''}
        </div>
      )}

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Earned (net of refunds)" value={formatMoneyDisplay(venue.earnedNetCents, venue.currency)} />
        <Stat label="Paid out" value={formatMoneyDisplay(venue.paidCents, venue.currency)} />
        <Stat label="Owed now" value={formatMoneyDisplay(venue.payableCents, venue.currency)} />
      </div>

      {/* Events at this venue with per-event payable + manual payout trigger */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-lg font-semibold">Events at this venue</h2>
        {venue.events.length === 0 ? (
          <p className="rounded-lg border border-white/[0.08] bg-[#131A2A] px-4 py-6 text-sm text-white/55">No events linked to this venue yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-white/50">
                  <th scope="col" className="px-4 py-3 font-medium">Event</th>
                  <th scope="col" className="px-4 py-3 font-medium">Ended</th>
                  <th scope="col" className="px-4 py-3 font-medium">Paid</th>
                  <th scope="col" className="px-4 py-3 font-medium">Owed</th>
                  <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Pay</span></th>
                </tr>
              </thead>
              <tbody>
                {venue.events.map((e) => (
                  <tr key={e.eventId} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-4 py-3 text-white/85">{e.eventTitle ?? e.eventId}</td>
                    <td className="px-4 py-3 text-white/60">{e.endDate ? new Date(e.endDate).toLocaleDateString('en-AU') : 'TBC'}</td>
                    <td className="px-4 py-3 text-white/70">{formatMoneyDisplay(e.paidCents, e.currency)}</td>
                    <td className="px-4 py-3 font-medium text-white">{formatMoneyDisplay(e.payableCents, e.currency)}</td>
                    <td className="px-4 py-3">
                      {e.payableCents > 0 ? (
                        <form action={triggerVenuePayoutAction}>
                          <input type="hidden" name="venueId" value={venue.id} />
                          <input type="hidden" name="eventId" value={e.eventId} />
                          <ConfirmSubmitButton
                            confirmMessage={`Pay ${formatMoneyDisplay(e.payableCents, e.currency)} to ${venue.name} for this event?`}
                            className="rounded-md bg-[#C9A227] px-3 py-1.5 text-xs font-semibold text-[#0A0F1A] transition hover:bg-[#dab43a]"
                          >
                            Pay now
                          </ConfirmSubmitButton>
                        </form>
                      ) : (
                        <span className="text-xs text-white/35">Nothing owed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Share ledger */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-lg font-semibold">Share ledger</h2>
        {venue.ledger.length === 0 ? (
          <p className="rounded-lg border border-white/[0.08] bg-[#131A2A] px-4 py-6 text-sm text-white/55">No share entries yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-white/50">
                  <th scope="col" className="px-4 py-3 font-medium">When</th>
                  <th scope="col" className="px-4 py-3 font-medium">Reason</th>
                  <th scope="col" className="px-4 py-3 font-medium">Amount</th>
                  <th scope="col" className="px-4 py-3 font-medium">From platform fee</th>
                </tr>
              </thead>
              <tbody>
                {venue.ledger.map((l) => (
                  <tr key={l.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-4 py-3 text-white/60">{new Date(l.created_at).toLocaleString('en-AU')}</td>
                    <td className="px-4 py-3 text-white/75">{l.reason.replace(/_/g, ' ')}</td>
                    <td className={`px-4 py-3 font-medium ${l.delta_cents < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                      {formatMoneyDisplay(l.delta_cents, l.currency)}
                    </td>
                    <td className="px-4 py-3 text-white/55">{l.platform_fee_cents != null ? formatMoneyDisplay(l.platform_fee_cents, l.currency) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Payouts */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Payouts</h2>
        {venue.payouts.length === 0 ? (
          <p className="rounded-lg border border-white/[0.08] bg-[#131A2A] px-4 py-6 text-sm text-white/55">No payouts yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-white/50">
                  <th scope="col" className="px-4 py-3 font-medium">When</th>
                  <th scope="col" className="px-4 py-3 font-medium">Amount</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Transfer</th>
                </tr>
              </thead>
              <tbody>
                {venue.payouts.map((p) => (
                  <tr key={p.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-4 py-3 text-white/60">{new Date(p.created_at).toLocaleString('en-AU')}</td>
                    <td className="px-4 py-3 font-medium text-white">{formatMoneyDisplay(p.amount_cents, p.currency)}</td>
                    <td className="px-4 py-3 text-white/75">{p.status}</td>
                    <td className="px-4 py-3 text-white/45">{p.stripe_transfer_id ? `${p.stripe_transfer_id.slice(0, 14)}...` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
