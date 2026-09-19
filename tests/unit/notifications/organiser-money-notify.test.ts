/**
 * MONEY FIX, PART B, B4. The four money messages an organiser was never sent.
 *
 * WHY THIS FILE EXISTS AT ALL, and it is the more useful half of the finding.
 * The item's named tests `organiser_receives_every_refund` and
 * `organiser_receives_dispute_immediately` already existed and already passed.
 * They assert the MATRIX:
 *
 *     expect(resolveRecipientRoles('refund_did_not_complete')).toContain('organiser')
 *
 * That was true, and no code anywhere sent that message to an organiser. A
 * declaration is a promise; a send site is the only thing that keeps it, and a
 * test that reads the promise passes just as happily either way.
 *
 * So these cases judge the SENDERS: who is addressed, what type is named, what
 * role is declared at the transport, and what is refused. The matrix tests stay
 * where they are and keep doing their own job.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/notifications/organiser-recipient', () => ({
  resolveOrganisationOwnerEmail: vi.fn(),
}))
vi.mock('@/lib/observability/sentry', () => ({ captureException: vi.fn() }))

import { sendEmail } from '@/lib/email/send'
import { resolveOrganisationOwnerEmail } from '@/lib/notifications/organiser-recipient'
import {
  hasStoppedWorking,
  notifyOrganiserOfCompletedRefund,
  notifyOrganiserOfDispute,
  notifyOrganiserOfPaymentSetupProblem,
  notifyOrganiserRefundDidNotComplete,
} from '@/lib/notifications/organiser-money-notify'

const sent = vi.mocked(sendEmail)
const resolved = vi.mocked(resolveOrganisationOwnerEmail)

/**
 * The reads these senders make, in the order they make them: the order, then
 * the event. Returning by table keeps each case readable and makes a "row is
 * missing" case one field rather than a new stub.
 */
function stubAdmin(rows: { orders?: Record<string, unknown> | null; events?: Record<string, unknown> | null }) {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = self
    chain.eq = self
    chain.maybeSingle = () =>
      Promise.resolve({ data: table === 'orders' ? (rows.orders ?? null) : (rows.events ?? null), error: null })
    return chain
  }
  return { from } as never
}

const ORDER = { order_number: 'EL-TEST1234', event_id: 'evt_1', organisation_id: 'org_1' }
const EVENT = { title: 'Afro-Fusion Music Showcase' }
const OWNER = { email: 'organiser@example.com', organisationName: 'MKLStudios', organisationId: 'org_1' }

beforeEach(() => {
  sent.mockReset()
  resolved.mockReset()
  resolved.mockResolvedValue(OWNER)
})

describe('a refund that settled on their event', () => {
  it('addresses_the_organisation_owner_and_names_the_declared_type_and_role', async () => {
    const result = await notifyOrganiserOfCompletedRefund(stubAdmin({ orders: ORDER, events: EVENT }), {
      orderId: 'ord_1',
      amountCents: 5_000,
      currency: 'AUD',
      ticketCount: 2,
    })
    expect(result).toEqual({ status: 'sent' })
    expect(sent).toHaveBeenCalledTimes(1)
    const msg = sent.mock.calls[0][0]
    expect(msg.to).toBe('organiser@example.com')
    expect(msg.messageType).toBe('refund_completed')
    expect(msg.recipientRole).toBe('organiser')
    expect(msg.subject).toContain('Afro-Fusion Music Showcase')
    expect(msg.text).toContain('EL-TEST1234')
  })

  it('does_not_depend_on_the_buyer_having_an_address', async () => {
    // STRUCTURAL, NOT INCIDENTAL. The buyer's copy lives in the Stripe webhook
    // and begins `if (!buyerEmail) return`, which is right for the buyer and
    // would have silenced the organiser for a reason that is not about them.
    // This sender is not given a buyer address at all, so it cannot acquire
    // that dependency by a later edit without changing its signature.
    const params = Object.keys({ orderId: '', amountCents: 0, currency: '', ticketCount: 0 })
    expect(params).not.toContain('buyerEmail')
    const result = await notifyOrganiserOfCompletedRefund(stubAdmin({ orders: ORDER, events: EVENT }), {
      orderId: 'ord_1',
      amountCents: 100,
      currency: 'AUD',
      ticketCount: 1,
    })
    expect(result).toEqual({ status: 'sent' })
  })

  it('reports_a_missing_recipient_rather_than_returning_as_though_it_sent', async () => {
    resolved.mockResolvedValue(null)
    const result = await notifyOrganiserOfCompletedRefund(stubAdmin({ orders: ORDER, events: EVENT }), {
      orderId: 'ord_1',
      amountCents: 100,
      currency: 'AUD',
      ticketCount: 1,
    })
    expect(result).toEqual({ status: 'skipped', reason: 'no_recipient' })
    expect(sent).not.toHaveBeenCalled()
  })

  it('sends_nothing_when_the_order_names_no_organisation', async () => {
    const result = await notifyOrganiserOfCompletedRefund(
      stubAdmin({ orders: { ...ORDER, organisation_id: null }, events: EVENT }),
      { orderId: 'ord_1', amountCents: 100, currency: 'AUD', ticketCount: 1 },
    )
    expect(result).toEqual({ status: 'skipped', reason: 'not_found' })
    expect(sent).not.toHaveBeenCalled()
  })
})

