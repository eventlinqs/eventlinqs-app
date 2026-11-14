/**
 * /admin/today, LAWAL'S ONE QUEUE (the EventLinqs engine plan of 28 October 2026, part H; the project manager's 20:17
 * of that day, on Lawal's 20:16 "fully automated, hands off": "/admin/today shows only plays to approve, paused sends
 * with the reason, unclear replies and exceptions").
 *
 * Everything that runs on its own stays off this page. What is here is only what waits for a person: each item says
 * what it is, why it is here, since when, and where it is acted on. A queue with nothing in it says so, with the moment
 * it was read, because "nothing needs you" is the page doing its job.
 *
 * WHERE EACH ITEM COMES FROM is its owner's own table, read by src/lib/admin/today.ts. A source whose table is not on
 * this database yet (its car has not landed) is said by name and owner, never shown as an empty queue: an empty list
 * that was never read would tell Lawal nothing needs him when nobody looked. A source that failed to read says so too.
 *
 * Pure.
 */

// 'submissions' leads (the PM's 15:00 of 8 November 2026): an organiser's event not live an hour after it was sent in is
// the first thing Lawal sees.
export const SOURCE_KEYS = ['submissions', 'pieces', 'plays', 'paused_sends', 'unclear_replies', 'exceptions'] as const
export type SectionKey = (typeof SOURCE_KEYS)[number]

export const SECTION_TITLES: Readonly<Record<SectionKey, string>> = {
  submissions: 'Organiser events not live after an hour',
  pieces: 'Posts to approve',
  plays: 'Plays to approve',
  paused_sends: 'Sends paused',
  unclear_replies: 'Replies to read',
  exceptions: 'Exceptions',
}

export interface QueueItem {
  readonly id: string
  /** What it is, in a few words. */
  readonly what: string
  /** Why it waits for a person. */
  readonly why: string
  readonly since: string
  /** Where it is acted on; null when no page acts on it yet, said beside it. */
  readonly href: string | null
  /**
   * A social piece Lawal approves here in one press (order 4, Release 1 item 3), through the same checked approval as
   * /admin/social: its id. Absent on everything that is a judgement on its own page, never a yes to a ready draft.
   */
  readonly approvePiece?: string
}

type Named = { name: string } | { name: string }[] | null
type Night = { title: string; slug: string } | { title: string; slug: string }[] | null

/**
 * One open removal request as a queue item. A venue or series request names its target; a night reported from its own
 * page (the release checklist's I5, 20261029150201) names the night and links to it, and its sender may have given no
 * name, only maybe an email.
 */
export function removalItem(r: {
  id: string
  requester_name: string | null
  requester_email: string | null
  reason: string
  created_at: string
  venues: Named
  event_series: Named
  events: Night
}): QueueItem {
  const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x)
  const venue = one(r.venues)
  const series = one(r.event_series)
  const night = one(r.events)
  const who = r.requester_name ?? (r.requester_email ? `Someone (${r.requester_email})` : 'Someone')
  return {
    id: `removal:${r.id}`,
    what: `${who} asks for ${venue?.name ?? series?.name ?? night?.title ?? 'a listing'} to be taken down`,
    why: `Their reason: ${r.reason.length > 160 ? `${r.reason.slice(0, 157)}...` : r.reason}. No admin page acts on a removal yet.`,
    since: r.created_at,
    href: night?.slug ? `/events/${night.slug}` : null,
  }
}

export type SourceRead =
  | { readonly state: 'read'; readonly items: readonly QueueItem[] }
  | { readonly state: 'not_landed'; readonly owner: string }
  | { readonly state: 'failed'; readonly reason: string }

export interface Source {
  readonly key: string
  readonly section: SectionKey
  /** The source in Lawal's words, said when it could not be read. */
  readonly name: string
  readonly read: SourceRead
}

export interface Section {
  readonly key: SectionKey
  readonly title: string
  readonly items: readonly QueueItem[]
  /** Sources of this section that were not read, each in words. */
  readonly unread: readonly string[]
  /**
   * Those of them that failed to read now, each in the same words: a source not on this database yet is said above but
   * is not a failure, so only these become failed tasks (src/lib/crm/tasks-math.ts).
   */
  readonly failed: readonly string[]
}

