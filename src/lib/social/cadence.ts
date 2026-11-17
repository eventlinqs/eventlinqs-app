/**
 * HOW OFTEN AND WHEN EVENTLINQS POSTS, LEARNED FROM ITS OWN POSTS AGAINST TICKETS SOLD (item 11, the social engine;
 * docs/SOCIAL-ENGINE.md). Ported from Bookedproof's src/lib/social/cadence.ts (bp-int-pf1, read only, 27 October 2026).
 *
 * WHAT IT LEARNS, per network and format, only from EventLinqs' own posts there:
 *   A post counts once it went at least settle_hours ago (48 to start), and once floor_posts of them (12 to start)
 *   count. Below that there is no baseline and the starting rule stands; the admin page says so.
 *   THE HOURS. Each post's hour of the week on Melbourne's clock, in bands of three hours. A band with at least two
 *   posts is ranked by tickets sold through its posts' links per post, then by people who arrived or pressed out through
 *   them per post. The best three are kept. Never likes: a like sells nothing.
 *   THE GAP. Weeks are counted by how many posts went in them; of the counts seen in at least two weeks, the one whose
 *   weeks sold the most tickets a week, fewest posts on a tie, sets the gap: 168 hours over that count.
 *
 * Pure: the reads and the one write are the caller's (src/lib/social/store.ts), so each rule is driven by its own test.
 * A new version is written only where the hours or the gap differ from the rule in force; a rule is read by date, so no
 * change is ever retroactive.
 */

export const SOCIAL_ZONE = 'Australia/Melbourne'

export type SocialPlatform = 'instagram' | 'facebook'
export type SocialFormat = 'feed' | 'story'

export interface CadenceRule {
  readonly version: number
  readonly gapHours: number
  /** Hours of the week (0 is Monday at midnight) each opening a three hour band, on Melbourne's clock, best first. */
  readonly slots: readonly number[]
  readonly basis: 'starting' | 'learned'
  readonly learnedFrom: number
  readonly floorPosts: number
  readonly settleHours: number
  readonly setAt: Date
}

/**
 * THE STARTING CALENDAR (Lawal's 14:07 of 15 November 2026: the week's calendar from the research, as defaults the daily
 * review tunes; C:\dev\START-16OCT\EL-AUTOMATION-15NOV\leaders-automation.md). Until twelve of our own posts in a format
 * have each gone 48 hours (the learner below), posts open these bands, hours of the week on Melbourne's clock (0 is
 * Monday at midnight). The first calendar (15 November) opened feed Monday from 6 pm (the week), Wednesday from noon (a
 * spotlight), Thursday from 9 am (the weekend picks) and Sunday from 6 pm (next week); stories Friday and Saturday from
 * 6 pm (Tonight); it is replaced below, because it could not carry the week's plan. Sprout Social's
 * Australian data (sproutsocial.com/insights/best-times-to-post-on-social-media-australia/, March 2026): 5 to 10 pm
 * Monday to Thursday, Monday and Thursday best; Buffer's 9.6 million posts (buffer.com/resources/
 * when-is-the-best-time-to-post-on-instagram/, September 2026): Thursday 9 am and Wednesday 12 pm on top, Friday and
 * Saturday weakest. The database keeps a starting rule with no slots (social_cadence_rules_whose), so the calendar is
 * applied as the rules are read, never stored as if learned.
 *
 * THE WEEK'S PLAN MUST FIT THE WEEK (the PM's 09:10 of 16 November 2026, read by WINDOW 5A at 09:14 to 09:25): those four
 * feed bands, one post each under the database's 12 hour floor (social_cadence_rules_feed_gap), carried four of the
 * thirteen feed pieces the week's plan draws for four cities (plan.json: one post a day for each open city), and every
 * piece is held once any of its nights has ended (pieceDependencies), so two of out-14's fourteen would have published
 * (C:\dev\EVIDENCE\EL-16NOV\out14-train\switch-on-deadlines.txt). The calendar is now feed every day at 9 am and 9 pm,
 * exactly the 12 hour floor: 9 am is Buffer's top Thursday slot and inside the 8 to 10 am Australian morning window the
 * PM's relay of 15 November 14:15 quotes from Sprout Social; 9 pm is inside Sprout's best Instagram evening, 5 to 10 pm.
 * Stories every day from 6 pm, each on the day of its first night (planMoments' notBefore), as Lawal's 14:07 has the
 * Tonight story go the night itself.
 */
const EVERY_DAY = (hour: number): number[] => Array.from({ length: 7 }, (_, day) => day * 24 + hour)
export const STARTING_CALENDAR: Readonly<Record<SocialFormat, readonly number[]>> = {
  feed: [...EVERY_DAY(9), ...EVERY_DAY(21)].sort((a, b) => a - b),
  story: EVERY_DAY(18),
}

