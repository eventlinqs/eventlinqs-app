import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { getAdminEventDetail, actionsForEventStatus, EVENT_ACTION_LABELS } from '@/lib/admin/events'
import { getLivePublicFee } from '@/lib/pricing/live-fee'
import { ConfirmSubmitButton } from '@/components/admin/confirm-submit-button'
import { eventActionForm, eventFeatureForm } from '../actions'
import { updateOverridePricingAction } from '../../pricing/actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Manage event | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ notice?: string }>

const STATUS_BADGE: Record<string, string> = {
  draft: 'border-white/15 bg-white/[0.04] text-white/50',
  scheduled: 'border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]',
  published: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  paused: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  postponed: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  cancelled: 'border-red-500/30 bg-red-500/10 text-red-200',
  completed: 'border-white/15 bg-white/[0.04] text-white/50',
}

function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`
}

export default async function AdminEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: SearchParams
}) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.events.manage')) redirect('/admin')

  const { id } = await params
  const { notice } = await searchParams
  const event = await getAdminEventDetail(id)
  if (!event) notFound()
  await recordAuditEvent({ action: 'admin.event.detail.view', targetType: 'event', targetId: id, session })

  const fee = await getLivePublicFee({ eventId: id })
  const actions = actionsForEventStatus(event.status)

  return (
    <div>
      <nav className="mb-6 text-sm text-white/50">
        <Link href="/admin/events" className="hover:text-white">Events</Link>
        <span aria-hidden className="px-2">/</span>
        <span className="text-white/80">{event.title}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{event.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
            <span className={`inline-block rounded border px-2 py-0.5 uppercase tracking-wider ${STATUS_BADGE[event.status] ?? STATUS_BADGE.draft}`}>{event.status}</span>
            {event.isFeatured && <span className="rounded bg-[var(--brand-accent)]/15 px-2 py-0.5 font-semibold uppercase tracking-wider text-[var(--brand-accent)]">Featured</span>}
            <span className="rounded bg-white/5 px-2 py-0.5 text-white/60">{event.visibility}</span>
            <span className="rounded bg-white/5 px-2 py-0.5 text-white/60">{event.isFree ? 'Free' : 'Paid'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/events/${event.slug}`} className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/[0.06] hover:text-white">
            View public page
          </Link>
          <Link href={`/admin/organisers/${event.organisationId}`} className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/[0.06] hover:text-white">
            Organiser
          </Link>
        </div>
      </header>

      {notice && (
        <div role={notice === 'error' ? 'alert' : 'status'} className={`mb-6 rounded-md border px-4 py-3 text-sm ${notice === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
          {notice === 'error' ? 'Could not apply that change.' : notice === 'featured' ? 'Event featured.' : notice === 'unfeatured' ? 'Event unfeatured.' : 'Done.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Details */}
        <section className="rounded-lg border border-white/[0.08] bg-[#131A2A] p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Details</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-white/50">Organiser</dt><dd className="text-white">{event.organisationName ?? '-'}</dd>
            <dt className="text-white/50">Slug</dt><dd className="font-mono text-[12px] text-white/70">{event.slug}</dd>
            <dt className="text-white/50">Starts</dt><dd className="text-white">{event.startDate.slice(0, 16).replace('T', ' ')}</dd>
            <dt className="text-white/50">Ends</dt><dd className="text-white">{event.endDate.slice(0, 16).replace('T', ' ')}</dd>
            <dt className="text-white/50">Venue</dt><dd className="text-white">{event.venueName ?? '-'}{event.city ? `, ${event.city}` : ''}</dd>
            <dt className="text-white/50">Capacity</dt><dd className="text-white">{event.maxCapacity ?? 'Unlimited'}</dd>
            <dt className="text-white/50">Fee treatment</dt><dd className="text-white">{event.feePassType === 'absorb' ? 'Organiser absorbs' : 'Passed to buyer'}</dd>
            <dt className="text-white/50">Created</dt><dd className="text-white">{event.createdAt.slice(0, 10)}</dd>
          </dl>

          <h3 className="mt-5 mb-2 text-[11px] uppercase tracking-wider text-white/50">Ticket tiers</h3>
          {event.tiers.length === 0 ? (
            <p className="text-sm text-white/40">No ticket tiers.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {event.tiers.map((t) => (
                <li key={t.id} className="flex justify-between border-b border-white/[0.05] py-1">
                  <span className="text-white/80">{t.name}</span>
                  <span className="text-white">{money(t.priceCents, t.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Controls */}
        <div className="flex flex-col gap-6">
          {/* Moderation */}
          <section className="rounded-lg border border-white/[0.08] bg-[#131A2A] p-5">
            <h2 className="mb-3 font-display text-lg font-semibold">Status and moderation</h2>
            {actions.length === 0 ? (
              <p className="text-sm text-white/50">No moderation actions available from {event.status}.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <form key={action} action={eventActionForm}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="action" value={action} />
                    <input type="hidden" name="returnTo" value={`/admin/events/${event.id}`} />
                    <ConfirmSubmitButton
                      confirmMessage={`${EVENT_ACTION_LABELS[action]} "${event.title}"? Recorded in the audit log.`}
                      className={action === 'cancel'
                        ? 'rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/20'
                        : action === 'pause'
                          ? 'rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20'
                          : 'rounded-md bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#0A0F1A] transition hover:bg-white'}
                    >
                      {EVENT_ACTION_LABELS[action]}
                    </ConfirmSubmitButton>
                  </form>
                ))}
              </div>
            )}
            <form action={eventFeatureForm} className="mt-4 border-t border-white/[0.06] pt-4">
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="featured" value={event.isFeatured ? 'false' : 'true'} />
              <ConfirmSubmitButton
                confirmMessage={event.isFeatured ? 'Remove this event from featured?' : 'Feature this event?'}
                className="rounded-md border border-white/15 px-3 py-1.5 text-sm font-semibold text-white/80 transition hover:bg-white/[0.06] hover:text-white"
              >
                {event.isFeatured ? 'Unfeature event' : 'Feature event'}
              </ConfirmSubmitButton>
            </form>
          </section>

          {/* Fee override */}
          <section className="rounded-lg border border-white/[0.08] bg-[#131A2A] p-5">
            <h2 className="mb-1 font-display text-lg font-semibold">Platform fee for this event</h2>
            <p className="mb-3 text-sm text-white/60">
              Current fee: <span className="font-semibold text-white">{fee.label}</span>{' '}
              <span className="text-white/40">({fee.source === 'live' ? 'live' : 'fallback'})</span>. Set an
              event-specific override below; it wins over the organiser and region defaults, and drives the
              charge, payout, and display together. Saved overrides appear on the Pricing page.
            </p>
            <form action={updateOverridePricingAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input type="hidden" name="scopeKind" value="event" />
              <input type="hidden" name="targetId" value={event.id} />
              <input type="hidden" name="currency" value="AUD" />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ev-pct" className="text-[11px] uppercase tracking-wider text-white/50">Fee percent</label>
                <input id="ev-pct" name="platform_fee_percentage" type="number" step="0.01" min="0" max="100" defaultValue={fee.percent}
                  className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ev-fixed" className="text-[11px] uppercase tracking-wider text-white/50">Fixed (cents)</label>
                <input id="ev-fixed" name="platform_fee_fixed" type="number" step="1" min="0" max="100000" defaultValue={fee.fixedCents}
                  className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none" />
              </div>
              <div className="flex items-end">
                <ConfirmSubmitButton confirmMessage="Set an event-specific platform fee override? New transactions for this event use it immediately." className="rounded-md bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#0A0F1A] transition hover:bg-white">
                  Save event fee
                </ConfirmSubmitButton>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}
