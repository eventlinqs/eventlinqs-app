import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import { escapeHtml } from '@/lib/email/escape'
import { formatMoneyDisplay } from '@/lib/money/format'
import { captureException } from '@/lib/observability/sentry'
import { resolveOrganisationOwnerEmail } from './organiser-recipient'

/**
 * THE FOUR MONEY MESSAGES AN ORGANISER WAS NEVER SENT. Close-out MONEY FIX,
 * part B, step B4, the remainder.
 *
 * All four types were DECLARED in the recipient matrix on 18 September and none
 * of them reached the organiser, which is a promise with nothing behind it. The
 * matrix records who should receive a message; only a send site makes it
 * happen. Each is built here, and `guard:every-message-has-a-declared-recipient`
 * clause 2b already fails the build on a companion that is declared and never
 * sent, so the gap could not have survived being named.
 *
 * WHY THESE, in the item's own words: the organiser receives "every refund on
 * their event", "every dispute immediately and marked urgent", and "any payment
 * setup problem". The fourth, a refund that FAILED at the bank, was not on that
 * list and was found by writing clause 4 of the guard: it declared the
 * organiser as a recipient and only the platform owner was ever sent it. The
 * governing sentence is "the organiser's money belongs to the organiser and so
 * does the news about it."
 *
 * ============================================================================
 * NONE OF THESE MAY BE SWITCHED OFF, AND THAT IS ENFORCED ELSEWHERE
 * ============================================================================
 *
 * `organisations.sales_notification_mode` governs SALE messages only. The
 * item's reversal condition is explicit: "payout, refund, dispute and payment
 * setup messages cannot be switched off by anyone", and clause 3 of the guard
 * fails the build if any of these paths starts reading that column. So there is
 * deliberately no preference lookup in this file.
 *
 * ============================================================================
 * NON-FATAL, FOR THE SAME REASON THE SALE NOTICE IS
 * ============================================================================
 *
 * Two of these run inside the Stripe webhook, AFTER the money work is done. A
 * throw would make Stripe retry a delivery whose refund or freeze has already
 * been applied. The buyer's money and the organiser's ledger must never be put
 * at risk by a mail server, so every failure is captured and reported and none
 * is raised. Each function returns its outcome so a caller can log what
 * happened without a try/catch of its own, and so a test can assert the
 * decision without a mailbox.
 */

type AdminClient = SupabaseClient

export type OrganiserNotifyResult =
  | { status: 'sent' }
  | { status: 'skipped'; reason: 'no_recipient' | 'not_found' | 'send_failed' }

/** The shared shell. Australian English, no dashes of any kind, no exclamation marks. */
function wrap(title: string, lines: string[], cta?: { label: string; url: string }): { html: string; text: string } {
  const body = lines.filter(Boolean)
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0A1628">',
    `<h1 style="font-size:20px;line-height:1.3;margin:0 0 16px">${escapeHtml(title)}</h1>`,
    ...body.map(l => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${escapeHtml(l)}</p>`),
    cta
      ? `<p style="margin:24px 0"><a href="${cta.url}" style="background:#0A1628;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${escapeHtml(cta.label)}</a></p>`
      : '',
    '</div>',
  ].join('')
  const text = [title, '', ...body, cta ? `${cta.label}: ${cta.url}` : ''].filter(Boolean).join('\n\n')
  return { html, text }
}

const origin = () => getSiteUrl().replace(/\/$/, '')

/* =========================================================================
 * 1. A REFUND ON THEIR EVENT HAS SETTLED
 * ========================================================================= */

/**
 * `refund_completed` declared `roles: ['buyer', 'organiser']` from the day the
 * matrix was written, and only the buyer was ever sent it. The organiser
 * learned that money had left their event from nobody.
 *
 * IT IS SENT SEPARATELY FROM THE BUYER'S COPY, DELIBERATELY. The buyer's leg
 * lives in the Stripe webhook and begins `if (!buyerEmail) return`, which is
 * correct for the buyer and would have silenced the organiser for a reason that
 * has nothing to do with them. An order with no buyer address is exactly the
 * kind of order an organiser most needs to hear about.
 */
