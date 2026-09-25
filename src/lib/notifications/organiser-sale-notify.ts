import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import { escapeHtml } from '@/lib/email/escape'
import { formatMoneyDisplay } from '@/lib/money/format'
import { captureException } from '@/lib/observability/sentry'
import {
  decideOrganiserSaleMessage,
  messageTypeForDecision,
  readSalesNotificationMode,
  type OrganiserSaleDecision,
} from './organiser-sales-policy'
import { readOrThrow, ReadFailed } from '@/lib/supabase/read-or-throw'
import { countOrRaise, type CountResult } from '@/lib/supabase/count-or-raise'

/**
 * THE MESSAGE THAT DID NOT EXIST. Close-out MONEY FIX, part B, step B4.
 *
 * MKLStudios sold two tickets on 10 September 2026 and the only human told was
 * the platform owner, because `order_paid` is a PLATFORM notification and the
 * organiser had no counterpart anywhere in the codebase. This is the
 * counterpart.
 *
 * NON-FATAL BY CONSTRUCTION, and the reason is worth stating because "swallow
 * the error" is usually the wrong answer. This runs inside the Stripe webhook,
 * AFTER the order is confirmed and the tickets are issued. A throw here would
 * make Stripe retry a delivery whose money work is already done, and the retry
 * would re-run against a confirmed order. The buyer's tickets must never be put
 * at risk by the organiser's notification, so every failure is captured and
 * reported, and none is raised. That is the same posture the ledger write and
 * the discount write already take three lines above the call site.
 */

type AdminClient = SupabaseClient

export interface OrganiserSaleContext {
  organisationId: string
  eventId: string
  orderId: string
}

export type OrganiserSaleNotifyResult =
  | { status: 'sent'; messageType: string }
  | { status: 'held_for_digest' }
  | {
      status: 'skipped'
      reason: 'mode_off' | 'no_recipient' | 'order_not_found' | 'send_failed' | 'read_failed'
    }

interface SaleFacts {
  organisationName: string
  recipientEmail: string
  mode: string | null
  eventTitle: string
  eventSlug: string | null
  orderNumber: string
  totalCents: number
  currency: string
  ticketCount: number
  isFirstSaleForEvent: boolean
}

/**
 * Tell the organiser one of their tickets sold, honouring their own preference.
 *
 * Returns rather than throws, so the caller can log the outcome without a
 * try/catch of its own and so a test can assert the decision without a mailbox.
 */
export async function notifyOrganiserOfSale(
  admin: AdminClient,
  ctx: OrganiserSaleContext,
): Promise<OrganiserSaleNotifyResult> {
  let facts: SaleFacts | null = null
  try {
    facts = await loadSaleFacts(admin, ctx)
  } catch (err) {
    captureException(err, { where: 'notifications/organiser-sale-notify:loadSaleFacts' })
    /*
     * A READ THAT COULD NOT BE MADE IS NOT AN ORDER THAT DOES NOT EXIST.
     * This catch used to answer `order_not_found` to every throw, so a
     * dropped socket was written into the webhook's warning line as a
     * statement about the order that had just been paid for.
     */
    return { status: 'skipped', reason: err instanceof ReadFailed ? 'read_failed' : 'send_failed' }
  }
  if (!facts) return { status: 'skipped', reason: 'order_not_found' }

  const decision: OrganiserSaleDecision = decideOrganiserSaleMessage({
    mode: readSalesNotificationMode(facts.mode),
    isFirstSaleForEvent: facts.isFirstSaleForEvent,
  })

  if (decision === 'send_nothing') return { status: 'skipped', reason: 'mode_off' }
  if (decision === 'hold_for_digest') return { status: 'held_for_digest' }

  if (!facts.recipientEmail) return { status: 'skipped', reason: 'no_recipient' }

  const messageType = messageTypeForDecision(decision)
  // Unreachable: the two decisions that reach here both name a type. Written as
  // a check rather than a `!` because an unchecked assertion here would send a
  // message with no declared type, which is the one thing B3 forbids.
  if (!messageType) return { status: 'skipped', reason: 'send_failed' }

  const { subject, html, text } = buildSaleEmail(decision, facts)

  try {
    await sendEmail({
      to: facts.recipientEmail,
      subject,
      html,
      text,
      messageType,
      recipientRole: 'organiser',
    })
  } catch (err) {
    captureException(err, {
      where: 'notifications/organiser-sale-notify:send',
      order_id: ctx.orderId,
      message_type: messageType,
    })
    return { status: 'skipped', reason: 'send_failed' }
  }

  return { status: 'sent', messageType }
}

