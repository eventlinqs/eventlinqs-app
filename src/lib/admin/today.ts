import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readNightsOwed } from '@/lib/growth/organiser-report'
import { REPORT_AFTER_HOURS } from '@/lib/growth/organiser-report-math'
import { queueOf, reportsOverdue, type Queue, type QueueItem, type Source, type SourceRead } from './today-math'

/**
 * The sources behind /admin/today (the rules and why are in ./today-math.ts). Each reads its owner's own table and
 * answers read, failed or not landed; nothing here writes.
 *
 * NOT LANDED YET, by the car timetable of window 1's 20:12: the plays, paused sends and unclear replies are window 6's
 * outreach CRM (car 3), the low-confidence rows window 4's exception queue (car 4), and a failed J15 or K10 check or a
 * swept image window 3's (car 3). Each is read here by its owner's names the day its car lands, before this car.
 */

const LIST_CAP = 50

type Admin = ReturnType<typeof createAdminClient>

async function attempt(read: () => Promise<QueueItem[]>): Promise<SourceRead> {
  try {
    return { state: 'read', items: await read() }
  } catch (err) {
    return { state: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }
}

/** Collected events waiting for a person's review, as one item: the count, from the oldest. */
async function collectedWaiting(admin: Admin): Promise<QueueItem[]> {
  const { data, count, error } = await admin
    .from('listing_candidates')
    .select('found_at', { count: 'exact' })
    .eq('status', 'waiting')
    .order('found_at', { ascending: true })
    .limit(1)
  if (error) throw new Error(error.message)
  const n = count ?? 0
  if (n === 0 || !data?.[0]) return []
  return [
    {
      id: 'collected:waiting',
      what: `${n} collected ${n === 1 ? 'event' : 'events'} waiting for review`,
      why: 'A collected night is published only once a person has checked it against its source.',
      since: data[0].found_at,
      href: '/admin/collected',
    },
  ]
}

/** Claims a person must decide: the claimant could not be sent a code and asked by hand. */
async function claimsToDecide(admin: Admin): Promise<QueueItem[]> {
  const { data, error } = await admin
    .from('listing_claims')
    .select('id, claimant_name, claimant_role, created_at, venues(name), events(title)')
    .eq('status', 'manual_open')
    .order('created_at', { ascending: true })
    .limit(LIST_CAP)
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => {
    const venue = Array.isArray(c.venues) ? c.venues[0] : c.venues
    const event = Array.isArray(c.events) ? c.events[0] : c.events
    return {
      id: `claim:${c.id}`,
      what: `${c.claimant_name} (${c.claimant_role}) asks to claim ${venue?.name ?? event?.title ?? 'a listing'}`,
      why: 'No published address could take a code, so a person decides. No admin page acts on a hand claim yet.',
      since: c.created_at,
      href: null,
    }
  })
}

/** Requests to take a listing down, still open. */
async function removalsOpen(admin: Admin): Promise<QueueItem[]> {
  const { data, error } = await admin
    .from('removal_requests')
    .select('id, requester_name, reason, created_at, venues(name), event_series(title)')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(LIST_CAP)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const venue = Array.isArray(r.venues) ? r.venues[0] : r.venues
    const series = Array.isArray(r.event_series) ? r.event_series[0] : r.event_series
    return {
      id: `removal:${r.id}`,
      what: `${r.requester_name} asks for ${venue?.name ?? series?.title ?? 'a listing'} to be taken down`,
      why: `Their reason: ${r.reason.length > 160 ? `${r.reason.slice(0, 157)}...` : r.reason}. No admin page acts on a removal yet.`,
      since: r.created_at,
      href: null,
    }
  })
}

/** Lawal's queue, read now. */
export async function readTodayQueue(now: Date = new Date()): Promise<Queue> {
  const admin = createAdminClient()
  const [collected, claims, removals, reports] = await Promise.all([
    attempt(() => collectedWaiting(admin)),
    attempt(() => claimsToDecide(admin)),
    attempt(() => removalsOpen(admin)),
    attempt(async () => reportsOverdue(await readNightsOwed(now), REPORT_AFTER_HOURS, now)),
  ])
  const sources: Source[] = [
    { key: 'plays', section: 'plays', name: 'Outreach plays', read: { state: 'not_landed', owner: "window 6's outreach CRM, car 3" } },
    { key: 'paused', section: 'paused_sends', name: 'Paused sends', read: { state: 'not_landed', owner: "window 6's outreach CRM, car 3" } },
    { key: 'replies', section: 'unclear_replies', name: 'Unclear replies', read: { state: 'not_landed', owner: "window 6's outreach CRM, car 3" } },
    { key: 'collected', section: 'exceptions', name: 'Collected events waiting', read: collected },
    { key: 'low_confidence', section: 'exceptions', name: 'Low-confidence rows', read: { state: 'not_landed', owner: "window 4's exception queue, car 4" } },
    { key: 'checks', section: 'exceptions', name: 'Failed post checks and swept images', read: { state: 'not_landed', owner: "window 3's treatments, car 3" } },
    { key: 'claims', section: 'exceptions', name: 'Claims to decide by hand', read: claims },
    { key: 'removals', section: 'exceptions', name: 'Requests to take a listing down', read: removals },
    { key: 'reports', section: 'exceptions', name: 'After-the-night reports not kept', read: reports },
  ]
  return queueOf(sources)
}
