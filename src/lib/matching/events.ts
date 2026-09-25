import 'server-only'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'

type Admin = SupabaseClient<Database>

/**
 * WHICH EVENTS THE MATCHER MAY BE POINTED AT, AND THE ONE PLACE THAT DECIDES.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO STOP, measured on TEST on 19 September 2026.
 *
 * The picker on /admin/matches composed its own read inline: published, public,
 * `order('start_date', ascending)`, `limit(40)`, and NO BOUND ON TIME. The
 * component's own comment said "The picker lists the soonest published events".
 * It does not. Ordering every published event ascending and taking forty gives
 * the forty OLDEST events the platform has ever had.
 *
 *   published + public on TEST:  101 already over, 175 still to come
 *   what the picker offered:     June 2026, every one of them finished
 *
 * So the screen that decides who hears about an event could not be pointed at a
 * single event anybody could still go to, and it got worse every time a past
 * event was added. Nothing failed, nothing was empty, and the list looked
 * entirely plausible.
 *
 * ---------------------------------------------------------------------------
 * THE BOUND IS THE PLATFORM'S OWN, NOT A NEW ONE WRITTEN HERE.
 *
 * The first version of this door spelled out `status`, `visibility` and a
 * `gte('end_date')` of its own, and `scripts/guards/one-visibility-source.mjs`
 * refused it within the minute. It was right, and the shared rule is better than
 * the one written here was: `listingWindowOrPredicate` keeps an event listed
 * until it has ACTUALLY ENDED, and for an event with no `end_date` it uses the
 * end of the calendar day of `start_date` IN THE EVENT'S OWN ZONE. A festival
 * that opened on Friday and runs to Sunday is still worth telling somebody about
 * on Saturday, and a 9 am show stays offerable all day.
 *
 * `includeExternal` IS LEFT AT ITS DEFAULT OF FALSE, deliberately. An externally
 * ticketed event is a real event and is not hidden anywhere, but the consent
 * this matcher's list is spent against is worded "events ticketed on EventLinqs,
 * marketed by EventLinqs as the sender" (src/lib/consent/purposes.ts). An event
 * whose tickets are sold elsewhere is not that, so it is not offered here.
 *
 * `now` IS AN ARGUMENT rather than a call to the clock, so the door can be
 * tested at a chosen instant instead of whenever the suite happens to run.
 *
 * THE DATE IS NOT FORMATTED HERE. It travels as the stored instant plus the
 * event's own zone, and the surface renders it through
 * src/lib/dates/event-time.ts, because an event's date is the EVENT's and this
 * module has no opinion about how a screen spells a date.
 */

export interface MatchableEvent {
  id: string
  title: string
  /** The stored instant, UTC, exactly as the database holds it. */
  startDate: string
  /** The event's own zone. Every rendering of startDate takes it. */
  timezone: string
}

/** The columns every caller needs, named once. */
const COLUMNS = 'id, title, start_date, timezone'

type Row = { id: string; title: string; start_date: string; timezone: string }

function toMatchable(row: Row): MatchableEvent {
  return { id: row.id, title: row.title, startDate: row.start_date, timezone: row.timezone }
}

/**
 * The events an owner may produce a match for: publicly visible by the
 * platform's one rule, which includes not being over yet, soonest first.
 */
export async function readMatchableEvents(admin: Admin, now: Date, limit = 40): Promise<MatchableEvent[]> {
  /*
   * THE ORDER AND THE LIMIT SIT INSIDE THE WRAPPED CHAIN, and that is not a
   * style choice.
   *
   * scripts/guards/no-silent-row-ceiling.mjs follows the builder chain from
   * `.from()` across `.method(...)` links to decide whether a read is bounded,
   * and a WRAPPING call ends that walk: with the order and the limit written
   * after `applyPublicEventVisibility(...)`, the guard saw `.select` alone and
   * reported this read as unbounded. It was right from where it was standing.
   * Inside the wrapper the whole chain is visible, and it is equivalent:
   * PostgrestTransformBuilder.limit returns `this`
   * (node_modules/@supabase/postgrest-js/src/PostgrestTransformBuilder.ts), so
   * the object the visibility rule then filters is the same builder.
   */
  /*
   * THROUGH THE DOOR, BECAUSE AN EMPTY CANDIDATE LIST IS AN ANSWER.
   *
   * This read discarded its error, so a failed request became "there are no
   * events to match", the matcher scored nobody, and /admin/matches reported a
   * run of zero. Nothing about that reads as a fault. A throw answers 500 and
   * says ask again.
   */
  const data = await readOrThrow('matchable events', () =>
    applyPublicEventVisibility(
      admin.from('events').select(COLUMNS).order('start_date', { ascending: true }).limit(limit),
      { now },
    ),
  )
  return ((data ?? []) as Row[]).map(toMatchable)
}

/**
 * One event by id, WITHOUT the time bound.
 *
 * An address may name any event, including one that is over, and the screen
 * must be able to describe the event it is describing. Reading a past run's
 * event is not the same act as offering it in the picker, which is why the
 * bound lives on the list and not here.
 */
export async function readEventForMatching(admin: Admin, id: string): Promise<MatchableEvent | null> {
  // null here is "no such event", which the screen may say. A failed read is
  // not that, so it raises rather than becoming the same sentence.
  const data = await readOrThrow('matching event by id', () =>
    admin.from('events').select(COLUMNS).eq('id', id).maybeSingle(),
  )
  return data ? toMatchable(data as Row) : null
}
