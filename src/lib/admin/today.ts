import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DISCOVERY_PARTS, dayLineWords, type DayChecks } from '@/lib/listings/discovery-day'
import { createAdminClient } from '@/lib/supabase/admin'
import { NOT_LIVE_FILTER, SUBMISSION_LIVE_WITHIN_MINUTES } from '@/lib/listings/submission-watch-rule'
import { readNightsOwed } from '@/lib/growth/organiser-report'
import { readKitIdsSentByEmail } from '@/lib/social/kit-sent'
import { readCampaign } from '@/lib/social/store'
import { KIND_NAMES } from '@/lib/growth/social-report-math'
import { REPORT_AFTER_HOURS } from '@/lib/growth/organiser-report-math'
import { discoveryDayGlance, failuresInARow, poolFoundGlance, queueOf, removalItem, reportsOverdue, RULE_GLANCE, rulePublishedGlance, heldUnpayableItems, SOURCE_FAILING_AFTER, type Queue, type QueueItem, type RulePublished, type Source, type SourceRead } from './today-math'
import { CAPTURE_RULE_CHECKS } from '@/lib/listings/capture-rule'
import { readEveryRow } from '@/lib/supabase/read-every-row'

/**
 * The sources behind /admin/today (the rules and why are in ./today-math.ts). Each reads its owner's own table and
 * answers read, failed or not landed; nothing here writes.
 *
 * WINDOW 6's OUTREACH (20261028201001 and 20261028213001, car 3), by the names window 6 gave on 28 October at 20:46: a
 * play to approve is outreach_plays in state draft; a paused one is state paused with its paused_reason; a reply the
 * classifier could not act on is outreach_replies.needs_lawal; a draft held by a messages-file rule is an
 * outreach_touches row whose held_because names the rules, read through their generated types (car 3). A table not
 * on the database answers not landed, never an empty queue.
 *
 * WINDOW 4's EXCEPTION QUEUE (20261028204001, its 21:18) is the collected rows waiting for a person, now with their
 * confidence and reasons, read here as one item; and a source whose daily run has failed SOURCE_FAILING_AFTER times in
 * a row (listing_source_runs), window 4's own rule on /admin/collected (FAILING_AFTER_RUNS and failuresInARow, on its
 * branch until car 4, when this reads them from there).
 *
 * WINDOW 3's IMAGE SWEEP (20261028205501, car 3): when an organiser's image is withdrawn or expires, the hourly sweep
 * draws the unposted piece again in type and writes a social_piece_decisions row 'image_withdrawn' with no person; the
 * piece then waits for Lawal's approval of its new revision, so it is listed until that approval or its posting.
 *
 * NOT LANDED: a failed J15 or K10 check. Window 3's pieceDependencies judges it when Approve is pressed and keeps no
 * row; it fetches each night's pages and outside ticket pages, so it is not run on every read of this queue. Until a
 * failed check is kept as a row, this source says where it is shown instead, never restating window 3's rules.
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

/** The client untyped for the one table whose car has not reached this branch: window 4's listing_source_runs (car 4). */
type RunsDb = SupabaseClient
const OUTREACH = "window 6's outreach CRM, car 3"

/** Plays written and waiting for Lawal's one approval. */
async function playsToApprove(db: Admin): Promise<QueueItem[]> {
  const { data, error } = await db.from('outreach_plays').select('id, name, cap_start, created_at').eq('state', 'draft').order('created_at', { ascending: true }).limit(LIST_CAP)
  if (error) fail(error)
  return (data ?? []).map((p) => ({
    id: `play:${p.id}`,
    what: `The play "${p.name}", starting at ${p.cap_start} emails a day`,
    why: 'A play sends only once you approve it; after that every email inside it goes on its own. So it is not approved here in one press: that waits on the gateway checking every email and your mailbox connection, and the PM rules on it.',
    since: p.created_at,
    href: null,
  }))
}

/** Plays the ramp paused, with the reason the database wrote. */
async function pausedPlays(db: Admin): Promise<QueueItem[]> {
  const { data, error } = await db.from('outreach_plays').select('id, name, paused_at, paused_reason').eq('state', 'paused').order('paused_at', { ascending: true }).limit(LIST_CAP)
  if (error) fail(error)
  return (data ?? []).map((p) => ({
    id: `paused:${p.id}`,
    what: `The play "${p.name}" is paused`,
    why: p.paused_reason,
    since: p.paused_at,
    href: null,
  }))
}

