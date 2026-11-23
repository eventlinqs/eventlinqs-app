import { momentWindowOf, nextSlot, scheduleWindowOf, STARTING_CALENDAR, withStartingCalendar, type CadenceRule, type SocialFormat } from './cadence'
import { carriesBannedWord } from './words'
import { fromZonedInputValue, toZonedInputValue } from '@/lib/dates/event-time'

/**
 * THE ENGINE THINKS IN EVENT LIFECYCLES AND NEVER REPEATS (law 37 (l), Lawal, 20 November 2026, 14:06; his yes to the
 * researched plan at 14:29; the PM's 14:10, 14:20 and 14:35). Pure: the reads and writes are the store's, so every rule
 * here is driven by its own test (tests/unit/social/lifecycle.test.ts).
 *
 * THE RESEARCH IT FOLLOWS (the PM's 14:35, sources in the PM's reply to Lawal): promotion runs announce, build, a quieter
 * stretch, then a final push concentrated in the last days, because sales bunch late (Ticketmaster's 'last chance');
 * while a multi day event runs, stories go out daily and feed posts are fewer and different (Adam Mosseri: several
 * stories a day do not hurt reach); the account's feed carries 3 to 5 posts a week (Buffer, 2.1 million posts).
 * ORIGINALITY (Instagram, 30 April 2024, creators.instagram.com/recommendations-and-originality: 'when we find two or more
 * identical pieces of content on Instagram, we will only recommend the original one'; Facebook,
 * creators.facebook.com/blog/combating-unoriginal-content: accounts that 'improperly reuse someone else's videos, photos
 * or text posts repeatedly' get 'reduced distribution on everything that they share'): an organiser's photograph goes as
 * an Instagram Collab with their account where we hold their verified handle, and no image is ever posted twice.
 */

export const LIFECYCLE_ZONE = 'Australia/Melbourne'
/*
 * NO DAILY COUNT (Lawal, 22 November 2026, 01:31, binding: "The events rule the day. The engine works according to the
 * event."). The account's caps (one feed post a day, five in seven, four stories a day) were the PM's 14:35 reading of
 * law 37 (l)'s 'only the most relevant few'; Lawal never set them and removed them. The day's volume is every moment the
 * lifecycle plan makes due for every event, however many; the scheduler spreads them across the day (cadence.ts).
 */
/** A caption's first line is never used again inside this many days. */
export const FIRST_LINE_WINDOW_DAYS = 30
/** One event's feed posts stand at least this many days apart, except its first and final days. */
export const EVENT_FEED_GAP_DAYS = 2
/** An event is 'just announced' for this many days after it is listed. */
export const ANNOUNCE_DAYS = 2
/** A build post at most once in this many days while an event is more than a week away. */
export const BUILD_EVERY_DAYS = 7
/** Blotato's and Meta's own limit on collaborators (research\COLLAB-RESEARCH.md). */
export const MAX_COLLABORATORS = 3

const DAY_MS = 86_400_000

/** The calendar day of an instant in a zone, as YYYY-MM-DD. */
export function dayIn(at: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

/** Whole days from day a to day b (YYYY-MM-DD), negative when b is earlier. */
export function daysFrom(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
}

function nextDay(d: string): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10)
}

/** One listed night as the planner sees it. */
export type LifecycleNight = {
  readonly eventId: string
  readonly seriesId: string | null
  readonly title: string
  readonly venueKey: string | null
  readonly startDate: string
  readonly endDate: string | null
  readonly timezone: string | null
  /** When EventLinqs listed it (events.created_at). */
  readonly listedAt: string
  readonly cancelled: boolean
  /** Tickets can still be had (not sold out, sales not closed): 'last chance' words only then. */
  readonly salesOpen: boolean
  /** Sold through EventLinqs itself (law 39: what sells through us leads). */
  readonly ticketedHere: boolean
  /** Law 18's tier, 1 to 4 (src/lib/events/relevance.ts). */
  readonly tier: 1 | 2 | 3 | 4
}

