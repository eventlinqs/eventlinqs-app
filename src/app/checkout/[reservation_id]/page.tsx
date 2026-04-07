import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PaymentCalculator } from '@/lib/payments/payment-calculator'
import { CheckoutForm } from './checkout-form'
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
    // Reservation missing or already used — send user back to pick tickets again
    redirect('/events?error=reservation_not_found')
  }

  // Expired?
  if (new Date(reservation.expires_at) < new Date()) {
    redirect('/events?error=reservation_expired')
  }

  // Load event
  const { data: event } = await supabase
    .from('events')
    .select('id, title, start_date, end_date, timezone, venue_name, venue_city, venue_country, organisation_id, fee_pass_type, currency')
    .eq('id', reservation.event_id)
    .single()

  if (!event) notFound()

  // Determine currency from ticket tiers
  const reservationItems = reservation.items as { ticket_tier_id?: string; addon_id?: string; quantity: number }[]

  const tierIds = reservationItems.filter(i => i.ticket_tier_id).map(i => i.ticket_tier_id!)
  const addonIds = reservationItems.filter(i => i.addon_id).map(i => i.addon_id!)

  let tiers: TicketTier[] = []
  if (tierIds.length > 0) {
    const { data } = await supabase.from('ticket_tiers').select('*').in('id', tierIds)
    tiers = (data ?? []) as TicketTier[]
  }

  let addons: EventAddon[] = []
  if (addonIds.length > 0) {
    const { data } = await supabase.from('event_addons').select('*').in('id', addonIds)
    addons = (data ?? []) as EventAddon[]
  }

  const tierMap = new Map(tiers.map(t => [t.id, t]))
  const addonMap = new Map(addons.map(a => [a.id, a]))

  const currency = tiers[0]?.currency ?? 'AUD'
  const fee_pass_type = (event.fee_pass_type ?? 'pass_to_buyer') as FeePassType

  // Calculate initial fees
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
  const initialFees = await calculator.calculate(cartTickets, cartAddons, currency, fee_pass_type, 0)

  // Load user profile for pre-fill
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

  const ticketSlots = cartTickets.map(t => ({
    tier_id: t.tier_id,
    tier_name: t.tier_name,
    quantity: t.quantity,
  }))

  return (
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
      userId={user?.id ?? null}
      userFirstName={userFirstName}
      userLastName={userLastName}
      userEmail={userEmail}
      currency={currency}
    />
  )
}