/** Replies the classifier could not act on by itself. */
async function repliesToRead(db: Admin): Promise<QueueItem[]> {
  const { data, error } = await db.from('outreach_replies').select('id, received_at, wording, confidence').eq('needs_lawal', true).order('received_at', { ascending: true }).limit(LIST_CAP)
  if (error) fail(error)
  return (data ?? []).map((r) => ({
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
async function draftsHeld(db: Admin): Promise<QueueItem[]> {
  const { data, error } = await db
    .from('outreach_touches')
    .select('id, step, drafted_at, held_because')
    .not('held_because', 'eq', '{}')
    .is('sent_at', null)
    .order('drafted_at', { ascending: true })
    .limit(LIST_CAP)
  if (error) fail(error)
  return (data ?? []).map((t) => ({
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
      why: 'Each waits with its confidence and the reasons it was not accepted by itself; a person checks it against its source.',
      since: data[0].found_at,
      href: '/admin/collected',
    },
  ]
}

/** The nights a rule published since yesterday, ten of them for a glance (src/lib/listings/capture-rule.ts). */
async function rulePublished(admin: Admin, now: Date): Promise<QueueItem[]> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const { data, count, error } = await admin
    .from('listing_candidates')
    .select('title, venue_name, starts_at, reviewed_at', { count: 'exact' })
    .eq('decided_by', 'partner_rule')
    .not('published_series_id', 'is', null)
    .gte('reviewed_at', since)
    .order('reviewed_at', { ascending: false })
    .limit(RULE_GLANCE)
  if (error) throw new Error(error.message)
  return rulePublishedGlance((data ?? []) as RulePublished[], count ?? 0, CAPTURE_RULE_CHECKS)
}

/** The Event Discovery Engine's newest judged day (public.discovery_engine_days, written by the engine itself). */
async function discoveryDayLine(admin: Admin): Promise<QueueItem[]> {
  const db = admin as unknown as SupabaseClient
  const { data, error } = await db
    .from('discovery_engine_days')
    .select('day, checks, manual_steps, consecutive_days, numbers, written_at')
    .not('checks', 'eq', '{}')
    .order('day', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const r = (data ?? [])[0] as
    | { day: string; checks: DayChecks; manual_steps: number; consecutive_days: number; numbers: { evidence?: { manualDetail?: string[] } }; written_at: string }
    | undefined
  if (!r) return discoveryDayGlance(null)
  const failing = DISCOVERY_PARTS.filter((p) => !r.checks[p]?.pass).map((p) => `(${p}) ${r.checks[p]?.why ?? 'not judged'}`)
  return discoveryDayGlance({
    day: r.day,
    words: dayLineWords({ day: r.day, checks: r.checks, manualSteps: r.manual_steps, consecutiveDays: r.consecutive_days }),
    failing,
    manual: r.numbers?.evidence?.manualDetail ?? [],
    writtenAt: r.written_at,
  })
}

/** The addresses the twenty's pool recorded since yesterday, each waiting for Lawal's page check (src/lib/outreach/basis-pool.ts). */
async function poolFound(admin: Admin, now: Date): Promise<QueueItem[]> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const { data, count, error } = await admin
    .from('organiser_contacts')
    .select('address, basis_recorded_at', { count: 'exact' })
    .eq('channel', 'email')
    .eq('basis', 'conspicuous_publication')
    .eq('no_marketing_statement_checked', false)
    .gte('basis_recorded_at', since)
    .order('basis_recorded_at', { ascending: false })
    .limit(5)
  if (error) throw new Error(error.message)
  /* Addresses alone: each names its own domain, and the organisers are read nowhere here (growth-reads-skip-the-platform). */
  const rows = (data ?? []).map((r) => ({ address: String(r.address), organiser: null, recorded_at: String(r.basis_recorded_at) }))
  return poolFoundGlance(rows, count ?? 0)
}

const RUNS_READ = 500

/** Sources whose daily collection has failed SOURCE_FAILING_AFTER runs in a row. */
async function sourcesFailing(db: RunsDb): Promise<QueueItem[]> {
  const { data, error } = await db.from('listing_source_runs').select('source_id, ran_at, succeeded, outcome').order('ran_at', { ascending: false }).limit(RUNS_READ)
  if (error) fail(error)
  const bySource = new Map<string, { ran_at: string; succeeded: boolean; outcome: string }[]>()
  for (const r of (data ?? []) as { source_id: string; ran_at: string; succeeded: boolean; outcome: string }[]) {
    const list = bySource.get(r.source_id) ?? []
    list.push(r)
    bySource.set(r.source_id, list)
  }
  const failing = [...bySource.entries()].filter(([, runs]) => failuresInARow(runs) >= SOURCE_FAILING_AFTER)
  if (failing.length === 0) return []
  const { data: names, error: nerr } = await db.from('listing_sources').select('id, name').in('id', failing.map(([id]) => id))
  if (nerr) fail(nerr)
  const nameOf = new Map(((names ?? []) as { id: string; name: string }[]).map((n) => [n.id, n.name]))
  return failing.map(([id, runs]) => {
    const n = failuresInARow(runs)
    return {
      id: `source:${id}`,
      what: `${nameOf.get(id) ?? 'A source'} has failed ${n} runs in a row`,
      why: `Its last run said: ${runs[0].outcome}. Nothing new comes from it until it reads again.`,
      since: runs[n - 1].ran_at,
      href: '/admin/collected',
    }
  })
}

/**
 * THE WEEK'S PIECES WAITING FOR LAWAL'S YES (order 4, Release 1 item 3: "one prioritised approval queue, approve in one
 * press singly or in a batch"): every piece of this week's campaign whose newest version is drafted, neither approved
 * nor rejected, approved here through the same checked approval as /admin/social (approvePieceAction). Oldest first.
 */
async function piecesToApprove(db: Admin, now: Date): Promise<QueueItem[]> {
  const campaign = await readCampaign(db as unknown as SupabaseClient, now)
  if (campaign === null) return []
  return campaign.pieces
    .filter((p) => p.state === 'drafted')
    .map((p) => ({
      id: `piece:${p.id}`,
      what: `${KIND_NAMES[p.kind] ?? p.kind.replace(/_/g, ' ')}${p.partnerName ? `, ${p.partnerName}` : ''}, ${p.city}`,
      why: 'Waiting for your yes. Approve runs its checks first; a piece that fails one is held and says why.',
      since: p.revision.madeAt,
      href: `/admin/social#piece-${p.id}`,
      approvePiece: p.id,
    }))
}

/** Pieces the image sweep drew again in type, not yet approved again or posted. */
async function piecesSwept(db: Admin): Promise<QueueItem[]> {
  const { data, error } = await db
    .from('social_piece_decisions')
    .select('piece_id, revision, reason, decided_at')
    .eq('decision', 'image_withdrawn')
    .order('decided_at', { ascending: true })
    .limit(LIST_CAP)
  if (error) fail(error)
  const swept = data ?? []
  if (swept.length === 0) return []
  const ids = [...new Set(swept.map((d) => d.piece_id))]
  const [{ data: posted, error: perr }, { data: approved, error: aerr }] = await Promise.all([
    db.from('social_piece_postings').select('piece_id').in('piece_id', ids),
    db.from('social_piece_approvals').select('piece_id, revision').in('piece_id', ids),
  ])
  if (perr) fail(perr)
  if (aerr) fail(aerr)
  // A partner kit Lawal sent by email has gone as surely as one marked sent (src/lib/social/kit-sent.ts).
  const gone = new Set([...(posted ?? []).map((p) => p.piece_id), ...(await readKitIdsSentByEmail(db, ids))])
  const approvals = approved ?? []
  return swept
    .filter((d) => !gone.has(d.piece_id) && !approvals.some((a) => a.piece_id === d.piece_id && a.revision > d.revision))
    .map((d) => ({
      id: `swept:${d.piece_id}:${d.revision}`,
      what: 'A post drawn again in type after its image was withdrawn',
      why: `${d.reason} It goes only once you approve the new version.`,
      since: d.decided_at,
      href: '/admin/social',
      approvePiece: d.piece_id,
    }))
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
    .select('id, requester_name, requester_email, reason, created_at, venues(name), event_series(name), events(title, slug)')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(LIST_CAP)
  if (error) throw new Error(error.message)
  return (data ?? []).map(removalItem)
}

/**
 * ORGANISER EVENTS NOT LIVE AFTER AN HOUR (the PM's 15:00 of 8 November 2026): waiting, held, or accepted with no event,
 * an hour after they were sent in (src/lib/listings/submission-watch-rule.ts). Read first; the target is none.
 */
async function submissionsNotLive(admin: Admin, now: Date): Promise<QueueItem[]> {
  const hourAgo = new Date(now.getTime() - SUBMISSION_LIVE_WITHIN_MINUTES * 60_000).toISOString()
  const { data, error } = await admin
    .from('listing_submissions')
    .select('id, title, name, status, held_because, created_at')
    .or(NOT_LIVE_FILTER)
    .lt('created_at', hourAgo)
    .order('created_at', { ascending: true })
    .limit(LIST_CAP)
  if (error) fail(error)
  return (data ?? []).map((r) => ({
    id: `submission:${r.id as string}`,
    what: `${String(r.title)}, sent in by ${String(r.name)}`,
    why:
      r.status === 'held'
        ? `Held: ${String(r.held_because ?? 'no reason recorded')}`
        : r.status === 'accepted'
          ? 'Accepted, and not joined to a live event'
          : 'Still waiting for its checks',
    since: r.created_at as string,
    href: '/admin/submissions',
  }))
}

/**
 * ORGANISATIONS THAT CANNOT BE PAID YET, HOLDING MORE THAN A$2,000 (the PM's 15:36 of 14 November 2026). "Cannot be paid
 * yet" is the payout cron's own rule, connected and active (runEventDisbursements; money-summary.ts states it the same
 * way), and the amount is the ledger the payout pays from, so this line and the organiser's own money panel agree.
 */
async function heldUnpayable(admin: Admin): Promise<QueueItem[]> {
  const orgs = await readEveryRow('today held unpayable organisations', (from, to) =>
    admin.from('organisations').select('id, name').or('stripe_account_id.is.null,payout_status.neq.active').order('id').range(from, to),
  )
  if (orgs.length === 0) return []
  const ids = orgs.map((o) => o.id as string)
  const rows = await readEveryRow('today held unpayable ledger', (from, to) =>
    admin.from('organiser_balance_ledger').select('organisation_id, delta_cents, created_at').in('organisation_id', ids).eq('currency', 'AUD').order('id').range(from, to),
  )
  return heldUnpayableItems(
    orgs.map((o) => ({ id: o.id as string, name: String(o.name) })),
    rows.map((r) => ({ organisation_id: r.organisation_id as string, delta_cents: Number(r.delta_cents), created_at: r.created_at as string })),
  )
}

/** Lawal's queue, read now. */
export async function readTodayQueue(now: Date = new Date()): Promise<Queue> {
  const admin = createAdminClient()
  const runs = admin as unknown as RunsDb
  const [submissions, pieces, plays, paused, replies, held, collected, failingSources, swept, claims, removals, reports, ruled, pooled] = await Promise.all([
    attempt(() => submissionsNotLive(admin, now)),
    attempt(() => piecesToApprove(admin, now)),
    attempt(() => playsToApprove(admin), OUTREACH),
    attempt(() => pausedPlays(admin), OUTREACH),
    attempt(() => repliesToRead(admin), OUTREACH),
    attempt(() => draftsHeld(admin), OUTREACH),
    attempt(() => collectedWaiting(admin)),
    attempt(() => sourcesFailing(runs), "window 4's supply horizon, car 4"),
    attempt(() => piecesSwept(admin), "window 3's image sweep, car 3"),
    attempt(() => claimsToDecide(admin)),
    attempt(() => removalsOpen(admin)),
    attempt(async () => reportsOverdue(await readNightsOwed(now), REPORT_AFTER_HOURS, now)),
    attempt(() => rulePublished(admin, now)),
    attempt(() => poolFound(admin, now), OUTREACH),
  ])
  const sources: Source[] = [
    { key: 'submissions', section: 'submissions', name: 'Organiser events not live after an hour', read: submissions },
    { key: 'pieces', section: 'pieces', name: "This week's posts waiting for your yes", read: pieces },
    { key: 'plays', section: 'plays', name: 'Outreach plays', read: plays },
    { key: 'paused', section: 'paused_sends', name: 'Paused plays', read: paused },
    { key: 'replies', section: 'unclear_replies', name: 'Unclear replies', read: replies },
    { key: 'held', section: 'exceptions', name: 'Drafts held by a rule', read: held },
    { key: 'collected', section: 'exceptions', name: 'Collected events waiting', read: collected },
    { key: 'failing_sources', section: 'exceptions', name: 'Sources failing their daily run', read: failingSources },
    { key: 'swept', section: 'exceptions', name: 'Posts drawn again after an image was withdrawn', read: swept },
    { key: 'checks', section: 'exceptions', name: 'Posts failing their J15 or K10 checks', read: { state: 'not_landed', owner: 'window 3 keeps no row of a failed check; /admin/social shows each one when Approve is pressed' } },
    { key: 'claims', section: 'exceptions', name: 'Claims to decide by hand', read: claims },
    { key: 'removals', section: 'exceptions', name: 'Requests to take a listing down', read: removals },
    { key: 'reports', section: 'exceptions', name: 'After-the-night reports not kept', read: reports },
    { key: 'rule_published', section: 'exceptions', name: 'Nights published by the rule since yesterday', read: ruled },
    { key: 'pool_found', section: 'exceptions', name: "Addresses the twenty's pool recorded since yesterday", read: pooled },
  ]
  /* The engine's own day line, read in a line of its own (Lawal's 18:31 of 13 November 2026). */
  sources.push({ key: 'discovery_day', section: 'exceptions', name: "The Event Discovery Engine's day line", read: await attempt(() => discoveryDayLine(admin)) })
  sources.push({ key: 'held_unpayable', section: 'exceptions', name: 'Ticket sales held for an organisation with no payout account', read: await attempt(() => heldUnpayable(admin)) })
  return queueOf(sources)
}
