import { HUNT_SUMMARY_LINE, lockRefusal, nightKind, OLDER_LOOK_IN_PLAN, type CampaignNight, type Slide } from './campaign'
import { standInOf } from './stand-ins'
import { getAllCities } from '@/lib/cities/data'

/**
 * LAW 22, THE PUBLISH GATE: ONE CHECK OF A PIECE'S OWN CONTENT (the PM's 21:58 and 22:02 of 17 November 2026; Lawal's P0
 * directive of 21:47, sections 3 to 7). Pure: given a revision's slides and caption, the time it was drawn, its nights as
 * they are now and the moment, it returns every reason the piece may not go, each led by its class, or none. The one
 * pipeline runs it at approval and at publishing (store.pieceDependencies), at scheduling and when a piece is drawn, so no
 * route reaches the publisher without it. The faults of 17 November are its drills (tests/unit/social/piece-quality.test.ts).
 *
 *   [night]    a night the piece advertises has started (class 1; a piece never posts once its night has started)
 *   [photo]    a stand-in over a night it does not show (class 2; Lawal's D1: never a wrong photograph)
 *   [look]     Lawal's lock of 15 November refuses it (class 3)
 *   [language] wrong or robotic words on a slide or in the caption (class 4)
 *   [stale]    drawn before the rules now in force (P0 section 7): drawn again before it goes
 */

/** The moment the rules below came into force: a revision drawn before it is stale. Moved forward with every rule change. */
export const PIECE_RULES_SINCE = '2026-11-17T12:30:00.000Z'

export type QualityNight = Pick<CampaignNight, 'eventId' | 'title' | 'summary' | 'venueName' | 'host' | 'categorySlug' | 'sourceTitle' | 'startDate' | 'timezone'>

export type QualityInput = {
  readonly slides: readonly Slide[]
  readonly caption: string
  readonly madeAt: string
  readonly nights: ReadonlyMap<string, QualityNight>
  readonly now: Date
}

/** The nights a slide's photograph stands over: a day or venue slide's rows, a cover's lead cards, a night's own slide. */
function nightIdsOf(slide: Slide): string[] {
  if (slide.t === 'days' || slide.t === 'venue') return slide.rows.map((r) => r.eventId)
  if (slide.t === 'week_cover') return (slide.lead ?? []).map((r) => r.eventId)
  if ('eventId' in slide && typeof slide.eventId === 'string') return [slide.eventId]
  return []
}

/** Every word a slide prints, as plain strings. */
function wordsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(wordsOf)
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !['photo', 'credit', 'eventId', 'photoEventId', 'startDate', 'composition', 't', 'link', 'url', 'shortLink'].includes(k))
      .flatMap(([, v]) => wordsOf(v))
  }
  return []
}

/** Wrong or robotic English, by rule (class 4). Each rule names what it refuses. */
const LANGUAGE: readonly { readonly test: (s: string) => string | null }[] = [
  { test: (s) => (/\b(one|1) (nights|things|events|shows|gigs)\b/i.exec(s)?.[0] ?? null) },
  { test: (s) => (/\b[A-Za-z0-9]+- [A-Z][^,.\n]{0,30}/.exec(s)?.[0] ?? null) },
  { test: (s) => (/\S - \S/.exec(s) ? s.slice(0, 80) : null) },
  { test: (s) => (/\b([A-Z][a-z]{2,})\b[^,.\n]{0,60}?, \1\b/.exec(s)?.[0] ?? null) },
]

/**
 * OUR HASHTAGS, ONE LIST (the PM's 23:45 of 17 November 2026, fix (e)): a city's own two, as campaign.ts tagsFor writes them
 * ('#geelong', '#geelongevents'), for every city the platform carries (src/lib/cities/data.ts), and the extras the planner
 * adds. A tag typed by hand that is not on it ('#geelongevent') is refused.
 */
const EXTRA_TAGS = ['#thisweekend', '#victoriaevents'] as const
const OUR_TAGS: ReadonlySet<string> = new Set([
  ...EXTRA_TAGS,
  ...getAllCities().flatMap((c) => [`#${c.slug}`, `#${c.slug}events`]),
])