/** An event's run: one night, or the consecutive days of a festival, as one thing to promote. */
export type Run = {
  readonly key: string
  readonly nights: readonly LifecycleNight[]
  /** Its calendar days, in its own zone, first to last. */
  readonly days: readonly string[]
  readonly zone: string
  readonly listedAt: string
  readonly cancelled: boolean
  readonly salesOpen: boolean
  readonly ticketedHere: boolean
  readonly tier: 1 | 2 | 3 | 4
  /** The keys its nights' moments were drawn under before a season was joined (runsOf), read with its own. */
  readonly aliases?: readonly string[]
  /** An earlier run of the same season comes before it (its first day is never the season's first day). */
  readonly continuesSeason?: boolean
  /** A later run of the same season comes after it (its last day is never the season's final day). */
  readonly seasonGoesOn?: boolean
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The calendar days a night covers: one, unless it runs a full day or more (AMCF's three days in one row). */
function daysOfNight(n: LifecycleNight, zone: string): string[] {
  const first = dayIn(new Date(n.startDate), zone)
  if (!n.endDate) return [first]
  const span = Date.parse(n.endDate) - Date.parse(n.startDate)
  if (!(span >= DAY_MS)) return [first]
  const last = dayIn(new Date(n.endDate), zone)
  const out = [first]
  while (out.length < 60 && out[out.length - 1] < last) out.push(nextDay(out[out.length - 1]))
  return out
}

/** One day's opening and closing of a night (ISO instants). */
export type Session = { readonly start: string; readonly end: string }

/**
 * TODAY'S DAY OF THE RUN, NEVER THE SEASON'S FIRST DAY (the PM's 09:10 of 22 November 2026, a hotfix): a row that runs a
 * full day or more (AMCF, 11am on 20 November to 8pm on 22 November, one row) is open each day from its start's clock
 * to its end's clock in its own zone, the first day opening at its start and the last closing at its end; a closing
 * clock at or before the opening clock closes the next day (a night from 11pm to 3am). A night of under a day is its
 * one session. Before this the publish gate and the planner judged AMCF by 20 November, so its final day feed was held
 * at the 08:40 run, quoted: 'it has started (2026-11-20T00:00:00+00:00)'. Pure.
 */
export function sessionsOf(night: { readonly startDate: string; readonly endDate: string | null }, zone: string): Session[] {
  const start = Date.parse(night.startDate)
  const end = night.endDate ? Date.parse(night.endDate) : start
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(end - start >= DAY_MS)) return [{ start: night.startDate, end: night.endDate ?? night.startDate }]
  const opens = toZonedInputValue(night.startDate, zone).slice(11, 16)
  const closes = toZonedInputValue(night.endDate as string, zone).slice(11, 16)
  const out: Session[] = []
  let day = dayIn(new Date(start), zone)
  for (let i = 0; i < 62; i++) {
    const open = Date.parse(fromZonedInputValue(`${day}T${opens}`, zone))
    if (!(open < end)) break
    let close = Date.parse(fromZonedInputValue(`${day}T${closes}`, zone))
    if (close <= open) close = Date.parse(fromZonedInputValue(`${nextDay(day)}T${closes}`, zone))
    out.push({ start: new Date(Math.max(open, start)).toISOString(), end: new Date(Math.min(close, end)).toISOString() })
    day = nextDay(day)
  }
  return out.length > 0 ? out : [{ start: night.startDate, end: night.endDate ?? night.startDate }]
}

/** The session a minute is judged by: the one open then or the next to open (the first not yet closed), else the last. */
export function sessionAt(night: { readonly startDate: string; readonly endDate: string | null }, zone: string, at: Date): Session {
  const all = sessionsOf(night, zone)
  return all.find((s) => Date.parse(s.end) > at.getTime()) ?? all[all.length - 1]
}

/**
 * A calendar day's own session: the first that is open at some minute of that day (a festival from 11pm to 10pm the
 * next day is open through that morning), else, for a day before the night, its first, and after it, its last. Pure.
 */
export function sessionOfDay(night: { readonly startDate: string; readonly endDate: string | null }, zone: string, day: string): Session {
  const all = sessionsOf(night, zone)
  const overlaps = (s: Session) => dayIn(new Date(s.start), zone) <= day && dayIn(new Date(Math.max(Date.parse(s.start), Date.parse(s.end) - 1)), zone) >= day
  return all.find(overlaps) ?? (day < dayIn(new Date(all[0].start), zone) ? all[0] : all[all.length - 1])
}

/** A night as the scheduler reads it on a moment's day: that day's own session (sessionOfDay), as start and end ms. */
export function nightOnDay(n: { readonly title: string; readonly startDate: string; readonly endDate: string | null; readonly zone: string }, day: string): { title: string; start: number; end: number } {
  const s = sessionOfDay({ startDate: n.startDate, endDate: n.endDate }, n.zone, day)
  return { title: n.title, start: Date.parse(s.start), end: Date.parse(s.end) }
}

/**
 * A lifecycle piece's window on its moment's day (the scheduler's, store.ts scheduleApprovedPieces): the moment's day
 * (momentWindowOf) over its nights' own sessions that day (nightOnDay), never a season's first day; words that say on
 * now never go before that day's doors open (the PM's 09:00 and 09:10 of 22 November 2026). Pure.
 */
export function lifecycleWindow(format: SocialFormat, day: string, onNow: boolean, own: readonly { readonly title: string; readonly start: number; readonly end: number }[]): { notBefore: Date; deadline: Date } {
  const { notBefore, deadline } = momentWindowOf(day, scheduleWindowOf(format, own, undefined, { onNow }))
  const doors = onNow && own.length > 0 ? Math.min(...own.map((n) => n.start)) : 0
  return { notBefore: new Date(Math.max(notBefore.getTime(), doors)), deadline }
}

/**
 * Nights grouped into runs: those sharing a series OR a title and venue, whose days follow on with no gap of more than
 * a day (a festival listed one row a day). A cancelled night stays in its run and marks it cancelled only when every
 * night of the run is.
 *
 * A SEASON IS ONE RUN (22 November 2026): the listings engine gives every dated night its own one-off series, so
 * Colours of Asia's 20, 21 and 22 November were three one-day runs and its last night posted 'Opening today.'. Nights
 * are now joined by a shared series or by the same title at the same venue; a run of one series keeps its series key
 * (its moments drawn before keep their key), any other takes its title key, and every key its nights were drawn under
 * before is kept as an alias, so a moment already had is never drawn twice.
 */
export function runsOf(nights: readonly LifecycleNight[]): Run[] {
  const titleKey = (n: LifecycleNight) => `t:${norm(n.title)}|${n.venueKey ?? ''}`
  const oldKey = (n: LifecycleNight) => (n.seriesId ? `s:${n.seriesId}` : titleKey(n))
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let r = k
    while (parent.get(r) !== r) r = parent.get(r) as string
    return r
  }
  const join = (a: string, b: string) => {
    for (const k of [a, b]) if (!parent.has(k)) parent.set(k, k)
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }
  for (const n of nights) join(titleKey(n), oldKey(n))
  const members = new Map<string, LifecycleNight[]>()
  for (const n of nights) {
    const root = find(titleKey(n))
    members.set(root, [...(members.get(root) ?? []), n])
  }
  const groups = new Map<string, LifecycleNight[]>()
  for (const list of members.values()) {
    const series = new Set(list.map((n) => n.seriesId ?? ''))
    const first = [...list].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.eventId.localeCompare(b.eventId))[0]
    const key = series.size === 1 && first.seriesId ? `s:${first.seriesId}` : titleKey(first)
    groups.set(key, [...(groups.get(key) ?? []), ...list])
  }
  const runs: Run[] = []
  for (const [key, list] of groups) {
    const before = runs.length
    const sorted = [...list].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.eventId.localeCompare(b.eventId))
    let current: { nights: LifecycleNight[]; days: string[]; zone: string } | null = null
    const close = () => {
      if (!current) return
      const ns = current.nights
      const own = `${key}|${current.days[0]}`
      const zoneOf = current.zone
      // Each older key's run began on its earliest night here, so that is the key its moments carry.
      const firstByOld = new Map<string, string>()
      for (const n of ns) {
        const k = oldKey(n)
        const d = daysOfNight(n, n.timezone?.trim() || zoneOf)[0]
        const seen = firstByOld.get(k)
        if (seen === undefined || d < seen) firstByOld.set(k, d)
      }
      const aliases = [...firstByOld].map(([k, d]) => `${k}|${d}`).filter((a) => a !== own).sort()
      runs.push({
        key: own,
        ...(aliases.length > 0 ? { aliases } : {}),
        nights: ns,
        days: current.days,
        zone: current.zone,
        listedAt: ns.map((n) => n.listedAt).sort()[0],
        cancelled: ns.every((n) => n.cancelled),
        salesOpen: ns.some((n) => n.salesOpen && !n.cancelled),
        ticketedHere: ns.some((n) => n.ticketedHere),
        tier: Math.min(...ns.map((n) => n.tier)) as 1 | 2 | 3 | 4,
      })
      current = null
    }
    for (const n of sorted) {
      const zone = n.timezone?.trim() || LIFECYCLE_ZONE
      const days = daysOfNight(n, zone)
      if (current && daysFrom(current.days[current.days.length - 1], days[0]) <= 1) {
        current.nights.push(n)
        for (const d of days) if (!current.days.includes(d)) current.days.push(d)
        current.days.sort()
      } else {
        close()
        current = { nights: [n], days: [...days], zone }
      }
    }
    close()
    // THE SEASON'S RUNS (the PM's 03:39 of 22 November 2026): Colours of Asia's 13 to 15 and 20 to 22 November are one
    // season in two runs; its 20th is not an opening and its 15th not its final day.
    const mine = runs.splice(before)
    mine.forEach((r, i) => runs.push({ ...r, ...(i > 0 ? { continuesSeason: true } : {}), ...(i < mine.length - 1 ? { seasonGoesOn: true } : {}) }))
  }
  return runs.sort((a, b) => a.days[0].localeCompare(b.days[0]) || a.key.localeCompare(b.key))
}

