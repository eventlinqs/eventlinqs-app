import { momentWindowOf, nextSlot, scheduleWindowOf, STARTING_CALENDAR, withStartingCalendar, type CadenceRule, type SocialFormat } from './cadence'
import { carriesBannedWord } from './words'

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
    // The season's own first day and final day only (runsOf continuesSeason, seasonGoesOn).
    if (today === first && !run.continuesSeason) return 'first_day'
    if (today === last && !run.seasonGoesOn) return 'final_day'
    return 'running'
  }
  const ahead = daysFrom(today, first)
  if (ahead === 1) return 'tomorrow'
  if (ahead <= 7) return 'this_week'
  return daysFrom(dayIn(new Date(run.listedAt), run.zone), today) < ANNOUNCE_DAYS ? 'announced' : 'upcoming'
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
 * WHETHER A MOMENT'S WORDS SAY THE NIGHT IS ON NOW (piece-quality.ts ON_NOW), by its kind: a running day and a final
 * day always do ('still on'), a first day does when its night has started by its band (FIRST_DAY_ON_NOW), and a moment
 * ahead of its night never does. Held against every first line by tests/unit/social/every-moment-has-a-window.test.ts.
 * Pure.
 */
export function momentSaysOnNow(kind: MomentKind, startedByBand: boolean): boolean {
  if (kind === 'running' || kind === 'final_day') return true
  if (kind === 'first_day') return startedByBand
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
}): { readonly at: Date; readonly onNow: boolean } | { readonly why: string } {
  const start = Date.parse(input.night.startDate)
  const end = input.night.endDate ? Date.parse(input.night.endDate) : start
  if (!Number.isFinite(start)) return { why: `${input.night.title} has no start` }
  // A first day tries its words as 'starts today' first, then, when its night is under way by the band it can take, as
  // on now; every other moment's words are fixed by its kind (momentSaysOnNow).
  const tries = input.kind === 'first_day' ? [false, true] : [momentSaysOnNow(input.kind, false)]
  let why = `no ${input.format} band on ${input.day}`
  for (const onNow of tries) {
    const w = momentWindowOf(input.day, scheduleWindowOf(input.format, [{ title: input.night.title, start, end }], input.zone, { onNow }), input.zone)
    const from = new Date(Math.max(input.now.getTime(), w.notBefore.getTime()))
    const at = nextSlot(STARTING_RULE(input.format), from, input.zone)
    if (at.getTime() > w.deadline.getTime() || dayIn(at, input.zone) !== input.day) {
      why = `no ${input.format} band on ${input.day} inside its window (it closes ${w.deadline.toISOString()})`
      continue
    }
    const started = start <= at.getTime()
    const ended = end <= at.getTime()
    if (started && !(onNow && !ended)) {
      why = `${input.night.title} would have ${ended ? 'ended' : 'started'} by its ${input.format} band`
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
}

/** Instagram's feed range, as Meta states it ('Aspect ratio: Must be within a 4:5 to 1.91:1 range',
 * https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media). */
const FEED_RATIO_MIN = 4 / 5
const FEED_RATIO_MAX = 1.91

/**
 * The photographs a piece may carry, best first, within the policy only (the PM's 14:20 item 1): a photograph (never a
 * flyer, law 37 (b)), looked at and ranked by a person (law 37 (k)), never posted before on either network (law 37 (l)),
 * its size known. Then lead rank, then whole fit to the format, then width.
 */
export function rankPhotos(assets: readonly PhotoAsset[], format: SocialFormat, used: ReadonlySet<string>): PhotoAsset[] {
  const fits = (a: PhotoAsset): number => {
    const r = (a.width ?? 0) / (a.height ?? 1)
    if (format === 'feed') return r >= FEED_RATIO_MIN && r <= FEED_RATIO_MAX ? 1 : 0
    return (a.height ?? 0) >= (a.width ?? 0) ? 1 : 0
  }
  return assets
    .filter((a) => a.type === 'photo' && a.leadRank !== null && !used.has(a.url) && (a.width ?? 0) > 0 && (a.height ?? 0) > 0)
    .sort((a, b) => (a.leadRank ?? 99) - (b.leadRank ?? 99) || fits(b) - fits(a) || (b.width ?? 0) - (a.width ?? 0) || a.assetId.localeCompare(b.assetId))
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
 * A first day whose night has already started by the format's first band that day (a night listed from midnight, or one
 * that opens before the morning post): its words say it is on now (piece-quality.ts ON_NOW), which is what lets the
 * scheduler give it the night's run and the publish gate post it after the night's start (law 22, class 1). 'It starts
 * today' at 9 am for a night under way since midnight could never post (21 November 2026, the PM's 16:05).
 */
const FIRST_DAY_ON_NOW: readonly string[] = ['Opening day, and on now.', 'Day one, and it is on now.', 'It is on now, from today.']

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

/** The first line for a moment, never one used inside the window; null when every line is spent (then no post). */
export function firstLineFor(kind: MomentKind, _salesOpen: boolean, usedRecently: ReadonlySet<string>, seed: number, startedByBand = false): string | null {
  const bank = kind === 'first_day' && startedByBand ? FIRST_DAY_ON_NOW : FIRST_LINES[kind]
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
  const signposts = [
    f.title,
    f.place ? `\u{1F4CD} ${f.place}` : '',
    `\u{1F4C5} ${f.dateLabel}`,
    price ? `\u{1F4B2} ${/^free$/i.test(price) ? 'Free entry' : price}` : '',
  ]
    .filter((l) => l !== '')
    .join('\n')
  const link = input.platform === 'instagram' ? '\u{1F39F} Event details and tickets: link in our bio' : `\u{1F39F} Event details and tickets:\n${input.link}`
  return [input.firstLine, experience, signposts, link].filter((p) => p !== '').join('\n\n')
}
