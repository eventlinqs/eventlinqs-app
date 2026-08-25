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

  /*
   * THE CHECK AND THE INCREMENT HAPPEN IN ONE LOCKED STATEMENT, in the database.
   *
   * THE DEFECT THIS CLOSES, found by the stored-figure enumeration of
   * 25 August 2026 rather than by anyone hitting it. This code used to SELECT
   * the matching codes and filter them in JavaScript:
   *
   *     if (c.max_uses !== null && c.current_uses >= c.max_uses) return false
   *
   * and then never write anything back. NOTHING in the entire repository
   * incremented tier_access_codes.current_uses: not a trigger, not a function,
   * not a line of TypeScript. It was created 0 and stayed 0, so that comparison
   * has never once refused anybody, and an organiser who capped a code at 50
   * uses had a code that could be redeemed without limit.
   *
   * It was also a read-then-decide race even if the column had been maintained:
   * two people redeeming the last use of a code both passed the check.
   *
   * `redeem_tier_access_codes` (migration 20260825000003) evaluates the validity
   * window and max_uses inside the UPDATE's own predicate, so the second caller's
   * statement matches no row. It returns the tiers actually unlocked.
   */
  const { data: redeemed, error } = await supabase.rpc('redeem_tier_access_codes', {
    p_code: trimmedCode,
    p_tier_ids: tierIds,
  })

  if (error) {
    console.error('[access-codes] redeem_tier_access_codes failed:', error)
    return { success: false, unlockedTierIds: [], error: 'Code validation failed. Try again.' }
  }

  const newTierIds = ((redeemed ?? []) as { ticket_tier_id: string }[]).map(r => r.ticket_tier_id)

  if (newTierIds.length === 0) {
    // One message for "no such code" and for "that code is used up", on purpose:
    // distinguishing them tells a stranger which codes exist.
    return {
      success: false,
      unlockedTierIds: [],
      error: 'That access code is not valid, or it has expired or reached its limit',
    }
  }

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