export function withStartingCalendar(rule: CadenceRule, format: SocialFormat): CadenceRule {
  return rule.basis === 'starting' && rule.slots.length === 0 ? { ...rule, slots: STARTING_CALENDAR[format] } : rule
}

/** One of EventLinqs' own posts, as the learner reads it. */
export interface PostOutcome {
  readonly postedAt: Date
  /** Tickets sold through the post's own link (share_link_events conversions, their orders' ticket counts). */
  readonly tickets: number
  /** People who arrived through the post's link, plus presses out to the organiser's own page from it. */
  readonly visits: number
}

export const BAND_HOURS = 3
export const BANDS_KEPT = 3
export const ENOUGH_TO_RANK = 2

const WEEK_INDEX: Readonly<Record<string, number>> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

/** A moment's hour of the week on a zone's clock: 0 is Monday at midnight, 167 Sunday at eleven at night. */
export function hourOfWeek(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(at)
  const day = WEEK_INDEX[parts.find((p) => p.type === 'weekday')?.value ?? ''] ?? 0
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  return day * 24 + hour
}

/** The Monday a moment's week began on, on a zone's clock, as YYYY-MM-DD: the week a post is counted in. */
export function weekOf(zone: string, at: Date): string {
  const back = new Date(at.getTime() - Math.floor(hourOfWeek(zone, at) / 24) * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(back)
}

/** The posts that count: gone at least settle hours before now. */
export function settled(posts: readonly PostOutcome[], settleHours: number, now: Date): PostOutcome[] {
  return posts.filter((p) => p.postedAt.getTime() <= now.getTime() - settleHours * 3_600_000)
}

/** The bands of hours ranked by tickets per post, then by visits per post, each on at least two posts, best first. */
export function bestBands(zone: string, posts: readonly PostOutcome[], keep: number = BANDS_KEPT): number[] {
  const bands = new Map<number, { posts: number; tickets: number; visits: number }>()
  for (const p of posts) {
    const band = Math.floor(hourOfWeek(zone, p.postedAt) / BAND_HOURS) * BAND_HOURS
    const b = bands.get(band) ?? { posts: 0, tickets: 0, visits: 0 }
    bands.set(band, { posts: b.posts + 1, tickets: b.tickets + p.tickets, visits: b.visits + p.visits })
  }
  return [...bands]
    .filter(([, b]) => b.posts >= ENOUGH_TO_RANK)
    .sort(([ha, a], [hb, b]) => b.tickets / b.posts - a.tickets / a.posts || b.visits / b.posts - a.visits / a.posts || ha - hb)
    .slice(0, keep)
    .map(([h]) => h)
}

/** The gap from the weekly count of posts that sold the most tickets a week, or null where no count is seen twice. */
export function bestGap(zone: string, posts: readonly PostOutcome[], bounds: { min: number; max: number }): number | null {
  const weeks = new Map<string, { posts: number; tickets: number }>()
  for (const p of posts) {
    const w = weekOf(zone, p.postedAt)
    const k = weeks.get(w) ?? { posts: 0, tickets: 0 }
    weeks.set(w, { posts: k.posts + 1, tickets: k.tickets + p.tickets })
  }
  const counts = new Map<number, { weeks: number; tickets: number }>()
  for (const k of weeks.values()) {
    const c = counts.get(k.posts) ?? { weeks: 0, tickets: 0 }
    counts.set(k.posts, { weeks: c.weeks + 1, tickets: c.tickets + k.tickets })
  }
  const seen = [...counts].filter(([, c]) => c.weeks >= ENOUGH_TO_RANK)
  if (seen.length === 0) return null
  const [best] = seen.sort(([na, a], [nb, b]) => b.tickets / b.weeks - a.tickets / a.weeks || na - nb)[0]
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(168 / best)))
}

/** The fewest and most hours a learned gap may hold, as the database holds them (social_cadence_rules_gap). */
export const GAP_BOUNDS: Readonly<Record<SocialFormat, { min: number; max: number }>> = {
  feed: { min: 12, max: 168 },
  story: { min: 1, max: 168 },
}

export type Learned =
  | { readonly state: 'learned'; readonly gapHours: number; readonly slots: readonly number[]; readonly learnedFrom: number; readonly reason: string }
  | { readonly state: 'unchanged'; readonly rule: CadenceRule }
  | { readonly state: 'no_baseline'; readonly posts: number; readonly floor: number; readonly rule: CadenceRule }

