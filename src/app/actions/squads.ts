'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Squad, SquadMember } from '@/types/database'

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreateSquadSchema = z.object({
  event_id: z.string().uuid(),
  ticket_tier_id: z.string().uuid(),
  total_spots: z.number().int().min(2, 'Minimum 2 spots').max(10, 'Maximum 10 spots'),
  attendee_first_name: z.string().min(1, 'First name is required'),
  attendee_last_name: z.string().min(1, 'Last name is required'),
  attendee_email: z.string().email('Valid email is required'),
})

const JoinSquadSchema = z.object({
  share_token: z.string().min(1),
  attendee_first_name: z.string().min(1, 'First name is required'),
  attendee_last_name: z.string().min(1, 'Last name is required'),
  attendee_email: z.string().email('Valid email is required'),
  guest_email: z.string().email().optional(),
})

// ─── Return types ─────────────────────────────────────────────────────────────

export interface CreateSquadResult {
  squad_id?: string
  share_token?: string
  member_id?: string
  error?: string
}

export interface JoinSquadResult {
  member_id?: string
  squad_id?: string
  error?: string
}

export interface LeaveSquadResult {
  success?: boolean
  error?: string
}

export interface SquadWithDetails extends Omit<Squad, 'event' | 'ticket_tier' | 'squad_members'> {
  event: {
    id: string
    title: string
    slug: string
    start_date: string
    timezone: string
    venue_name: string | null
    venue_city: string | null
    cover_image_url?: string | null
  }
  ticket_tier: {
    id: string
    name: string
    price: number
    currency: string
  }
  squad_members: SquadMember[]
}

// ─── createSquad ──────────────────────────────────────────────────────────────

export async function createSquad(
  data: z.infer<typeof CreateSquadSchema>
): Promise<CreateSquadResult> {
  const parsed = CreateSquadSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid squad data' }
  }

  const { event_id, ticket_tier_id, total_spots, attendee_first_name, attendee_last_name, attendee_email } = parsed.data

  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to create a squad' }
  }

  // Verify squad booking is enabled for this event
  const { data: event, error: eventError } = await adminClient
    .from('events')
    .select('id, squad_booking_enabled, squad_timeout_hours')
    .eq('id', event_id)
    .single()

  if (eventError || !event) {
    return { error: 'Event not found' }
  }

  if (!event.squad_booking_enabled) {
    return { error: 'Squad booking is not enabled for this event' }
  }

  const timeoutHours = (event.squad_timeout_hours as number) ?? 24

  // Atomically reserve all N tickets via existing RPC — admin client so RLS doesn't block
  const { data: reservationData, error: reservationError } = await adminClient.rpc('create_reservation', {
    p_event_id: event_id,
    p_user_id: user.id,
    p_session_id: null,
    p_items: [{ ticket_tier_id, quantity: total_spots }],
  })

  if (reservationError || !reservationData) {
    console.error('[squads] create_reservation error:', reservationError)
    return { error: reservationError?.message ?? 'Failed to reserve tickets - they may have sold out.' }
  }

  const reservationResult = reservationData as {
    success: boolean
    reservation_id?: string
    error?: string
  }

  if (!reservationResult.success || !reservationResult.reservation_id) {
    return { error: reservationResult.error ?? 'Unable to reserve tickets. Please try again.' }
  }

  const reservationId = reservationResult.reservation_id

  // Extend reservation TTL from 10 minutes to squad timeout duration
  const expiresAt = new Date(Date.now() + timeoutHours * 60 * 60 * 1000).toISOString()

  const { error: extendError } = await adminClient
    .from('reservations')
    .update({ expires_at: expiresAt })
    .eq('id', reservationId)

  if (extendError) {
    console.error('[squads] extend reservation TTL error:', extendError)
    // Non-fatal — reservation still exists, just with shorter TTL
  }

  // Create the squad row
  const shareToken = crypto.randomUUID()

  const { data: squad, error: squadError } = await adminClient
    .from('squads')
    .insert({
      event_id,
      leader_user_id: user.id,
      ticket_tier_id,
      reservation_id: reservationId,
      total_spots,
      status: 'forming',
      share_token: shareToken,
      extended_once: false,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (squadError || !squad) {
    console.error('[squads] insert squad error:', squadError)
    // Rollback: cancel the reservation
    await adminClient
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservationId)
    return { error: 'Failed to create squad. Please try again.' }
  }

  // Add leader as position 1 member
  const { data: member, error: memberError } = await adminClient
    .from('squad_members')
    .insert({
      squad_id: squad.id,
      user_id: user.id,
      attendee_first_name,
      attendee_last_name,
      attendee_email,
      status: 'invited',
      position: 1,
    })
    .select('id')
    .single()

  if (memberError || !member) {
    console.error('[squads] insert leader member error:', memberError)
    return { error: 'Failed to add you to the squad. Please try again.' }
  }

  revalidatePath('/dashboard/my-squads')
  revalidatePath(`/events/${event_id}`)

  return {
    squad_id: squad.id,
    share_token: shareToken,
    member_id: member.id,
  }
}