export async function notifyOrganiserOfCompletedRefund(
  admin: AdminClient,
  input: { orderId: string; amountCents: number; currency: string; ticketCount: number },
): Promise<OrganiserNotifyResult> {
  try {
    const { data: order } = await admin
      .from('orders')
      .select('order_number, event_id, organisation_id')
      .eq('id', input.orderId)
      .maybeSingle()
    if (!order?.organisation_id) return { status: 'skipped', reason: 'not_found' }

    const { data: event } = await admin
      .from('events')
      .select('title')
      .eq('id', order.event_id as string)
      .maybeSingle()

    const recipient = await resolveOrganisationOwnerEmail(admin, order.organisation_id as string)
    if (!recipient) return { status: 'skipped', reason: 'no_recipient' }

    const eventTitle = (event?.title as string | null) ?? 'your event'
    const amount = formatMoneyDisplay(input.amountCents, input.currency)
    const tickets = `${input.ticketCount} ticket${input.ticketCount === 1 ? '' : 's'}`

    const { html, text } = wrap(
      'A refund has settled on your event',
      [
        `${amount} has been refunded to a buyer on ${eventTitle}, order ${order.order_number ?? ''}.`,
        `${tickets} on that order no longer scan at the door, so the places are back in your inventory.`,
        'The amount comes off what is owed to you for this event, and your payout figures already reflect it.',
        'There is nothing for you to do. This message exists so the first you hear of it is not a gap in your payout.',
      ],
      { label: 'See your payouts', url: `${origin()}/dashboard/payouts` },
    )

    await sendEmail({
      to: recipient.email,
      subject: `Refund settled: ${eventTitle} (order ${order.order_number ?? ''})`,
      html,
      text,
      messageType: 'refund_completed',
      recipientRole: 'organiser',
    })
    return { status: 'sent' }
  } catch (err) {
    captureException(err, { where: 'notifications/organiser-money-notify:refund', order_id: input.orderId })
    return { status: 'skipped', reason: 'send_failed' }
  }
}

/* =========================================================================
 * 2. A CHARGEBACK HAS BEEN OPENED AGAINST THEIR EVENT
 * ========================================================================= */

/**
 * `charge.dispute.created` FREEZES THE ORGANISER'S SHARE AND TOLD NOBODY.
 *
 * The webhook calls `freeze_chargeback`, which pins that order's share so it
 * can never be paid out while the dispute is open, and then logged a line to
 * the server console. The organiser's money stopped moving and the only party
 * informed was the platform. That is the MKLStudios defect in its most
 * expensive form, because a dispute has a deadline: Stripe documents that
 * evidence must be submitted by `evidence_details.due_by` or the dispute is
 * lost by default.
 *
 * MARKED URGENT, which is the item's word. The subject line says so, the first
 * sentence says what has been frozen, and the deadline is stated when Stripe
 * has given one rather than described in general terms.
 */
export async function notifyOrganiserOfDispute(
  admin: AdminClient,
  input: {
    orderId: string
    disputeAmountCents: number
    currency: string
    /** Stripe's own `evidence_details.due_by`, as a unix timestamp in seconds, when it gives one. */
    evidenceDueBy: number | null
  },
): Promise<OrganiserNotifyResult> {
  try {
    const { data: order } = await admin
      .from('orders')
      .select('order_number, event_id, organisation_id')
      .eq('id', input.orderId)
      .maybeSingle()
    if (!order?.organisation_id) return { status: 'skipped', reason: 'not_found' }

    const { data: event } = await admin
      .from('events')
      .select('title')
      .eq('id', order.event_id as string)
      .maybeSingle()

    const recipient = await resolveOrganisationOwnerEmail(admin, order.organisation_id as string)
    if (!recipient) return { status: 'skipped', reason: 'no_recipient' }

    const eventTitle = (event?.title as string | null) ?? 'your event'
    const amount = formatMoneyDisplay(input.disputeAmountCents, input.currency)

    const { html, text } = wrap(
      'Urgent: a chargeback has been opened on your event',
      [
        `A buyer's bank has disputed ${amount} on ${eventTitle}, order ${order.order_number ?? ''}.`,
        `That ${amount} is held and will not be paid out to you while the dispute is open. If the dispute is lost the amount stays withheld; if it is won it is released back to you.`,
        deadlineSentence(input.evidenceDueBy),
        'Reply to this email with anything that shows the ticket was sold and the buyer was told what they were buying: the order, the scan record, and any messages between you. We submit the response.',
      ],
      { label: 'Open your payouts', url: `${origin()}/dashboard/payouts` },
    )

    await sendEmail({
      to: recipient.email,
      subject: `Urgent: chargeback opened on ${eventTitle} (order ${order.order_number ?? ''})`,
      html,
      text,
      messageType: 'organiser_dispute_opened',
      recipientRole: 'organiser',
    })
    return { status: 'sent' }
  } catch (err) {
    captureException(err, { where: 'notifications/organiser-money-notify:dispute', order_id: input.orderId })
    return { status: 'skipped', reason: 'send_failed' }
  }
}