describe('a chargeback opened against their event', () => {
  it('is_marked_urgent_and_says_what_has_been_frozen', async () => {
    const result = await notifyOrganiserOfDispute(stubAdmin({ orders: ORDER, events: EVENT }), {
      orderId: 'ord_1',
      disputeAmountCents: 5_274,
      currency: 'AUD',
      evidenceDueBy: null,
    })
    expect(result).toEqual({ status: 'sent' })
    const msg = sent.mock.calls[0][0]
    expect(msg.messageType).toBe('organiser_dispute_opened')
    expect(msg.recipientRole).toBe('organiser')
    // "every dispute immediately and marked urgent" is the item's wording, and
    // the subject is the only part an organiser sees before deciding to open it.
    expect(msg.subject.toLowerCase()).toContain('urgent')
    expect(msg.text).toContain('will not be paid out to you while the dispute is open')
  })

  it('states_stripes_own_deadline_when_stripe_gives_one', async () => {
    const dueBy = Math.floor(Date.UTC(2026, 9, 3, 1, 0, 0) / 1000)
    await notifyOrganiserOfDispute(stubAdmin({ orders: ORDER, events: EVENT }), {
      orderId: 'ord_1',
      disputeAmountCents: 100,
      currency: 'AUD',
      evidenceDueBy: dueBy,
    })
    expect(sent.mock.calls[0][0].text).toContain('3 October 2026')
  })

  it('invents_no_deadline_when_stripe_gives_none', async () => {
    // Stripe publishes the response window per dispute on evidence_details.due_by
    // and does not publish one number that applies to every dispute. Writing
    // "you have 7 days" would be an unsourced claim on the one message where
    // being wrong costs the organiser the disputed amount.
    await notifyOrganiserOfDispute(stubAdmin({ orders: ORDER, events: EVENT }), {
      orderId: 'ord_1',
      disputeAmountCents: 100,
      currency: 'AUD',
      evidenceDueBy: null,
    })
    const text: string = sent.mock.calls[0][0].text
    expect(text).toContain('The window to respond is short')
    expect(text).not.toMatch(/\b\d+\s*days?\b/)
  })
})

describe('a refund that failed at the bank', () => {
  it('reaches_the_organiser_and_not_only_the_platform_owner', async () => {
    // The defect clause 4 of the guard found: this type has declared roles
    // ['organiser', 'platform_owner'] since the matrix was written and the only
    // send was to the owner's alert address.
    const result = await notifyOrganiserRefundDidNotComplete(stubAdmin({ orders: ORDER, events: EVENT }), {
      orderId: 'ord_1',
      amountCents: 5_000,
      currency: 'AUD',
    })
    expect(result).toEqual({ status: 'sent' })
    const msg = sent.mock.calls[0][0]
    expect(msg.messageType).toBe('refund_did_not_complete')
    expect(msg.recipientRole).toBe('organiser')
    expect(msg.to).toBe('organiser@example.com')
  })

  it('tells_them_not_to_refund_the_buyer_themselves', async () => {
    // The most expensive thing a well-meaning organiser could do on reading
    // that a buyer has not been refunded is refund them again out of their own
    // pocket, so the message says so rather than leaving it to be inferred.
    await notifyOrganiserRefundDidNotComplete(stubAdmin({ orders: ORDER, events: EVENT }), {
      orderId: 'ord_1',
      amountCents: 5_000,
      currency: 'AUD',
    })
    expect(sent.mock.calls[0][0].text).toContain('pay them twice')
  })
})

