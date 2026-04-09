'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { canTransition } from '@/lib/event-lifecycle'
import type { EventStatus, EventVisibility, EventType, TicketTierType } from '@/types/database'

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
  const suffix = Math.random().toString(36).substring(2, 8)
  return `${base}-${suffix}`
}

export type TicketTierInput = {
  name: string
  description: string
  tier_type: TicketTierType
  price: number // dollars — converted to cents on insert
  currency: string
  total_capacity: number
  sale_start: string | null
  sale_end: string | null
  min_per_order: number
  max_per_order: number
  sort_order: number
}

export type CreateEventInput = {
  eventId: string
  organisationId: string
  title: string
  summary: string
  description: string
  category_id: string | null
  tags: string[]
  start_date: string
  end_date: string
  timezone: string
  is_multi_day: boolean
  is_recurring: boolean
  recurrence_rule: string | null
  event_type: EventType
  venue_name: string | null
  venue_address: string | null
  venue_city: string | null
  venue_state: string | null
  venue_country: string | null
  venue_postal_code: string | null
  venue_latitude: number | null
  venue_longitude: number | null
  virtual_url: string | null
  cover_image_url: string | null
  visibility: EventVisibility
  is_age_restricted: boolean
  age_restriction_min: number | null
  max_capacity: number | null
  status: EventStatus
  scheduled_publish_at: string | null
  ticket_tiers: TicketTierInput[]
  // M4: Reserved seating
  has_reserved_seating: boolean
  venue_id: string | null
  seat_map_id: string | null
}

export async function createEvent(input: CreateEventInput): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify org ownership
  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', input.organisationId)
    .or(`owner_id.eq.${user.id}`)
    .single()

  if (!org) return { error: 'Organisation not found or access denied' }

  const slug = generateSlug(input.title)
  const now = new Date().toISOString()

  const admin = createAdminClient()

  const { error: eventError } = await admin
    .from('events')
    .insert({
      id: input.eventId,
      organisation_id: input.organisationId,
      created_by: user.id,
      title: input.title,
      slug,
      summary: input.summary || null,
      description: input.description || null,
      category_id: input.category_id || null,
      tags: input.tags,
      start_date: input.start_date,
      end_date: input.end_date,
      timezone: input.timezone,
      is_multi_day: input.is_multi_day,
      is_recurring: input.is_recurring,
      recurrence_rule: input.recurrence_rule || null,
      event_type: input.event_type,
      venue_name: input.venue_name || null,
      venue_address: input.venue_address || null,
      venue_city: input.venue_city || null,
      venue_state: input.venue_state || null,
      venue_country: input.venue_country || null,
      venue_postal_code: input.venue_postal_code || null,
      venue_latitude: input.venue_latitude || null,
      venue_longitude: input.venue_longitude || null,
      virtual_url: input.virtual_url || null,
      cover_image_url: input.cover_image_url || null,
      visibility: input.visibility,
      is_age_restricted: input.is_age_restricted,
      age_restriction_min: input.is_age_restricted ? (input.age_restriction_min ?? 18) : null,
      max_capacity: input.max_capacity || null,
      status: input.status,
      published_at: input.status === 'published' ? now : null,
      scheduled_publish_at: input.status === 'scheduled' ? input.scheduled_publish_at : null,
      has_reserved_seating: input.has_reserved_seating,
      venue_id: input.has_reserved_seating ? (input.venue_id || null) : null,
      seat_map_id: input.has_reserved_seating ? (input.seat_map_id || null) : null,
    })

  if (eventError) {
    console.error('Event insert error:', eventError)
    return { error: 'Failed to create event. Please try again.' }
  }

  if (input.ticket_tiers.length > 0) {
    const tiers = input.ticket_tiers.map((tier, i) => ({
      event_id: input.eventId,
      name: tier.name,
      description: tier.description || null,
      tier_type: tier.tier_type,
      price: Math.round(tier.price * 100), // convert dollars to cents
      currency: tier.currency,
      total_capacity: tier.total_capacity,
      sale_start: tier.sale_start || null,
      sale_end: tier.sale_end || null,
      min_per_order: tier.min_per_order,
      max_per_order: tier.max_per_order,
      sort_order: tier.sort_order ?? i,
    }))

    const { error: tiersError } = await admin.from('ticket_tiers').insert(tiers)
    if (tiersError) {
      console.error('Ticket tiers insert error:', tiersError)
      return { error: 'Event created but failed to save ticket tiers.' }
    }
  }

  // Materialise seats if reserved seating is enabled and a seat map is selected
  if (input.has_reserved_seating && input.seat_map_id) {
    const { error: matError } = await admin.rpc('materialize_seats', {
      p_event_id: input.eventId,
      p_seat_map_id: input.seat_map_id,
    })
    if (matError) {
      console.error('[events] materialize_seats failed:', matError)
      // Non-fatal: event is created, seats can be materialised later
    }
  }

  revalidatePath('/dashboard/events')
  revalidatePath('/dashboard')
  return {}
}

