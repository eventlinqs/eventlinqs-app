'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createReservation } from '@/app/actions/reservations'
import { registerFreeTickets } from '@/app/actions/register-free'
import type { TicketTier, EventAddon } from '@/types/database'
import { JoinWaitlistButton } from '@/components/waitlist/join-waitlist-button'
import { StartSquadButton } from '@/components/squads/start-squad-button'
import { trackTicketCheckoutStart } from '@/lib/analytics/plausible'
import {
  TICKETS_NOT_ON_SALE_BODY,
  TICKETS_NOT_ON_SALE_HEADING,
} from '@/lib/payments/sale-status'
import {
  computeFeeLineCents,
  computeAllInTotalCents,
  type FeeRates,
  type FeePassType,
} from '@/lib/payments/fee-math'

type TierWithDisplayPrice = TicketTier & { display_price_cents?: number }

interface TicketSelectorProps {
  eventId: string
  tiers: TierWithDisplayPrice[]
  addons: EventAddon[]
  isTicketingSuspended: boolean
  currency: string
  waitlistEnabled?: boolean
  squadBookingEnabled?: boolean
  // Paid event whose organiser has not finished Stripe setup: render the
  // not-on-sale state and allow no selection so no inventory is consumed.
  saleBlocked?: boolean
  // ACCC all-in display (drip-pricing compliance): the live fee VALUES for this
  // event's scope and who carries them. When fees are passed to the buyer the
  // selector shows the true all-in total BEFORE checkout, never only at the
  // final step. Resolved server-side from pricing_rules (the one source) and
  // computed here through the SAME pure math the charge uses, so the shown total
  // equals the charged total. Optional so non-paid / not-yet-wired callers fall
  // back to a plain subtotal.
  feeRates?: FeeRates
  feePassType?: FeePassType
}

function formatPrice(priceCents: number, currency: string) {
  if (priceCents === 0) return 'Free'
  return `${currency.toUpperCase()} ${(priceCents / 100).toFixed(2)}`
}

