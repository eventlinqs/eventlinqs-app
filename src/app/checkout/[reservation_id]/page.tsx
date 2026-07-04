import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PaymentCalculator } from '@/lib/payments/payment-calculator'
import { getDynamicPriceMap } from '@/lib/pricing/dynamic-pricing'
import { pickUnitPriceCents, resolveSeatUnitPriceCents } from '@/lib/checkout/pricing'
import { CheckoutForm } from './checkout-form'
import { getGuestSessionId } from '@/lib/auth/guest-session'
import { CheckoutTrustSignals } from '@/components/features/checkout/CheckoutTrustSignals'
import { Button } from '@/components/ui/Button'
import type { FeePassType, TicketTier, EventAddon } from '@/types/database'

type Props = {
  params: Promise<{ reservation_id: string }>
}

export default async function CheckoutPage({ params }: Props) {
  const { reservation_id } = await params

  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Load reservation via admin client to bypass RLS (supports guest checkout)
  const { data: reservation, error: resError } = await admin
    .from('reservations')
    .select('*')
    .eq('id', reservation_id)
    .eq('status', 'active')
    .single()

  if (resError || !reservation) {
    // Reservation missing or already used - send user back to pick tickets again
    redirect('/events?error=reservation_not_found')
  }

  // Ownership check - either the reservation belongs to this auth user,
  // or its session_id matches this browser's guest cookie. The admin
  // client above bypasses RLS for guest visibility, so we enforce
  // ownership here instead of relying on the policy.
  const guestSessionId = await getGuestSessionId()
  const ownedByUser = reservation.user_id && user && reservation.user_id === user.id
  const ownedByGuest = reservation.session_id && guestSessionId && reservation.session_id === guestSessionId
  if (!ownedByUser && !ownedByGuest) {
    redirect('/events?error=reservation_not_found')
  }

  // Expired?
  if (new Date(reservation.expires_at) < new Date()) {
    redirect('/events?error=reservation_expired')
  }

  // Load event - must use admin client to bypass RLS for guest users
  const { data: event } = await admin
    .from('events')
    .select('id, title, start_date, end_date, timezone, venue_name, venue_city, venue_country, organisation_id, fee_pass_type')
    .eq('id', reservation.event_id)
    .single()

  if (!event) {
    notFound()
  }

  // Organiser name for the marketing-consent opt-in wording (names the sender).
  const { data: organisation } = await admin
    .from('organisations')
    .select('name')
    .eq('id', event.organisation_id)
    .maybeSingle()
  const organiserName = organisation?.name ?? ''

  // Determine if this is a seat reservation or GA
  const rawItems = reservation.items as
    | { seat_ids: string[] }
    | { ticket_tier_id?: string; addon_id?: string; quantity: number }[]

  const isSeatReservation = !Array.isArray(rawItems) && Array.isArray((rawItems as { seat_ids?: unknown }).seat_ids)

  // ── Seat reservation path ──────────────────────────────────────────────────
  let seatSlots: { seat_id: string; label: string; price_cents: number }[] = []
  let currency = 'AUD'
  let initialFees: Awaited<ReturnType<typeof PaymentCalculator.prototype.calculate>> | null = null
  let ticketSlots: { tier_id: string; tier_name: string; quantity: number }[] = []
  let tierIds: string[] = []
  // [FIX-CHECKOUT 2026-05-28] Wrap fee calc so any downstream failure
  // (pricing_rules schema drift, Redis cache hiccup, Supabase blip)
  // renders a clean handled state instead of crashing the server render
  // through to the app-router error boundary. The reservation has NOT
  // been consumed at this point so a retry is safe.
  let feesError: unknown = null

  if (isSeatReservation) {
    const seatIds = (rawItems as { seat_ids: string[] }).seat_ids

    const { data: seats } = await admin
      .from('seats')
      .select('id, row_label, seat_number, seat_type, price_cents, ticket_tier_id')
      .in('id', seatIds)

    if (seats && seats.length > 0) {
      // Get tier info for currency
      const tierIdsFromSeats = [...new Set(seats.map(s => s.ticket_tier_id).filter(Boolean) as string[])]
      let firstTier: { id: string; price: number; currency: string } | null = null
      if (tierIdsFromSeats.length > 0) {
        const { data: t } = await admin.from('ticket_tiers').select('id, price, currency').in('id', tierIdsFromSeats).limit(1)
        firstTier = t?.[0] ?? null
      }
      if (!firstTier) {
        const { data: t } = await admin.from('ticket_tiers').select('id, price, currency').eq('event_id', event.id).limit(1)
        firstTier = t?.[0] ?? null
      }
      currency = firstTier?.currency ?? 'AUD'

      // FUN-03: price each seat through the SAME resolver the charge uses
      // (current dynamic-aware tier price, identical fallback ordering) so the
      // displayed seat total equals the charged seat total.
      const seatFallbackCents = firstTier?.price ?? 0
      seatSlots = await Promise.all(
        seats.map(async s => ({
          seat_id: s.id,
          label: `Row ${s.row_label} · Seat ${s.seat_number}${s.seat_type !== 'standard' ? ` (${s.seat_type})` : ''}`,
          price_cents: await resolveSeatUnitPriceCents(
            s,
            async (tierId) => {
              const { data } = await admin.rpc('get_current_tier_price', { p_tier_id: tierId })
              return data as number | null
            },
            seatFallbackCents,
          ),
        }))
      )

      const totalSeatCents = seatSlots.reduce((s, x) => s + x.price_cents, 0)
      const avgPriceCents = Math.round(totalSeatCents / seatSlots.length)
      const fee_pass_type = (event.fee_pass_type ?? 'pass_to_buyer') as FeePassType
      const calculator = new PaymentCalculator()
      try {
        const computed = await calculator.calculate(
          [{ tier_id: 'seat', tier_name: 'Reserved Seat', quantity: seatSlots.length, unit_price_cents: avgPriceCents }],
          [],
          currency,
          fee_pass_type,
          0,
          event.organisation_id,
          event.id, // FUN-03: event-scoped fee, same as the charge
        )
        // Override subtotal with exact seat sum
        initialFees = { ...computed, subtotal_cents: totalSeatCents, total_cents: totalSeatCents + computed.platform_fee_cents + computed.payment_processing_fee_cents + computed.tax_cents }
      } catch (err) {
        feesError = err
        console.error('[checkout] PaymentCalculator.calculate failed (seat path):', err)
      }
    } else {
      redirect('/events?error=reservation_not_found')
    }
  }

  // ── GA path ────────────────────────────────────────────────────────────────
  let addons: EventAddon[] = []

  if (!isSeatReservation) {
    const reservationItems = rawItems as { ticket_tier_id?: string; addon_id?: string; quantity: number }[]
    tierIds = reservationItems.filter(i => i.ticket_tier_id).map(i => i.ticket_tier_id!)
    const addonIds = reservationItems.filter(i => i.addon_id).map(i => i.addon_id!)

    let tiers: TicketTier[] = []
    if (tierIds.length > 0) {
      const { data: tiersData } = await admin.from('ticket_tiers').select('*').in('id', tierIds)
      tiers = (tiersData ?? []) as TicketTier[]
    }

    if (addonIds.length > 0) {
      const { data: addonsData } = await admin.from('event_addons').select('*').in('id', addonIds)
      addons = (addonsData ?? []) as EventAddon[]
    }

    const tierMap = new Map(tiers.map(t => [t.id, t]))
    const addonMap = new Map(addons.map(a => [a.id, a]))

    currency = tiers[0]?.currency ?? 'AUD'
    const fee_pass_type = (event.fee_pass_type ?? 'pass_to_buyer') as FeePassType

    // FUN-01: resolve the SAME dynamic prices the charge uses, through the
    // SAME shared rule, so the displayed total equals the charged total.
    const dynamicPriceMap = await getDynamicPriceMap(tierIds)

    const cartTickets = reservationItems
      .filter(i => i.ticket_tier_id)
      .map(i => ({
        tier_id: i.ticket_tier_id!,
        tier_name: tierMap.get(i.ticket_tier_id!)?.name ?? 'Ticket',
        quantity: i.quantity,
        unit_price_cents: pickUnitPriceCents(
          dynamicPriceMap.get(i.ticket_tier_id!),
          tierMap.get(i.ticket_tier_id!)?.price,
        ),
      }))

    const cartAddons = reservationItems
      .filter(i => i.addon_id)
      .map(i => ({
        addon_id: i.addon_id!,
        addon_name: addonMap.get(i.addon_id!)?.name ?? 'Add-on',
        quantity: i.quantity,
        unit_price_cents: addonMap.get(i.addon_id!)?.price ?? 0,
      }))

    const calculator = new PaymentCalculator()
    try {
      initialFees = await calculator.calculate(
        cartTickets,
        cartAddons,
        currency,
        fee_pass_type,
        0,
        event.organisation_id,
        event.id, // FUN-01: event-scoped fee, same as the charge, so fees match
      )
    } catch (err) {
      feesError = err
      console.error('[checkout] PaymentCalculator.calculate failed (GA path):', err)
    }

    ticketSlots = cartTickets.map(t => ({
      tier_id: t.tier_id,
      tier_name: t.tier_name,
      quantity: t.quantity,
    }))
  }

  // Load user profile for pre-fill (session client is correct here - only called when user is authenticated)
  let userFirstName = ''
  let userLastName = ''
  let userEmail = ''

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    if (profile) {
      const parts = (profile.full_name ?? '').split(' ')
      userFirstName = parts[0] ?? ''
      userLastName = parts.slice(1).join(' ') ?? ''
      userEmail = profile.email ?? user.email ?? ''
    } else {
      userEmail = user.email ?? ''
    }
  }

  // Format event info
  const eventDate = new Date(event.start_date).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: event.timezone,
    timeZoneName: 'short',
  })

  const venue = [event.venue_name, event.venue_city, event.venue_country].filter(Boolean).join(', ') || null

  // [FIX-CHECKOUT 2026-05-28] If fee calculation failed, render a clean
  // handled state instead of asserting initialFees! and crashing through
  // to the app-router error boundary. The reservation is still active
  // and unconsumed; the "Try again" link forces a fresh server render.
  if (feesError !== null || initialFees === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-error/30 bg-error/5 p-8 text-center">
          <h1 className="text-xl font-bold text-ink-900">We could not load checkout</h1>
          <p className="mt-3 text-sm text-ink-700">
            Your reservation is safe and your tickets are still held until it
            expires. This is a temporary issue on our side. Try again in a
            moment, or reach out and a real person will help you finish the
            purchase.
          </p>
          <p className="mt-2 text-xs text-ink-500">Reservation: {reservation_id}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button href={`/checkout/${reservation_id}`}>Try again</Button>
            <Button href="/events" variant="secondary">Back to events</Button>
            <Button
              href={`mailto:hello@eventlinqs.com?subject=Checkout%20error%20${encodeURIComponent(reservation_id)}`}
              variant="secondary"
            >
              Email support
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_320px] lg:gap-12 lg:px-8 lg:py-12">
      <div className="min-w-0">
        <CheckoutForm
          reservationId={reservation_id}
          expiresAt={reservation.expires_at}
          eventId={event.id}
          eventTitle={event.title}
          eventDate={eventDate}
          venue={venue}
          initialFees={initialFees}
          ticketSlots={ticketSlots}
          tierIds={tierIds}
          seatMode={isSeatReservation}
          seatSlots={seatSlots}
          userId={user?.id ?? null}
          userFirstName={userFirstName}
          userLastName={userLastName}
          userEmail={userEmail}
          currency={currency}
          organiserName={organiserName}
        />
      </div>
      {/* Batch 11.0 - Trust signals sidebar at the payment-decision
       *  moment, 2026 contextual-trust pattern. Stacks below the form
       *  on mobile, sits to the right on desktop. */}
      <aside className="order-2 lg:order-1">
        <CheckoutTrustSignals />
      </aside>
    </div>
  )
}