export type Stage = 'announced' | 'upcoming' | 'this_week' | 'tomorrow' | 'first_day' | 'running' | 'final_day' | 'ended' | 'cancelled'

/** Where a run stands today, on its own calendar. */
export function stageOf(run: Run, now: Date): Stage {
  if (run.cancelled) return 'cancelled'
  const today = dayIn(now, run.zone)
  const first = run.days[0]
  const last = run.days[run.days.length - 1]
  if (today > last) return 'ended'
  if (run.days.includes(today)) {
    // The season's own first day and final day only (runsOf continuesSeason, seasonGoesOn). A one-night run in a season
    // of several runs is a repeat (a weekly trivia night: 5C's 03:50, 75 such groups on production), never an opening
    // and never a last day; its day reads neutral (repeatDayOf).
    if (isRepeat(run)) return 'running'
    if (today === first && !run.continuesSeason) return 'first_day'
    if (today === last && !run.seasonGoesOn) return 'final_day'
    return 'running'
  }
  const ahead = daysFrom(today, first)
  if (ahead === 1) return 'tomorrow'
  if (ahead <= 7) return 'this_week'
  return daysFrom(dayIn(new Date(run.listedAt), run.zone), today) < ANNOUNCE_DAYS ? 'announced' : 'upcoming'
}

/** A one-night run inside a season of several runs: a repeat, never an opening nor a last day. */
export function isRepeat(run: Run): boolean {
  return run.days.length === 1 && Boolean(run.continuesSeason || run.seasonGoesOn)
}

/**
 * A running day that is its run's own first day (a season's later run beginning today, or a repeat's one night): its
 * words are neutral, never 'Opening' and never 'Still on' (5C's 03:50 of 22 November 2026). Pure.
 */
export function repeatDayOf(run: Run, kind: MomentKind, day: string): boolean {
  return kind === 'running' && run.days[0] === day
}

export type MomentKind = 'announce' | 'build' | 'final_push' | 'tomorrow' | 'first_day' | 'running' | 'final_day'

export type Moment = { readonly kind: MomentKind; readonly format: SocialFormat }

/** What a run has already had, read from the publication history before anything is planned (law 37 (l)). */
export type RunHistory = {
  /** The calendar days (run zone) on which a feed piece of this run was posted or is scheduled. */
  readonly feedDays: readonly string[]
  /** The calendar days on which a story of this run was posted or is scheduled. */
  readonly storyDays: readonly string[]
  /** The moments this run has already had, by kind and format. */
  readonly had: readonly string[]
}

export const momentKey = (m: Moment): string => `${m.kind}|${m.format}`

/** The order moments are given the day's few places in: the last day first, the quiet build last. */
export const MOMENT_WEIGHT: Record<MomentKind, number> = {
  final_day: 7,
  first_day: 6,
  tomorrow: 5,
  running: 4,
  final_push: 3,
  announce: 2,
  build: 1,
}

/** The moments a run is due today. Never every event every day: the day's selection then takes only the few best. */
export function momentsDue(run: Run, now: Date, h: RunHistory): Moment[] {
  const stage = stageOf(run, now)
  if (stage === 'ended' || stage === 'cancelled') return []
  const today = dayIn(now, run.zone)
  const feedToday = h.feedDays.includes(today)
  const storyToday = h.storyDays.includes(today)
  const lastFeed = [...h.feedDays].sort().pop() ?? null
  const feedGapOk = lastFeed === null || daysFrom(lastFeed, today) >= EVENT_FEED_GAP_DAYS
  const had = (m: Moment) => h.had.includes(momentKey(m))
  const out: Moment[] = []
  const feed = (kind: MomentKind, gap: boolean) => {
    const m: Moment = { kind, format: 'feed' }
    if (!feedToday && (!gap || feedGapOk)) out.push(m)
  }
  const story = (kind: MomentKind) => {
    if (!storyToday) out.push({ kind, format: 'story' })
  }
  switch (stage) {
    case 'first_day':
      feed('first_day', false)
      story('first_day')
      break
    case 'running':
      if (!had({ kind: 'running', format: 'feed' })) feed('running', true)
      story('running')
      break
    case 'final_day':
      feed('final_day', false)
      story('final_day')
      break
    case 'tomorrow':
      // THE LAST CHANCE FEED (the PM's 13:32 of 23 November 2026, item 1: A Moment of Sanity reached its tomorrow stage
      // with no final push ever posted, so the engine had only a story to offer, and a story carries no link). A night
      // that never had its final push gets it the day before, beside its tomorrow story; one that had it gets the story.
      if (!had({ kind: 'final_push', format: 'feed' })) feed('final_push', true)
      story('tomorrow')
      break
    case 'this_week': {
      const ahead = daysFrom(today, run.days[0])
      if (ahead <= 3 && !had({ kind: 'final_push', format: 'feed' })) feed('final_push', true)
      break
    }
    case 'announced':
      if (!had({ kind: 'announce', format: 'feed' })) feed('announce', true)
      break
    case 'upcoming':
      if (lastFeed === null || daysFrom(lastFeed, today) >= BUILD_EVERY_DAYS) feed('build', true)
      break
  }
  return out
}