export function TicketSelector({ eventId, tiers, addons, isTicketingSuspended, currency, waitlistEnabled = false, squadBookingEnabled = false, saleBlocked = false, feeRates, feePassType = 'pass_to_buyer' }: TicketSelectorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [tierQuantities, setTierQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(tiers.map(t => [t.id, 0]))
  )
  const [addonQuantities, setAddonQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(addons.map(a => [a.id, 0]))
  )

  function getAvailable(tier: TicketTier) {
    return tier.total_capacity - tier.sold_count - tier.reserved_count
  }

  function setTierQty(tierId: string, delta: number, tier: TicketTier) {
    setTierQuantities(prev => {
      const current = prev[tierId] ?? 0
      const newVal = Math.max(0, Math.min(current + delta, tier.max_per_order, getAvailable(tier)))
      return { ...prev, [tierId]: newVal }
    })
  }

  function setAddonQty(addonId: string, delta: number, addon: EventAddon) {
    setAddonQuantities(prev => {
      const current = prev[addonId] ?? 0
      const max = addon.total_capacity !== null
        ? Math.min(10, addon.total_capacity - addon.sold_count)
        : 10
      const newVal = Math.max(0, Math.min(current + delta, max))
      return { ...prev, [addonId]: newVal }
    })
  }

  const totalTickets = Object.values(tierQuantities).reduce((s, q) => s + q, 0)

  const subtotalCents =
    tiers.reduce((s, t) => s + (tierQuantities[t.id] ?? 0) * (t.display_price_cents ?? t.price), 0) +
    addons.reduce((s, a) => s + (addonQuantities[a.id] ?? 0) * a.price, 0)

  const allFree = tiers.every(t => (t.display_price_cents ?? t.price) === 0)

  // ACCC all-in: surface the true total the buyer will pay (incl. unavoidable
  // fees) BEFORE checkout, through the SAME pure fee math the charge uses. No
  // discount is known at this stage (codes apply at checkout), so the subtotal
  // is the post-discount base here; the platform flat fee multiplies per ticket.
  const feeLines =
    feeRates && subtotalCents > 0
      ? computeFeeLineCents(subtotalCents, totalTickets, feeRates)
      : { platform_fee_cents: 0, payment_processing_fee_cents: 0 }
  const feesPassedToBuyer = feePassType !== 'absorb'
  const buyerFeesCents = feesPassedToBuyer
    ? feeLines.platform_fee_cents + feeLines.payment_processing_fee_cents
    : 0
  // The single all-in figure shown to the buyer (and on the checkout button).
  const allInTotalCents =
    feeRates && subtotalCents > 0
      ? computeAllInTotalCents(subtotalCents, feeLines, feePassType)
      : subtotalCents
  const showAllIn = !allFree && subtotalCents > 0

  function handleCheckout() {
    setError(null)

    const ticket_items = tiers
      .filter(t => (tierQuantities[t.id] ?? 0) > 0)
      .map(t => ({ ticket_tier_id: t.id, quantity: tierQuantities[t.id] }))

    const addon_items = addons
      .filter(a => (addonQuantities[a.id] ?? 0) > 0)
      .map(a => ({ addon_id: a.id, quantity: addonQuantities[a.id] }))

    // Primary tier = tier with the largest quantity; when tied, first one wins.
    // A single checkout can span multiple tiers, but Plausible props are flat
    // key-value, so we pick a representative label for funnel analysis.
    const primaryTier = tiers
      .filter(t => (tierQuantities[t.id] ?? 0) > 0)
      .sort((a, b) => (tierQuantities[b.id] ?? 0) - (tierQuantities[a.id] ?? 0))[0]
    if (primaryTier) {
      trackTicketCheckoutStart({
        event_id: eventId,
        ticket_type: primaryTier.name,
        quantity: totalTickets,
        total_amount_cents: subtotalCents,
      })
    }

    startTransition(async () => {
     try {
      // Free-only cart: skip checkout page entirely for logged-in users
      if (allFree && addon_items.length === 0) {
        const result = await registerFreeTickets({ event_id: eventId, ticket_items })

        if (result.error) {
          setError(result.error)
          return
        }

        if (result.order_id) {
          // Logged-in user: order confirmed, go straight to confirmation
          router.push(`/orders/${result.order_id}/confirmation`)
          return
        }

        if (result.reservation_id) {
          // Guest user: go to checkout for email capture (no payment step)
          router.push(`/checkout/${result.reservation_id}`)
          return
        }
      }

      // Paid cart (or free cart with addons): go through full checkout
      const result = await createReservation({ event_id: eventId, ticket_items, addon_items })

      if (result.error) {
        setError(result.error)
        return
      }

      router.push(`/checkout/${result.reservation_id}`)
     } catch (err) {
        // A thrown server action used to reject the transition silently:
        // no error, no navigation, no DB write - the guest free-RSVP
        // dead-end. Surface it so the user is never left stuck.
        console.error('[checkout] start failed:', err)
        setError(
          'Something went wrong starting your checkout. Please try again. If it keeps happening, contact support.',
        )
      }
    })
  }

  // Squad: show button when squad booking is on, 2+ tickets from exactly one tier selected
  const squadEligibleTier = (() => {
    if (!squadBookingEnabled || isTicketingSuspended) return null
    const selectedEntries = tiers.filter(t => (tierQuantities[t.id] ?? 0) >= 2)
    if (selectedEntries.length !== 1) return null
    const tier = selectedEntries[0]
    const qty = tierQuantities[tier.id] ?? 0
    if (qty < 2) return null
    return { tier, qty }
  })()

  // Paid event whose organiser has not finished Stripe setup: render the
  // not-on-sale state and no selection controls, so no inventory is consumed.
  // Mirrors the server-side guard in createReservation.
  if (saleBlocked) {
    return (
      <div className="rounded-xl border border-ink-200 bg-ink-100/40 px-4 py-5 text-center">
        <p className="font-display text-base font-bold text-ink-900">
          {TICKETS_NOT_ON_SALE_HEADING}
        </p>
        <p className="mt-2 text-sm text-ink-600">{TICKETS_NOT_ON_SALE_BODY}</p>
      </div>
    )
  }

  const now = new Date()
  const activeTiers = tiers.filter(t => t.is_visible && t.is_active)

  return (
    <div className="space-y-4">
      {isTicketingSuspended && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Ticket sales are temporarily paused.
        </div>
      )}

      {activeTiers.length === 0 ? (
        <p className="text-sm text-ink-400">No tickets available.</p>
      ) : (
        <div className="space-y-3">
          {activeTiers.map(tier => {
            const available = getAvailable(tier)
            const soldOut = available <= 0
            const salePending = !!(tier.sale_start && new Date(tier.sale_start) > now)
            const qty = tierQuantities[tier.id] ?? 0
            const qtyCapped = qty >= Math.min(tier.max_per_order, available)
            const isSelected = qty > 0

            return (
              <div
                key={tier.id}
                className={`rounded-xl border p-4 transition-colors ${
                  soldOut || salePending
                    ? 'border-ink-200/50 bg-ink-100/50 opacity-80'
                    : isSelected
                    ? 'border-gold-500 bg-gold-100/30 shadow-sm'
                    : 'border-ink-200 bg-white hover:border-ink-400'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink-900">{tier.name}</p>
                    {tier.description && (
                      <p className="mt-0.5 text-xs text-ink-600">{tier.description}</p>
                    )}
                    {salePending && tier.sale_start && (
                      <p className="mt-1 text-xs font-medium text-gold-600">
                        Sale opens {new Date(tier.sale_start).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    )}
                    {!soldOut && !salePending && available <= 20 && (
                      <p className="mt-1 text-xs font-medium text-coral-500">Only {available} left</p>
                    )}
                    {!soldOut && !salePending && tier.max_per_order < 10 && (
                      <p className="mt-0.5 text-[11px] text-ink-400">Max {tier.max_per_order} per order</p>
                    )}
                    <p className="mt-1 text-sm font-bold text-ink-900">{formatPrice(tier.display_price_cents ?? tier.price, currency)}</p>
                  </div>

                  {soldOut ? (
                    waitlistEnabled ? (
                      <div className="shrink-0 w-28">
                        <JoinWaitlistButton
                          eventId={eventId}
                          tierId={tier.id}
                          tierName={tier.name}
                          maxPerOrder={tier.max_per_order}
                        />
                      </div>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-ink-900 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gold-500 shrink-0">
                        Sold out
                      </span>
                    )
                  ) : salePending ? (
                    <span className="inline-flex items-center rounded-md bg-gold-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gold-600 shrink-0">
                      Starts soon
                    </span>
                  ) : !isTicketingSuspended && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setTierQty(tier.id, -1, tier)}
                        disabled={qty === 0}
                        className={`h-11 w-11 rounded-full border text-base font-bold flex items-center justify-center transition-colors ${
                          qty === 0
                            ? 'border-ink-200 text-ink-400 cursor-not-allowed'
                            : 'border-gold-500 text-ink-900 hover:bg-gold-100'
                        }`}
                        aria-label={`Decrease ${tier.name} quantity`}
                      >
                        −
                      </button>
                      <span className="w-7 text-center text-sm font-bold tabular-nums text-ink-900" aria-live="polite">{qty}</span>
                      <button
                        type="button"
                        onClick={() => setTierQty(tier.id, +1, tier)}
                        disabled={qtyCapped}
                        className={`h-11 w-11 rounded-full border text-base font-bold flex items-center justify-center transition-colors ${
                          qtyCapped
                            ? 'border-ink-200 text-ink-400 cursor-not-allowed'
                            : isSelected
                            ? 'border-gold-500 bg-gold-500 text-ink-900 hover:bg-gold-600'
                            : 'border-ink-200 text-ink-600 hover:border-gold-500 hover:text-ink-900'
                        }`}
                        aria-label={`Increase ${tier.name} quantity`}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {addons.filter(a => a.is_active).length > 0 && (
        <div className="pt-2">
          <p className="text-sm font-semibold text-ink-900 mb-2">Add-ons</p>
          <div className="space-y-2">
            {addons.filter(a => a.is_active).map(addon => {
              const qty = addonQuantities[addon.id] ?? 0
              const isSelected = qty > 0
              return (
                <div
                  key={addon.id}
                  className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                    isSelected ? 'border-gold-500 bg-gold-100/30' : 'border-ink-200 bg-white'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900">{addon.name}</p>
                    <p className="text-xs text-ink-900 font-semibold">{formatPrice(addon.price, currency)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setAddonQty(addon.id, -1, addon)}
                      disabled={qty === 0}
                      className={`h-11 w-11 rounded-full border text-sm font-bold flex items-center justify-center transition-colors ${
                        qty === 0
                          ? 'border-ink-200 text-ink-400 cursor-not-allowed'
                          : 'border-gold-500 text-ink-900 hover:bg-gold-100'
                      }`}
                      aria-label={`Decrease ${addon.name} quantity`}
                    >−</button>
                    <span className="w-5 text-center text-sm font-bold tabular-nums text-ink-900">{qty}</span>
                    <button
                      type="button"
                      onClick={() => setAddonQty(addon.id, +1, addon)}
                      className={`h-11 w-11 rounded-full border text-sm font-bold flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-gold-500 bg-gold-500 text-ink-900 hover:bg-gold-600'
                          : 'border-ink-200 text-ink-600 hover:border-gold-500 hover:text-ink-900'
                      }`}
                      aria-label={`Increase ${addon.name} quantity`}
                    >+</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {totalTickets > 0 && showAllIn && (
        <div className="space-y-1.5 pt-3 border-t border-ink-200">
          <div className="flex justify-between text-sm text-ink-600">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatPrice(subtotalCents, currency)}</span>
          </div>
          {feesPassedToBuyer ? (
            <>
              <div className="flex justify-between text-sm text-ink-600">
                <span>Service + processing fees</span>
                <span className="tabular-nums">{formatPrice(buyerFeesCents, currency)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-ink-900 pt-1.5 border-t border-ink-100">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(allInTotalCents, currency)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-base font-bold text-ink-900 pt-1.5 border-t border-ink-100">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(allInTotalCents, currency)}</span>
              </div>
              <p className="text-[11px] text-ink-400">All fees included in the ticket price</p>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {squadEligibleTier && (
        <StartSquadButton
          eventId={eventId}
          tierId={squadEligibleTier.tier.id}
          tierName={squadEligibleTier.tier.name}
          totalSpots={squadEligibleTier.qty}
          pricePerSpotCents={squadEligibleTier.tier.display_price_cents ?? squadEligibleTier.tier.price}
          currency={currency}
        />
      )}

      {!isTicketingSuspended && activeTiers.some(t => getAvailable(t) > 0 && !(t.sale_start && new Date(t.sale_start) > now)) && (
        <button
          type="button"
          onClick={handleCheckout}
          disabled={totalTickets === 0 || isPending}
          className="w-full rounded-xl bg-gold-500 hover:bg-gold-600 px-4 py-3.5 text-sm font-semibold text-ink-900 disabled:bg-ink-200 disabled:text-ink-400 disabled:cursor-not-allowed transition-colors shadow-sm hover:shadow-md"
        >
          {isPending
            ? 'Reserving…'
            : totalTickets === 0
            ? 'Select tickets to continue'
            : allFree
            ? `Register ${totalTickets} ticket${totalTickets > 1 ? 's' : ''}`
            : `Checkout · ${formatPrice(allInTotalCents, currency)}`}
        </button>
      )}
    </div>
  )
}
