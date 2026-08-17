/**
 * THE OUTAGE THIS PINS, 18 August 2026.
 *
 * Every paid event on production refused to sell. The buyer saw "Tickets for
 * this event are not on sale yet" above a fully enabled gold checkout button
 * priced at AUD 2.03, and the founder spent hours editing a sales-start date on
 * a platform that has no sales-start column on an event.
 *
 * NONE of the three things anyone suspected was true. There was no sale window.
 * The organiser's Stripe posture was perfect on all five gate fields:
 * stripe_account_id present, charges enabled, payouts enabled, payout_status
 * active, country AU. What actually happened is that
 * `events.external_ticket_url` did not exist on production, because migration
 * 20260815000001 had not been applied. `createReservation` names that column in
 * a select, so PostgREST failed the whole request. The call site destructured
 * only `{ data: ev }`, so the error was discarded, `ev` arrived null,
 * `ev?.organisation_id` was undefined, the organisation was NEVER READ, and the
 * gate correctly refused a null organisation.
 *
 * Three defects, each of which alone would have been survivable:
 *
 *   1. A read error was discarded, so a schema failure became a business answer.
 *   2. One sentence served three unrelated causes, and named the only one of the
 *      three that does not exist in this codebase.
 *   3. The client rendered a live, priced, clickable checkout button beside the
 *      server's refusal, so the button and the message disagreed and the button
 *      looked more credible.
 *
 * These tests fail if any of the three comes back.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  describeSaleRefusal,
  saleRefusalMessage,
  ticketsOnSale,
  ticketsOnSaleDetailed,
} from '@/lib/payments/sale-status'

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

const SELLABLE_ORG = {
  stripe_account_id: 'acct_1',
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  stripe_account_country: 'AU',
  payout_status: 'active',
} as never

describe('defect 1: a failed read is not a refused sale', () => {
  it('reports a lookup failure as its own cause, never as a payment-setup problem', () => {
    const decision = ticketsOnSaleDetailed({
      isPaidEvent: true,
      org: SELLABLE_ORG,
      lookupFailed: true,
    })
    expect(decision.onSale).toBe(false)
    expect(decision.reason).toBe('sale_lookup_failed')
  })

  it('still fails CLOSED on a lookup failure, because money must not move on a guess', () => {
    expect(ticketsOnSale({ isPaidEvent: true, org: SELLABLE_ORG })).toBe(true)
    expect(
      ticketsOnSaleDetailed({ isPaidEvent: true, org: SELLABLE_ORG, lookupFailed: true }).onSale,
    ).toBe(false)
  })

  it('never words a lookup failure as a sale window, for either audience', () => {
    for (const audience of ['buyer', 'organiser'] as const) {
      const copy = describeSaleRefusal('sale_lookup_failed', audience)
      const words = `${copy.heading} ${copy.body}`.toLowerCase()
      // The exact vocabulary that sent the founder to edit a field that does not
      // exist. A lookup failure may never borrow any of it.
      for (const misleading of ['not on sale yet', 'sale starts', 'sales start', 'on sale from', 'goes on sale']) {
        expect(words.includes(misleading), `"${misleading}" must not appear in a lookup-failure message`).toBe(false)
      }
    }
  })

  it('the reservation action reads the event error rather than discarding it', () => {
    const action = read('src/app/actions/reservations.ts')
    // The precise shape of the outage: destructuring data only.
    expect(
      /const\s*\{\s*data:\s*ev\s*\}\s*=\s*await/.test(action),
      'createReservation must destructure the ERROR from the event read. Discarding ' +
        'it is what turned a missing column into "tickets are not on sale yet" for ' +
        'every paid event on the platform.',
    ).toBe(false)
    expect(/const\s*\{\s*data:\s*ev,\s*error:\s*\w+\s*\}\s*=\s*await/.test(action)).toBe(true)
  })

  it('the reservation action also reads the organisation error', () => {
    const action = read('src/app/actions/reservations.ts')
    expect(
      /const\s*\{\s*data:\s*org\s*\}\s*=/.test(action),
      'the organisation read must not discard its error either: a permissions change ' +
        'there would be reported to an organiser as a payment-setup problem they cannot find.',
    ).toBe(false)
  })
})

describe('defect 2: every refusal says something true and actionable', () => {
  it('gives an organiser the real cause and exactly one action', () => {
    const copy = describeSaleRefusal('organiser_payment_setup_incomplete', 'organiser')
    expect(copy.action).not.toBeNull()
    expect(copy.action?.href).toBe('/dashboard/payouts')
    expect(copy.action?.label.length).toBeGreaterThan(0)
  })

  it('never shows a buyer a payment-provider internal or an action they cannot take', () => {
    for (const reason of [
      'organiser_payment_setup_incomplete',
      'sale_lookup_failed',
      'externally_ticketed',
    ] as const) {
      const copy = describeSaleRefusal(reason, 'buyer')
      expect(copy.action, `a buyer must not be handed an organiser control for ${reason}`).toBeNull()
      const words = `${copy.heading} ${copy.body}`.toLowerCase()
      for (const internal of ['stripe', 'connect', 'payout_status', 'charges_enabled', 'acct_']) {
        expect(words.includes(internal), `"${internal}" must never reach a buyer`).toBe(false)
      }
    }
  })

  it('gives each cause a DISTINCT message, so one sentence can never mean three things', () => {
    const bodies = (['organiser_payment_setup_incomplete', 'sale_lookup_failed', 'externally_ticketed'] as const).map(
      r => saleRefusalMessage(r),
    )
    expect(new Set(bodies).size).toBe(bodies.length)
  })

  it('honours the copy laws: no dashes, no exclamation marks', () => {
    for (const reason of ['organiser_payment_setup_incomplete', 'sale_lookup_failed', 'externally_ticketed'] as const) {
      for (const audience of ['buyer', 'organiser'] as const) {
        const copy = describeSaleRefusal(reason, audience)
        const all = `${copy.heading} ${copy.body} ${copy.action?.label ?? ''}`
        expect(all.includes('—'), 'no em-dash').toBe(false)
        expect(all.includes('–'), 'no en-dash').toBe(false)
        expect(all.includes('!'), 'no exclamation mark in user-facing copy').toBe(false)
      }
    }
  })
})

describe('defect 3: never a live checkout button beside a refusal', () => {
  const SELECTOR = read('src/components/checkout/ticket-selector.tsx')

  it('latches on the server reason rather than only printing its prose', () => {
    expect(
      /setLatchedRefusal\(\s*result\.reason\s*\)/.test(SELECTOR),
      'a refusal carrying a reason must take the checkout away, not sit above it.',
    ).toBe(true)
  })

  it('the checkout control is disabled by the refusal, not only by the cart', () => {
    const disabled = SELECTOR.match(/disabled=\{totalTickets === 0[^}]*\}/)?.[0] ?? ''
    expect(disabled, 'checkout button disabled predicate not found').not.toBe('')
    expect(
      disabled.includes('refusalReason'),
      'the checkout button must be disabled when the sale is refused. It was ' +
        'disabled only on an empty cart, so a server refusal left an enabled, ' +
        'priced "Checkout AUD 2.03" sitting directly under the refusal text.',
    ).toBe(true)
  })

  it('renders no selection controls at all when refused', () => {
    expect(/if \(refusalReason\) \{/.test(SELECTOR)).toBe(true)
  })
})
