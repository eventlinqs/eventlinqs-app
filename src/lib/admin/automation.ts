import { createAdminClient } from '@/lib/supabase/admin'
import { midnightIn } from '@/lib/dates/zone-midnight'
import { cardState, nextRun, threeNumbers, type CardState, type ThreeNumbers } from './automation-math'
import { SCHEDULES, type Schedule } from './automation-schedules'
import { agrees, countOf } from '@/lib/text/plural'
import { LETTER_WAITS, PHOTO_WAITS } from './what-waits'

/**
 * THE AUTOMATION DASHBOARD'S READS (Lawal's 13:41 of 15 November 2026, relayed by the PM at 13:55; the map is
 * C:\dev\START-16OCT\EL-AUTOMATION-MAP-15NOV.md). One card per recurring task: what it does, its schedule and next run,
 * its last run where the task records one, today's queue, its results, its one switch, and what waits for a person.
 * Every figure is read now from the table its task keeps; a read that fails says so on its card, never a zero.
 *
 * THE SCHEDULES are written in ./automation-schedules.ts and held to vercel.json and the GitHub workflows by
 * tests/unit/admin/automation-schedules.test.ts, so a schedule changed in one place and not the other fails the build.
 */

export type Switch =
  | { kind: 'flag'; flag: 'social_auto_publish'; on: boolean }
  | { kind: 'sender'; mode: 'hold' | 'test' | 'live'; dnsOk: boolean; dnsCheckedAt: string | null; setByAPerson: boolean }
  | { kind: 'none'; note: string }

export type Figure = { label: string; value: number | string }

export type AutomationCard = {
  key: string
  title: string
  does: string
  schedules: Array<Schedule & { next: string | null }>
  lastRun: { at: string; what: string } | null
  queue: Figure[]
  results: Figure[]
  switch: Switch
  waitsFor: string | null
  /** How many things on this card wait for a person, read with its figures (0 when its read failed). */
  waiting: number
  /** Where what waits is an approval, the noun one of them is called ('post', 'letter'): Today sums these (needsYou). */
  approvalNoun?: string
  state: CardState
  link: { href: string; label: string } | null
  readFailed: string | null
}


/** The start of today in Melbourne, as an instant. */
function melbourneDayStart(now: Date): Date {
  // True on a daylight saving day too (src/lib/dates/zone-midnight.ts; car D, 19 November 2026).
  return midnightIn(now, 'Australia/Melbourne')
}

function melbourneMonthStart(now: Date, monthsBack: number): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit' }).format(now)
  const [y, m] = ymd.split('-').map(Number) as [number, number]
  const target = new Date(Date.UTC(y, m - 1 - monthsBack, 1, 12))
  // The first of the month in Melbourne, as an instant: noon UTC on the first, then back to Melbourne's midnight.
  return melbourneDayStart(target)
}

type Db = ReturnType<typeof createAdminClient>

type Counted = PromiseLike<{ count: number | null; error: { message: string } | null }>

/** A head-only exact count; a failed read throws with its table's name, so the card says which read failed. */
async function counted(table: string, query: Counted): Promise<number> {
  const { count: n, error } = await query
  if (error) throw new Error(`${table}: ${error.message}`)
  return n ?? 0
}

function withSchedules(list: Schedule[], now: Date) {
  return list.map((s) => ({ ...s, next: nextRun(s.cron, now)?.toISOString() ?? null }))
}