/**
 * A COUNT THAT COULD NOT BE READ, IN THIS MODULE'S OWN VOCABULARY.
 *
 * `countOrRaise` is the platform's door for the count spelling and already
 * refuses both a failed count and a count nobody asked for. It throws a plain
 * Error, and this file answers its caller with a REASON, so the two are joined
 * here rather than by reading an error message back out of a string.
 *
 * THE COUNT SPELLING IS INVISIBLE TO THE TREE'S READ GUARDS, which is why it
 * survived in a file whose every other read has now been through them. Both
 * matchers in `a-failed-read-is-not-a-fact-about-a-person` look for a binding
 * that reads `.data`; `const { count } = await ...` reads neither `data` nor
 * `error`, so neither can see it. Clause 3 of
 * `scripts/guards/a-blink-defers-the-message.mjs` holds it for this directory.
 */
function countOrRead(what: string, result: CountResult): number {
  try {
    return countOrRaise(what, result)
  } catch (err) {
    throw new ReadFailed(what, err)
  }
}

async function loadSaleFacts(
  admin: AdminClient,
  ctx: OrganiserSaleContext,
): Promise<SaleFacts | null> {
  /*
   * WHICH READS RAISE, AND WHY THEY ARE NOT ALL TREATED THE SAME.
   *
   * The line is whether the email would say something FALSE or merely
   * something GENERIC. A read whose failure would put a false statement in
   * front of the organiser raises, and the notice is not sent. A read whose
   * failure only costs the event's name degrades to the fallback that was
   * always there, because a slightly plainer sentence is worth more than a
   * silence.
   *
   * FALSE, therefore raising: the ORDER (its number and amount are in the
   * subject line), the ORGANISATION (it carries `sales_notification_mode`,
   * which is the organiser's own choice about how often they hear from us, and
   * a blinked read used to silently answer `null` and take the choice away),
   * the PROFILE (the address), and both COUNTS. The counts are the sharpest of
   * them: `ticketCount ?? 0` would tell an organiser that nought tickets sold,
   * and `(confirmedCount ?? 0) <= 1` would head every message on a sold-out
   * event `Your first sale`.
   *
   * GENERIC, therefore degrading: the EVENT title and slug, which already
   * fall back to `your event` and the browse page.
   */
  const order = await readOrThrow('organiser-sale-order', () =>
    admin
      .from('orders')
      .select('id, order_number, total_cents, currency, event_id, organisation_id, confirmed_at')
      .eq('id', ctx.orderId)
      .maybeSingle(),
  )
  if (!order) return null

  const org = await readOrThrow('organiser-sale-organisation', () =>
    admin
      .from('organisations')
      .select('id, name, owner_id, sales_notification_mode')
      .eq('id', ctx.organisationId)
      .maybeSingle(),
  )

  const { data: event, error: titleError } = await admin
    .from('events')
    .select('title, slug')
    .eq('id', ctx.eventId)
    .maybeSingle()
  if (titleError) {
    captureException(titleError, {
      where: 'notifications/organiser-sale-notify:title',
      order_id: ctx.orderId,
    })
  }

  let recipientEmail = ''
  if (org?.owner_id) {
    const profile = await readOrThrow('organiser-sale-profile', () =>
      admin.from('profiles').select('email').eq('id', org.owner_id as string).maybeSingle(),
    )
    recipientEmail = (profile?.email as string) ?? ''
  }

  const ticketCount = countOrRead(
    'tickets on this order',
    await admin.from('tickets').select('id', { count: 'exact', head: true }).eq('order_id', ctx.orderId),
  )

  /*
   * IS THIS THE FIRST SALE ON THIS EVENT. Counted from confirmed orders rather
   * than remembered on a flag, because a flag has to be written exactly once
   * and this webhook is explicitly redelivered by Stripe. Counting is
   * idempotent: a redelivery of the same order sees the same count and reaches
   * the same answer, where a flag would have to be checked and set atomically
   * to avoid two "first sale" messages for one sale.
   *
   * head:true so this is a COUNT and not a read of every order on the event.
   */
  const confirmedCount = countOrRead(
    'confirmed orders on this event',
    await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', ctx.eventId)
      .eq('status', 'confirmed'),
  )

  return {
    organisationName: (org?.name as string) ?? 'your organisation',
    recipientEmail,
    mode: (org?.sales_notification_mode as string | null) ?? null,
    eventTitle: (event?.title as string) ?? 'your event',
    eventSlug: (event?.slug as string | null) ?? null,
    orderNumber: (order.order_number as string) ?? '',
    totalCents: Number(order.total_cents ?? 0),
    currency: (order.currency as string) ?? 'AUD',
    ticketCount,
    isFirstSaleForEvent: confirmedCount <= 1,
  }
}

