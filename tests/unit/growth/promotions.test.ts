import { describe, expect, it } from 'vitest'
import { confirmPaid, featuredNow, priceFromDollars, startOrder } from '@/lib/promotions/promotions'
import { enquiryProblem, recordEnquiry } from '@/lib/partners/partners'

/**
 * TRAIN C, ROWS 12, 13 AND 14. An offer with no price is not on sale and cannot be ordered; an order is written at the
 * offer's own price and sent to Stripe Checkout with the order as its reference; an order is marked paid only when
 * Stripe says that very session is paid, for that organiser; a featured slot shows only while its week runs and only
 * for a public listing still to come; a partner enquiry is checked before it reaches the admin queue.
 */

type Op = { readonly op: string; readonly args: readonly unknown[] }
type Resolve = (table: string, ops: readonly Op[]) => { data: unknown; error: unknown }

function fakeAdmin(resolve: Resolve) {
  const writes: { table: string; ops: Op[] }[] = []
  const from = (table: string) => {
    const ops: Op[] = []
    const builder: Record<string, unknown> = {}
    for (const name of ['select', 'insert', 'update', 'eq', 'in', 'lte', 'gt', 'gte', 'not', 'or', 'order', 'limit', 'maybeSingle', 'single']) {
      builder[name] = (...args: unknown[]) => {
        ops.push({ op: name, args })
        return builder
      }
    }
    builder.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => {
      if (ops.some((o) => o.op === 'insert' || o.op === 'update')) writes.push({ table, ops: [...ops] })
      return Promise.resolve(resolve(table, ops)).then(ok, bad)
    }
    return builder
  }
  return { admin: { from } as never, writes }
}

const NOW = new Date('2026-10-27T03:00:00Z')
const ORG = '00000000-0000-4000-8000-0000000000a1'
const OTHER_ORG = '00000000-0000-4000-8000-0000000000b2'
const OFFER_PRICED = { id: 'offer-home', key: 'featured-homepage', kind: 'featured_slot', name: 'Featured on the homepage', description: 'A week.', placement: 'homepage', price_cents: 4900, slots: 4 }
const OFFER_UNPRICED = { ...OFFER_PRICED, id: 'offer-poster', key: 'service-poster-pack', kind: 'service', placement: null, price_cents: null, slots: null, name: 'Poster pack' }
const EVENT = { id: 'event-1', title: 'Bp night', city_primary: 'geelong' }

function fakeStripe(session: { id: string; url: string | null; client_reference_id: string | null; payment_status: string }) {
  const created: unknown[] = []
  return {
    created,
    stripe: {
      checkout: {
        sessions: {
          create: async (p: unknown) => {
            created.push(p)
            return session
          },
          retrieve: async () => session,
        },
      },
    } as never,
  }
}

const has = (ops: readonly Op[], op: string, ...args: unknown[]) => ops.some((o) => o.op === op && JSON.stringify(o.args) === JSON.stringify(args))

describe('the price Lawal types', () => {
  it('reads dollars into cents, and empty as not on sale', () => {
    expect(priceFromDollars('49')).toBe(4900)
    expect(priceFromDollars('49.5')).toBe(4950)
    expect(priceFromDollars(' 1,250.00 ')).toBe(125000)
    expect(priceFromDollars('')).toBeNull()
    expect(priceFromDollars('0')).toBe('invalid')
    expect(priceFromDollars('-5')).toBe('invalid')
    expect(priceFromDollars('ten')).toBe('invalid')
  })
})