/** Every wrong or robotic line among the given words (class 4), each said once. Used by the gate and by draft save. */
export function languageFaults(texts: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of texts) {
    const line = t.trim()
    if (!line) continue
    for (const tag of line.match(/#[A-Za-z0-9_]+/g) ?? []) {
      if (!OUR_TAGS.has(tag.toLowerCase()) && !seen.has(tag)) {
        seen.add(tag)
        out.push(`[language] "${tag}" is not one of our hashtags; use the city's own two.`)
      }
    }
    if (HUNT_SUMMARY_LINE.test(line) && !seen.has(line)) {
      seen.add(line)
      out.push(`[language] robotic line: "${line}"; say why to go, or nothing.`)
    }
    for (const rule of LANGUAGE) {
      const hit = rule.test(line)
      if (hit && !seen.has(hit)) {
        seen.add(hit)
        out.push(`[language] "${hit}" is not correct English; write it again.`)
      }
    }
  }
  return out
}

/**
 * WORDS FOR THE DAY IT POSTS (the PM's 23:45 of 17 November 2026, fix (c)): every date a piece prints, as a weekday and a
 * day ('Fri 20') or a day and a month ('20 to 21 November', '21 Nov'), read against the day it would go on Melbourne's
 * clock; one already over is said, so a piece never goes out naming a day that has passed (Geelong's 'Fri and Sat' piece
 * set for Saturday). A weekday and day is placed in this month or the last, where its weekday matches.
 */
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function dayOn(now: Date, zone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now)
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { y: n('year'), m: n('month'), d: n('day') }
}

export function pastDaysPrinted(texts: readonly string[], now: Date, zone = 'Australia/Melbourne'): string[] {
  const today = dayOn(now, zone)
  const todayKey = Date.UTC(today.y, today.m - 1, today.d)
  const out: string[] = []
  const say = (token: string) => {
    const r = `[night] It prints "${token}", a day already over; draw it again for the day it posts.`
    if (!out.includes(r)) out.push(r)
  }
  for (const text of texts) {
    for (const m of text.matchAll(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?\s+(\d{1,2})\b/gi)) {
      const wd = WEEKDAYS.indexOf(m[1].slice(0, 3).toLowerCase())
      const d = Number(m[2])
      for (const back of [0, 1]) {
        const at = Date.UTC(today.y, today.m - 1 - back, d)
        const check = new Date(at)
        if (check.getUTCDate() !== d || check.getUTCDay() !== wd) continue
        if (at < todayKey) say(m[0])
        break
      }
    }
    for (const m of text.matchAll(/\b(\d{1,2})(?:\s+to\s+\d{1,2})?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/gi)) {
      const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
      // The nearest year to today: a month more than six back is next year's.
      const year = month < today.m - 1 - 6 ? today.y + 1 : today.y
      if (Date.UTC(year, month, Number(m[1])) < todayKey) say(m[0])
    }
  }
  return out
}

export function pieceQuality(input: QualityInput): string[] {
  const out: string[] = []

  /* [stale] P0 section 7: a revision drawn under older rules is drawn again before it goes. */
  if (!(Date.parse(input.madeAt) >= Date.parse(PIECE_RULES_SINCE))) {
    out.push(`[stale] It was drawn at ${input.madeAt}, before the rules in force since ${PIECE_RULES_SINCE}: draw it again.`)
  }

  /* [night] class 1: no piece posts once a night it advertises has started. */
  const ids = new Set(input.slides.flatMap(nightIdsOf))
  for (const id of ids) {
    const n = input.nights.get(id)
    if (n && Date.parse(n.startDate) <= input.now.getTime()) out.push(`[night] ${n.title}: it has started (${n.startDate}); a piece never posts once its night has started. Draw it again without this night.`)
  }

  /* [night] fix (c): no day it prints is already over on the day it would go. */
  out.push(...pastDaysPrinted([...input.slides.flatMap(wordsOf), ...input.caption.split('\n')], input.now))

  /* [photo] class 2: a stand-in stands only over nights of its own kind; a night whose kind cannot be read is refused too. */
  input.slides.forEach((slide, i) => {
    const s = 'photo' in slide ? standInOf(slide.photo) : null
    if (!s) return
    for (const id of nightIdsOf(slide)) {
      const n = input.nights.get(id)
      if (!n) continue
      const kind = nightKind(n)
      if (kind !== s.kind) out.push(`[photo] slide ${i + 1}: its photograph (${s.subject}) does not show ${n.title} (${kind ?? 'a night of no known kind'}); draw that slide without it.`)
    }
  })

  /* [look] class 3: Lawal's lock of 15 November. */
  const locked = OLDER_LOOK_IN_PLAN ? null : lockRefusal(input.slides)
  if (locked) out.push(`[look] ${locked}`)

  /* [language] class 4: on every slide and in the caption. */
  out.push(...languageFaults([...input.slides.flatMap(wordsOf), ...input.caption.split('\n')]))
  return out
}
