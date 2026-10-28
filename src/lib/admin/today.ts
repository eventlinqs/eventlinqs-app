import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { readNightsOwed } from '@/lib/growth/organiser-report'
import { REPORT_AFTER_HOURS } from '@/lib/growth/organiser-report-math'
import { queueOf, reportsOverdue, type Queue, type QueueItem, type Source, type SourceRead } from './today-math'

/**
 * The sources behind /admin/today (the rules and why are in ./today-math.ts). Each reads its owner's own table and
 * answers read, failed or not landed; nothing here writes.
 *
 * WINDOW 6's OUTREACH (20261028201001 and 20261028213001, car 3), by the names window 6 gave on 28 October at 20:46: a
 * play to approve is outreach_plays in state draft; a paused one is state paused with its paused_reason; a reply the
 * classifier could not act on is outreach_replies.needs_lawal; a draft held by a messages-file rule is an
 * outreach_touches row whose held_because names the rules. Their generated types reach this branch with car 3, so
 * until then these four reads go through OutreachDb, the client untyped for those tables only. A table not on the
 * database answers not landed, never an empty queue.
 *
 * NOT LANDED YET, by the car timetable of window 1's 20:12: the low-confidence rows are window 4's exception queue
 * (car 4), and a failed J15 or K10 check or a swept image window 3's (car 3).
 */

const LIST_CAP = 50

type Admin = ReturnType<typeof createAdminClient>

/** PostgREST's answer for a table it does not know: the source's car has not landed on this database. */
class NotLanded extends Error {}
const isNotLanded = (error: { code?: string; message?: string }) =>
  error.code === 'PGRST205' || error.code === '42P01' || /Could not find the table/i.test(error.message ?? '')

async function attempt(read: () => Promise<QueueItem[]>, owner: string | null = null): Promise<SourceRead> {
  try {
    return { state: 'read', items: await read() }
  } catch (err) {
    if (err instanceof NotLanded && owner !== null) return { state: 'not_landed', owner }
    return { state: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }
}

/** Throws NotLanded for a missing table, the message otherwise. */
function fail(error: { code?: string; message?: string }): never {
  if (isNotLanded(error)) throw new NotLanded(error.message ?? 'not landed')
  throw new Error(error.message ?? 'unknown')
}

type OutreachDb = SupabaseClient
const OUTREACH = "window 6's outreach CRM, car 3"

/** Plays written and waiting for Lawal's one approval. */
async function playsToApprove(db: OutreachDb): Promise<QueueItem[]> {
  const { data, error } = await db.from('outreach_plays').select('id, name, cap_start, created_at').eq('state', 'draft').order('created_at', { ascending: true }).limit(LIST_CAP)
  if (error) fail(error)
  return ((data ?? []) as { id: string; name: string; cap_start: number; created_at: string }[]).map((p) => ({
    id: `play:${p.id}`,
    what: `The play "${p.name}", starting at ${p.cap_start} emails a day`,
    why: 'A play sends only once you approve it; after that every email inside it goes on its own.',
    since: p.created_at,
    href: null,
  }))
}

/** Plays the ramp paused, with the reason the database wrote. */
async function pausedPlays(db: OutreachDb): Promise<QueueItem[]> {
  const { data, error } = await db.from('outreach_plays').select('id, name, paused_at, paused_reason').eq('state', 'paused').order('paused_at', { ascending: true }).limit(LIST_CAP)
  if (error) fail(error)
  return ((data ?? []) as { id: string; name: string; paused_at: string; paused_reason: string }[]).map((p) => ({
    id: `paused:${p.id}`,
    what: `The play "${p.name}" is paused`,
    why: p.paused_reason,
    since: p.paused_at,
    href: null,
  }))
}

/** Replies the classifier could not act on by itself. */
async function repliesToRead(db: OutreachDb): Promise<QueueItem[]> {
  const { data, error } = await db.from('outreach_replies').select('id, received_at, wording, confidence').eq('needs_lawal', true).order('received_at', { ascending: true }).limit(LIST_CAP)
  if (error) fail(error)
  return ((data ?? []) as { id: string; received_at: string; wording: string; confidence: number | null }[]).map((r) => ({
    id: `reply:${r.id}`,
    what: `A reply: "${r.wording.length > 140 ? `${r.wording.slice(0, 137)}...` : r.wording}"`,
    why:
      r.confidence === null
        ? 'It did not clearly say yes, stop, take it down, or ask a question with a stored answer.'
        : `It did not clearly say yes, stop, take it down, or ask a question with a stored answer (confidence ${Math.round(Number(r.confidence) * 100)} percent).`,
    since: r.received_at,
    href: null,
  }))
}

/** Drafts held because they break a rule of the messages file. */
async function draftsHeld(db: OutreachDb): Promise<QueueItem[]> {
  const { data, error } = await db
    .from('outreach_touches')
    .select('id, step, drafted_at, held_because')
    .not('held_because', 'eq', '{}')
    .is('sent_at', null)
    .order('drafted_at', { ascending: true })
    .limit(LIST_CAP)
  if (error) fail(error)
  return ((data ?? []) as { id: string; step: number; drafted_at: string; held_because: string[] }[]).map((t) => ({
    id: `held:${t.id}`,
    what: `A message ${t.step} draft held`,
    why: `It breaks: ${t.held_because.join('; ')}.`,
    since: t.drafted_at,
    href: null,
  }))
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
    .select('id, requester_name, reason, created_at, venues(name), event_series(name)')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(LIST_CAP)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const venue = Array.isArray(r.venues) ? r.venues[0] : r.venues
    const series = Array.isArray(r.event_series) ? r.event_series[0] : r.event_series
    return {
      id: `removal:${r.id}`,
      what: `${r.requester_name} asks for ${venue?.name ?? series?.name ?? 'a listing'} to be taken down`,
      why: `Their reason: ${r.reason.length > 160 ? `${r.reason.slice(0, 157)}...` : r.reason}. No admin page acts on a removal yet.`,
      since: r.created_at,
      href: null,
    }
  })
}

