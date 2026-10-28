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

export const SOURCE_KEYS = ['plays', 'paused_sends', 'unclear_replies', 'exceptions'] as const
export type SectionKey = (typeof SOURCE_KEYS)[number]

export const SECTION_TITLES: Readonly<Record<SectionKey, string>> = {
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
    return { key, title: SECTION_TITLES[key], items, unread }
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