/** A run's moment that has a photograph to carry it (law 37 (h): no permitted photograph, no post). */
export type Candidate = { readonly run: Run; readonly moment: Moment; readonly hasPhoto: boolean }

/**
 * The day's pieces: every due moment of every event with a photograph to carry it, ranked by the moment, then what sells
 * through EventLinqs (law 39), then law 18's tier, then the soonest (the order the scheduler gives the day's slots in).
 * Law 18's tier 4 (library sessions, story time, classes) never takes a feed place. One piece per moment and format.
 */
export function selectToday(candidates: readonly Candidate[]): Candidate[] {
  return chooseToday(candidates, (c) => (c.hasPhoto ? null : 'no permitted photograph')).chosen
}

/**
 * THE DAY'S CHOICE THAT HEALS (the PM's 16:30 of 21 November 2026, item 1; Lawal, 16:26: "Why is there no intelligence on
 * the system?"). On 21 November the only eligible night offered a tomorrow story whose window was empty, and one wrong
 * window stopped the day. Now each ranked moment is asked whether it can be drawn (the planner's own checks, passed in
 * as `drawable`: a photograph for its format, a band on its day, the publish gate's rule at that band); one that cannot
 * is passed over, and the same moment for that night in the other format is tried, where the night does not offer it
 * already. There is no daily count (Lawal, 22 November 2026, 01:31): every drawable moment is drawn. Each run takes one
 * piece of a format. Pure.
 */
export function chooseToday(
  candidates: readonly Candidate[],
  drawable: (c: Candidate) => string | null,
): { readonly chosen: Candidate[]; readonly passedOver: { readonly candidate: Candidate; readonly why: string }[] } {
  const ranked = candidates
    .filter((c) => !(c.moment.format === 'feed' && c.run.tier === 4))
    .sort(
      (a, b) =>
        MOMENT_WEIGHT[b.moment.kind] - MOMENT_WEIGHT[a.moment.kind] ||
        Number(b.run.ticketedHere) - Number(a.run.ticketedHere) ||
        a.run.tier - b.run.tier ||
        a.run.days[0].localeCompare(b.run.days[0]) ||
        a.run.key.localeCompare(b.run.key),
    )
  const taken = new Set<string>()
  const out: Candidate[] = []
  const passedOver: { candidate: Candidate; why: string }[] = []
  const offered = new Set(candidates.map((c) => `${c.run.key}|${c.moment.format}`))
  const take = (c: Candidate) => {
    taken.add(`${c.run.key}|${c.moment.format}`)
    out.push(c)
  }
  for (const c of ranked) {
    if (taken.has(`${c.run.key}|${c.moment.format}`)) continue
    const why = drawable(c)
    if (why === null) {
      take(c)
      continue
    }
    passedOver.push({ candidate: c, why })
    // The same moment for that night in the other format, where the run has not offered that format already, a tier 4
    // night is never a feed post, and it can be drawn.
    const other: SocialFormat = c.moment.format === 'feed' ? 'story' : 'feed'
    const alt: Candidate = { ...c, moment: { kind: c.moment.kind, format: other } }
    const key = `${c.run.key}|${other}`
    if (offered.has(key) || taken.has(key) || (other === 'feed' && c.run.tier === 4)) continue
    const altWhy = drawable(alt)
    if (altWhy === null) take(alt)
    else passedOver.push({ candidate: alt, why: altWhy })
  }
  return { chosen: out, passedOver }
}

/**
 * WHETHER A MOMENT'S WORDS SAY THE NIGHT IS ON NOW (piece-quality.ts ON_NOW), by its kind: a first, running or final day
 * does when that day's own session is open by its band ('still on' only once the doors are open: the PM's 09:00 of
 * 22 November 2026), and a moment ahead of its night never does. Held against every first line by
 * tests/unit/social/every-moment-has-a-window.test.ts and season-day.test.ts. Pure.
 */
export function momentSaysOnNow(kind: MomentKind, startedByBand: boolean): boolean {
  if (kind === 'first_day' || kind === 'running' || kind === 'final_day') return startedByBand
  return false
}

const STARTING_RULE = (format: SocialFormat): CadenceRule =>
  withStartingCalendar({ version: 0, gapHours: 0, slots: [], basis: 'starting', learnedFrom: 0, floorPosts: 0, settleHours: 0, setAt: new Date(0) }, format)

/**
 * WHETHER A MOMENT CAN POST ON ITS DAY, AND AT WHICH BAND (the PM's 16:30 of 21 November 2026, items 1 and 3): the band
 * the starting calendar gives it inside its window (momentWindowOf over scheduleWindowOf, the scheduler's own rule), no
 * earlier than now, and the publish gate's rule at that band (piece-quality.ts, class 1: a started night posts only while
 * its words say it is on now and it has not ended). The planner draws only what this answers with a band, and the class
 * test proves every moment kind has one. Pure.
 */
