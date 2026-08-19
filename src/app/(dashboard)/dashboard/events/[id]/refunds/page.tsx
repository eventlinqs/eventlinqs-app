import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEventAccess } from '@/lib/organisations/event-access'
import { describeRefundPolicy, policyFromEvent } from '@/lib/refunds/policy'
import { RefundRequestList, type RequestRow } from './request-list'

/**
 * THE ORGANISER'S REFUND QUEUE, which is the "dashboard item" half of the
 * requirement that an organiser gets an email AND a dashboard item. The email can
 * land in spam; this cannot. Eventbrite gives an organiser five business days to
 * respond before the attendee escalates, and an organiser who only had the email
 * would miss the ones that never arrived.
 */

type Props = { params: Promise<{ id: string }> }

export default async function EventRefundsPage({ params }: Props) {
  const { id: eventId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // The one shared access definition, so a manager can work this queue exactly as
  // they can already issue a refund from the order screen.
  const access = await resolveEventAccess(eventId)
  if (!access.allowed) notFound()

  const admin = createAdminClient()

  const { data: event } = await admin
    .from('events')
    .select('id, title, is_free, refund_policy_type, refund_policy_days, refund_policy_absorb_fee, refund_policy_self_service')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) notFound()

  const { data: requests } = await admin
    .from('refund_requests')
    .select('id, status, created_at, decided_at, buyer_message, decision_note, decline_reason, auto_approved, auto_decision_reason, requester_email, order_id')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(200)

  const orderIds = [...new Set((requests ?? []).map(r => r.order_id as string))]
  const { data: orders } = orderIds.length
    ? await admin.from('orders').select('id, order_number, total_cents, currency').in('id', orderIds)
    : { data: [] as Array<{ id: string; order_number: string; total_cents: number; currency: string }> }
  const orderById = new Map((orders ?? []).map(o => [o.id, o]))

  // One count query rather than one per request.
  const { data: links } = orderIds.length
    ? await admin
      .from('refund_request_tickets')
      .select('request_id, ticket_id')
      .in('request_id', (requests ?? []).map(r => r.id as string))
    : { data: [] as Array<{ request_id: string; ticket_id: string }> }
  const countByRequest = new Map<string, number>()
  for (const l of links ?? []) {
    countByRequest.set(l.request_id, (countByRequest.get(l.request_id) ?? 0) + 1)
  }

  const rows: RequestRow[] = (requests ?? []).map(r => {
    const o = orderById.get(r.order_id as string)
    return {
      id: r.id as string,
      status: r.status as string,
      created_at: r.created_at as string,
      decided_at: (r.decided_at as string | null) ?? null,
      buyer_message: (r.buyer_message as string | null) ?? null,
      decision_note: (r.decision_note as string | null) ?? null,
      decline_reason: (r.decline_reason as string | null) ?? null,
      auto_approved: Boolean(r.auto_approved),
      auto_decision_reason: (r.auto_decision_reason as string | null) ?? null,
      requester_email: r.requester_email as string,
      order_number: o?.order_number ?? null,
      total_cents: o?.total_cents ?? null,
      currency: o?.currency ?? null,
      ticket_count: countByRequest.get(r.id as string) ?? 0,
    }
  })

  const open = rows.filter(r => r.status === 'submitted').length

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href={`/dashboard/events/${eventId}`}
        className="text-sm font-medium text-gold-800 underline hover:text-gold-700"
      >
        Back to {event.title}
      </Link>

      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-ink-900">
        Refund requests
      </h1>
      <p className="mt-2 text-sm text-ink-600">
        {open === 0
          ? 'Nothing is waiting on you.'
          : `${open} request${open === 1 ? '' : 's'} waiting on you. Buyers expect an answer within about five business days.`}
      </p>

      <div className="mt-6 rounded-2xl border border-ink-200 bg-white p-6">
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-800">
          This event refund policy
        </p>
        <p className="mt-2 text-sm text-ink-600">
          {describeRefundPolicy(policyFromEvent(event), event.is_free ?? false)}
        </p>
        <p className="mt-3 text-xs text-ink-400">
          A published policy can only be made more generous. Buyers paid under the terms
          shown at the time, so tightening it is refused.
        </p>
      </div>

      <div className="mt-8">
        <RefundRequestList eventId={eventId} rows={rows} />
      </div>
    </main>
  )
}
