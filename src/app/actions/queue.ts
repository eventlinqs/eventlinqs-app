'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getRedisClient } from '@/lib/redis/client'
import {
  generatePositionToken,
  generateAdmissionToken,
  validateAdmissionToken,
} from '@/lib/queue/tokens'

// IP rate limit: max 3 join attempts per 15 minutes
const RATE_LIMIT_WINDOW_SEC = 900
const RATE_LIMIT_MAX = 3

// ─── joinQueue ─────────────────────────────────────────────────────────────────

const JoinQueueSchema = z.object({
  eventId: z.string().uuid(),
  sessionId: z.string().min(1).max(128),
})

export async function joinQueue(input: {
  eventId: string
  sessionId: string
}): Promise<
  | { success: true; queueId: string; position: number }
  | { success: false; error: string; alreadyJoined?: boolean }
> {
  const parsed = JoinQueueSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input.' }

  const { eventId, sessionId } = parsed.data

  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  // IP rate limiting (gracefully skipped when Redis is unavailable)
  if (ip) {
    const redis = getRedisClient()
    if (redis) {
      const key = `queue:join:${ip}`
      const count = (await redis.incr(key)) as number
      if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SEC)
      if (count > RATE_LIMIT_MAX) {
        return {
          success: false,
          error: 'Too many queue attempts. Please wait a few minutes before trying again.',
        }
      }
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const admin = createAdminClient()

  // Authenticated users: check for an existing active entry
  if (user) {
    const { data: existing } = await admin
      .from('virtual_queue')
      .select('id, position, status')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .in('status', ['waiting', 'admitted'])
      .maybeSingle()

    if (existing) {
      return {
        success: false,
        error: 'You are already in the queue for this event.',
        alreadyJoined: true,
      }
    }
  }

  const positionToken = generatePositionToken(eventId, sessionId)

  const { data, error } = await admin.rpc('enter_queue', {
    p_event_id: eventId,
    p_user_id: user?.id ?? null,
    p_session_id: sessionId,
    p_ip_address: ip,
    p_position_token: positionToken,
  })

  if (error) {
    console.error('[queue] enter_queue RPC error:', error)
    return { success: false, error: 'Could not join queue. Please try again.' }
  }

  const result = data as {
    success: boolean
    error?: string
    queue_id?: string
    position?: number
  }

  if (!result.success) {
    return {
      success: false,
      error: result.error ?? 'Could not join queue.',
      alreadyJoined: true,
    }
  }

  return {
    success: true,
    queueId: result.queue_id!,
    position: result.position!,
  }
}

// ─── getQueuePosition ──────────────────────────────────────────────────────────

const GetPositionSchema = z.object({
  queueId: z.string().uuid(),
  eventId: z.string().uuid(),
})

export async function getQueuePosition(input: {
  queueId: string
  eventId: string
}): Promise<
  | { found: true; position: number; status: string; admissionToken?: string }
  | { found: false; error?: string }
> {
  const parsed = GetPositionSchema.safeParse(input)
  if (!parsed.success) return { found: false, error: 'Invalid input.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('virtual_queue')
    .select('id, position, status, admitted_at, expires_at')
    .eq('id', parsed.data.queueId)
    .eq('event_id', parsed.data.eventId)
    .maybeSingle()

  if (error || !data) return { found: false, error: 'Queue entry not found.' }

  // For waiting entries, recompute live position (expired entries don't shift down)
  let livePosition = data.position
  if (data.status === 'waiting') {
    const { count } = await admin
      .from('virtual_queue')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', parsed.data.eventId)
      .eq('status', 'waiting')
      .lt('position', data.position)
    livePosition = (count ?? 0) + 1
  }

  if (data.status === 'admitted') {
    const expiresAtMs = data.expires_at
      ? new Date(data.expires_at).getTime()
      : Date.now() + 10 * 60 * 1000
    const admissionToken = generateAdmissionToken(data.id, parsed.data.eventId, expiresAtMs)
    return { found: true, position: livePosition, status: data.status, admissionToken }
  }

  return { found: true, position: livePosition, status: data.status }
}

// ─── leaveQueue ────────────────────────────────────────────────────────────────

const LeaveQueueSchema = z.object({
  queueId: z.string().uuid(),
})

export async function leaveQueue(input: {
  queueId: string
}): Promise<{ success: boolean; error?: string }> {
  const parsed = LeaveQueueSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('virtual_queue')
    .update({ status: 'abandoned' })
    .eq('id', parsed.data.queueId)
    .eq('status', 'waiting')

  if (error) return { success: false, error: 'Failed to leave queue.' }
  return { success: true }
}

// ─── validateQueueToken ────────────────────────────────────────────────────────

export async function validateQueueToken(
  token: string
): Promise<{ valid: true; queueId: string; eventId: string } | { valid: false }> {
  return validateAdmissionToken(token)
}