export type UpdateEventInput = Omit<CreateEventInput, 'eventId' | 'organisationId'> & {
  eventId: string
}

export async function updateEvent(input: UpdateEventInput): Promise<{ error: string } | never> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify ownership via event → org
  const { data: event } = await supabase
    .from('events')
    .select('id, organisation_id, status')
    .eq('id', input.eventId)
    .single()

  if (!event) return { error: 'Event not found' }

  const now = new Date().toISOString()

  const admin = createAdminClient()

  // Read previous seat_map_id to detect changes
  const { data: prevEvent } = await supabase
    .from('events')
    .select('seat_map_id, has_reserved_seating')
    .eq('id', input.eventId)
    .single()

  const { error: eventError } = await admin
    .from('events')
    .update({
      title: input.title,
      summary: input.summary || null,
      description: input.description || null,
      category_id: input.category_id || null,
      tags: input.tags,
      start_date: input.start_date,
      end_date: input.end_date,
      timezone: input.timezone,
      is_multi_day: input.is_multi_day,
      is_recurring: input.is_recurring,
      recurrence_rule: input.recurrence_rule || null,
      event_type: input.event_type,
      venue_name: input.venue_name || null,
      venue_address: input.venue_address || null,
      venue_city: input.venue_city || null,
      venue_state: input.venue_state || null,
      venue_country: input.venue_country || null,
      venue_postal_code: input.venue_postal_code || null,
      venue_latitude: input.venue_latitude || null,
      venue_longitude: input.venue_longitude || null,
      virtual_url: input.virtual_url || null,
      cover_image_url: input.cover_image_url || null,
      visibility: input.visibility,
      is_age_restricted: input.is_age_restricted,
      age_restriction_min: input.is_age_restricted ? (input.age_restriction_min ?? 18) : null,
      max_capacity: input.max_capacity || null,
      status: input.status,
      published_at: input.status === 'published' && !event.status.includes('published') ? now : undefined,
      scheduled_publish_at: input.status === 'scheduled' ? input.scheduled_publish_at : null,
      has_reserved_seating: input.has_reserved_seating,
      venue_id: input.has_reserved_seating ? (input.venue_id || null) : null,
      seat_map_id: input.has_reserved_seating ? (input.seat_map_id || null) : null,
    })
    .eq('id', input.eventId)

  if (eventError) return { error: 'Failed to update event.' }

  // Replace ticket tiers: delete existing, re-insert
  await admin.from('ticket_tiers').delete().eq('event_id', input.eventId)

  if (input.ticket_tiers.length > 0) {
    const tiers = input.ticket_tiers.map((tier, i) => ({
      event_id: input.eventId,
      name: tier.name,
      description: tier.description || null,
      tier_type: tier.tier_type,
      price: Math.round(tier.price * 100),
      currency: tier.currency,
      total_capacity: tier.total_capacity,
      sale_start: tier.sale_start || null,
      sale_end: tier.sale_end || null,
      min_per_order: tier.min_per_order,
      max_per_order: tier.max_per_order,
      sort_order: tier.sort_order ?? i,
    }))

    const { error: tiersError } = await admin.from('ticket_tiers').insert(tiers)
    if (tiersError) return { error: 'Failed to update ticket tiers.' }
  }

  // Re-materialise seats if seat map changed or reserved seating was just enabled
  const seatMapChanged =
    input.has_reserved_seating &&
    input.seat_map_id &&
    (prevEvent?.seat_map_id !== input.seat_map_id || !prevEvent?.has_reserved_seating)

  if (seatMapChanged) {
    const { error: matError } = await admin.rpc('materialize_seats', {
      p_event_id: input.eventId,
      p_seat_map_id: input.seat_map_id,
    })
    if (matError) {
      console.error('[events] materialize_seats failed on update:', matError)
    }
  }

  revalidatePath('/dashboard/events')
  revalidatePath('/dashboard')
  redirect('/dashboard/events?saved=1')
}