async function card(
  base: Omit<AutomationCard, 'schedules' | 'lastRun' | 'queue' | 'results' | 'switch' | 'waitsFor' | 'waiting' | 'state' | 'readFailed'> & { schedules: Schedule[] },
  now: Date,
  read: () => Promise<Pick<AutomationCard, 'lastRun' | 'queue' | 'results' | 'switch' | 'waitsFor'> & { waiting: number }>,
): Promise<AutomationCard> {
  const schedules = withSchedules(base.schedules, now)
  try {
    const r = await read()
    const switchedOn = r.switch.kind === 'flag' ? r.switch.on : r.switch.kind === 'sender' ? r.switch.mode === 'live' : null
    return { ...base, schedules, lastRun: r.lastRun, queue: r.queue, results: r.results, switch: r.switch, waitsFor: r.waitsFor, waiting: r.waiting, state: cardState({ switchedOn, waitingOnPerson: r.waiting }), readFailed: null }
  } catch (err) {
    return {
      ...base,
      schedules,
      lastRun: null,
      queue: [],
      results: [],
      switch: { kind: 'none', note: 'not read' },
      waitsFor: null,
      waiting: 0,
      state: 'waits',
      readFailed: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function readThreeNumbers(db: Db, now: Date): Promise<ThreeNumbers> {
  const thisStart = melbourneMonthStart(now, 0).toISOString()
  const lastStart = melbourneMonthStart(now, 1).toISOString()
  const { data, error } = await db
    .from('orders')
    .select('organisation_id, confirmed_at, created_at, tickets(id)')
    .in('status', ['confirmed', 'partially_refunded'])
    .gt('total_cents', 0)
    .gte('created_at', lastStart)
  if (error) throw new Error(`orders: ${error.message}`)
  const rows = (data ?? []) as unknown as Array<{ organisation_id: string; confirmed_at: string | null; created_at: string; tickets: Array<{ id: string }> | null }>
  const at = (r: (typeof rows)[number]) => r.confirmed_at ?? r.created_at
  const thisMonth = rows.filter((r) => at(r) >= thisStart)
  const lastMonth = rows.filter((r) => at(r) >= lastStart && at(r) < thisStart)
  return threeNumbers({
    organisersSelling: new Set(thisMonth.map((r) => r.organisation_id)).size,
    paidTicketsThisMonth: thisMonth.reduce((n, r) => n + (r.tickets?.length ?? 0), 0),
    paidTicketsLastMonth: lastMonth.reduce((n, r) => n + (r.tickets?.length ?? 0), 0),
  })
}

export async function readAutomation(now: Date = new Date()): Promise<{ numbers: ThreeNumbers | { failed: string }; cards: AutomationCard[] }> {
  const db = createAdminClient()
  const today = melbourneDayStart(now).toISOString()
  const week = new Date(now.getTime() - 7 * 864e5).toISOString()
  const month = new Date(now.getTime() - 30 * 864e5).toISOString()

  const sender = async () => {
    const { data, error } = await db.from('outreach_sender').select('mode, dns_ok, dns_checked_at, changed_by').limit(1).maybeSingle()
    if (error) throw new Error(`outreach_sender: ${error.message}`)
    const row = data as { mode: 'hold' | 'test' | 'live'; dns_ok: boolean; dns_checked_at: string | null; changed_by: string | null } | null
    if (!row) throw new Error('outreach_sender: no row')
    return { kind: 'sender' as const, mode: row.mode, dnsOk: row.dns_ok, dnsCheckedAt: row.dns_checked_at, setByAPerson: row.changed_by !== null }
  }

  const cards = await Promise.all([
    card(
      {
        key: 'social',
        title: 'Social posts',
        does: "Plans the week's pieces from the ranked nights, redraws any piece whose photo was withdrawn, and posts each approved piece on Instagram and Facebook at its moment.",
        schedules: [SCHEDULES.socialPublish, SCHEDULES.socialImageSweep],
        link: { href: '/admin/social', label: 'Open social' },
        approvalNoun: 'post',
      },
      now,
      async () => {
        const { data: flag, error: flagError } = await db.from('feature_flags').select('enabled').eq('flag', 'social_auto_publish').maybeSingle()
        if (flagError) throw new Error(`feature_flags: ${flagError.message}`)
        const { data: last, error: lastError } = await db.from('audit_log').select('created_at, action').like('action', 'system.social.%').order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (lastError) throw new Error(`audit_log: ${lastError.message}`)
        const planned = await counted('social_pieces', db.from('social_pieces').select('id', { count: 'exact', head: true }).gte('planned_at', week))
        const approved = await counted('social_piece_approvals', db.from('social_piece_approvals').select('id', { count: 'exact', head: true }).gte('approved_at', week))
        const posted = await counted('social_piece_postings', db.from('social_piece_postings').select('id', { count: 'exact', head: true }).gte('posted_at', week).neq('post_url', 'sent'))
        const lastRow = last as { created_at: string; action: string } | null
        const waiting = Math.max(planned - approved, 0)
        return {
          lastRun: lastRow ? { at: lastRow.created_at, what: lastRow.action === 'system.social.plan' ? 'planned the week' : 'published or held a piece' } : null,
          queue: [{ label: 'Pieces planned this week', value: planned }, { label: 'Waiting for approval', value: waiting }],
          results: [{ label: 'Approved this week', value: approved }, { label: 'Posted this week', value: posted }],
          switch: { kind: 'flag', flag: 'social_auto_publish', on: Boolean((flag as { enabled: boolean } | null)?.enabled) },
          waitsFor: waiting > 0 ? `${countOf(waiting, 'piece')} ${agrees(waiting, 'waits', 'wait')} for approval` : null,
          waiting,
        }
      },
    ),
    card(
      {
        key: 'first-letters',
        title: 'First letters to organisers',
        does: "Drafts the day's twenty first letters from verified rows and holds each for your approval of its exact words; an approved letter is queued in its play, and the sender sends it from the EventLinqs hello mailbox inside business hours, after the gateway's rules and its consent basis.",
        schedules: [SCHEDULES.outreachRun],
        link: { href: '/admin/today', label: 'Open today' },
        approvalNoun: 'letter',
      },
      now,
      async () => {
        const sw = await sender()
        const held = await counted('outreach_touches', db.from('outreach_touches').select('id', { count: 'exact', head: true }).eq('step', 1).eq('state', 'held'))
        const sentToday = await counted('outreach_touches', db.from('outreach_touches').select('id', { count: 'exact', head: true }).eq('step', 1).gte('sent_at', today))
        const sentWeek = await counted('outreach_touches', db.from('outreach_touches').select('id', { count: 'exact', head: true }).eq('step', 1).gte('sent_at', week))
        const plays = await counted('outreach_plays', db.from('outreach_plays').select('id', { count: 'exact', head: true }).not('approved_at', 'is', null))
        const unsubscribes = await counted('outreach_unsubscribes', db.from('outreach_unsubscribes').select('id', { count: 'exact', head: true }))
        const queued = await counted('outreach_touches', db.from('outreach_touches').select('id', { count: 'exact', head: true }).eq('step', 1).eq('state', 'queued'))
        // What waits for a person's yes, by the one definition Today's queue lists (src/lib/admin/letters-waiting.ts): a
        // letter a rule holds is an exception to fix, never an approval.
        const waiting = await counted('outreach_touches', db.from('outreach_touches').select('id', { count: 'exact', head: true }).eq('step', LETTER_WAITS.step).eq('state', LETTER_WAITS.state).eq('held_because', LETTER_WAITS.heldBecause).is('sent_at', null))
        // A held letter never queues by itself (src/lib/outreach/drafts.ts stores every draft held; only a person's approval
        // queues it inside a play), so it waits on a person in every sender mode, live included.
        const senderWaits = sw.mode !== 'live' ? `The sender is on ${sw.mode}${sw.setByAPerson ? '' : ', never set by a person'}` : null
        const lettersWait = waiting > 0 ? `${countOf(waiting, 'letter')} ${agrees(waiting, 'waits', 'wait')} for your approval before ${agrees(waiting, 'it', 'they')} can queue` : null
        return {
          lastRun: sw.dnsCheckedAt ? { at: sw.dnsCheckedAt, what: 'checked SPF, DKIM and DMARC (every 6 hours)' } : null,
          queue: [{ label: 'Letters held', value: held }, { label: 'Letters queued', value: queued }, { label: 'Plays approved', value: plays }],
          results: [{ label: 'Sent today', value: sentToday }, { label: 'Sent this week', value: sentWeek }, { label: 'Unsubscribed', value: unsubscribes }],
          switch: sw,
          waitsFor: [senderWaits, lettersWait].filter((w): w is string => w !== null).join('; ') || null,
          waiting,
        }
      },
    ),
    card(
      {
        key: 'follow-ups',
        title: 'Follow ups',
        does: 'On day 4 and day 10 after a first letter is sent, drafts the follow up in its thread, held for your approval; any reply, unsubscribe or bounce stops it.',
        schedules: [SCHEDULES.outreachRun],
        link: { href: '/admin/today', label: 'Open today' },
        approvalNoun: 'follow up',
      },
      now,
      async () => {
        const sw = await sender()
        const held = await counted('outreach_touches', db.from('outreach_touches').select('id', { count: 'exact', head: true }).gte('step', 2).eq('state', 'held'))
        const sentWeek = await counted('outreach_touches', db.from('outreach_touches').select('id', { count: 'exact', head: true }).gte('step', 2).gte('sent_at', week))
        return {
          lastRun: null,
          queue: [{ label: 'Follow ups held', value: held }],
          results: [{ label: 'Sent this week', value: sentWeek }],
          switch: sw,
          // Held like a first letter: it waits for a person's approval in every sender mode.
          waitsFor: held > 0 ? `${countOf(held, 'follow up')} ${agrees(held, 'waits', 'wait')} for your approval before ${agrees(held, 'it', 'they')} can queue` : null,
          waiting: held,
        }
      },
    ),
    card(
      {
        key: 'replies',
        title: 'Replies from organisers',
        does: 'Reads the inbox, acts on a clear stop, unsubscribe, yes or stored question by its approved answer, and leaves anything unclear for a person.',
        schedules: [SCHEDULES.outreachRun],
        link: { href: '/admin/today', label: 'Open today' },
      },
      now,
      async () => {
        const sw = await sender()
        const week7 = await counted('outreach_replies', db.from('outreach_replies').select('id', { count: 'exact', head: true }).gte('received_at', week))
        const unclear = await counted('outreach_replies', db.from('outreach_replies').select('id', { count: 'exact', head: true }).eq('outcome', 'unclear').gte('received_at', month))
        return {
          lastRun: null,
          queue: [{ label: 'Unclear, waiting (30 days)', value: unclear }],
          results: [{ label: 'Replies this week', value: week7 }],
          switch: sw,
          waitsFor: !sw.setByAPerson ? 'The inbox is read only once a person has set the sender' : unclear > 0 ? `${countOf(unclear, 'reply', 'replies')} ${agrees(unclear, 'waits', 'wait')} for a person` : null,
          waiting: unclear + (sw.setByAPerson ? 0 : 1),
        }
      },
    ),
    card(
      {
        key: 'photos',
        title: 'Photo permission',
        does: "Every first letter carries the organiser's own photo link; their yes and images are recorded against their night, then placed after the checks.",
        schedules: [SCHEDULES.outreachRun],
        link: { href: '/admin/social', label: 'Open social' },
      },
      now,
      async () => {
        const yeses = await counted('organiser_permissions', db.from('organiser_permissions').select('id', { count: 'exact', head: true }).gte('granted_at', month))
        const given = await counted('social_assets', db.from('social_assets').select('id', { count: 'exact', head: true }).eq('asset_state', PHOTO_WAITS.assetState).eq('approval_status', PHOTO_WAITS.approvalStatus).eq('withdrawal_status', PHOTO_WAITS.withdrawalStatus))
        return {
          lastRun: null,
          queue: [{ label: 'Organiser photos held', value: given }],
          results: [{ label: 'Permissions given (30 days)', value: yeses }],
          switch: { kind: 'none', note: 'Each image is placed by one look (law 5)' },
          waitsFor: given > 0 ? `${countOf(given, 'organiser photo')} to look at` : null,
          waiting: given,
        }
      },
    ),
    card(
      {
        key: 'submissions',
        title: 'Listing approvals',
        does: 'A night an organiser submits is checked against its own booking page and published or held with its reason.',
        schedules: [SCHEDULES.listingOccurrences],
        link: { href: '/admin/submissions', label: 'Open submissions' },
      },
      now,
      async () => {
        const waitingRows = await counted('listing_submissions', db.from('listing_submissions').select('id', { count: 'exact', head: true }).in('status', ['waiting', 'held']))
        const accepted = await counted('listing_submissions', db.from('listing_submissions').select('id', { count: 'exact', head: true }).in('status', ['accepted', 'published']).gte('created_at', month))
        return {
          lastRun: null,
          queue: [{ label: 'Waiting or held', value: waitingRows }],
          results: [{ label: 'Accepted (30 days)', value: accepted }],
          switch: { kind: 'none', note: 'Decided in submissions' },
          waitsFor: waitingRows > 0 ? `${countOf(waitingRows, 'submission')} ${agrees(waitingRows, 'waits', 'wait')}` : null,
          waiting: waitingRows,
        }
      },
    ),
    card(
      {
        key: 'claims',
        title: 'Claims',
        does: "A person proves a listing is theirs with a 6-digit code sent to the venue's published address or its own domain; with neither, the claim waits for a check.",
        schedules: [],
        link: null,
      },
      now,
      async () => {
        const manual = await counted('listing_claims', db.from('listing_claims').select('id', { count: 'exact', head: true }).eq('status', 'manual_open'))
        const verified = await counted('listing_claims', db.from('listing_claims').select('id', { count: 'exact', head: true }).eq('status', 'verified').gte('created_at', month))
        const { data: flag, error } = await db.from('feature_flags').select('enabled').eq('flag', 'listing_claims').maybeSingle()
        if (error) throw new Error(`feature_flags: ${error.message}`)
        return {
          lastRun: null,
          queue: [{ label: 'Waiting for a check', value: manual }],
          results: [{ label: 'Claimed (30 days)', value: verified }],
          switch: { kind: 'none', note: (flag as { enabled: boolean } | null)?.enabled ? 'Claims are on' : 'Claims are off' },
          waitsFor: manual > 0 ? `${countOf(manual, 'claim')} ${agrees(manual, 'waits', 'wait')} for a check` : null,
          waiting: manual,
        }
      },
    ),
    card(
      {
        key: 'scorecard',
        title: 'Daily email and Monday report',
        does: "Emails the platform's state every morning whether or not anything is wrong; on a Melbourne Monday it carries last week's report.",
        schedules: [SCHEDULES.stateReport, SCHEDULES.growthScorecard],
        link: { href: '/admin/growth', label: 'Open growth' },
      },
      now,
      async () => {
        const { data, error } = await db.from('growth_scorecard_daily').select('day, read_at').order('day', { ascending: false }).limit(1).maybeSingle()
        if (error) throw new Error(`growth_scorecard_daily: ${error.message}`)
        const row = data as { day: string; read_at: string } | null
        return {
          lastRun: row ? { at: row.read_at, what: `kept the scorecard for ${row.day}` } : null,
          queue: [],
          results: [],
          switch: { kind: 'none', note: 'Runs every day' },
          waitsFor: null,
          waiting: 0,
        }
      },
    ),
    card(
      {
        key: 'engine',
        title: 'Engine verifier',
        does: "Compares the fixed critical nights and a fresh sample of 20 across the cities, field by field, between each night's source, the database and the live page; a disagreeing source is paused.",
        schedules: [SCHEDULES.engineVerifier, SCHEDULES.engineVerifierMorning, SCHEDULES.collectionRun],
        link: null,
      },
      now,
      async () => ({ lastRun: null, queue: [], results: [], switch: { kind: 'none', note: 'Runs every day' }, waitsFor: null, waiting: 0 }),
    ),
  ])

  let numbers: ThreeNumbers | { failed: string }
  try {
    numbers = await readThreeNumbers(db, now)
  } catch (err) {
    numbers = { failed: err instanceof Error ? err.message : String(err) }
  }
  return { numbers, cards }
}