export function postableBand(input: {
  readonly kind: MomentKind
  readonly format: SocialFormat
  readonly night: { readonly title: string; readonly startDate: string; readonly endDate: string | null }
  readonly day: string
  readonly zone: string
  readonly now: Date
  /** Its run's own first day, not the season's opening (repeatDayOf): its words try neutral first, then on now. */
  readonly repeatDay?: boolean
}): { readonly at: Date; readonly onNow: boolean } | { readonly why: string } {
  const start = Date.parse(input.night.startDate)
  const end = input.night.endDate ? Date.parse(input.night.endDate) : start
  if (!Number.isFinite(start)) return { why: `${input.night.title} has no start` }
  // A first, running or final day tries its words as true before that day's doors open first ('Last day today.'),
  // then, when that day's session is open by the band it can take, as on now; every other moment's words are fixed by
  // its kind (momentSaysOnNow). Each is judged by its own day's session (sessionsOf), never the season's first day.
  const ownDay = input.kind === 'first_day' || input.kind === 'running' || input.kind === 'final_day'
  const tries = ownDay || input.repeatDay ? [false, true] : [momentSaysOnNow(input.kind, false)]
  const night = { startDate: input.night.startDate, endDate: input.night.endDate }
  const today = sessionOfDay(night, input.zone, input.day)
  const windowStart = ownDay ? Date.parse(today.start) : start
  const windowEnd = ownDay ? Date.parse(today.end) : end
  let why = `no ${input.format} band on ${input.day}`
  for (const onNow of tries) {
    const w = momentWindowOf(input.day, scheduleWindowOf(input.format, [{ title: input.night.title, start: windowStart, end: windowEnd }], input.zone, { onNow }), input.zone)
    let from = new Date(Math.max(input.now.getTime(), w.notBefore.getTime()))
    // Words that say on now wait for the doors: never a band before the session open at that minute opens.
    if (onNow) from = new Date(Math.max(from.getTime(), Date.parse(sessionAt(night, input.zone, from).start)))
    const at = nextSlot(STARTING_RULE(input.format), from, input.zone)
    if (at.getTime() > w.deadline.getTime() || dayIn(at, input.zone) !== input.day) {
      why = `no ${input.format} band on ${input.day} inside its window (it closes ${w.deadline.toISOString()})`
      continue
    }
    const session = sessionAt(night, input.zone, at)
    const started = Date.parse(session.start) <= at.getTime()
    const ended = Date.parse(session.end) <= at.getTime()
    if (started && !(onNow && !ended)) {
      why = `${input.night.title} would have ${ended ? 'ended' : 'started'} by its ${input.format} band`
      continue
    }
    if (!started && onNow) {
      why = `${input.night.title} would not be open yet by its ${input.format} band`
      continue
    }
    return { at, onNow }
  }
  return { why }
}

/** A photograph the register permits for social use now (social_usable_images_all). */
export type PhotoAsset = {
  readonly assetId: string
  readonly url: string
  readonly type: string
  /** Set by a person who looked (1 leads); null means no one has looked, and law 37 (k) does not post it. */
  readonly leadRank: number | null
  readonly width: number | null
  readonly height: number | null
  /** What the person who looked recorded it shows (social_assets.shows); empty when not yet recorded. */
  readonly shows?: readonly string[]
}

/** What makes a photograph show the event itself: its crowd, its stage, its own name, its setting. */
const SHOWS_THE_EVENT = new Set(['crowd', 'stage', 'name', 'setting'])

/**
 * HOW STRONGLY A PHOTOGRAPH SHOWS ITS EVENT (the PM's 11:05 of 22 November 2026; Lawal, 10:52: 'I don't like your photo
 * selection ... use those better ones'): one for each of its crowd, its stage, its own name and its setting, two less
 * for a close crop or a detail. AMCF's Fed Square crowd under the skyline and its main stage with AMCF's name on the
 * screen lead; three dancers in a close crop with a camera rig behind them does not. Zero when nothing is recorded,
 * so a set no one has described ranks by lead rank as before. Pure.
 */
export function showsTheEvent(shows: readonly string[] | undefined): number {
  const s = new Set(shows ?? [])
  return [...s].filter((w) => SHOWS_THE_EVENT.has(w)).length - (s.has('close') || s.has('detail') ? 2 : 0)
}

/** Instagram's feed range, as Meta states it ('Aspect ratio: Must be within a 4:5 to 1.91:1 range',
 * https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media). */
const FEED_RATIO_MIN = 4 / 5
const FEED_RATIO_MAX = 1.91

/**
 * The photographs a piece may carry, best first, within the policy only (the PM's 14:20 item 1): a photograph (never a
 * flyer, law 37 (b)), looked at and ranked by a person (law 37 (k)), never posted before on either network (law 37 (l)),
 * its size known. First how strongly it shows the event (showsTheEvent), then lead rank, then whole fit to the format,
 * then width; the used set keeps each post of a run on a different photograph.
 */
export function rankPhotos(assets: readonly PhotoAsset[], format: SocialFormat, used: ReadonlySet<string>): PhotoAsset[] {
  const fits = (a: PhotoAsset): number => {
    const r = (a.width ?? 0) / (a.height ?? 1)
    if (format === 'feed') return r >= FEED_RATIO_MIN && r <= FEED_RATIO_MAX ? 1 : 0
    return (a.height ?? 0) >= (a.width ?? 0) ? 1 : 0
  }
  return assets
    .filter((a) => a.type === 'photo' && a.leadRank !== null && !used.has(a.url) && (a.width ?? 0) > 0 && (a.height ?? 0) > 0)
    .sort((a, b) => showsTheEvent(b.shows) - showsTheEvent(a.shows) || (a.leadRank ?? 99) - (b.leadRank ?? 99) || fits(b) - fits(a) || (b.width ?? 0) - (a.width ?? 0) || a.assetId.localeCompare(b.assetId))
}

/** An Instagram username as Instagram allows it: letters, numbers, full stops and underscores, at most 30. */
export function cleanHandle(handle: string | null | undefined): string | null {
  const h = (handle ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '')
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h.toLowerCase() : null
}

/** An organiser as the CRM holds them for a Collab (the PM's 14:46 item 3). Photo permission is never collab permission. */
export type CollabOrganiser = {
  readonly handle: string | null
  /** When the handle was verified as theirs (from their own site or listing, read back on Instagram); null: unverified. */
  readonly verifiedAt: string | null
  readonly preference: 'open' | 'declined' | 'do_not_invite'
  /** Every invitation sent them, as Instagram shows it now ('ignored' once it stood pending past its window). */
  readonly invites: readonly { readonly status: 'pending' | 'accepted' | 'declined' | 'ignored' }[]
}

/** Two ignored invitations and the organiser is not invited again (the PM's 14:46 item 3). */
export const IGNORED_INVITES_STOP = 2

/** Whether an organiser may be invited at all: verified, open, never declined, not ignored twice, none pending. */
export function mayInvite(o: CollabOrganiser): boolean {
  if (!o.verifiedAt || cleanHandle(o.handle) === null || o.preference !== 'open') return false
  if (o.invites.some((i) => i.status === 'declined' || i.status === 'pending')) return false
  return o.invites.filter((i) => i.status === 'ignored').length < IGNORED_INVITES_STOP
}