export async function publishEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event } = await supabase
    .from('events')
    .select('status')
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Event not found' }
  if (!canTransition(event.status as EventStatus, 'published')) {
    return { error: `Cannot publish event in '${event.status}' state` }
  }

  const { error } = await supabase
    .from('events')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', eventId)

  return error ? { error: 'Failed to publish event' } : {}
}

export async function pauseEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event } = await supabase
    .from('events')
    .select('status')
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Event not found' }
  if (!canTransition(event.status as EventStatus, 'paused')) {
    return { error: `Cannot pause event in '${event.status}' state` }
  }

  const { error } = await supabase
    .from('events')
    .update({ status: 'paused' })
    .eq('id', eventId)

  return error ? { error: 'Failed to pause event' } : {}
}

export async function cancelEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event } = await supabase
    .from('events')
    .select('status')
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Event not found' }
  if (!canTransition(event.status as EventStatus, 'cancelled')) {
    return { error: `Cannot cancel event in '${event.status}' state` }
  }

  const { error } = await supabase
    .from('events')
    .update({ status: 'cancelled' })
    .eq('id', eventId)

  return error ? { error: 'Failed to cancel event' } : {}
}

export async function duplicateEvent(eventId: string): Promise<{ error?: string; newEventId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event } = await supabase
    .from('events')
    .select('*, ticket_tiers(*)')
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Event not found' }

  const newSlug = generateSlug(event.title)
  const { id: _id, created_at: _ca, updated_at: _ua, published_at: _pa, ticket_tiers, ...rest } = event

  const { data: newEvent, error: insertError } = await supabase
    .from('events')
    .insert({
      ...rest,
      slug: newSlug,
      status: 'draft',
      published_at: null,
      scheduled_publish_at: null,
      created_by: user.id,
    })
    .select()
    .single()

  if (insertError || !newEvent) return { error: 'Failed to duplicate event' }

  if (ticket_tiers && ticket_tiers.length > 0) {
    const newTiers = ticket_tiers.map(
      ({ id: _tid, event_id: _eid, created_at: _tca, updated_at: _tua, sold_count: _sc, reserved_count: _rc, ...tierRest }: {
        id: string
        event_id: string
        created_at: string
        updated_at: string
        sold_count: number
        reserved_count: number
        [key: string]: unknown
      }) => ({
        ...tierRest,
        event_id: newEvent.id,
        sold_count: 0,
        reserved_count: 0,
      })
    )
    await supabase.from('ticket_tiers').insert(newTiers)
  }

  return { newEventId: newEvent.id }
}

export async function deleteEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event } = await supabase
    .from('events')
    .select('status')
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Event not found' }
  if (event.status !== 'draft') return { error: 'Only draft events can be deleted' }

  const { error } = await supabase.from('events').delete().eq('id', eventId)
  return error ? { error: 'Failed to delete event' } : {}
}
