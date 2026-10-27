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
export function bestBands(zone: string, posts: readonly PostOutcome[]): number[] {
  const bands = new Map<number, { posts: number; tickets: number; visits: number }>()
  for (const p of posts) {
    const band = Math.floor(hourOfWeek(zone, p.postedAt) / BAND_HOURS) * BAND_HOURS
    const b = bands.get(band) ?? { posts: 0, tickets: 0, visits: 0 }
    bands.set(band, { posts: b.posts + 1, tickets: b.tickets + p.tickets, visits: b.visits + p.visits })
  }
  return [...bands]
    .filter(([, b]) => b.posts >= ENOUGH_TO_RANK)
    .sort(([ha, a], [hb, b]) => b.tickets / b.posts - a.tickets / a.posts || b.visits / b.posts - a.visits / a.posts || ha - hb)
    .slice(0, BANDS_KEPT)
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
  const slots = bestBands(zone, counted)
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