describe('ordering a promotion', () => {
  const resolve: Resolve = (table, ops) => {
    if (table === 'promotion_offers') return { data: [OFFER_PRICED, OFFER_UNPRICED], error: null }
    if (table === 'events') return { data: [EVENT], error: null }
    if (table === 'promotion_orders' && ops.some((o) => o.op === 'insert')) return { data: { id: 'order-1' }, error: null }
    if (table === 'promotion_orders') return { data: [{ id: 'taken-1' }], error: null }
    return { data: null, error: null }
  }

  it('refuses an offer with no price, and writes no order', async () => {
    const { admin, writes } = fakeAdmin(resolve)
    const { stripe, created } = fakeStripe({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', client_reference_id: 'order-1', payment_status: 'unpaid' })
    const done = await startOrder(admin, stripe, { offerId: 'offer-poster', eventId: 'event-1', organisationId: ORG, userId: 'u1', origin: 'https://eventlinqs.com', now: NOW })
    expect(done).toEqual({ state: 'refused', reason: 'Poster pack is not on sale yet.' })
    expect(writes).toHaveLength(0)
    expect(created).toHaveLength(0)
  })

  it('refuses a listing that is not the organiser\'s own', async () => {
    const { admin, writes } = fakeAdmin(resolve)
    const { stripe } = fakeStripe({ id: 'cs_test_1', url: 'https://checkout.stripe.com/x', client_reference_id: 'order-1', payment_status: 'unpaid' })
    const done = await startOrder(admin, stripe, { offerId: 'offer-home', eventId: 'event-of-someone-else', organisationId: ORG, userId: 'u1', origin: 'https://eventlinqs.com', now: NOW })
    expect(done.state).toBe('refused')
    expect(writes).toHaveLength(0)
  })

  it('writes the order at the offer\'s price and sends it to Stripe Checkout as the reference', async () => {
    const { admin, writes } = fakeAdmin(resolve)
    const { stripe, created } = fakeStripe({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', client_reference_id: 'order-1', payment_status: 'unpaid' })
    const done = await startOrder(admin, stripe, { offerId: 'offer-home', eventId: 'event-1', organisationId: ORG, userId: 'u1', origin: 'https://eventlinqs.com', now: NOW })
    expect(done).toEqual({ state: 'checkout', url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
    const insert = writes.find((w) => w.table === 'promotion_orders' && w.ops.some((o) => o.op === 'insert'))
    expect(insert?.ops.find((o) => o.op === 'insert')?.args[0]).toEqual({ offer_id: 'offer-home', organisation_id: ORG, event_id: 'event-1', amount_cents: 4900, ordered_by: 'u1' })
    expect(created[0]).toMatchObject({
      mode: 'payment',
      client_reference_id: 'order-1',
      line_items: [{ quantity: 1, price_data: { currency: 'aud', unit_amount: 4900 } }],
      success_url: 'https://eventlinqs.com/dashboard/promote?paid={CHECKOUT_SESSION_ID}',
    })
    const keep = writes.find((w) => w.table === 'promotion_orders' && w.ops.some((o) => o.op === 'update'))
    expect(keep?.ops.find((o) => o.op === 'update')?.args[0]).toEqual({ stripe_checkout_session_id: 'cs_test_1' })
  })
})

describe('a featured slot is sold no more often than it has slots', () => {
  it('refuses when the running and awaiting orders fill every slot, and writes no order', async () => {
    const { admin, writes } = fakeAdmin((table, ops) => {
      if (table === 'promotion_offers') return { data: [OFFER_PRICED], error: null }
      if (table === 'events') return { data: [EVENT], error: null }
      if (table === 'promotion_orders' && !ops.some((o) => o.op === 'insert')) return { data: [{ id: 'a' }, { id: 'b' }], error: null }
      return { data: { id: 'order-1' }, error: null }
    })
    const { stripe, created } = fakeStripe({ id: 'cs_test_1', url: 'https://checkout.stripe.com/x', client_reference_id: 'order-1', payment_status: 'unpaid' })
    const done = await startOrder(admin, stripe, { offerId: 'offer-home', eventId: 'event-1', organisationId: ORG, userId: 'u1', origin: 'https://eventlinqs.com', now: NOW })
    expect(done).toEqual({ state: 'refused', reason: 'Every slot for Featured on the homepage is taken this week. A slot frees when a featured week ends.' })
    expect(writes).toHaveLength(0)
    expect(created).toHaveLength(0)
  })
})

describe('confirming a payment', () => {
  const order = (over: Record<string, unknown> = {}) => ({ id: 'order-1', organisation_id: ORG, status: 'awaiting_payment', stripe_checkout_session_id: 'cs_test_1', offer_id: 'offer-home', ...over })
  const resolveWith =
    (row: Record<string, unknown>): Resolve =>
    (table) => {
      if (table === 'promotion_orders') return { data: row, error: null }
      if (table === 'promotion_offers') return { data: { kind: 'featured_slot' }, error: null }
      return { data: null, error: null }
    }

  it('marks a featured order paid with its week, when Stripe says this session is paid', async () => {
    const { admin, writes } = fakeAdmin(resolveWith(order()))
    const { stripe } = fakeStripe({ id: 'cs_test_1', url: null, client_reference_id: 'order-1', payment_status: 'paid' })
    expect(await confirmPaid(admin, stripe, { sessionId: 'cs_test_1', organisationId: ORG, now: NOW })).toEqual({ state: 'paid' })
    const update = writes.find((w) => w.ops.some((o) => o.op === 'update'))
    expect(update?.ops.find((o) => o.op === 'update')?.args[0]).toEqual({
      status: 'paid',
      paid_at: '2026-10-27T03:00:00.000Z',
      starts_at: '2026-10-27T03:00:00.000Z',
      ends_at: '2026-11-03T03:00:00.000Z',
    })
    expect(has(update!.ops, 'eq', 'status', 'awaiting_payment')).toBe(true)
  })

  it('marks nothing when Stripe has not taken the payment', async () => {
    const { admin, writes } = fakeAdmin(resolveWith(order()))
    const { stripe } = fakeStripe({ id: 'cs_test_1', url: null, client_reference_id: 'order-1', payment_status: 'unpaid' })
    expect((await confirmPaid(admin, stripe, { sessionId: 'cs_test_1', organisationId: ORG, now: NOW })).state).toBe('refused')
    expect(writes).toHaveLength(0)
  })

  it('marks nothing for another organiser\'s order, or a session that is not the order\'s own', async () => {
    for (const row of [order({ organisation_id: OTHER_ORG }), order({ stripe_checkout_session_id: 'cs_test_other' })]) {
      const { admin, writes } = fakeAdmin(resolveWith(row))
      const { stripe } = fakeStripe({ id: 'cs_test_1', url: null, client_reference_id: 'order-1', payment_status: 'paid' })
      expect((await confirmPaid(admin, stripe, { sessionId: 'cs_test_1', organisationId: ORG, now: NOW })).state).toBe('refused')
      expect(writes).toHaveLength(0)
    }
  })

  it('leaves an order already paid as it is', async () => {
    const { admin, writes } = fakeAdmin(resolveWith(order({ status: 'paid' })))
    const { stripe } = fakeStripe({ id: 'cs_test_1', url: null, client_reference_id: 'order-1', payment_status: 'paid' })
    expect(await confirmPaid(admin, stripe, { sessionId: 'cs_test_1', organisationId: ORG, now: NOW })).toEqual({ state: 'already' })
    expect(writes).toHaveLength(0)
  })
})

describe('the featured row', () => {
  const ev = (over: Record<string, unknown>) => ({ slug: 'bp-a', title: 'Bp A', city_primary: 'geelong', cover_image_url: null, start_date: '2026-11-01T09:00:00Z', status: 'published', visibility: 'public', ...over })
  const rows = [
    { id: 'o1', event_id: 'e1', paid_at: '2026-10-26T00:00:00Z', events: ev({}) },
    { id: 'o2', event_id: 'e2', paid_at: '2026-10-25T00:00:00Z', events: [ev({ slug: 'bp-private', visibility: 'unlisted' })] },
    { id: 'o3', event_id: 'e3', paid_at: '2026-10-24T00:00:00Z', events: ev({ slug: 'bp-past', start_date: '2026-10-20T09:00:00Z' }) },
    { id: 'o4', event_id: 'e4', paid_at: '2026-10-23T00:00:00Z', events: ev({ slug: 'bp-melbourne', city_primary: 'melbourne' }) },
  ]

  it('reads only the slots running now, and shows only public listings still to come in the page\'s city', async () => {
    let ordersOps: readonly Op[] = []
    const { admin } = fakeAdmin((table, ops) => {
      if (table === 'promotion_offers') return { data: { id: 'offer-city', slots: 4 }, error: null }
      ordersOps = ops
      return { data: rows, error: null }
    })
    const shown = await featuredNow(admin, 'city', NOW, 'geelong')
    expect(shown.map((f) => f.slug)).toEqual(['bp-a'])
    expect(has(ordersOps, 'lte', 'starts_at', NOW.toISOString())).toBe(true)
    expect(has(ordersOps, 'gt', 'ends_at', NOW.toISOString())).toBe(true)
    expect(has(ordersOps, 'in', 'status', ['paid', 'done'])).toBe(true)
  })
})

describe('a partner enquiry', () => {
  const good = { name: 'Bp Tester', email: 'bp-partner@eventlinqs.test', organisation: 'Bp Venue', kind: 'venue', message: 'We host a weekly night.' }

  it('names what is missing before anything is written', () => {
    expect(enquiryProblem(good)).toBeNull()
    expect(enquiryProblem({ ...good, email: 'not an address' })).toBe('Give an email address we can reply to.')
    expect(enquiryProblem({ ...good, kind: 'mafia' })).toBe('Choose what kind of partner you are.')
    expect(enquiryProblem({ ...good, message: '  ' })).toBe('Tell us in a few lines what you have in mind.')
  })

  it('lands in the admin queue as one row, the address in lower case', async () => {
    const { admin, writes } = fakeAdmin(() => ({ data: null, error: null }))
    expect(await recordEnquiry(admin, { ...good, email: 'BP-Partner@EventLinqs.test' })).toEqual({ state: 'recorded' })
    expect(writes).toHaveLength(1)
    expect(writes[0].table).toBe('partner_enquiries')
    expect(writes[0].ops[0].args[0]).toMatchObject({ email: 'bp-partner@eventlinqs.test', kind: 'venue' })
  })
})
