import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { COMPLETE_BY } from '@/lib/events/event-clock'
import { readTheirNights, type OwnNight } from './their-nights'
import { daysToGo, lifecycleChoice, type LifecycleNightClock } from './lifecycle-letters'

type Admin = SupabaseClient<Database>

/**
 * THE GENERAL FIRST LETTER (Lawal's founder directive of 26 November 2026, 00:21, item A, his written decision: "Retain
 * the existing 14-21-day timing rule for event-specific acquisition messages. For organisers who do not have a qualifying
 * event in that window, the engine may use the existing approved general organiser-acquisition invitation, provided the
 * recipient satisfies the applicable contact, consent and suppression requirements ... Preserve the minimum target of 10
 * first invitations per eligible sending day"; the PM's 00:21 and 00:24).
 *
 * The cause it answers, read in the code and on production on 26 November: an ACQ first letter was drafted only on law
 * 49's clock (an organiser's linked night due its offer) or by a play naming its cohort by hand; the daily twenty is off
 * (./twenty-drafts.ts TWENTY_ADVICE_DRAFTING). After the hand made cohort of 20 November, the clock met a small pool and
 * no first letter went for three send days.
 *
 * A play whose cohort rule says general (cohort_rule.general, ./planner.ts) writes the approved general letter, acq_first
 * (Lawal's standing approval), to organisers in the four guide cities never written to, at most its cap a day, through the
 * one path every letter takes (the contact policy, one first letter per organisation and domain, the self queue's
 * standing approval and page check, the sender). It never writes to an organiser one of whose nights is due its own event
 * letter on law 49's clock (lifecycleChoice, the clock's own rule: the event specific letter keeps its place), nor to
 * one with a night inside its final week, when nothing new goes to them (the same clock, COMPLETE_BY). A night that
 * cannot be read is a reason, never a guess.
 */

/** One of their nights as the clock reads it. Pure. */
const clockOf = (n: Pick<OwnNight, 'eventId' | 'startDate' | 'timezone'>): LifecycleNightClock => ({
  eventId: n.eventId,
  startIso: n.startDate,
  endIso: null,
  zone: n.timezone || 'Australia/Melbourne',
  granted: false,
})

/**
 * Why the general letter must not go to this organiser now, from their nights ahead, or null when it may. Pure.
 *   a night due its own event letter on law 49's clock: that letter keeps its place;
 *   a night inside its final week: nothing new goes to them (the clock's COMPLETE_BY).
 */
export function generalLetterHeldBy(nights: readonly Pick<OwnNight, 'eventId' | 'startDate' | 'timezone' | 'title'>[], now: Date): string | null {
  if (nights.length === 0) return null
  const choice = lifecycleChoice('lifecycle_acq', { replied: false, alreadyAsked: false, nights: nights.map(clockOf) }, now)
  if (choice.due) {
    const n = nights.find((x) => x.eventId === choice.eventId)
    return `their night ${n ? `'${n.title}' ` : ''}is due its own event letter on law 49's clock (${choice.daysToStart} days to go): the general letter never takes its place`
  }
  const close = nights.find((n) => {
    const d = daysToGo(n.startDate, n.timezone, now)
    return d >= 0 && d <= COMPLETE_BY
  })
  if (close) return `their night '${close.title}' is inside its final week (${COMPLETE_BY} days), when nothing new goes to them (law 49's clock)`
  return null
}

/** The same, read from production for one organiser; a read that fails is a reason, never a guess. */
export async function readGeneralLetterHold(db: Admin, organiserId: string, now: Date): Promise<string | null> {
  const org = await db.from('organisers').select('id, organisation_id, website_url, is_test').eq('id', organiserId).maybeSingle()
  if (org.error || !org.data) return `the organiser could not be read${org.error ? `: ${org.error.message}` : ''}; never written on a guess`
  try {
    const nights = await readTheirNights(
      db,
      { id: org.data.id as string, organisation_id: (org.data.organisation_id as string | null) ?? null, website_url: (org.data.website_url as string | null) ?? null, isTest: org.data.is_test === true },
      now,
      20,
    )
    return generalLetterHeldBy(nights, now)
  } catch (err) {
    return `their nights could not be read (${err instanceof Error ? err.message : String(err)}); never written on a guess`
  }
}
