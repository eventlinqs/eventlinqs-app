import Stripe from 'stripe'
import type { SettledPlatformCharge, SettlementWindow } from '@/lib/payments/platform-settlement-reconcile'

/**
 * READS THE PLATFORM BALANCE. The Stripe half of MONEY FIX A3 layer three.
 *
 * Kept apart from src/lib/payments/platform-settlement-reconcile.ts on purpose:
 * that module holds the RULE and must stay testable exhaustively without a
 * network, a key or a mock of the Stripe SDK, so it never imports Stripe and
 * takes its charges through an injected lister instead. This file is the only
 * thing that knows Stripe exists, and all it does is flatten.
 *
 * WHY BALANCE TRANSACTIONS RATHER THAN CHARGES. A charge can exist and never
 * settle. A balance transaction is Stripe's record that the money reached the
 * platform's own balance, which is the exact fact the item is asking about:
 * "any ticket charge found ON THE PLATFORM ACCOUNT". Listing charges would
 * answer a different and weaker question.
 *
 * THE AMOUNT REPORTED IS THE GROSS. `balance_transaction.amount` is what the
 * buyer paid; `net` is what is left after Stripe has taken its own cut. The
 * question this alarm asks is whether the ORDER is recorded as owed onward, and
 * the order is denominated in gross, so gross is the figure a reader can match
 * against an order total without doing arithmetic in their head.
 *
 * READ ONLY. This module performs no Stripe write of any kind. Clause four of
 * scripts/guards/funds-reach-the-organiser.mjs fails the build if one appears.
 */

const STRIPE_API_VERSION = '2026-03-25.dahlia' as const

let cachedClient: Stripe | null = null

function getStripe(): Stripe {
  if (cachedClient) return cachedClient
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  cachedClient = new Stripe(key, { apiVersion: STRIPE_API_VERSION })
  return cachedClient
}

/**
 * A hard stop on paging, so a misread window can never turn this into an
 * unbounded loop against Stripe. One hundred pages of one hundred is ten
 * thousand charges in a two day window, which this platform is nowhere near and
 * which would itself be worth knowing about: the cap is reported rather than
 * swallowed.
 */
const MAX_PAGES = 100
const PAGE_SIZE = 100

export interface ListSettledChargesResult {
  readonly charges: readonly SettledPlatformCharge[]
  /** True when MAX_PAGES was hit, so the caller can say the window was truncated. */
  readonly truncated: boolean
}

/**
 * Lists every charge that SETTLED on the platform balance inside the window,
 * flattened to the shape the rule understands.
 */
export async function listSettledPlatformCharges(
  window: SettlementWindow,
): Promise<ListSettledChargesResult> {
  const stripe = getStripe()
  const charges: SettledPlatformCharge[] = []

  const gte = Math.floor(new Date(window.sinceIso).getTime() / 1000)
  const lt = Math.floor(new Date(window.untilIso).getTime() / 1000)

  let startingAfter: string | undefined
  let pages = 0
  let truncated = false

  for (;;) {
    if (pages >= MAX_PAGES) {
      truncated = true
      break
    }
    pages += 1

    const page: Stripe.ApiList<Stripe.BalanceTransaction> = await stripe.balanceTransactions.list({
      type: 'charge',
      created: { gte, lt },
      limit: PAGE_SIZE,
      // The source is the Charge, and the Charge is where transfer_group lives.
      expand: ['data.source'],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    for (const txn of page.data) {
      const flattened = flatten(txn)
      if (flattened) charges.push(flattened)
    }

    if (!page.has_more || page.data.length === 0) break
    startingAfter = page.data[page.data.length - 1]?.id
    if (!startingAfter) break
  }

  return { charges, truncated }
}

/**
 * Returns null for a balance transaction whose source is not an expanded
 * Charge. That is not a silent skip: `type: 'charge'` guarantees the source IS
 * a charge, so a null here means Stripe did not expand it, and the caller sees
 * a smaller `checked` count than Stripe reported rather than a wrong verdict.
 */
function flatten(txn: Stripe.BalanceTransaction): SettledPlatformCharge | null {
  const source = txn.source
  if (!source || typeof source === 'string') return null
  if ((source as { object?: string }).object !== 'charge') return null
  const charge = source as Stripe.Charge

  const paymentIntent = charge.payment_intent
  return {
    chargeId: charge.id,
    balanceTransactionId: txn.id,
    paymentIntentId:
      typeof paymentIntent === 'string' ? paymentIntent : (paymentIntent?.id ?? null),
    transferGroup: charge.transfer_group ?? null,
    amountCents: txn.amount,
    currency: txn.currency.toUpperCase(),
    createdIso: new Date(txn.created * 1000).toISOString(),
    description: charge.description ?? null,
  }
}
