import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PaymentCalculator } from '@/lib/payments/payment-calculator'
import { CheckoutForm } from './checkout-form'
import { getGuestSessionId } from '@/lib/auth/guest-session'
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

      seatSlots = seats.map(s => ({
        seat_id: s.id,
        label: `Row ${s.row_label} · Seat ${s.seat_number}${s.seat_type !== 'standard' ? ` (${s.seat_type})` : ''}`,
        price_cents: s.price_cents ?? firstTier?.price ?? 0,
      }))

      const totalSeatCents = seatSlots.reduce((s, x) => s + x.price_cents, 0)
      const avgPriceCents = Math.round(totalSeatCents / seatSlots.length)
      const fee_pass_type = (event.fee_pass_type ?? 'pass_to_buyer') as FeePassType
      const calculator = new PaymentCalculator()
      initialFees = await calculator.calculate(
        [{ tier_id: 'seat', tier_name: 'Reserved Seat', quantity: seatSlots.length, unit_price_cents: avgPriceCents }],
        [],
        currency,
        fee_pass_type,
        0
      )
      // Override subtotal with exact seat sum
      initialFees = { ...initialFees, subtotal_cents: totalSeatCents, total_cents: totalSeatCents + initialFees.platform_fee_cents + initialFees.payment_processing_fee_cents + initialFees.tax_cents }
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

    const cartTickets = reservationItems
      .filter(i => i.ticket_tier_id)
      .map(i => ({
        tier_id: i.ticket_tier_id!,
        tier_name: tierMap.get(i.ticket_tier_id!)?.name ?? 'Ticket',
        quantity: i.quantity,
        unit_price_cents: tierMap.get(i.ticket_tier_id!)?.price ?? 0,
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
    initialFees = await calculator.calculate(cartTickets, cartAddons, currency, fee_pass_type, 0)

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

  return (
    <CheckoutForm
      reservationId={reservation_id}
      expiresAt={reservation.expires_at}
      eventId={event.id}
      eventTitle={event.title}
      eventDate={eventDate}
      venue={venue}
      initialFees={initialFees!}
      ticketSlots={ticketSlots}
      tierIds={tierIds}
      seatMode={isSeatReservation}
      seatSlots={seatSlots}
      userId={user?.id ?? null}
      userFirstName={userFirstName}
      userLastName={userLastName}
      userEmail={userEmail}
      currency={currency}
    />
  )
}
