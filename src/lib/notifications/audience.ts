import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { readEveryRowIn } from '@/lib/supabase/read-every-row-in'
import { chooseChannel, DEFAULT_PREFS } from './policy'

/**
 * WHO AN ALERT IS FOR, READ IN FULL AND ASKED ABOUT ONCE.
 *
 * ---------------------------------------------------------------------------
 * THE THREE DEFECTS THIS MODULE EXISTS TO END, all in the just-announced cron,
 * all reproduced in tests/unit/cron/notify-just-announced.test.ts before a line
 * of this file was written.
 *
 * 1. THE FOLLOWER LIST WAS READ UNBOUNDED. `saved_organisers` and `follows` were
 *    selected with no `.limit()` and no `.range()`, and a Supabase project
 *    returns at most a fixed number of rows per response, 1,000 by default
 *    ("By default, Supabase projects return a maximum of 1,000 rows ... You can
 *    use range() queries to paginate through your data",
 *    https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 *    The truncation is silent: HTTP 200, `error` null, a full-looking array.
 *    Every follower past the ceiling was simply never a recipient of anything.
 *
 * 2. THE `.in()` LISTS WERE NOT CHUNKED. The cron reads up to 200 events and
 *    spells their organisation ids into one `.in()`. A UUID and its comma cost
 *    37 bytes, so 200 of them is about 7.4 KB against the 4 KB budget
 *    `chunkInFilterValues` documents and measures. The failure is not a short
 *    answer, it is `TypeError: fetch failed`.
 *
 * 3. THE RUN RE-CONSIDERED WORK THAT COULD NEVER FINISH. The cron capped itself
 *    at MAX_DISPATCHES and counted a slot for every recipient it LOOKED at,
 *    including ones it had already alerted. Events are read newest first, so
 *    every run walked the identical sequence, spent its whole budget
 *    re-confirming delivered alerts, and broke at the same index: a livelock
 *    rather than a delay, and one that got worse each time a new event was
 *    announced, because a new event arrives at the FRONT of that order.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ALREADY-ALERTED SET IS READ IN BULK RATHER THAN ASKED PER PERSON.
 *
 * `dispatchAlert` checks the dedupe row itself, one `maybeSingle()` per
 * recipient, and it still does: that check is the race-safe one and it stays.
 * What changed is that the route no longer needs it to be the first thing it
 * learns. Reading a whole event's delivered set in pages of a thousand replaces
 * one round trip per recipient with one per thousand, so the bulk read is
 * cheaper than the status quo on the same information rather than an added cost.
 *
 * ---------------------------------------------------------------------------
 * WHY UNREACHABILITY IS A FILTERED READ AND NOT A SCAN.
 *
 * A user with no `notification_prefs` row gets DEFAULT_PREFS, which has both
 * channels ON, so they are always reachable. Only a user with an explicit row
 * carrying `email_enabled = false` can possibly have no channel at all. That
 * makes the question a small filtered read rather than a scan of every
 * follower's preferences, and it is why this asks about email first, push after.
 *
 * The verdict itself is `chooseChannel`, called here with bulk-loaded inputs
 * rather than restated. One policy function, two callers, nothing to drift.
 */

type Admin = SupabaseClient

/** Group `rows` into a map of key to the values found under it. */
function groupBy<T>(rows: T[], key: (row: T) => string | null, value: (row: T) => string | null) {
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const k = key(row)
    const v = value(row)
    if (!k || !v) continue
    const list = map.get(k) ?? []
    list.push(v)
    map.set(k, list)
  }
  return map
}

/** Display names for the alert copy, read in full so a long batch keeps them all. */
export async function readOrganisationNames(admin: Admin, orgIds: string[]): Promise<Map<string, string>> {
  const rows = await readEveryRowIn<{ id: string; name: string }>(
    'organisation names for just-announced alerts',
    orgIds,
    (values, from, to) =>
      admin.from('organisations').select('id, name').in('id', values).order('id').range(from, to),
  )
  return new Map(rows.map((r) => [r.id, r.name]))
}