/**
 * The collaborators a piece invites (the PM's 14:45 item 1 and 14:46 items 1 to 3): COLLAB IS SMART, NOT ON EVERY POST.
 * Only a piece about ONE organiser's event invites that organiser, and only where the engine judged a Collab adds value
 * (worthIt: festivals, concerts, community events, organisers with an audience first); a roundup invites no one. A single
 * photograph feed post only: never a story (Meta: 'Not supported for Stories'), never a carousel (Blotato: 'not supported
 * on carousels (multi-media posts), which will fail to publish'). Only a handle verified as theirs, an organiser open to
 * it who never declined and has not ignored two, at most MAX_COLLABORATORS.
 */
export function collaboratorsFor(input: {
  readonly format: SocialFormat
  readonly slideCount: number
  /** How many events the piece is about. */
  readonly eventCount: number
  readonly worthIt: boolean
  readonly organisers: readonly CollabOrganiser[]
}): string[] {
  if (input.format !== 'feed' || input.slideCount !== 1 || input.eventCount !== 1 || !input.worthIt) return []
  const out: string[] = []
  for (const o of input.organisers) {
    const clean = mayInvite(o) ? cleanHandle(o.handle) : null
    if (clean && !out.includes(clean)) out.push(clean)
  }
  return out.slice(0, MAX_COLLABORATORS)
}

/** The kinds of night a Collab most adds to (the PM's 14:46 item 1: festivals, concerts, community events). */
const COLLAB_FIRST = /festival|concert|music|gig|community/

/**
 * Whether a Collab adds value to a piece about this night: its kind first (the listing's own category and title), else
 * an organiser whose Instagram shows an audience (business discovery's followers_count, read through the official API).
 */
export function collabWorthIt(input: { readonly categorySlug: string | null; readonly title: string; readonly organiserFollowers: number | null }): boolean {
  if (COLLAB_FIRST.test(`${input.categorySlug ?? ''} ${input.title}`.toLowerCase())) return true
  return (input.organiserFollowers ?? 0) > 0
}

/**
 * The human first lines (law 37 (j): the feeling first, the facts short at the end), several a moment so a run's
 * moments and the account's days never say the same thing twice inside FIRST_LINE_WINDOW_DAYS. No line hurries a buyer
 * ('last chance', 'selling fast': a scarcity message must be computed from real stock, scripts/guards/no-false-urgency.mjs),
 * and none claims a crowd, a sell out, a weekday or a number nobody has proved.
 */
const FIRST_LINES: Record<MomentKind, readonly string[]> = {
  announce: ['One for the calendar.', 'Something new to look forward to.', 'Fresh on the list this week.', 'Put this one in your plans.'],
  build: ['Still a little way off, and worth planning for.', 'One to plan the month around.', 'Coming up, and worth the wait.', 'Mark the date now.'],
  final_push: ['Only days to go now.', 'Nearly here.', 'Coming up in a few days.', 'Not long now.'],
  tomorrow: ['Tomorrow.', 'See you tomorrow.', 'It is on tomorrow.'],
  first_day: ['It starts today.', 'Today is the day.', 'Opening today.'],
  // A day after the first is posted while the run is under way, so its words say it is on (piece-quality.ts ON_NOW:
  // 'still on'), which is what lets the publish gate post it after the run's first start (law 22, class 2).
  running: ['Still on today.', 'It is still on today.', 'Still on today, so there is time.'],
  final_day: ['Last day today, and still on.', 'Final day today, still on until it closes.', 'Still on today, for the last time.'],
}

/**
 * A running or final day posted before that day's doors open (the PM's 09:00 of 22 November 2026: words true at publish
 * time, 'still on' only after that day's opening): never on now (piece-quality.ts ON_NOW).
 */
const BEFORE_DOORS: Readonly<Record<'running' | 'final_day', readonly string[]>> = {
  running: ['Open again today.', 'Back again today.', 'Another day of it today.'],
  final_day: ['Last day today.', 'The final day is today.', 'Today is the last day.'],
}

/**
 * A first day whose night has already started by the format's first band that day (a night listed from midnight, or one
 * that opens before the morning post): its words say it is on now (piece-quality.ts ON_NOW), which is what lets the
 * scheduler give it the night's run and the publish gate post it after the night's start (law 22, class 1). 'It starts
 * today' at 9 am for a night under way since midnight could never post (21 November 2026, the PM's 16:05).
 */
const FIRST_DAY_ON_NOW: readonly string[] = ['Opening day, and on now.', 'Day one, and it is on now.', 'It is on now, from today.']

/** A run's own first day that is not the season's opening (repeatDayOf): neutral, never 'Opening', never 'Still on'. */
const REPEAT_DAY: readonly string[] = ['On today.', 'On again today.', 'Here again today.']
/** The same, its night already under way by its band: its words say it is on now (piece-quality.ts ON_NOW). */
const REPEAT_DAY_ON_NOW: readonly string[] = ['On now, today.', 'It is on now.', 'On again, and on now.']

/**
 * Whether a night has started by its format's first band on the moment's day (the starting calendar, cadence.ts: feed
 * 9 am, story 6 pm, Melbourne's clock until the account's own posts teach the hours). Pure.
 */
export function startedByFirstBand(startIso: string, zone: string, format: SocialFormat, day: string): boolean {
  const hour = Math.min(...STARTING_CALENDAR[format].map((h) => h % 24))
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(startIso))
  const get = (t: string) => local.find((p) => p.type === t)?.value ?? ''
  const startDay = `${get('year')}-${get('month')}-${get('day')}`
  if (startDay < day) return true
  if (startDay > day) return false
  return Number(get('hour')) * 60 + Number(get('minute')) <= hour * 60
}

/**
 * Whether a night has ended by its format's first band on the moment's day, so a piece of that format could not post that
 * day (a morning market's story: the market closes at 4 pm, stories go from 6 pm). The planner never draws it. Pure.
 */
export function endedByFirstBand(endIso: string | null, zone: string, format: SocialFormat, day: string): boolean {
  if (!endIso) return false
  const hour = Math.min(...STARTING_CALENDAR[format].map((h) => h % 24))
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(endIso))
  const get = (t: string) => local.find((p) => p.type === t)?.value ?? ''
  const endDay = `${get('year')}-${get('month')}-${get('day')}`
  if (endDay < day) return true
  if (endDay > day) return false
  return Number(get('hour')) * 60 + Number(get('minute')) <= hour * 60
}