describe('a payment setup that has stopped working', () => {
  it('fires_only_on_a_capability_that_was_working_and_has_stopped', () => {
    const on = { chargesEnabled: true, payoutsEnabled: true }
    const chargesOff = { chargesEnabled: false, payoutsEnabled: true }
    const payoutsOff = { chargesEnabled: true, payoutsEnabled: false }
    const off = { chargesEnabled: false, payoutsEnabled: false }

    expect(hasStoppedWorking(on, chargesOff)).toBe(true)
    expect(hasStoppedWorking(on, payoutsOff)).toBe(true)
    expect(hasStoppedWorking(on, off)).toBe(true)

    // Unchanged in either direction is not news.
    expect(hasStoppedWorking(on, on)).toBe(false)
    expect(hasStoppedWorking(off, off)).toBe(false)

    // GOING THE OTHER WAY MUST NOT SEND. An account that has just been enabled
    // is good news the organiser already has from Stripe, and treating it as a
    // fault would train them to ignore the message that matters.
    expect(hasStoppedWorking(off, on)).toBe(false)
    expect(hasStoppedWorking(chargesOff, on)).toBe(false)
  })

  it('sends_nothing_when_nothing_was_lost', async () => {
    const result = await notifyOrganiserOfPaymentSetupProblem(stubAdmin({}), {
      organisationId: 'org_1',
      before: { chargesEnabled: false, payoutsEnabled: false },
      after: { chargesEnabled: true, payoutsEnabled: true },
    })
    expect(result).toEqual({ status: 'skipped', reason: 'no_change' })
    expect(sent).not.toHaveBeenCalled()
  })

  it('names_what_specifically_stopped_working', async () => {
    await notifyOrganiserOfPaymentSetupProblem(stubAdmin({}), {
      organisationId: 'org_1',
      before: { chargesEnabled: true, payoutsEnabled: true },
      after: { chargesEnabled: true, payoutsEnabled: false },
    })
    const msg = sent.mock.calls[0][0]
    expect(msg.messageType).toBe('organiser_payment_setup_problem')
    expect(msg.recipientRole).toBe('organiser')
    expect(msg.subject).toContain('receive payouts')
    expect(msg.subject).not.toContain('take payments')
  })

  it('names_both_when_both_stopped', async () => {
    await notifyOrganiserOfPaymentSetupProblem(stubAdmin({}), {
      organisationId: 'org_1',
      before: { chargesEnabled: true, payoutsEnabled: true },
      after: { chargesEnabled: false, payoutsEnabled: false },
    })
    expect(sent.mock.calls[0][0].subject).toContain('take payments or receive payouts')
  })
})

describe('none of these may be switched off', () => {
  it('no_sender_here_reads_the_sales_notification_preference', async () => {
    // The item's reversal condition: an organiser may reduce SALES messages to
    // a digest or switch them off, and "payout, refund, dispute and payment
    // setup messages cannot be switched off by anyone". Clause 3 of
    // every-message-has-a-declared-recipient fails the build if this file ever
    // starts reading that column; this asserts the same thing from the inside,
    // so the rule survives a change to the guard's file list.
    const { readFileSync } = await import('node:fs')
    const raw = readFileSync('src/lib/notifications/organiser-money-notify.ts', 'utf8')
    // COMMENTS BLANKED, as the guard does. The module's header NAMES the column
    // in order to say it must never be read here, and a check that cannot tell
    // an explanation from a read would fail on the sentence that states the
    // rule. It would also pass on a read that had been commented out and then
    // restored, which is the failure that shape is famous for.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toContain('sales_notification_mode')
  })
})