// ─── joinSquad ────────────────────────────────────────────────────────────────

export async function joinSquad(
  data: z.infer<typeof JoinSquadSchema>
): Promise<JoinSquadResult> {
  const parsed = JoinSquadSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid data' }
  }

  const { share_token, attendee_first_name, attendee_last_name, attendee_email, guest_email } = parsed.data

  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Look up squad by share token
  const { data: squad, error: squadError } = await adminClient
    .from('squads')
    .select('id, status, total_spots, expires_at, event_id, leader_user_id')
    .eq('share_token', share_token)
    .single()

  if (squadError || !squad) {
    return { error: 'Squad not found - this link may be invalid.' }
  }

  if (squad.status === 'completed') return { error: 'This squad is already complete.' }
  if (squad.status === 'expired') return { error: 'This squad has expired.' }
  if (squad.status === 'cancelled') return { error: 'This squad has been cancelled.' }
  if (squad.status !== 'forming') return { error: 'This squad is no longer accepting members.' }
  if (new Date(squad.expires_at) < new Date()) {
    return { error: 'This squad has expired.' }
  }

  // Check if this logged-in user already has an active membership
  if (user) {
    const { data: existingMember } = await adminClient
      .from('squad_members')
      .select('id, status')
      .eq('squad_id', squad.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingMember && existingMember.status !== 'declined' && existingMember.status !== 'timed_out') {
      return { member_id: existingMember.id, squad_id: squad.id }
    }
  }

  // Count active members
  const { count: activeCount } = await adminClient
    .from('squad_members')
    .select('id', { count: 'exact', head: true })
    .eq('squad_id', squad.id)
    .in('status', ['invited', 'paid'])

  if ((activeCount ?? 0) >= squad.total_spots) {
    return { error: 'This squad is full.' }
  }

  const nextPosition = (activeCount ?? 0) + 1

  const { data: member, error: memberError } = await adminClient
    .from('squad_members')
    .insert({
      squad_id: squad.id,
      user_id: user?.id ?? null,
      guest_email: user ? null : (guest_email ?? attendee_email),
      attendee_first_name,
      attendee_last_name,
      attendee_email,
      status: 'invited',
      position: nextPosition,
    })
    .select('id')
    .single()

  if (memberError || !member) {
    console.error('[squads] joinSquad insert member error:', memberError)
    return { error: 'Failed to join squad. Please try again.' }
  }

  revalidatePath(`/squad/${share_token}`)
  revalidatePath('/dashboard/my-squads')

  return { member_id: member.id, squad_id: squad.id }
}

// ─── getMySquads ──────────────────────────────────────────────────────────────

export async function getMySquads(): Promise<SquadWithDetails[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const adminClient = createAdminClient()

  // Squads where user is leader
  const { data: leadSquads, error: leadError } = await adminClient
    .from('squads')
    .select(`
      *,
      event:events!event_id ( id, title, slug, start_date, timezone, venue_name, venue_city, cover_image_url ),
      ticket_tier:ticket_tiers!ticket_tier_id ( id, name, price, currency ),
      squad_members ( * )
    `)
    .eq('leader_user_id', user.id)
    .order('created_at', { ascending: false })

  if (leadError) {
    console.error('[squads] getMySquads leader query error:', leadError)
  }

  const leadSquadIds = new Set((leadSquads ?? []).map(s => s.id))

  // Squads where user is a member (not leader)
  const { data: memberRows, error: memberError } = await adminClient
    .from('squad_members')
    .select('squad_id')
    .eq('user_id', user.id)
    .not('status', 'in', '(declined,timed_out)')

  if (memberError) {
    console.error('[squads] getMySquads member query error:', memberError)
  }

  const memberOnlySquadIds = (memberRows ?? [])
    .map(r => r.squad_id)
    .filter(id => !leadSquadIds.has(id))

  let memberSquads: SquadWithDetails[] = []
  if (memberOnlySquadIds.length > 0) {
    const { data: ms, error: msError } = await adminClient
      .from('squads')
      .select(`
        *,
        event:events!event_id ( id, title, slug, start_date, timezone, venue_name, venue_city, cover_image_url ),
        ticket_tier:ticket_tiers!ticket_tier_id ( id, name, price, currency ),
        squad_members ( * )
      `)
      .in('id', memberOnlySquadIds)
      .order('created_at', { ascending: false })

    if (msError) {
      console.error('[squads] getMySquads member squads query error:', msError)
    }

    memberSquads = (ms ?? []) as unknown as SquadWithDetails[]
  }

  return [
    ...((leadSquads ?? []) as unknown as SquadWithDetails[]),
    ...memberSquads,
  ]
}