export interface Queue {
  readonly sections: readonly Section[]
  readonly waiting: number
  /** True only when every source was read and none has an item. */
  readonly allClear: boolean
}

/** The queue from its sources: oldest first in each section, every unread source said. */
export function queueOf(sources: readonly Source[]): Queue {
  const sections = SOURCE_KEYS.map((key): Section => {
    const mine = sources.filter((s) => s.section === key)
    const items = mine
      .flatMap((s) => (s.read.state === 'read' ? s.read.items : []))
      .slice()
      .sort((a, b) => Date.parse(a.since) - Date.parse(b.since) || a.id.localeCompare(b.id))
    const unread = mine.flatMap((s) =>
      s.read.state === 'not_landed'
        ? [`${s.name}: not on this database yet (${s.read.owner}).`]
        : s.read.state === 'failed'
          ? [`${s.name}: could not be read just now (${s.read.reason}).`]
          : [],
    )
    const failed = mine.flatMap((s) => (s.read.state === 'failed' ? [`${s.name}: could not be read just now (${s.read.reason}).`] : []))
    return { key, title: SECTION_TITLES[key], items, unread, failed }
  })
  const waiting = sections.reduce((n, s) => n + s.items.length, 0)
  const allClear = waiting === 0 && sections.every((s) => s.unread.length === 0)
  return { sections, waiting, allClear }
}

const HOUR_MS = 60 * 60 * 1000

/** How long past its hour a night's report may be before it is an exception: the sweep runs hourly, so two runs. */
export const REPORT_GRACE_HOURS = 2

/**
 * The nights whose report should have been kept by now and was not: the sweep failed on them, or did not run. `due` is
 * the nights the report rule owes (nightsDue), `afterHours` its wait.
 */
export function reportsOverdue(due: readonly { id: string; endDate: string; title: string }[], afterHours: number, now: Date): QueueItem[] {
  return due
    .filter((n) => now.getTime() - Date.parse(n.endDate) >= (afterHours + REPORT_GRACE_HOURS) * HOUR_MS)
    .map((n) => ({
      id: `report:${n.id}`,
      what: `The after-the-night report for ${n.title}`,
      why: 'The hourly sweep has not kept it, so message 8 cannot go. Check the organiser-reports cron log.',
      since: new Date(Date.parse(n.endDate) + afterHours * HOUR_MS).toISOString(),
      href: null,
    }))
}

/** Window 4's rule for a collection source in trouble (/admin/collected): its newest runs failed this many times in a row. */
export const SOURCE_FAILING_AFTER = 3

/** The newest unbroken run of failures, the runs given newest first. */
export function failuresInARow(runs: readonly { succeeded: boolean }[]): number {
  let n = 0
  for (const r of runs) {
    if (r.succeeded) break
    n += 1
  }
  return n
}

/** One night a rule published, as the Command Centre's glance names it. */
export type RulePublished = { title: string; venue_name: string | null; starts_at: string; reviewed_at: string | null }

const GLANCE_DAY = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', day: 'numeric', month: 'short' })

/** 'Sat 21 Nov' in Melbourne, from the parts, so no locale punctuation creeps in. */
function glanceDay(iso: string): string {
  const part = (t: string) => GLANCE_DAY.formatToParts(new Date(iso)).find((p) => p.type === t)?.value ?? ''
  return `${part('weekday')} ${part('day')} ${part('month')}`
}

/** How many of a day's rule published nights the Command Centre shows for a glance (the PM's 11:06 of 13 November 2026). */
export const RULE_GLANCE = 10

/**
 * CAPTURE PUBLISHES BY ITSELF, SEEN (src/lib/listings/capture-rule.ts; the project manager's 11:06 item 1 of 13 November
 * 2026: 'ten auto-published nights a day are sampled into the Command Centre for a glance'). One item: how many nights a
 * rule published since yesterday, the checks each passed, and ten of them by name, venue and day. None, no item. Pure.
 */