/**
 * WHAT A READER WILL FIND THERE, IN THE LISTING'S OWN WORDS (the PM's 05:02 of 22 November 2026, item 1; Lawal, 04:50:
 * "could it be any better ... a human would do this ... professional"). The first line names the night's own experiences
 * (what you see, hear, eat) taken only from its listing's words, never invented: each phrase below is matched in the
 * summary, then the title, in the order the listing says them, at most three, a longer phrase before a shorter one it holds.
 */
export const EXPERIENCE_PHRASES: readonly string[] = [
  'street food', 'food trucks', 'food stalls', 'night market', 'artisan markets', 'live music', 'lantern gardens', 'fireworks',
  'lanterns', 'markets', 'music', 'dance', 'djs', 'comedy', 'stand-up', 'theatre', 'film', 'art', 'workshops', 'cocktails',
  'wine', 'beer', 'dumplings', 'rides', 'parade', 'choir', 'orchestra', 'jazz', 'trivia', 'games', 'circus', 'magic',
]

/** Up to three of the night's experiences, in the order its own words give them (summary first, then title). Pure. */
export function experiencesOf(summary: string | null, title: string): string[] {
  const text = ` ${(summary ?? '')} ${title} `.toLowerCase()
  const found: { phrase: string; at: number }[] = []
  for (const phrase of EXPERIENCE_PHRASES) {
    const m = new RegExp(`(?<![a-z])${phrase.replace(/[-]/g, '\\-')}(?![a-z])`).exec(text)
    if (!m) continue
    // A shorter phrase inside one already found ('music' inside 'live music') adds nothing.
    if (found.some((f) => f.phrase.includes(phrase) && Math.abs(f.at - m.index) <= f.phrase.length)) continue
    found.push({ phrase, at: m.index })
  }
  return found.sort((a, b) => a.at - b.at).slice(0, 3).map((f) => (f.phrase === 'djs' ? 'DJs' : f.phrase))
}

function listOf(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * THE NIGHT'S OWN FIRST LINE (the PM's 05:02, item 1): its experiences, its place, and the day's stage in words that keep
 * the publish gate's rule (piece-quality.ts ON_NOW: a first, running or final day under way by its band says 'on now' or
 * 'still on'; momentSaysOnNow). Null when the listing names no experience, and the moment's own bank speaks instead. Pure.
 */
export function hookFor(kind: MomentKind, experiences: readonly string[], place: string | null, opts: { readonly startedByBand?: boolean; readonly repeatDay?: boolean; readonly title?: string | null } = {}): string | null {
  // The 05:15 standard, check 5: never a stock phrase; with no experience in its words, the night's own title names it.
  const named = experiences.length > 0 ? experiences : opts.title ? [opts.title] : []
  if (named.length === 0) return null
  const what = listOf(named)
  const What = what.charAt(0).toUpperCase() + what.slice(1)
  const at = place && place.length <= 40 ? ` at ${place}` : ''
  if (opts.repeatDay) return opts.startedByBand ? `${What}${at}, on now.` : `${What}${at}, on today.`
  switch (kind) {
    case 'first_day':
      return opts.startedByBand ? `${What}${at}, on now from today.` : `${What}${at}, from today.`
    // A running or final day says 'still on' only once that day's doors are open by its band (sessionsOf; the PM's 09:00
    // of 22 November 2026), and words true before them otherwise.
    case 'running':
      return opts.startedByBand ? `${What}${at}, still on today.` : `${What}${at}, on again today.`
    case 'final_day':
      return opts.startedByBand ? `Last day today for ${what}${at}, and still on.` : `Last day today for ${what}${at}.`
    case 'tomorrow':
      return `${What}${at}, tomorrow.`
    case 'final_push':
      // No relative words in a feed post (the PM's 12:50 and 13:32 of 23 November 2026: "no relative date"): a feed post
      // stays visible after its day, and the fact block below names the day and the date.
      return `${What}${at}, coming up.`
    default:
      return `${What}${at}, coming up.`
  }
}

/** The place line: the venue, its street address and its city, each said once (an address holding the city keeps it). */
export function whereOf(place: string | null, address: string | null, city: string | null): string {
  const parts: string[] = []
  const has = (s: string) => parts.some((p) => p.toLowerCase().includes(s.toLowerCase()))
  if (place && place.trim()) parts.push(place.trim())
  if (address && address.trim() && !has(address.trim())) parts.push(address.trim())
  if (city && city.trim() && !has(city.trim())) parts.push(city.trim())
  return parts.join(', ')
}

/**
 * A feed post's day word: always the weekday (the PM's 13:32 of 23 November 2026: "no relative date"), because a feed post
 * stays on the profile after its day, where "Today" or "Tomorrow" would be false. A story expires within the day, so it
 * keeps dayWordOf's words. Pure.
 */
