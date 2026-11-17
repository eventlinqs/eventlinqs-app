import { clockOf, EXTRA_TAGS, HUNT_SUMMARY_LINE, lockRefusal, nightKind, OLDER_LOOK_IN_PLAN, type CampaignNight, type Slide } from './campaign'
import { standInOf } from './stand-ins'
import { getAllCities } from '@/lib/cities/data'

/**
 * LAW 22, THE PUBLISH GATE, AS LAWAL'S 00:12 OF 18 NOVEMBER 2026 SHAPES IT (OPS-DIRECTIVE-LOCKED-18NOV.md; the P0 directive
 * of 17 November 21:47, sections 3 to 7). Pure. pieceQuality gives every ESSENTIAL reason a piece may not go, each led by its
 * class; it runs at approval and publishing (store.pieceDependencies) and at scheduling, so no route reaches the publisher
 * without it. Everything else is a CORRECTION, never a hold: pieceCorrections names it, and the hourly run draws the piece
 * again by the code in force (store.redrawOlderLook). A piece that still cannot pass is left out alone; it never holds
 * another piece or the campaign.
 *
 *   holds (pieceQuality)
 *     [night]    a night it advertises has started (unless its caption says it is on now and the night has not ended),
 *                a day it prints is already over, a row prints another session's time
 *     [photo]    a stand-in over a night it does not show (Lawal's D1: never a wrong photograph)
 *   corrections (pieceCorrections): drawn again automatically
 *     [stale]    drawn before the rules now in force
 *     [look]     drawn in the older list look
 *     [language] wrong or robotic words, the city twice, a hashtag off our list
 */

/** The moment the rules below came into force: a revision drawn before it is stale. Moved forward with every rule change. */
export const PIECE_RULES_SINCE = '2026-11-17T13:10:00.000Z'

export type QualityNight = Pick<CampaignNight, 'eventId' | 'title' | 'summary' | 'venueName' | 'host' | 'categorySlug' | 'sourceTitle' | 'startDate' | 'timezone' | 'endDate'>

/** A caption that says the night is happening now (Lawal's 00:12, section 5: an event in progress posts only so). */
export const ON_NOW = /\b(on now|happening now|on right now|underway now|still on)\b/i

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
// The planner's own extra tags, from the one place it writes them (campaign.ts EXTRA_TAGS).
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

  /* [night] class 1: no piece posts once a night it advertises has started, unless its caption says it is on now and
     people can still go (the night has not ended): Lawal's 00:12, section 5. */
  const onNow = ON_NOW.test(input.caption)
  const ids = new Set(input.slides.flatMap(nightIdsOf))
  for (const id of ids) {
    const n = input.nights.get(id)
    const ended = n?.endDate ? Date.parse(n.endDate) <= input.now.getTime() : true
    if (n && Date.parse(n.startDate) <= input.now.getTime() && (!onNow || ended)) out.push(`[night] ${n.title}: it has started (${n.startDate}); a piece never posts once its night has started. Draw it again without this night.`)
  }

  /* [night] fix (a): one time per night; a row prints its own night's start, the time its caption prints. */
  for (const slide of input.slides) {
    if (slide.t !== 'days' && slide.t !== 'venue') continue
    for (const row of slide.rows) {
      const n = input.nights.get(row.eventId)
      if (!n || row.when.includes(' to ')) continue
      const own = clockOf(n.startDate, n.timezone ?? null)
      if (row.when !== own) out.push(`[night] ${n.title} prints ${row.when} on its slide, but this night starts at ${own}; one night shows one time.`)
    }
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

  return out
}

/**
 * What the hourly run corrects by drawing the piece again (Lawal's 00:12: never a hold, never a question to him): a
 * drawing made before the rules in force, the older list look, and wrong or robotic words.
 */
export function pieceCorrections(input: Pick<QualityInput, 'slides' | 'caption' | 'madeAt'>): string[] {
  const out: string[] = []
  if (!(Date.parse(input.madeAt) >= Date.parse(PIECE_RULES_SINCE))) {
    out.push(`[stale] It was drawn at ${input.madeAt}, before the rules in force since ${PIECE_RULES_SINCE}: drawn again.`)
  }
  const locked = OLDER_LOOK_IN_PLAN ? null : lockRefusal(input.slides)
  if (locked) out.push(`[look] ${locked}`)
  out.push(...languageFaults([...input.slides.flatMap(wordsOf), ...input.caption.split('\n')]))
  return out
}
