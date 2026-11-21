import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { getAdminEventDetail, actionsForEventStatus, featureAllowed, EVENT_ACTION_LABELS } from '@/lib/admin/events'
import { getLivePublicFee } from '@/lib/pricing/live-fee'
import { ConfirmSubmitButton } from '@/components/admin/confirm-submit-button'
import { SalesPacePanel } from '@/components/dashboard/sales-pace-panel'
import { paceForSlot } from '@/lib/ledger/pace'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteRefusalSentence, judgeDeleteEligibility, readMoneyRecordCounts } from '@/lib/events/delete-eligibility'
import { eventActionForm, eventDeleteForm, eventFeatureForm } from '../actions'
import { updateOverridePricingAction } from '../../pricing/actions'
import { PageHeader, SECONDARY, StatusChip, type ChipTone } from '@/components/admin/ui/admin-kit'
import { dayDate, dayTime } from '@/lib/dates/admin-dates'

/** Each status as the kit's coloured chip, the same words as the events list (the PM's 02:45 fix 2). */
const STATUS_CHIP: Record<string, { tone: ChipTone; word: string }> = {
  draft: { tone: 'info', word: 'Draft' },
  scheduled: { tone: 'info', word: 'Scheduled' },
  published: { tone: 'ok', word: 'Live' },
  paused: { tone: 'waits', word: 'Paused' },
  postponed: { tone: 'waits', word: 'Postponed' },
  cancelled: { tone: 'fault', word: 'Cancelled' },
  completed: { tone: 'off', word: 'Ended' },
  archived: { tone: 'off', word: 'Archived' },
}
const QUIET = 'inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--admin-line)] px-4 text-sm font-medium text-[var(--admin-ink)] transition hover:bg-[var(--admin-tint-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Manage event | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ notice?: string }>

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
  // The database's own count of money records decides whether Delete is
  // offered here, exactly as it does for the organiser (close-out C13.7).
  const eligibility = judgeDeleteEligibility(await readMoneyRecordCounts(createAdminClient(), id))
  /*
   * HOW THIS EVENT SOLD, read out of the slot ledger and nowhere else, through
   * the same one door the organiser's own dashboard reads it through.
   *
   * WHY IT IS HERE (close-out D1, 13 September 2026). The ledger's whole purpose
   * is answering when units sold and at what price, and until now the only
   * surface that rendered that answer was the owning organiser's dashboard. For
   * the one real production event the platform has sold tickets for, that
   * dashboard belongs to an outside organiser, so the person who owns the
   * platform could not read it anywhere. D1's last open leg was exactly that,
   * and the ledger row for it said so in as many words: "no admin surface
   * renders the panel".
   *
   * A null curve is a real answer and the panel renders it as one: an event
   * created before the ledger existed did not sell nothing.
   */
  const paceCurve = await paceForSlot(id)

  return (
    <div>
      <nav className="mb-6 text-sm text-[var(--admin-muted)]">
        <Link prefetch={false} href="/admin/events" className="hover:text-[var(--admin-ink)]">Events</Link>
        <span aria-hidden className="px-2">/</span>
        <span className="text-[var(--admin-ink)]">{event.title}</span>
      </nav>

      <PageHeader
        eyebrow="Events"
        title={event.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip tone={STATUS_CHIP[event.status]?.tone ?? 'info'}>{STATUS_CHIP[event.status]?.word ?? event.status}</StatusChip>
            {event.isFeatured ? <StatusChip tone="waits">Featured</StatusChip> : null}
            <StatusChip tone="info">{event.visibility === 'public' ? 'Public' : event.visibility === 'private' ? 'Private' : event.visibility === 'unlisted' ? 'Unlisted' : event.visibility}</StatusChip>
            <StatusChip tone="info">{event.isFree ? 'Free' : 'Paid'}</StatusChip>
          </span>
        }
        action={
          <span className="flex flex-wrap gap-2">
            <Link prefetch={false} href={`/events/${event.slug}`} className={SECONDARY}>View public page</Link>
            <Link prefetch={false} href={`/admin/organisers/${event.organisationId}`} className={SECONDARY}>Organiser</Link>
          </span>
        }
      />

      {notice && (
        <div role={notice === 'error' || notice === 'title' || notice === 'money' ? 'alert' : 'status'} className={`mb-6 rounded-md border px-4 py-3 text-sm ${notice === 'error' || notice === 'title' || notice === 'money' ? 'border-red-500/30 bg-red-500/10 text-red-800' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800'}`}>
          {notice === 'error'
            ? 'Could not apply that change.'
            : notice === 'title'
              ? 'The title you typed does not match the event, so nothing was deleted.'
              : notice === 'money'
                ? 'The database refused the delete: this event has orders, tickets or refunds. Archive it instead.'
                : notice === 'featured'
                  ? 'Event featured.'
                  : notice === 'unfeatured'
                    ? 'Event unfeatured.'
                    : 'Done.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Details */}
        <section className="rounded-lg border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Details</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-[var(--admin-muted)]">Organiser</dt><dd className="text-[var(--admin-ink)]">{event.organisationName ?? '-'}</dd>
            {/* The slug as a short grey line that wraps after its hyphens (the PM's 07:30 polish (c)); copied whole, as typed. */}
            <dt className="text-[var(--admin-muted)]">Slug</dt>
            <dd data-slug className="text-[12px] leading-5 text-[var(--admin-muted)]">
              {event.slug.split('-').map((part, i, all) => (
                <span key={i}>{part}{i < all.length - 1 ? '-' : ''}<wbr /></span>
              ))}
            </dd>
            <dt className="text-[var(--admin-muted)]">Starts</dt><dd className="text-[var(--admin-ink)]">{dayTime(event.startDate)}</dd>
            <dt className="text-[var(--admin-muted)]">Ends</dt><dd className="text-[var(--admin-ink)]">{dayTime(event.endDate)}</dd>
            <dt className="text-[var(--admin-muted)]">Venue</dt><dd className="text-[var(--admin-ink)]">{event.venueName ?? '-'}{event.city ? `, ${event.city}` : ''}</dd>
            <dt className="text-[var(--admin-muted)]">Capacity</dt><dd className="text-[var(--admin-ink)]">{event.maxCapacity ?? 'Unlimited'}</dd>
            <dt className="text-[var(--admin-muted)]">Fee treatment</dt><dd className="text-[var(--admin-ink)]">{event.feePassType === 'absorb' ? 'Organiser absorbs' : 'Passed to buyer'}</dd>
            <dt className="text-[var(--admin-muted)]">Created</dt><dd className="text-[var(--admin-ink)]">{dayDate(event.createdAt)}</dd>
          </dl>

          <h3 className="mt-5 mb-2 text-xs font-medium text-[var(--admin-soft)]">Ticket tiers</h3>
          {event.tiers.length === 0 ? (
            <p className="text-sm text-[var(--admin-muted)]">No ticket tiers.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {event.tiers.map((t) => (
                <li key={t.id} className="flex justify-between border-b border-[var(--admin-line)] py-1">
                  <span className="text-[var(--admin-ink)]">{t.name}</span>
                  <span className="text-[var(--admin-ink)]">{money(t.priceCents, t.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Controls */}
        <div className="flex flex-col gap-6">
          {/* Moderation */}
          <section className="rounded-lg border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5">
            <h2 className="mb-3 font-display text-lg font-semibold">Status and moderation</h2>
            {actions.length === 0 ? (
              <p className="text-sm text-[var(--admin-muted)]">No moderation actions available from {event.status}.</p>
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
                        ? 'rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm font-semibold text-red-800 transition hover:bg-red-500/20'
                        : action === 'pause'
                          ? 'rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-500/20'
                          : QUIET}
                    >
                      {EVENT_ACTION_LABELS[action]}
                    </ConfirmSubmitButton>
                  </form>
                ))}
              </div>
            )}
            {/* Feature only on a live event (the PM's 05:37 fix 4): an archived event offers Restore and Delete alone. */}
            {featureAllowed(event.status) ? (
            <form action={eventFeatureForm} className="mt-4 border-t border-[var(--admin-line)] pt-4">
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="featured" value={event.isFeatured ? 'false' : 'true'} />
              <ConfirmSubmitButton
                confirmMessage={event.isFeatured ? 'Remove this event from featured?' : 'Feature this event?'}
                className="rounded-md border border-[var(--admin-line)] px-3 py-1.5 text-sm font-semibold text-[var(--admin-ink)] transition hover:bg-[var(--admin-tint-strong)] hover:text-[var(--admin-ink)]"
              >
                {event.isFeatured ? 'Unfeature event' : 'Feature event'}
              </ConfirmSubmitButton>
            </form>
            ) : null}
          </section>

          {/* Delete, under the same database rule as the organiser (C13.7) */}
          <section className="rounded-lg border border-red-500/20 bg-[var(--admin-paper)] p-5" data-testid="admin-delete-panel">
            <h2 className="mb-1 font-display text-lg font-semibold text-red-800">Delete</h2>
            {eligibility.deletable ? (
              <>
                <p className="mb-3 text-sm text-[var(--admin-soft)]">
                  Permanent, with no undo. The event, its tiers, codes, lineup, seats and artwork are removed and its
                  address answers 410 Gone. Offered only because this event has never had an order, a ticket, a
                  squad purchase, a discount redemption or a refund; the database checks again as it deletes, and
                  there is no admin override.
                </p>
                <form action={eventDeleteForm} className="space-y-3">
                  <input type="hidden" name="eventId" value={event.id} />
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-[var(--admin-soft)]">Type the event title to confirm</span>
                    <input
                      name="typedTitle"
                      type="text"
                      required
                      autoComplete="off"
                      placeholder={event.title}
                      className="w-full rounded-md border border-[var(--admin-line)] bg-[var(--admin-tint)] px-3 py-2 text-sm text-[var(--admin-ink)] outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
                    />
                  </label>
                  <ConfirmSubmitButton
                    confirmMessage={`Delete "${event.title}" permanently? There is no undo. Recorded in the audit log.`}
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm font-semibold text-red-800 transition hover:bg-red-500/20"
                  >
                    Delete event permanently
                  </ConfirmSubmitButton>
                </form>
              </>
            ) : (
              <p className="text-sm text-[var(--admin-soft)]" data-testid="admin-delete-refusal">
                {deleteRefusalSentence(eligibility)} The database refuses the delete for the same reason, for every role.
              </p>
            )}
          </section>

          {/* Takedown (post-moderation) */}
          {event.status !== 'cancelled' && event.status !== 'completed' && event.status !== 'archived' ? (
            <section className="rounded-lg border border-red-500/20 bg-[var(--admin-paper)] p-5">
              <h2 className="mb-1 font-display text-lg font-semibold text-red-800">Take down</h2>
              <p className="mb-3 text-sm text-[var(--admin-soft)]">
                Remove this event from sale for a policy breach. This cancels the event and cannot be undone. A reason is
                required and recorded in the audit log.
              </p>
              <form action={eventActionForm} className="space-y-3">
                <input type="hidden" name="eventId" value={event.id} />
                <input type="hidden" name="action" value="takedown" />
                <input type="hidden" name="returnTo" value={`/admin/events/${event.id}`} />
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-[var(--admin-soft)]">Reason (required)</span>
                  <textarea
                    name="reason"
                    required
                    rows={3}
                    placeholder="Why is this event being taken down"
                    className="w-full rounded-md border border-[var(--admin-line)] bg-[var(--admin-tint)] px-3 py-2 text-sm text-[var(--admin-ink)] outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]"
                  />
                </label>
                <ConfirmSubmitButton
                  confirmMessage={`Take down "${event.title}"? This removes it from sale and is recorded in the audit log.`}
                  className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm font-semibold text-red-800 transition hover:bg-red-500/20"
                >
                  Take down event
                </ConfirmSubmitButton>
              </form>
            </section>
          ) : null}

          {/* Fee override */}
          <section className="rounded-lg border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5">
            <h2 className="mb-1 font-display text-lg font-semibold">Platform fee for this event</h2>
            <p className="mb-3 text-sm text-[var(--admin-soft)]">
              Current fee: <span className="font-semibold text-[var(--admin-ink)]">{fee.label}</span>{' '}
              <span className="text-[var(--admin-muted)]">({fee.source === 'live' ? 'live' : 'fallback'})</span>. Set an
              event-specific override below; it wins over the organiser and region defaults, and drives the
              charge, payout, and display together. Saved overrides appear on the Pricing page.
            </p>
            <form action={updateOverridePricingAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input type="hidden" name="scopeKind" value="event" />
              <input type="hidden" name="targetId" value={event.id} />
              <input type="hidden" name="currency" value="AUD" />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ev-pct" className="text-xs font-medium text-[var(--admin-soft)]">Fee percent</label>
                {/* min is 0.01, not 0: pricing_rules_value_split_check requires
                    value_percentage > 0, so 0 is the one value this control must
                    not offer. Zero fee is the Founding Organiser waiver. */}
                <input id="ev-pct" name="platform_fee_percentage" type="number" step="0.01" min="0.01" max="100" required defaultValue={fee.percent || undefined}
                  className="rounded-md border border-[var(--admin-line)] bg-[var(--admin-tint)] px-2 py-1.5 text-[var(--admin-ink)] focus:border-[var(--admin-line-strong)] focus:outline-none" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ev-fixed" className="text-xs font-medium text-[var(--admin-soft)]">Fixed (cents)</label>
                <input id="ev-fixed" name="platform_fee_fixed" type="number" step="1" min="0" max="100000" defaultValue={fee.fixedCents}
                  className="rounded-md border border-[var(--admin-line)] bg-[var(--admin-tint)] px-2 py-1.5 text-[var(--admin-ink)] focus:border-[var(--admin-line-strong)] focus:outline-none" />
              </div>
              <div className="flex items-end">
                <ConfirmSubmitButton confirmMessage="Set an event-specific platform fee override? New transactions for this event use it immediately." className={QUIET}>
                  Save event fee
                </ConfirmSubmitButton>
              </div>
            </form>
          </section>
        </div>
      </div>

      {/* Full width, because the curve is a plot and a two-column cell crushes
          it. Below the controls so the moderation actions stay above the fold. */}
      <div className="mt-6">
        <SalesPacePanel curve={paceCurve} tone="console" />
      </div>
    </div>
  )
}
