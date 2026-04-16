'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createReservation } from '@/app/actions/reservations'
import { registerFreeTickets } from '@/app/actions/register-free'
import type { TicketTier, EventAddon } from '@/types/database'
import { JoinWaitlistButton } from '@/components/waitlist/join-waitlist-button'
import { StartSquadButton } from '@/components/squads/start-squad-button'

type TierWithDisplayPrice = TicketTier & { display_price_cents?: number }

interface TicketSelectorProps {
  eventId: string
  tiers: TierWithDisplayPrice[]
  addons: EventAddon[]
  isTicketingSuspended: boolean
  currency: string
  waitlistEnabled?: boolean
  squadBookingEnabled?: boolean
}

function formatPrice(priceCents: number, currency: string) {
  if (priceCents === 0) return 'Free'
  return `${currency.toUpperCase()} ${(priceCents / 100).toFixed(2)}`
}

export function TicketSelector({ eventId, tiers, addons, isTicketingSuspended, currency, waitlistEnabled = false, squadBookingEnabled = false }: TicketSelectorProps) {
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

  function handleCheckout() {
    setError(null)

    const ticket_items = tiers
      .filter(t => (tierQuantities[t.id] ?? 0) > 0)
      .map(t => ({ ticket_tier_id: t.id, quantity: tierQuantities[t.id] }))

    const addon_items = addons
      .filter(a => (addonQuantities[a.id] ?? 0) > 0)
      .map(a => ({ addon_id: a.id, quantity: addonQuantities[a.id] }))

    startTransition(async () => {
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
        <p className="text-sm text-gray-500">No tickets available.</p>
      ) : (
        <div className="space-y-3">
          {activeTiers.map(tier => {
            const available = getAvailable(tier)
            const soldOut = available <= 0
            const salePending = !!(tier.sale_start && new Date(tier.sale_start) > now)
            const qty = tierQuantities[tier.id] ?? 0

            return (
              <div
                key={tier.id}
                className={`rounded-lg border p-4 ${soldOut || salePending ? 'border-gray-100 bg-gray-50' : 'border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{tier.name}</p>
                    {tier.description && (
                      <p className="mt-0.5 text-xs text-gray-500">{tier.description}</p>
                    )}
                    {salePending && tier.sale_start && (
                      <p className="mt-1 text-xs text-blue-600">
                        Sale opens {new Date(tier.sale_start).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    )}
                    {!soldOut && !salePending && available <= 20 && (
                      <p className="mt-1 text-xs text-amber-600">Only {available} left</p>
                    )}
                    <p className="mt-1 text-sm font-bold text-gray-900">{formatPrice(tier.display_price_cents ?? tier.price, currency)}</p>
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
                      <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600 shrink-0">
                        Sold out
                      </span>
                    )
                  ) : salePending ? (
                    <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600 shrink-0">
                      Sale starts soon
                    </span>
                  ) : !isTicketingSuspended && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setTierQty(tier.id, -1, tier)}
                        disabled={qty === 0}
                        className="h-8 w-8 rounded-full border border-gray-300 text-gray-600 font-bold disabled:opacity-30 hover:bg-gray-50 transition-colors flex items-center justify-center"
                        aria-label="Decrease"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
                      <button
                        type="button"
                        onClick={() => setTierQty(tier.id, +1, tier)}
                        disabled={qty >= Math.min(tier.max_per_order, available)}
                        className="h-8 w-8 rounded-full border border-gray-300 text-gray-600 font-bold disabled:opacity-30 hover:bg-gray-50 transition-colors flex items-center justify-center"
                        aria-label="Increase"
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
          <p className="text-sm font-semibold text-gray-700 mb-2">Add-ons</p>
          <div className="space-y-2">
            {addons.filter(a => a.is_active).map(addon => {
              const qty = addonQuantities[addon.id] ?? 0
              return (
                <div key={addon.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{addon.name}</p>
                    <p className="text-xs text-gray-900 font-semibold">{formatPrice(addon.price, currency)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setAddonQty(addon.id, -1, addon)}
                      disabled={qty === 0}
                      className="h-7 w-7 rounded-full border border-gray-300 text-sm font-bold disabled:opacity-30 hover:bg-gray-50 flex items-center justify-center"
                    >−</button>
                    <span className="w-5 text-center text-sm tabular-nums">{qty}</span>
                    <button
                      type="button"
                      onClick={() => setAddonQty(addon.id, +1, addon)}
                      className="h-7 w-7 rounded-full border border-gray-300 text-sm font-bold hover:bg-gray-50 flex items-center justify-center"
                    >+</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {totalTickets > 0 && subtotalCents > 0 && (
        <div className="flex justify-between text-sm font-medium text-gray-700 pt-2 border-t border-gray-100">
          <span>Subtotal</span>
          <span>{formatPrice(subtotalCents, currency)}</span>
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
          className="w-full rounded-lg bg-[#1A1A2E] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-[#2d2d4a] transition-colors"
        >
          {isPending
            ? 'Reserving…'
            : totalTickets === 0
            ? allFree ? 'Select Tickets' : 'Select Tickets'
            : allFree
            ? `Register ${totalTickets} ticket${totalTickets > 1 ? 's' : ''}`
            : `Checkout: ${formatPrice(subtotalCents, currency)}`}
        </button>
      )}
    </div>
  )
}