/** What the rule should be now, from the posts that count; the caller writes a 'learned' one as the next version. */
export function learn(input: { readonly current: CadenceRule; readonly format: SocialFormat; readonly posts: readonly PostOutcome[]; readonly now: Date; readonly zone?: string }): Learned {
  const zone = input.zone ?? SOCIAL_ZONE
  const counted = settled(input.posts, input.current.settleHours, input.now)
  if (counted.length < input.current.floorPosts) return { state: 'no_baseline', posts: counted.length, floor: input.current.floorPosts, rule: input.current }
  /* The learned hours never carry fewer bands than the week's plan needs (the starting calendar's count): three kept
     bands would put the week back to three posts, and the rest of the plan would be held as its nights pass (the PM's
     09:10 of 16 November 2026). Until that many bands are each ranked on two posts, the rule in force stands. */
  const need = STARTING_CALENDAR[input.format].length
  const slots = bestBands(zone, counted, need)
  if (slots.length < need) return { state: 'unchanged', rule: input.current }
  const gapHours = bestGap(zone, counted, GAP_BOUNDS[input.format]) ?? input.current.gapHours
  if (input.current.basis === 'learned' && gapHours === input.current.gapHours && slots.join(',') === input.current.slots.join(',')) {
    return { state: 'unchanged', rule: input.current }
  }
  return {
    state: 'learned',
    gapHours,
    slots,
    learnedFrom: counted.length,
    reason: `Learned from EventLinqs' own ${counted.length} posts here, each gone at least ${input.current.settleHours} hours: the hours ranked by tickets sold a post, and the gap from the weeks that sold the most.`,
  }
}

/** The next moment a learned band opens, from now, on the zone's clock; now where the rule has no bands or one is open. */
export function nextSlot(rule: CadenceRule, now: Date, zone: string = SOCIAL_ZONE): Date {
  if (rule.slots.length === 0) return now
  const here = hourOfWeek(zone, now)
  const forward = (from: number, to: number): number => (to + 168 - from) % 168
  const ahead = Math.min(...rule.slots.map((s) => (forward(s, here) < BAND_HOURS ? 0 : forward(here, s))))
  if (ahead === 0) return now
  const minute = Number(new Intl.DateTimeFormat('en-AU', { timeZone: zone, minute: 'numeric' }).formatToParts(now).find((p) => p.type === 'minute')?.value ?? 0)
  const top = new Date(Math.floor(now.getTime() / 60_000) * 60_000 - minute * 60_000)
  return new Date(top.getTime() + ahead * 3_600_000)
}

/** When the next post on this network and format may go: the last one's moment plus the gap, or now. */
export function nextAllowed(rule: CadenceRule, lastPostedAt: Date | null, now: Date): Date {
  if (lastPostedAt === null) return now
  const at = new Date(lastPostedAt.getTime() + rule.gapHours * 3_600_000)
  return at.getTime() > now.getTime() ? at : now
}

/** Each format's name, one and many, written out: "Stories", never a plural built by adding an s. */
export const FORMAT_NAME: Readonly<Record<SocialFormat, { readonly one: string; readonly many: string }>> = {
  feed: { one: 'Feed card', many: 'Feed cards' },
  story: { one: 'Story', many: 'Stories' },
}

/** The rule a format posts by, as /admin/social says it; `when` is the page's own "one may go now" or the next time. */
export function cadenceLine(format: SocialFormat, rule: CadenceRule, when: string): string {
  return rule.basis === 'starting'
    ? `${FORMAT_NAME[format].many} go at least ${rule.gapHours} hours apart, ${when}. No baseline yet: the hours are learned once ${rule.floorPosts} have each gone ${rule.settleHours} hours.`
    : `${FORMAT_NAME[format].many} go at least ${rule.gapHours} hours apart, ${when}. Learned from our own ${rule.learnedFrom} posts, ranked by tickets sold.`
}

/** An approved piece as the week's plan places it. */
export interface SchedulePiece {
  readonly id: string
  readonly format: SocialFormat
  readonly approvedAt: Date
  /** The earliest it may go: a story goes on the day of its first night (dayStart), never days before it. */
  readonly notBefore?: Date | null
  /** The latest it may go: the start of its earliest night (scheduleWindowOf), since no piece posts once its night has started. */
  readonly deadline?: Date | null
}

export type WeekPlan = {
  readonly moments: ReadonlyMap<string, Date>
  /** Pieces whose next free band falls after their deadline: never placed late, said with the band and the deadline. */
  readonly late: readonly { readonly id: string; readonly firstFree: Date; readonly deadline: Date }[]
}