/** Lawal's queue, read now. */
export async function readTodayQueue(now: Date = new Date()): Promise<Queue> {
  const admin = createAdminClient()
  const crm = admin as unknown as OutreachDb
  const [plays, paused, replies, held, collected, claims, removals, reports] = await Promise.all([
    attempt(() => playsToApprove(crm), OUTREACH),
    attempt(() => pausedPlays(crm), OUTREACH),
    attempt(() => repliesToRead(crm), OUTREACH),
    attempt(() => draftsHeld(crm), OUTREACH),
    attempt(() => collectedWaiting(admin)),
    attempt(() => claimsToDecide(admin)),
    attempt(() => removalsOpen(admin)),
    attempt(async () => reportsOverdue(await readNightsOwed(now), REPORT_AFTER_HOURS, now)),
  ])
  const sources: Source[] = [
    { key: 'plays', section: 'plays', name: 'Outreach plays', read: plays },
    { key: 'paused', section: 'paused_sends', name: 'Paused plays', read: paused },
    { key: 'replies', section: 'unclear_replies', name: 'Unclear replies', read: replies },
    { key: 'held', section: 'exceptions', name: 'Drafts held by a rule', read: held },
    { key: 'collected', section: 'exceptions', name: 'Collected events waiting', read: collected },
    { key: 'low_confidence', section: 'exceptions', name: 'Low-confidence rows', read: { state: 'not_landed', owner: "window 4's exception queue, car 4" } },
    { key: 'checks', section: 'exceptions', name: 'Failed post checks and swept images', read: { state: 'not_landed', owner: "window 3's treatments, car 3" } },
    { key: 'claims', section: 'exceptions', name: 'Claims to decide by hand', read: claims },
    { key: 'removals', section: 'exceptions', name: 'Requests to take a listing down', read: removals },
    { key: 'reports', section: 'exceptions', name: 'After-the-night reports not kept', read: reports },
  ]
  return queueOf(sources)
}
