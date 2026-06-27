import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readVenueAdminList, readVenueShareRates } from '@/lib/admin/venues'
import { formatMoneyDisplay } from '@/lib/money/format'
import { ConfirmSubmitButton } from '@/components/admin/confirm-submit-button'
import { updateVenueRateAction, enrolVenueAction, unenrolVenueAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Venue revenue | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ status?: string; changed?: string }>

const STATUS_BANNERS: Record<string, { tone: 'ok' | 'warn' | 'err'; text: string }> = {
  rate_saved: { tone: 'ok', text: 'Venue share rate saved. New accruals use it now.' },
  rate_invalid: { tone: 'warn', text: 'Rate not saved. Enter a percentage between 0 and 100.' },
  rate_error: { tone: 'err', text: 'Could not save the rate. Try again.' },
  enrolled: { tone: 'ok', text: 'Venue enrolled. Paid tickets at this venue now accrue a share.' },
  unenrolled: { tone: 'ok', text: 'Venue un-enrolled. Future tickets stop accruing; past share is unaffected.' },
  enrol_error: { tone: 'err', text: 'Could not change enrolment. Try again.' },
  enrol_invalid: { tone: 'warn', text: 'Invalid venue.' },
}

const BANNER_CLASS: Record<'ok' | 'warn' | 'err', string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  err: 'border-red-500/30 bg-red-500/10 text-red-200',
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    enrolled: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    not_enrolled: 'border-white/15 bg-white/[0.04] text-white/60',
    suspended: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  }
  const label = status === 'not_enrolled' ? 'Not enrolled' : status === 'enrolled' ? 'Enrolled' : 'Suspended'
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status] ?? map.not_enrolled}`}>{label}</span>
}

/**
 * Venue Revenue Sharing Program admin (capability admin.venues.manage).
 * Enrol/un-enrol venues, edit the single-source share rate, and see each
 * venue's earned/paid/payable share. Server-only forms, audit-logged writes.
 */
export default async function AdminVenuesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.venues.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.venues.view', session })

  const { status, changed } = await searchParams
  const [venues, rates] = await Promise.all([readVenueAdminList(), readVenueShareRates()])
  const banner = status ? STATUS_BANNERS[status] : undefined

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Venue moat</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Venue revenue sharing</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/60">
          Enrolled venues earn a share of the EventLinqs platform fee on every paid ticket for an
          event held at that venue. The share comes out of our platform-fee margin, so it never
          reduces the organiser payout or the buyer total. Enrolment is opt-in: a venue earns only
          while enrolled, and un-enrolling never touches past share. Venues are paid after the event
          through the same funds-holding payout path as organisers.
        </p>
      </header>

      {banner && (
        <div role={banner.tone === 'ok' ? 'status' : 'alert'} className={`mb-6 rounded-md border px-4 py-3 text-sm ${BANNER_CLASS[banner.tone]}`}>
          {banner.text}{status === 'rate_saved' ? ` ${Number(changed ?? 0)} scope${Number(changed ?? 0) === 1 ? '' : 's'} changed.` : ''}
        </div>
      )}

      {/* Rate editor (single source: pricing_rules venue_revenue_share_percentage) */}
      <section className="mb-10 rounded-lg border border-white/[0.08] bg-[#131A2A] p-5">
        <h2 className="font-display text-lg font-semibold">Share rate</h2>
        <p className="mt-1 text-sm text-white/55">
          The percentage of the platform fee an enrolled venue earns. Single source of truth, read by
          the accrual engine. Saving writes a new version; new accruals use it immediately.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {rates.map((r) => (
            <form key={`${r.countryCode}-${r.currency}`} action={updateVenueRateAction} className="flex items-end gap-3 rounded-md border border-white/[0.08] p-4">
              <input type="hidden" name="countryCode" value={r.countryCode} />
              <input type="hidden" name="currency" value={r.currency} />
              <label className="flex-1 text-sm">
                <span className="block text-white/60">{r.label} ({r.currency})</span>
                <input
                  type="number"
                  name="percentage"
                  step="0.1"
                  min="0"
                  max="100"
                  defaultValue={r.percentage ?? 20}
                  className="mt-1 w-full rounded-md border border-white/15 bg-[#0A0F1A] px-3 py-2 text-white"
                />
              </label>
              <span className="pb-2 text-xs text-white/40">v{r.version ?? 0}</span>
              <button type="submit" className="rounded-md bg-[#C9A227] px-4 py-2 text-sm font-semibold text-[#0A0F1A] transition hover:bg-[#dab43a]">
                Save
              </button>
            </form>
          ))}
        </div>
      </section>

      {/* Venue inventory */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Venues</h2>
        {venues.length === 0 ? (
          <p className="rounded-lg border border-white/[0.08] bg-[#131A2A] px-4 py-8 text-center text-sm text-white/55">
            No venues yet. Venues appear here once organisers create them.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-white/50">
                  <th scope="col" className="px-4 py-3 font-medium">Venue</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Payout ready</th>
                  <th scope="col" className="px-4 py-3 font-medium">Earned</th>
                  <th scope="col" className="px-4 py-3 font-medium">Paid</th>
                  <th scope="col" className="px-4 py-3 font-medium">Owed</th>
                  <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {venues.map((v) => (
                  <tr key={v.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/admin/venues/${v.id}`} className="font-medium text-white hover:text-[#C9A227]">
                        {v.name}
                      </Link>
                      <span className="block text-xs text-white/45">
                        {v.organisationName ?? v.organisationId}{v.city ? ` | ${v.city}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusPill status={v.status} /></td>
                    <td className="px-4 py-3 text-white/70">{v.stripeReady ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-white/80">{formatMoneyDisplay(v.earnedNetCents, v.currency)}</td>
                    <td className="px-4 py-3 text-white/80">{formatMoneyDisplay(v.paidCents, v.currency)}</td>
                    <td className="px-4 py-3 font-medium text-white">{formatMoneyDisplay(v.payableCents, v.currency)}</td>
                    <td className="px-4 py-3">
                      {v.status === 'enrolled' ? (
                        <form action={unenrolVenueAction}>
                          <input type="hidden" name="venueId" value={v.id} />
                          <ConfirmSubmitButton
                            confirmMessage={`Un-enrol ${v.name}? Future tickets stop accruing a share. Past share is unaffected.`}
                            className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.06]"
                          >
                            Un-enrol
                          </ConfirmSubmitButton>
                        </form>
                      ) : (
                        <form action={enrolVenueAction}>
                          <input type="hidden" name="venueId" value={v.id} />
                          <button type="submit" className="rounded-md bg-[#C9A227] px-3 py-1.5 text-xs font-semibold text-[#0A0F1A] transition hover:bg-[#dab43a]">
                            Enrol
                          </button>
                        </form>
                      )}
                    </td>
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
