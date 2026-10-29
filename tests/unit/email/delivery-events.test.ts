import { describe, expect, test } from 'vitest'
import { deliveryFactsOf } from '@/lib/email/delivery-events'

/* THE OPERATIONAL STREAM's BOUNCES AND COMPLAINTS (window 6, 29 October 2026; the master mandate 11: "Unsubscribe and
   suppression handling. Bounce handling. Delivery monitoring"). The payload shape is Resend's own, fetched the same day:
   https://resend.com/docs/webhooks/emails/bounced (type, created_at, data.email_id, data.to an array,
   data.bounce.type and data.bounce.subType). */

const bounced = (type: string, subType: string) => ({
  type: 'email.bounced',
  created_at: '2026-10-29T11:00:00.000Z',
  data: { email_id: 'em_1', to: ['Someone@Example.com'], subject: 'Your ticket', bounce: { type, subType, message: 'The recipient rejected it' } },
})

describe('what a verified Resend event is recorded as', () => {
  test('a permanent bounce: recorded, the address undeliverable, no consent change', () => {
    expect(deliveryFactsOf(bounced('Permanent', 'General'))).toEqual([
      { eventType: 'email.bounced', emailId: 'em_1', address: 'someone@example.com', bounceType: 'Permanent', bounceSubtype: 'General', detail: 'The recipient rejected it', occurredAt: '2026-10-29T11:00:00.000Z', undeliverable: true, complaint: false },
    ])
  })

  test('a temporary bounce is recorded but does not make the address undeliverable', () => {
    expect(deliveryFactsOf(bounced('Temporary', 'MailboxFull'))[0]).toMatchObject({ undeliverable: false, complaint: false })
  })

  test('a complaint: recorded, and a complaint (it becomes a marketing stop in the consent ledger)', () => {
    const facts = deliveryFactsOf({ type: 'email.complained', created_at: '2026-10-29T11:00:00.000Z', data: { email_id: 'em_2', to: ['a@b.com'] } })
    expect(facts).toEqual([{ eventType: 'email.complained', emailId: 'em_2', address: 'a@b.com', bounceType: null, bounceSubtype: null, detail: null, occurredAt: '2026-10-29T11:00:00.000Z', undeliverable: false, complaint: true }])
  })

  test('every recipient of a multi-recipient event is its own fact', () => {
    expect(deliveryFactsOf({ type: 'email.complained', created_at: '2026-10-29T11:00:00.000Z', data: { email_id: 'em_3', to: ['a@b.com', 'c@d.com'] } }).map((f) => f.address)).toEqual(['a@b.com', 'c@d.com'])
  })

  test('the events kept for monitoring: delivered, delayed, failed and suppressed are recorded, nothing else changes', () => {
    for (const type of ['email.delivered', 'email.delivery_delayed', 'email.failed', 'email.suppressed']) {
      expect(deliveryFactsOf({ type, created_at: '2026-10-29T11:00:00.000Z', data: { email_id: 'em_4', to: ['a@b.com'] } })[0]).toMatchObject({ eventType: type, undeliverable: false, complaint: false })
    }
  })

  test('opens, clicks and every other event are not recorded (opens are never a measure here)', () => {
    for (const type of ['email.opened', 'email.clicked', 'email.sent', 'domain.updated', 'contact.created']) {
      expect(deliveryFactsOf({ type, created_at: '2026-10-29T11:00:00.000Z', data: { email_id: 'em_5', to: ['a@b.com'] } })).toEqual([])
    }
  })

  test('a payload without an address records nothing', () => {
    expect(deliveryFactsOf({ type: 'email.bounced', created_at: 'x', data: { email_id: 'em_6' } })).toEqual([])
  })
})