// ─── getSquadByToken ──────────────────────────────────────────────────────────

export async function getSquadByToken(shareToken: string): Promise<SquadWithDetails | null> {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('squads')
    .select(`
      *,
      event:events!event_id ( id, title, slug, start_date, timezone, venue_name, venue_city, cover_image_url ),
      ticket_tier:ticket_tiers!ticket_tier_id ( id, name, price, currency ),
      squad_members ( * )
    `)
    .eq('share_token', shareToken)
    .single()

  if (error || !data) {
    console.error('[squads] getSquadByToken error:', error)
    return null
  }

  return data as unknown as SquadWithDetails
}

// ─── leaveSquad ───────────────────────────────────────────────────────────────

export async function leaveSquad(memberId: string): Promise<LeaveSquadResult> {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: member, error: memberError } = await adminClient
    .from('squad_members')
    .select('id, user_id, status, squad_id')
    .eq('id', memberId)
    .single()

  if (memberError || !member) return { error: 'Member record not found' }
  if (member.user_id !== user.id) return { error: 'You can only remove your own membership' }
  if (member.status === 'paid') {
    return { error: 'You have already paid - contact support to leave a completed squad' }
  }

  // Leaders cannot leave their own squad — they must cancel it
  const { data: squad } = await adminClient
    .from('squads')
    .select('leader_user_id')
    .eq('id', member.squad_id)
    .single()

  if (squad?.leader_user_id === user.id) {
    return { error: 'Squad leaders cannot leave - cancel the squad instead' }
  }

  const { error: updateError } = await adminClient
    .from('squad_members')
    .update({ status: 'declined' })
    .eq('id', memberId)

  if (updateError) {
    console.error('[squads] leaveSquad update error:', updateError)
    return { error: 'Failed to leave squad' }
  }

  revalidatePath('/dashboard/my-squads')

  return { success: true }
}

// ─── cancelSquad ──────────────────────────────────────────────────────────────

export async function cancelSquad(squadId: string): Promise<LeaveSquadResult> {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: squad, error: squadError } = await adminClient
    .from('squads')
    .select('id, leader_user_id, status, reservation_id, event_id')
    .eq('id', squadId)
    .single()

  if (squadError || !squad) return { error: 'Squad not found' }
  if (squad.leader_user_id !== user.id) return { error: 'Only the squad leader can cancel' }
  if (squad.status !== 'forming') {
    return { error: `Cannot cancel a squad with status "${squad.status}"` }
  }

  // Check for paid members — they will need Stripe refunds (handled in webhook/Commit 5)
  const { data: paidMembers } = await adminClient
    .from('squad_members')
    .select('id, order_id')
    .eq('squad_id', squadId)
    .eq('status', 'paid')

  if (paidMembers && paidMembers.length > 0) {
    // Refund processing happens via the Stripe refund flow wired in Commit 5
    console.log(`[squads] cancelSquad: ${paidMembers.length} paid member(s) require refund for squad ${squadId}`)
  }

  const { error: cancelError } = await adminClient
    .from('squads')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', squadId)
    .eq('status', 'forming')

  if (cancelError) {
    console.error('[squads] cancelSquad update error:', cancelError)
    return { error: 'Failed to cancel squad' }
  }

  // Release the inventory hold
  if (squad.reservation_id) {
    const { error: reservationError } = await adminClient
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', squad.reservation_id)
      .eq('status', 'active')

    if (reservationError) {
      console.error('[squads] cancelSquad release reservation error:', reservationError)
    }
  }

  revalidatePath('/dashboard/my-squads')
  revalidatePath(`/events/${squad.event_id}`)

  return { success: true }
}