/**
 * THE DEADLINE IS STRIPE'S OR IT IS NOT STATED.
 *
 * Stripe publishes the response deadline per dispute on
 * `evidence_details.due_by` and does not publish one fixed number of days that
 * applies to every dispute, so inventing "you have 7 days" would be an
 * unsourced claim about somebody's money on the one message where being wrong
 * costs them the disputed amount. When Stripe has not given a date, the
 * sentence says the deadline is short and that we will confirm it, which is
 * true, rather than a number that might not be.
 */
function deadlineSentence(dueBy: number | null): string {
  if (dueBy && Number.isFinite(dueBy)) {
    const due = new Date(dueBy * 1000)
    const when = due.toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Australia/Melbourne',
    })
    return `Evidence has to be with the bank by ${when}. After that the dispute is decided without it.`
  }
  return 'The window to respond is short and is set by the buyer\'s bank. We will confirm the exact date with you, and the sooner you send anything you have the better.'
}

/* =========================================================================
 * 3. THEIR PAYMENT SETUP HAS STOPPED WORKING
 * ========================================================================= */

/** What Stripe now says about an organiser's connected account. */
export interface ConnectPosture {
  chargesEnabled: boolean
  payoutsEnabled: boolean
}

/**
 * Tell an organiser their Connect account can no longer take money or be paid
 * out, at the moment Stripe says so rather than at the moment they try to sell.
 *
 * THE DEFECT THIS CLOSES. `account.updated` wrote the new posture into the
 * organisations row and told nobody. The organiser found out when a publish was
 * refused, or when a buyer met "This organiser is still finishing their payment
 * setup" on an event they had already promoted.
 *
 * ONLY ON THE TRANSITION, NOT ON EVERY EVENT. Stripe sends `account.updated`
 * for changes that have nothing to do with payability, and an account that has
 * simply never been finished is not news every time it is touched. The caller
 * passes the posture BEFORE and AFTER and this sends only when something that
 * was working has stopped, which is the only version of this message that stays
 * worth reading.
 */
export async function notifyOrganiserOfPaymentSetupProblem(
  admin: AdminClient,
  input: { organisationId: string; before: ConnectPosture; after: ConnectPosture },
): Promise<OrganiserNotifyResult | { status: 'skipped'; reason: 'no_change' }> {
  try {
    if (!hasStoppedWorking(input.before, input.after)) return { status: 'skipped', reason: 'no_change' }

    const recipient = await resolveOrganisationOwnerEmail(admin, input.organisationId)
    if (!recipient) return { status: 'skipped', reason: 'no_recipient' }

    const lostCharges = input.before.chargesEnabled && !input.after.chargesEnabled
    const lostPayouts = input.before.payoutsEnabled && !input.after.payoutsEnabled
    const what = lostCharges && lostPayouts
      ? 'take payments or receive payouts'
      : lostCharges
        ? 'take payments'
        : 'receive payouts'

    const { html, text } = wrap(
      'Your payment setup needs attention',
      [
        `Stripe has told us that ${recipient.organisationName} can no longer ${what}.`,
        'Until it is resolved, tickets on your paid events cannot be sold and money already held for you cannot be sent.',
        'This is almost always a document or a detail Stripe still needs, and it is usually a few minutes of work.',
        'Open your payouts page: it shows exactly what Stripe is asking for, in Stripe\'s own words, and takes you straight there.',
      ],
      { label: 'Fix payment setup', url: `${origin()}/dashboard/payouts` },
    )

    await sendEmail({
      to: recipient.email,
      subject: `Action needed: ${recipient.organisationName} cannot ${what}`,
      html,
      text,
      messageType: 'organiser_payment_setup_problem',
      recipientRole: 'organiser',
    })
    return { status: 'sent' }
  } catch (err) {
    captureException(err, {
      where: 'notifications/organiser-money-notify:payment-setup',
      organisation_id: input.organisationId,
    })
    return { status: 'skipped', reason: 'send_failed' }
  }
}

