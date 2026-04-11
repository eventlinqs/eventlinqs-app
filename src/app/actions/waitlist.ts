'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Schemas ────────────────────────────────────────────────────────────────

const JoinWaitlistSchema = z.object({
  event_id: z.string().uuid('Invalid event ID'),
  ticket_tier_id: z.string().uuid('Invalid tier ID'),
  quantity: z.number().int().min(1, 'Minimum 1 ticket').max(10, 'Maximum 10 tickets'),
})

// ─── Types ───────────────────────────────────────────────────────────────────

export type JoinWaitlistInput = z.infer<typeof JoinWaitlistSchema>

export interface JoinWaitlistResult {
  success: boolean
  waitlist_id?: string
  position?: number
  error?: string
}

export type MyWaitlistRow = {
  id: string
  event_id: string
  ticket_tier_id: string | null
  quantity_requested: number
  status: string
  position: number
  created_at: string
  notified_at: string | null
  converted_at: string | null
  expired_at: string | null
  event_title: string
  event_start_date: string
  event_slug: string
  tier_name: string | null
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Join the waitlist for a sold-out tier.
 * Uses the join_waitlist RPC for atomic position assignment.
 * Requires the user to be authenticated.
 */
export async function joinWaitlist(input: JoinWaitlistInput): Promise<JoinWaitlistResult> {
  const parsed = JoinWaitlistSchema.safeParse(input)
  if (!parsed.success) {
    const issues = parsed.error.issues
    const message = issues[0]?.message ?? 'Invalid waitlist data'
    return { success: false, error: message }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'You must be signed in to join the waitlist' }
  }

  const adminClient = createAdminClient()

  try {
    const { data, error } = await adminClient.rpc('join_waitlist', {
      p_event_id: parsed.data.event_id,
      p_ticket_tier_id: parsed.data.ticket_tier_id,
      p_user_id: user.id,
      p_quantity: parsed.data.quantity,
    })

    if (error) {
      console.error('[waitlist] join_waitlist RPC error:', error)
      return { success: false, error: error.message ?? 'Failed to join the waitlist. Please try again.' }
    }

    const result = data as { success: boolean; waitlist_id?: string; position?: number; error?: string }

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to join the waitlist. Please try again.' }
    }

    revalidatePath('/dashboard/my-waitlists')
    return {
      success: true,
      waitlist_id: result.waitlist_id,
      position: result.position,
    }
  } catch (err) {
    console.error('[waitlist] joinWaitlist unexpected error:', err)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * Get the current live position for a waitlist entry.
 * Used for polling from the dashboard.
 */
export async function getWaitlistPosition(waitlistId: string): Promise<number | null> {
  if (!waitlistId) return null

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('waitlist')
    .select('position, status')
    .eq('id', waitlistId)
    .single()

  if (error || !data) return null
  if (data.status !== 'waiting') return null
  return data.position
}

/**
 * Fetch all waitlist entries for the authenticated user.
 * Includes event and tier details for display.
 */
export async function getMyWaitlists(userId: string): Promise<MyWaitlistRow[]> {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('waitlist')
    .select(`
      id,
      event_id,
      ticket_tier_id,
      quantity_requested,
      status,
      position,
      created_at,
      notified_at,
      converted_at,
      expired_at,
      events!event_id ( title, start_date, slug ),
      ticket_tiers!ticket_tier_id ( name )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[waitlist] getMyWaitlists error:', error)
    return []
  }

  type EventShape = { title: string; start_date: string; slug: string }
  type TierShape = { name: string }
  type RawRow = {
    id: string
    event_id: string
    ticket_tier_id: string | null
    quantity_requested: number
    status: string
    position: number
    created_at: string
    notified_at: string | null
    converted_at: string | null
    expired_at: string | null
    events: EventShape | EventShape[] | null
    ticket_tiers: TierShape | TierShape[] | null
  }

  function pickOne<T>(v: T | T[] | null): T | null {
    if (!v) return null
    return Array.isArray(v) ? (v[0] ?? null) : v
  }

  return (data as RawRow[]).map((row) => ({
    id: row.id,
    event_id: row.event_id,
    ticket_tier_id: row.ticket_tier_id,
    quantity_requested: row.quantity_requested,
    status: row.status,
    position: row.position,
    created_at: row.created_at,
    notified_at: row.notified_at,
    converted_at: row.converted_at,
    expired_at: row.expired_at,
    event_title: pickOne(row.events)?.title ?? 'Unknown Event',
    event_start_date: pickOne(row.events)?.start_date ?? '',
    event_slug: pickOne(row.events)?.slug ?? '',
    tier_name: pickOne(row.ticket_tiers)?.name ?? null,
  }))
}

/**
 * Leave a waitlist entry (sets status to 'removed').
 * Only the owning user can remove their own entry.
 * Only entries with status 'waiting' can be removed.
 */
export async function leaveWaitlist(waitlistId: string): Promise<{ success: boolean; error?: string }> {
  if (!waitlistId) return { success: false, error: 'Invalid waitlist ID' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const adminClient = createAdminClient()

  // Verify ownership and status before updating
  const { data: entry, error: fetchError } = await adminClient
    .from('waitlist')
    .select('id, user_id, status')
    .eq('id', waitlistId)
    .single()

  if (fetchError || !entry) {
    return { success: false, error: 'Waitlist entry not found' }
  }
  if (entry.user_id !== user.id) {
    return { success: false, error: 'Not authorised to remove this entry' }
  }
  if (entry.status !== 'waiting') {
    return { success: false, error: 'This waitlist entry can no longer be removed' }
  }

  const { error: updateError } = await adminClient
    .from('waitlist')
    .update({ status: 'removed' })
    .eq('id', waitlistId)
    .eq('user_id', user.id)
    .eq('status', 'waiting')

  if (updateError) {
    console.error('[waitlist] leaveWaitlist error:', updateError)
    return { success: false, error: 'Failed to leave the waitlist. Please try again.' }
  }

  revalidatePath('/dashboard/my-waitlists')
  return { success: true }
}