/**
 * The copy. Australian English, no dashes of any kind, no exclamation marks,
 * and it says the amount and the event in the subject because that is what the
 * organiser wants to know before they open anything.
 */
export function buildSaleEmail(
  decision: OrganiserSaleDecision,
  facts: Pick<
    SaleFacts,
    'eventTitle' | 'eventSlug' | 'orderNumber' | 'totalCents' | 'currency' | 'ticketCount'
  >,
): { subject: string; html: string; text: string } {
  const amount = formatMoneyDisplay(facts.totalCents, facts.currency)
  const first = decision === 'send_first_sale'
  const tickets =
    facts.ticketCount === 1 ? '1 ticket' : `${facts.ticketCount} tickets`

  const subject = first
    ? `Your first sale: ${facts.eventTitle}`
    : `Ticket sold: ${facts.eventTitle}`

  const title = first ? 'You have your first sale' : 'You have a sale'

  const lines = first
    ? [
        `${facts.eventTitle} has made its first sale: ${tickets} for ${amount}.`,
        `Order ${facts.orderNumber}. The money is held for you and is paid out after the event, less the EventLinqs fee.`,
        'You own this attendee relationship. Their details are on your dashboard and yours to export whenever you want them.',
      ]
    : [
        `${tickets} sold on ${facts.eventTitle}, for ${amount}.`,
        `Order ${facts.orderNumber}. The money is held for you and is paid out after the event, less the EventLinqs fee.`,
      ]

  const dashboardUrl = `${getSiteUrl().replace(/\/$/, '')}/dashboard/events`
  const cta = { label: 'Open your dashboard', url: dashboardUrl }

  const text = [
    title,
    '',
    ...lines,
    '',
    `${cta.label}: ${cta.url}`,
    '',
    'Change how often you hear about sales in your organiser settings.',
  ].join('\n')

  const html = [
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1628">`,
    `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>`,
    ...lines.map(
      (l) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${escapeHtml(l)}</p>`,
    ),
    `<p style="margin:24px 0"><a href="${cta.url}" style="background:#0A1628;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${escapeHtml(cta.label)}</a></p>`,
    `<p style="font-size:13px;line-height:1.5;margin:0;color:#4a5568">Change how often you hear about sales in your organiser settings.</p>`,
    `</div>`,
  ].join('')

  return { subject, html, text }
}