/**
 * A capability that was true and is now false. Pure, and exported so the
 * transition rule is testable on its own rather than only through a mailbox.
 *
 * GOING THE OTHER WAY IS NOT A PROBLEM and must not send: an account that has
 * just been enabled is good news the organiser already has from Stripe, and
 * treating it as a fault would train them to ignore this message.
 */
export function hasStoppedWorking(before: ConnectPosture, after: ConnectPosture): boolean {
  const chargesLost = before.chargesEnabled && !after.chargesEnabled
  const payoutsLost = before.payoutsEnabled && !after.payoutsEnabled
  return chargesLost || payoutsLost
}

/* =========================================================================
 * 4. A REFUND ON THEIR EVENT FAILED AT THE BANK AND THE BUYER IS STILL OWED
 * ========================================================================= */

/**
 * `refund_did_not_complete` DECLARED THE ORGANISER AND ONLY THE OWNER WAS EVER
 * SENT IT, and this was found by writing clause 4 of the guard rather than by
 * reading the code.
 *
 * The matrix has said `roles: ['organiser', 'platform_owner']` since 18
 * September, with the description "A refund on their event failed to settle and
 * the buyer is still owed". The one send in the Stripe webhook is
 * `recipientRole: 'platform_owner'` to the alert address. Clause 2 could not
 * see it: clause 2 judges the DECLARATION, which names both parties and is
 * lawful, and nothing judged the SENDS.
 *
 * So this is the MKLStudios defect still live, in a message type that had
 * already been written down as belonging to the organiser too.
 *
 * WHY THE ORGANISER NEEDS THIS AND IT IS NOT JUST AN INTERNAL ALERT. Their
 * buyer asked for money back, was told it was coming, and does not have it. The
 * organiser is the person that buyer will contact, and an unanswered refund is
 * the single most common cause of a card chargeback, which costs the organiser
 * the money and a fee on top. They are told what happened, that it is ours to
 * fix, and what not to do.
 */
export async function notifyOrganiserRefundDidNotComplete(
  admin: AdminClient,
  input: { orderId: string; amountCents: number; currency: string },
): Promise<OrganiserNotifyResult> {
  try {
    const { data: order } = await admin
      .from('orders')
      .select('order_number, event_id, organisation_id')
      .eq('id', input.orderId)
      .maybeSingle()
    if (!order?.organisation_id) return { status: 'skipped', reason: 'not_found' }

    const { data: event } = await admin
      .from('events')
      .select('title')
      .eq('id', order.event_id as string)
      .maybeSingle()

    const recipient = await resolveOrganisationOwnerEmail(admin, order.organisation_id as string)
    if (!recipient) return { status: 'skipped', reason: 'no_recipient' }

    const eventTitle = (event?.title as string | null) ?? 'your event'
    const amount = formatMoneyDisplay(input.amountCents, input.currency)

    const { html, text } = wrap(
      'A refund on your event did not reach the buyer',
      [
        `A refund of ${amount} on ${eventTitle}, order ${order.order_number ?? ''}, failed at the buyer's bank. The money came back to us and the buyer does not have it.`,
        'This one is ours to fix and we are arranging another way to pay them. You do not need to refund them yourself, and you should not: it would pay them twice.',
        'You are being told because they may contact you first, and because an unanswered refund is the most common reason a buyer goes to their bank instead, which costs you the amount and a fee on top.',
        'If they do contact you, tell them the refund failed at their bank and is being re-sent, and send us anything they tell you about the card or account.',
      ],
      { label: 'See the order', url: `${origin()}/dashboard/payouts` },
    )

    await sendEmail({
      to: recipient.email,
      subject: `A refund on ${eventTitle} did not reach the buyer (order ${order.order_number ?? ''})`,
      html,
      text,
      messageType: 'refund_did_not_complete',
      recipientRole: 'organiser',
    })
    return { status: 'sent' }
  } catch (err) {
    captureException(err, {
      where: 'notifications/organiser-money-notify:refund-did-not-complete',
      order_id: input.orderId,
    })
    return { status: 'skipped', reason: 'send_failed' }
  }
}