export function rulePublishedGlance(rows: readonly RulePublished[], total: number, checks: readonly string[]): QueueItem[] {
  if (total === 0 || rows.length === 0) return []
  const named = rows.slice(0, RULE_GLANCE).map((r) => `${r.title}${r.venue_name ? ` at ${r.venue_name}` : ''}, ${glanceDay(r.starts_at)}`)
  const since = rows.reduce((min, r) => (r.reviewed_at && r.reviewed_at < min ? r.reviewed_at : min), rows[0].reviewed_at ?? rows[0].starts_at)
  return [
    {
      id: 'collected:rule-published',
      what: `${total} ${total === 1 ? 'night' : 'nights'} published by the rule since yesterday`,
      why: `Each passed every check (${checks.join('; ')}). ${named.length === total ? 'All' : `${named.length}`} for a glance: ${named.join('. ')}.`,
      since,
      href: '/admin/collected',
    },
  ]
}

/**
 * THE EVENT DISCOVERY ENGINE'S DAY LINE, SEEN (Lawal's 18:31 of 13 November 2026; src/lib/listings/discovery-day.ts):
 * the newest judged day, its count of seven, each part PASS or FAIL, and why each failing part failed and what the manual
 * steps were. No judged day yet, no item. Pure.
 */
export function discoveryDayGlance(
  row: { day: string; words: string; failing: readonly string[]; manual: readonly string[]; writtenAt: string } | null,
): QueueItem[] {
  if (!row) return []
  const why = [...row.failing, ...row.manual].join('; ')
  return [
    {
      id: `discovery:day-line:${row.day}`,
      what: `The Event Discovery Engine, ${row.words}`,
      why: why || 'Every part passed with no manual step.',
      since: row.writtenAt,
      href: '/admin/collected',
    },
  ]
}

/**
 * THE TWENTY'S POOL, SEEN (src/lib/outreach/basis-pool.ts): how many published events addresses the night's reading
 * recorded since yesterday, each waiting for Lawal's own check of its page when he sends (migration 20261031053501). None,
 * no item. Pure.
 */
export function poolFoundGlance(rows: readonly { address: string; organiser: string | null; recorded_at: string }[], total: number): QueueItem[] {
  if (total === 0 || rows.length === 0) return []
  const named = rows.slice(0, 5).map((r) => (r.organiser ? `${r.organiser} (${r.address})` : r.address))
  const since = rows.reduce((min, r) => (r.recorded_at < min ? r.recorded_at : min), rows[0].recorded_at)
  return [
    {
      id: 'outreach:pool-found',
      what: `${total} published ${total === 1 ? 'address' : 'addresses'} recorded for the twenty since yesterday`,
      why: `Each was found on the organiser's own page, at their own domain, in their events role. Nothing is sent to one until you open its page and tick it when you send. ${named.join('; ')}.`,
      since,
      href: '/admin/acquisition',
    },
  ]
}

/**
 * HELD TICKET SALES A PERSON LOOKS AT (the PM's 15:36 of 14 November 2026, on Lawal's 15:22 and 15:27). Since sell first
 * an organiser sells before they can be paid, and nothing stops them: "NO CAP that stops an unverified organiser
 * selling; instead an unverified organiser whose held takings pass A$2,000 shows in /admin/today's Exceptions for a
 * human look." This is that line. It stops nothing; it only asks a person to look.
 */
export const HELD_UNPAYABLE_LOOK_CENTS = 200_000

/** What an organisation holds: the sum of its ledger rows, the arithmetic the payout itself uses (money-summary.ts). */
export function heldUnpayableItems(
  orgs: readonly { id: string; name: string }[],
  rows: readonly { organisation_id: string; delta_cents: number; created_at: string }[],
): QueueItem[] {
  const held = new Map<string, { cents: number; first: string }>()
  for (const r of rows) {
    const now = held.get(r.organisation_id)
    const cents = (now?.cents ?? 0) + Number(r.delta_cents)
    const first = now && Date.parse(now.first) <= Date.parse(r.created_at) ? now.first : r.created_at
    held.set(r.organisation_id, { cents, first })
  }
  const money = (cents: number) =>
    `A$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return orgs.flatMap((o) => {
    const h = held.get(o.id)
    if (!h || h.cents <= HELD_UNPAYABLE_LOOK_CENTS) return []
    return [
      {
        id: `held-unpayable:${o.id}`,
        what: `${o.name} holds ${money(h.cents)} in ticket sales with no payout account yet`,
        why: `Held sales pass ${money(HELD_UNPAYABLE_LOOK_CENTS)} and the organisation cannot be paid until it adds and verifies a payout method. Nothing is stopped; this is for a look.`,
        since: h.first,
        href: '/admin/organisers',
      },
    ]
  })
}