export function feedDayWordOf(nightDay: string): string {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${nightDay}T12:00:00Z`))
}

/** The day word of the 05:15 standard: Today, Tomorrow, or the weekday, as the night's day reads from the post's day. */
export function dayWordOf(nightDay: string, postDay: string): string {
  if (nightDay === postDay) return 'Today'
  const next = new Date(Date.parse(`${postDay}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  if (nightDay === next) return 'Tomorrow'
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${nightDay}T12:00:00Z`))
}

/**
 * THE PRACTICAL LINE (the 05:15 standard): free and nothing to book, free with a place to register, or how to buy. A free
 * night never says 'ticket' (check 4).
 */
export function practicalLine(cta: { readonly freeEntry: boolean; readonly registrationRequired: boolean; readonly ticketingByEventLinqs: boolean }): string {
  if (cta.freeEntry) return "It's free, and there's nothing to book."
  if (cta.registrationRequired) return cta.ticketingByEventLinqs ? "It's free; register your place on EventLinqs." : "It's free; register your place through the link."
  return cta.ticketingByEventLinqs ? 'Tickets are on EventLinqs.' : 'Tickets are on sale through the link.'
}

/**
 * THE NIGHT'S HOURS, ALWAYS STATED (the PM's 05:02, item 2): its start and end in its own zone ('11am to 10pm'), its start
 * alone for a row running a day or more ('from 10am'), none for a date-only listing (a start at local midnight). Pure.
 */
export function nightTimes(startIso: string, endIso: string | null, zone: string): string | null {
  const start = new Date(startIso)
  if (!Number.isFinite(start.getTime())) return null
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(start)
  if (hm === '00:00') return null
  const t = (d: Date) => new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(d).replace(':00', '').replace(/\s/g, '').toLowerCase()
  const end = endIso ? new Date(endIso) : null
  if (!end || !Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) return `from ${t(start)}`
  return end.getTime() - start.getTime() < 24 * 3_600_000 ? `${t(start)} to ${t(end)}` : `from ${t(start)}`
}

/** The first line for a moment, never one used inside the window; null when every line is spent (then no post). */
export function firstLineFor(kind: MomentKind, _salesOpen: boolean, usedRecently: ReadonlySet<string>, seed: number, startedByBand = false, repeatDay = false, hook: string | null = null): string | null {
  // The night's own line first (hookFor), when it has not been said inside the window; then the moment's bank.
  if (hook && !usedRecently.has(hook)) return hook
  const bank = repeatDay
    ? (startedByBand ? REPEAT_DAY_ON_NOW : REPEAT_DAY)
    : kind === 'first_day' && startedByBand
      ? FIRST_DAY_ON_NOW
      : (kind === 'running' || kind === 'final_day') && !startedByBand
        ? BEFORE_DOORS[kind]
        : FIRST_LINES[kind]
  for (let i = 0; i < bank.length; i++) {
    const line = bank[(seed + i) % bank.length]
    if (!usedRecently.has(line)) return line
  }
  return null
}

/**
 * A run's reference as social_pieces.moment_key stores it: the run key itself, or, past 180 characters (the column's
 * check allows 200 for it), a stable hash with the key's start; written and read back through this one function.
 */
export function runRef(key: string): string {
  return key.length <= 180 ? key : `h:${seedOf(key).toString(36)}:${key.slice(0, 60)}`
}

/** A small, stable number from a text, so the same run on the same day picks the same line. */
export function seedOf(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

/** The one small line beneath a story's photograph (law 37 (b): the least words, never over the photograph). */
export function storyLine(kind: MomentKind, place: string | null): string {
  const at = place && place.length <= 28 ? ` at ${place}` : ''
  switch (kind) {
    case 'first_day':
      return `Starts today${at}.`
    case 'running':
      return `On today${at}.`
    case 'final_day':
      return `Last day today${at}.`
    case 'tomorrow':
      return `Tomorrow${at}.`
    default:
      return place ? `Coming up${at}.` : 'Coming up.'
  }
}

/** The facts a caption ends with, short (law 37 (j)). */
export type CaptionFacts = {
  readonly title: string
  readonly place: string | null
  readonly dateLabel: string
  /** The night's hours (nightTimes), stated beside its date; none for a date-only listing. */
  readonly times?: string | null
  /** The 05:15 standard's fact block: who runs it, the street address and city, and the day word (Today, Tomorrow, a weekday). */
  readonly organiser?: string | null
  readonly address?: string | null
  readonly city?: string | null
  readonly dayWord?: string | null
  /** The practical line: free and nothing to book, how to register, or how to buy (practicalLine). */
  readonly practical?: string | null
  readonly priceLine: string | null
  /** The listing's own words, its first sentence only. */
  readonly summary: string | null
  /**
   * The night's exact names (its title and its host), the only words that may carry the banned word (words.ts
   * carriesBannedWord, the one rule every piece is judged by). Absent, the title alone.
   */
  readonly names?: readonly (string | null | undefined)[]
}

/**
 * A caption per network: the first line, the experience in the listing's own words, then the title and caption standard
 * version 2's signposts, one emoji each on its own line (C:\dev\GROWTH\CAPTION-STANDARD-18NOV.md items 3 and 4: the
 * place, the date and time, the price or 'Free entry'; the link line led by the ticket), so every caption the planner
 * draws carries the marks src/lib/social/caption-marks.ts requires. The first line stays its own paragraph: the history
 * reads it back so no first line repeats (law 37 (l)).
 */
export function captionFor(input: {
  readonly platform: 'instagram' | 'facebook'
  readonly firstLine: string
  readonly facts: CaptionFacts
  /** This platform's own link (its utm_source names the platform; campaign.ts refuses a crossed one). */
  readonly link: string
}): string {
  const f = input.facts
  const sentence = (f.summary ?? '').split(/(?<=[.!?])\s/)[0]?.trim() ?? ''
  // The listing's sentence is quoted only where the piece may say it: one carrying the banned word outside the night's
  // own names is left out, and the caption goes on without it (21 November 2026, 02:53: AMCF's first sentence says the
  // banned word outside its title, and both of its pieces were refused as drawn; tests/unit/social/lifecycle.test.ts).
  const quotable = sentence.length >= 20 && sentence.length <= 200 && !carriesBannedWord(sentence, f.names ?? [f.title])
  const experience = quotable ? sentence.replace(/!+$/, '.') : ''
  const price = f.priceLine ? f.priceLine.replace(/\.$/, '').trim() : ''
  // THE 05:15 STANDARD'S FACT BLOCK: 'Title, by Organiser', then four markers, each a fact: the place with its street
  // address and city, the day word with the date and the hours, the price or 'Free entry', and the details link.
  const by = f.organiser && !f.title.toLowerCase().includes(f.organiser.toLowerCase()) ? `${f.title}, by ${f.organiser}` : f.title
  const where = whereOf(f.place, f.address ?? null, f.city ?? null)
  const when = [f.dayWord ?? '', f.dateLabel, f.times ?? ''].filter((x) => x !== '').join(', ')
  const details = input.platform === 'instagram' ? '\u{1F39F} Details on EventLinqs: link in our bio' : `\u{1F39F} Details on EventLinqs:\n${input.link}`
  const facts = [
    by,
    where ? `\u{1F4CD} ${where}` : '',
    `\u{1F4C5} ${when}`,
    price ? `\u{1F4B2} ${/^free$/i.test(price) ? 'Free entry' : price}` : '',
    details,
  ]
    .filter((l) => l !== '')
    .join('\n')
  const paragraph = [experience, f.practical ?? ''].filter((x) => x !== '').join(' ')
  return [input.firstLine, paragraph, facts].filter((p) => p !== '').join('\n\n')
}