/** Every follower of every named organisation. A follow is a row in saved_organisers. */
export async function readFollowersByOrganisation(
  admin: Admin,
  orgIds: string[],
): Promise<Map<string, string[]>> {
  const rows = await readEveryRowIn<{ organisation_id: string; user_id: string }>(
    'organisation followers for just-announced alerts',
    orgIds,
    (values, from, to) =>
      admin
        .from('saved_organisers')
        .select('organisation_id, user_id')
        .in('organisation_id', values)
        .order('organisation_id')
        .order('user_id')
        .range(from, to),
  )
  return groupBy(
    rows,
    (r) => r.organisation_id,
    (r) => r.user_id,
  )
}

/** Confirmed lineup rows for the named events. */
export async function readConfirmedLineups(
  admin: Admin,
  eventIds: string[],
): Promise<{ event_id: string; artist_id: string }[]> {
  return readEveryRowIn<{ event_id: string; artist_id: string }>(
    'confirmed lineups for just-announced alerts',
    eventIds,
    (values, from, to) =>
      admin
        .from('event_artists')
        .select('event_id, artist_id')
        .eq('status', 'confirmed')
        .in('event_id', values)
        .order('event_id')
        .order('artist_id')
        .range(from, to),
  )
}

/** Every follower of every named artist. */
export async function readFollowersByArtist(
  admin: Admin,
  artistIds: string[],
): Promise<Map<string, string[]>> {
  const rows = await readEveryRowIn<{ followable_id: string; user_id: string }>(
    'artist followers for just-announced alerts',
    artistIds,
    (values, from, to) =>
      admin
        .from('follows')
        .select('followable_id, user_id')
        .eq('followable_type', 'artist')
        .in('followable_id', values)
        .order('followable_id')
        .order('user_id')
        .range(from, to),
  )
  return groupBy(
    rows,
    (r) => r.followable_id,
    (r) => r.user_id,
  )
}

/**
 * The users who have already had this alert for this event, in full.
 *
 * Read per event rather than per batch so one read is bounded by one event's
 * audience rather than by everything this cron has ever sent.
 */
export async function readAlreadyAlerted(admin: Admin, eventId: string, type: string): Promise<Set<string>> {
  const rows = await readEveryRow<{ user_id: string }>(`alerts already sent for event ${eventId}`, (from, to) =>
    admin
      .from('notifications')
      .select('user_id')
      .eq('event_id', eventId)
      .eq('type', type)
      .order('user_id')
      .range(from, to),
  )
  return new Set(rows.map((r) => r.user_id).filter(Boolean))
}

/**
 * The subset of these users who have no delivery channel at all.
 *
 * NOT a suppression list and never written anywhere: it is recomputed every run,
 * so a user who turns a channel back on is reachable again on the next one. It
 * exists so that a recipient who cannot be delivered to does not spend a slot out
 * of the run's budget on every run for ever, which is how an opted-out population
 * sitting in front of everybody else starved the people behind it.
 */
export async function findUnreachableUsers(admin: Admin, userIds: string[]): Promise<Set<string>> {
  const unreachable = new Set<string>()
  if (userIds.length === 0) return unreachable

  const emailOff = await readEveryRowIn<{ user_id: string; push_enabled: boolean }>(
    'notification preferences with email switched off',
    userIds,
    (values, from, to) =>
      admin
        .from('notification_prefs')
        .select('user_id, push_enabled')
        .eq('email_enabled', false)
        .in('user_id', values)
        .order('user_id')
        .range(from, to),
  )
  if (emailOff.length === 0) return unreachable

  // Of those, the ones who still allow push are reachable if and only if they
  // actually have a live subscription.
  const mayPush = emailOff.filter((r) => r.push_enabled).map((r) => r.user_id)
  const subscribed = new Set(
    (
      await readEveryRowIn<{ user_id: string }>(
        'push subscriptions for users with email switched off',
        mayPush,
        (values, from, to) =>
          admin
            .from('push_subscriptions')
            .select('user_id')
            .in('user_id', values)
            .order('user_id')
            .range(from, to),
      )
    ).map((r) => r.user_id),
  )

  for (const row of emailOff) {
    const prefs = { ...DEFAULT_PREFS, email_enabled: false, push_enabled: row.push_enabled }
    if (chooseChannel(prefs, subscribed.has(row.user_id)) === null) unreachable.add(row.user_id)
  }
  return unreachable
}
