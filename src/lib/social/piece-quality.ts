import { clockOf, EXTRA_TAGS, HUNT_SUMMARY_LINE, lockRefusal, nightKind, OLDER_LOOK_IN_PLAN, ORGANISER_OFFER_FILE, ORGANISER_OFFER_SHOWS_UNTIL, type CampaignNight, type Slide } from './campaign'
import { namesAStandIn, STAND_INS_IN_PLAN, standInOf } from './stand-ins'
import { captionMarkFaults } from './caption-marks'
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
// Moved forward with every rule change. Last moved to 11:00 on 18 November 2026 (Melbourne), past the category car's deploy
// (the PM's 07:05, item 3: the routine corrections apply by the hourly redraw after the car): the pack of 08:01 held seven
// posts drawn at 05:40 by #295's code that #296's moment did not make stale. Until 11:00 a fresh drawing also reads as
// stale, which only means the hourly run compares it again; an identical drawing is never written twice (olderLookRedraws).
export const PIECE_RULES_SINCE = '2026-11-18T00:00:00.000Z'

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
  if (slide.t === 'days' || slide.t === 'venue' || slide.t === 'tonight' || slide.t === 'free_week') return slide.rows.map((r) => r.eventId)
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
      // venueAddress is the source's raw address, never printed whole ('99 Breakwater Rd, Breakwater VIC 3219' read as the
      // city twice in the pack of 18 November 2026); the poster prints its street and the city from it.
      .filter(([k]) => !['photo', 'credit', 'eventId', 'photoEventId', 'startDate', 'composition', 't', 'link', 'url', 'shortLink', 'venueAddress'].includes(k))
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
 * CAPTION STANDARD VERSION 2 (Lawal's model, '#BallaratEvents #KateCeberano #EventLinqs'; his 20:44 of 18 November 2026)
 * adds #EventLinqs and the post's own tag: a tag made from words the piece itself prints, a night's, a venue's or a
 * category's name, as campaign.ts tagWord writes them (tagMadeFromItsWords). Case is never judged.
 */
// The planner's own extra tags, from the one place it writes them (campaign.ts EXTRA_TAGS).
const OUR_TAGS: ReadonlySet<string> = new Set([
  ...EXTRA_TAGS,
  '#eventlinqs',
  ...getAllCities().flatMap((c) => [`#${c.slug}`, `#${c.slug}events`, `#${c.slug.replace(/-/g, '')}`, `#${c.slug.replace(/-/g, '')}events`]),
])

/** Every run of up to eight words a piece prints, joined and lower case ('Melbourne Recital Centre' gives 'melbournerecitalcentre'). */
function wordRuns(texts: readonly string[]): Set<string> {
  const runs = new Set<string>()
  for (const t of texts) {
    const words = t
      .replace(/#[A-Za-z0-9_]+/g, ' ')
      .normalize('NFKD')
      .replace(/['\u2019]/g, '')
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((w) => w.toLowerCase())
    for (let i = 0; i < words.length; i++) {
      let run = ''
      for (let j = i; j < Math.min(words.length, i + 8); j++) {
        run += words[j]
        runs.add(run)
      }
    }
  }
  return runs
}

/** Every wrong or robotic line among the given words (class 4), each said once. Used by the gate and by draft save. */
export function languageFaults(texts: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const runs = wordRuns(texts)
  for (const t of texts) {
    const line = t.trim()
    if (!line) continue
    for (const tag of line.match(/#[A-Za-z0-9_]+/g) ?? []) {
      const own = runs.has(tag.slice(1).toLowerCase())
      if (!OUR_TAGS.has(tag.toLowerCase()) && !own && !seen.has(tag)) {
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
    if (slide.t !== 'days' && slide.t !== 'venue' && slide.t !== 'tonight') continue
    for (const row of slide.rows) {
      const n = input.nights.get(row.eventId)
      if (!n || row.when.includes(' to ')) continue
      const own = clockOf(n.startDate, n.timezone ?? null)
      if (row.when !== own) out.push(`[night] ${n.title} prints ${row.when} on its slide, but this night starts at ${own}; one night shows one time.`)
    }
  }

  /* [night] family G (the PM's 23:38 of 18 November 2026, item 3): the approved organiser offer shows a live event page of
     Saturday 5 December 2026; after the end of that day in Melbourne it is never posted, until a new capture is approved. */
  if (input.slides.some((s) => s.t === 'file' && s.url === ORGANISER_OFFER_FILE) && input.now.getTime() >= Date.parse(ORGANISER_OFFER_SHOWS_UNTIL)) {
    out.push('[night] The approved organiser offer shows a live event page of Saturday 5 December 2026, and that day is over; it is not posted again until a new capture is approved.')
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
export function pieceCorrections(input: Pick<QualityInput, 'slides' | 'caption' | 'madeAt'> & { readonly captions?: readonly string[] }): string[] {
  const out: string[] = []
  if (!(Date.parse(input.madeAt) >= Date.parse(PIECE_RULES_SINCE))) {
    out.push(`[stale] It was drawn at ${input.madeAt}, before the rules in force since ${PIECE_RULES_SINCE}: drawn again.`)
  }
  const locked = OLDER_LOOK_IN_PLAN ? null : lockRefusal(input.slides)
  if (locked) out.push(`[look] ${locked}`)
  out.push(...languageFaults([...input.slides.flatMap(wordsOf), ...input.caption.split('\n')]))
  // Caption standard version 2's marks (caption-marks.ts): a drawing without them is drawn again by the code in force. Each
  // platform's caption is judged on its own (captions), never the joined words, whose hooks would count three times over.
  for (const c of input.captions ?? [input.caption]) if (c.trim()) out.push(...captionMarkFaults(c))
  // The PM's 15:55 of 19 November 2026: a piece drawn with a stock stand-in, or whose caption names one, is drawn again by
  // the code in force, which draws none while STAND_INS_IN_PLAN is off (stand-ins.ts).
  if (!STAND_INS_IN_PLAN && (input.slides.some((s) => 'photo' in s && standInOf(s.photo)) || (input.captions ?? [input.caption]).some(namesAStandIn))) {
    out.push("[photo] It is drawn with a stock photograph or names one in its caption; drawn again with the night's own photograph or in type.")
  }
  return out
}