/** Midnight on the zone's clock of the day a moment falls on: the first moment a story about that day may go. */
/**
 * A PIECE GOES BEFORE ITS NIGHT STARTS (the PM's 22:08 of 17 November 2026, class 2: "No piece posts in a slot after its
 * night starts"). An approved piece's window: its deadline the START of its earliest night (it was the end of its soonest
 * ending night, so a daily poster took 9:25 pm on its own night, after the night began), and a story no earlier than its
 * first night's day. No night with a start, no window. Pure.
 */
export function scheduleWindowOf(
  format: SocialFormat,
  nights: readonly { readonly title: string; readonly start: number; readonly end: number }[],
  zone: string = SOCIAL_ZONE,
  opts: { readonly onNow?: boolean } = {},
): { deadline: Date | null; notBefore: Date | null; first: { title: string; start: Date } | null } {
  const dated = nights.filter((n) => Number.isFinite(n.start))
  if (dated.length === 0) return { deadline: null, notBefore: null, first: null }
  const first = dated.reduce((a, b) => (b.start < a.start ? b : a))
  // ON NOW (Lawal's 00:12 of 18 November 2026, section 5): a piece whose caption says the night is on now may go while
  // people can still go, until its earliest night ends.
  const ends = dated.map((n) => n.end).filter((e) => Number.isFinite(e))
  return {
    deadline: opts.onNow && ends.length > 0 ? new Date(Math.min(...ends)) : new Date(first.start),
    notBefore: format === 'story' ? dayStart(new Date(first.start), zone) : null,
    first: { title: first.title, start: new Date(first.start) },
  }
}

export function dayStart(at: Date, zone: string = SOCIAL_ZONE): Date {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(at)
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return new Date(Math.floor(at.getTime() / 1000) * 1000 - ((n('hour') % 24) * 3600 + n('minute') * 60 + n('second')) * 1000)
}

/**
 * B5, THE WEEK'S PLAN (the PM's 09:10 of 16 November 2026): every approved piece gets the next free band of its format
 * that keeps the format's gap from every moment already taken (the last post that went, and every schedule still
 * waiting from an earlier approval, so two approvals an hour apart never put two feed posts inside the floor), never
 * before its approval or its notBefore. Pieces are placed earliest deadline first, the order given on a tie, so the
 * nights that end soonest take the soonest bands; a piece whose next free band falls after its deadline is not placed
 * (it would be held whole at publishing) but returned as late. Pure, so the plan is driven by its own test.
 */
export function planMoments(
  pieces: readonly SchedulePiece[],
  rules: Readonly<Record<SocialFormat, CadenceRule>>,
  taken: Readonly<Record<SocialFormat, readonly Date[]>>,
  now: Date,
  zone: string = SOCIAL_ZONE,
): WeekPlan {
  const moments = new Map<string, Date>()
  const late: { id: string; firstFree: Date; deadline: Date }[] = []
  const busy: Record<SocialFormat, number[]> = { feed: taken.feed.map((d) => d.getTime()), story: taken.story.map((d) => d.getTime()) }
  const order = pieces.map((p, i) => ({ p, i })).sort((a, b) => (a.p.deadline?.getTime() ?? Infinity) - (b.p.deadline?.getTime() ?? Infinity) || a.i - b.i)
  for (const { p } of order) {
    const rule = rules[p.format]
    const gap = rule.gapHours * 3_600_000
    let at = nextSlot(rule, new Date(Math.max(now.getTime(), p.approvedAt.getTime(), p.notBefore?.getTime() ?? 0)), zone)
    for (let tries = 0; tries < 2000; tries += 1) {
      const clash = busy[p.format].find((t) => Math.abs(t - at.getTime()) < gap)
      if (clash === undefined) break
      at = nextSlot(rule, new Date(clash + gap), zone)
    }
    if (p.deadline && at.getTime() > p.deadline.getTime()) {
      late.push({ id: p.id, firstFree: at, deadline: p.deadline })
      continue
    }
    moments.set(p.id, at)
    busy[p.format].push(at.getTime())
  }
  return { moments, late }
}

/**
 * B5: the moments approved pieces go, with no deadlines and nothing waiting but the last post that went (the shape the
 * week's plan began with; planMoments is the whole rule). A feed piece and a story run on their own rules.
 */
export function scheduleMoments(
  pieces: readonly { readonly id: string; readonly format: SocialFormat; readonly approvedAt: Date }[],
  rules: Readonly<Record<SocialFormat, CadenceRule>>,
  lastPosted: Readonly<Record<SocialFormat, Date | null>>,
  now: Date,
  zone: string = SOCIAL_ZONE,
): Map<string, Date> {
  const taken = { feed: lastPosted.feed ? [lastPosted.feed] : [], story: lastPosted.story ? [lastPosted.story] : [] }
  return new Map(planMoments(pieces, rules, taken, now, zone).moments)
}
