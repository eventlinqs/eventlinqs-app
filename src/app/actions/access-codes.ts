'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'el_unlocked_tiers'
const COOKIE_MAX_AGE = 60 * 60 * 24 // 24 hours

export interface ValidateAccessCodeResult {
  success: boolean
  unlockedTierIds: string[]
  error?: string
}

/**
 * Validates an access code for a given event.
 * If valid, stores the unlocked tier IDs in an HTTP-only session cookie.
 * All validation is server-side.
 */
export async function validateAccessCode(
  code: string,
  eventId: string
): Promise<ValidateAccessCodeResult> {
  if (!code || !code.trim()) {
    return { success: false, unlockedTierIds: [], error: 'Please enter an access code' }
  }

  const trimmedCode = code.trim().toUpperCase()
  const supabase = await createClient()

  // First, get all active tier IDs for this event
  const { data: eventTiers, error: tiersError } = await supabase
    .from('ticket_tiers')
    .select('id')
    .eq('event_id', eventId)
    .eq('is_active', true)

  if (tiersError) {
    console.error('[access-codes] Failed to load event tiers:', tiersError)
    return { success: false, unlockedTierIds: [], error: 'Code validation failed. Try again.' }
  }

  const tierIds = (eventTiers ?? []).map(t => t.id)
  if (tierIds.length === 0) {
    return { success: false, unlockedTierIds: [], error: 'Invalid access code' }
  }

  // Find all active access codes matching this code for tiers belonging to the event
  const { data: matchingCodes, error } = await supabase
    .from('tier_access_codes')
    .select('id, ticket_tier_id, max_uses, current_uses, valid_from, valid_until')
    .eq('code', trimmedCode)
    .eq('is_active', true)
    .in('ticket_tier_id', tierIds)

  if (error) {
    console.error('[access-codes] validateAccessCode DB error:', error)
    return { success: false, unlockedTierIds: [], error: 'Code validation failed. Try again.' }
  }

  if (!matchingCodes || matchingCodes.length === 0) {
    return { success: false, unlockedTierIds: [], error: 'Invalid access code' }
  }

  const now = new Date()

  // Filter to codes that are within their validity window and not exhausted
  const validCodes = matchingCodes.filter(c => {
    if (c.valid_from && new Date(c.valid_from) > now) return false
    if (c.valid_until && new Date(c.valid_until) < now) return false
    if (c.max_uses !== null && c.current_uses >= c.max_uses) return false
    return true
  })

  if (validCodes.length === 0) {
    return { success: false, unlockedTierIds: [], error: 'This access code has expired or reached its limit' }
  }

  const newTierIds = validCodes.map(c => c.ticket_tier_id)

  // Merge with any existing unlocked tier IDs from cookie
  const cookieStore = await cookies()
  const existing = cookieStore.get(COOKIE_NAME)?.value
  const existingTierIds: string[] = existing ? JSON.parse(existing) : []
  const merged = Array.from(new Set([...existingTierIds, ...newTierIds]))

  cookieStore.set(COOKIE_NAME, JSON.stringify(merged), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })

  return { success: true, unlockedTierIds: merged }
}

/**
 * Read the currently unlocked tier IDs from the session cookie.
 * Called server-side in the event detail page.
 */
export async function getUnlockedTierIds(): Promise<string[]> {
  try {
    const cookieStore = await cookies()
    const value = cookieStore.get(COOKIE_NAME)?.value
    if (!value) return []
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    return []
  }
}
