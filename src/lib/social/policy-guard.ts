import type { SupabaseClient } from '@supabase/supabase-js'
import { recordPhaseRun } from '@/lib/ops/phase-runs'
import type { PhaseKey } from '@/lib/ops/timetable'

/**
 * THE STANDING POLICY FAILS CLOSED (the PM's 10:47 of 20 November 2026, item 1, on Lawal's 09:01: 'schedule authorised
 * publications ... Do not require repeat approvals for content already covered by the authorised publishing policy').
 * The PM's conditions, each held here:
 *   - before each policy hour the dry run is logged (the run logs every piece it read, eligible or not, and why);
 *   - the run approves ONLY pieces that dry run read ELIGIBLE (store.ts approveUnderStandingPolicy, its `only`);
 *   - a piece approved outside it turns the switch OFF by code and alarms: a breach of the policy itself.
 * ONE PIECE NEVER STOPS THE ENGINE (Lawal's hardening order of 22 November 2026, 09:27, section 2 A: 'A failed, held or
 * rejected publication must never disable publishing globally'; the PM's 09:32 item 2 (a)). On 22 November AMCF's
 * final day feed, held by the gate at the 08:40 run, turned the switch off for every piece. A refusal at approval, a
 * hold at scheduling or at publishing and a provider's failure now hold that piece alone, with its reason on its own
 * row, and the run goes on; only an approval outside the hour's dry run is a system fault that stops publishing.
 */
export const POLICY_SWITCH = 'social_auto_publish'

/** The scheduler's own words for a piece too late for its night (store.ts scheduleApprovedPieces). */
export const LATE_HOLD_WORDS = 'Not scheduled: its next free band'

/** The scheduler's words when another run wrote the same schedule first: the database kept one, which is the rule. */
export const ALREADY_WORDS = ': scheduled already'

export type PolicyHour = {
  /** The pieces this hour's dry run read eligible, logged before any approval. */
  readonly eligible: ReadonlySet<string>
  /** What the policy approved this hour. */
  readonly approved: readonly string[]
  /** Pieces the dry run read eligible that the approval then refused: a check that failed between the two. */
  readonly refused: readonly { readonly id: string; readonly reason: string }[]
}

/**
 * Every reason this run must turn the switch off; empty when none: only an approval outside the hour's dry run. The
 * holds are passed in so the call site reads whole, and are never a reason (each is held on its own row). Pure.
 */
export function switchTrips(input: {
  readonly policy: PolicyHour | null
  readonly scheduleHeld: readonly string[]
  readonly publishHeld: readonly string[]
}): string[] {
  const out: string[] = []
  if (input.policy) {
    for (const id of input.policy.approved) if (!input.policy.eligible.has(id)) out.push(`${id} was approved outside this hour's dry run`)
  }
  return out
}

/**
 * Turns the switch off and raises the alarm: the flag written off (only while it reads on), and a failed row in
 * ops_phase_runs, which the timetable board and the 08:00 report read. Never throws; what could not be written is said.
 */
export async function switchOffByCode(
  db: SupabaseClient,
  input: { readonly now: Date; readonly phase: PhaseKey; readonly trips: readonly string[] },
): Promise<{ readonly off: boolean; readonly words: string }> {
  const n = input.trips.length
  const words = `SWITCH OFF BY CODE (the PM's 10:47 of 20 November 2026, item 1): ${n} fault${n === 1 ? '' : 's'} in the publishing run: ${input.trips.join(' | ')}`
  let off = false
  try {
    const { error } = await db.from('feature_flags').update({ enabled: false, updated_at: input.now.toISOString() }).eq('flag', POLICY_SWITCH)
    off = !error
    if (error) console.error(`[social/policy-guard] the switch could not be turned off: ${error.message}`)
  } catch (fault) {
    console.error(`[social/policy-guard] the switch could not be turned off: ${fault instanceof Error ? fault.message : String(fault)}`)
  }
  await recordPhaseRun(db, { phase: input.phase, ride: 'social', startedAt: input.now, endedAt: new Date(), units: n, result: off ? words : `${words}; THE SWITCH COULD NOT BE WRITTEN OFF`, failed: true })
  console.error(`[social/policy-guard] ${words}`)
  return { off, words }
}
