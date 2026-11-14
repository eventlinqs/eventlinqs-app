/**
 * ONE JUDGE FOR EVERY RE-READ (Lawal, 15 November 2026, 06:03: "anything that goes online must be verified on that day on
 * the real source"; PM-ORDER-EVENTLINQS-2-LAUNCH-8NOV.md). The engine accuracy sweep's own rules, moved here verbatim from
 * scripts/verify/engine-accuracy-sweep.mts (6 November 2026 and its corrections), so the sweep and the six hourly re-read
 * (./reverify-run.ts) judge a night by the same words: a night of its own on the page at the same minute, or its date and
 * start in the page's words, its weekly, monthly, seasonal, gig list, range or gates words. Pure: no reads, no writes.
 */
import { fold } from './headline-hunt'
import { titleShare, SAME_TITLE_SHARE } from '@/lib/events/booking-links'
import { statedInWords, statedWeekly, statedSeasonal, statedByGates, statedInDatedList, statedEveryWeekday, statedDailyInRange, statedUnderName } from './stated-words'
import type { FoundEvent as Found } from './collect'
import type { PatternKind } from './source-patterns'

/** A published listed night as the judge reads it. */
export type ListedNight = {
  id: string
  title: string
  start_date: string
  timezone: string | null
  venue_name: string | null
  venue_address: string | null
}
/** One fact judged against the page. */
export type NightFact = { field: 'start' | 'venue' | 'price' | 'status'; ok: boolean; detail: string }
/** What a page says of one night: its facts, the schedule words that vouched for it, or why it could not be judged. */
export type NightJudgement = { facts: NightFact[]; pattern: PatternKind | null | undefined; unread: string | null }

export const sameMinute = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60_000
export const alike = (a: string, b: string) => fold(a) === fold(b) || titleShare(a, b) >= SAME_TITLE_SHARE
/** The same title, not merely shared words: folded equal, or one folded title holding the other whole. */
export const sameTitle = (a: string, b: string) => {
  const x = fold(a)
  const y = fold(b)
  return x === y || (x.length >= 8 && y.includes(x)) || (y.length >= 8 && x.includes(y))
}
export const timed = (f: Found) => f.timeStatus !== 'date_only' && f.timeStatus !== 'multi_day'
/** The street a venue address names: its first number and the street word after it ('50 little malop'). */
export const street = (address: string | null | undefined) => {
  const m = fold(address ?? '').match(/\b(\d+[a-z]?)\s+([a-z]+)(?:\s+([a-z]+))?/)
  return m ? `${m[1]} ${m[2]}${m[3] && !/^(st|street|rd|road|ave|avenue|pde|parade|dr|drive|hwy|highway|ln|lane|pl|place)$/.test(m[3]) ? ` ${m[3]}` : ''}` : null
}
/** Same place: by street where both give one, else by name folded. Null where neither can say. */
export const samePlace = (ours: ListedNight, f: Found): boolean | null => {
  const a = street(ours.venue_address)
  const b = street(f.venueAddress)
  if (a && b) return a === b || (a.split(' ')[0] === b.split(' ')[0] && a.split(' ')[1] === b.split(' ')[1])
  if (!ours.venue_name || !f.venueName) return null
  const x = fold(ours.venue_name).replace(/^the /, '')
  const y = fold(f.venueName).replace(/^the /, '')
  return x === y || x.includes(y) || y.includes(x)
}
/**
 * A weekly night stated beside its own title: the first time written after the title (within 60 characters) is the night's
 * start, and its weekday is named in the 160 characters before the title (Murphy's: 'WEDNESDAY ... Front Bar Trivia 7pm')
 * or between the title and that time (Queen Victoria Market: 'The Melbourne Book Market Detail: Sat & Sun, 9am'). The FIRST
 * time after the title, never any time near it, so a Happy Hour's '4pm' beside the trivia never vouches for another start.
 */
export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
export function statedBesideTitle(html: string, title: string, iso: string, zone: string): boolean {
  const text = fold(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&#?[a-z0-9]+;/gi, ' '))
  const want = fold(title)
  if (want.length < 6) return false
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(iso))
  const day = (parts.find((p) => p.type === 'weekday')?.value ?? '').toLowerCase()
  const h = Number(parts.find((p) => p.type === 'hour')?.value)
  const mi = Number(parts.find((p) => p.type === 'minute')?.value)
  const ap = (parts.find((p) => p.type === 'dayPeriod')?.value ?? '').toLowerCase().replace(/\./g, '')
  if (!WEEKDAYS.includes(day) || !Number.isFinite(h)) return false
  const named = (s: string) => new RegExp(`\\b(${day}s?|${day.slice(0, 3)})\\b`).test(s)
  for (let at = text.indexOf(want); at >= 0; at = text.indexOf(want, at + 1)) {
    const after = text.slice(at + want.length, at + want.length + 60)
    const m = /\b(\d{1,2})(?: (\d{2}))? ?(am|pm)\b/.exec(after)
    if (!m) continue
    const sameTime = Number(m[1]) === h && Number(m[2] ?? 0) === mi && m[3] === ap
    if (sameTime && (named(text.slice(Math.max(0, at - 160), at)) || named(after.slice(0, m.index)))) return true
  }
  return false
}
/**
 * A monthly night stated in words: 'the second Saturday of every month ... from 9:00 am' (Bendigo Community Farmers Market,
 * read 7 November). The night must BE that weekday's nth (or last) in its month, and the first time written within 120
 * characters after the phrase must be its start.
 */
export const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, last: -1 }
export function statedMonthly(html: string, iso: string, zone: string): boolean {
  const text = fold(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&#?[a-z0-9]+;/gi, ' '))
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const day = get('weekday').toLowerCase()
  const date = Number(get('day'))
  const h = Number(get('hour'))
  const mi = Number(get('minute'))
  const ap = get('dayPeriod').toLowerCase().replace(/\./g, '')
  const daysInMonth = new Date(Number(get('year')), Number(get('month')), 0).getDate()
  const nth = Math.ceil(date / 7)
  const last = date + 7 > daysInMonth
  const re = new RegExp(`\\b(first|second|third|fourth|1st|2nd|3rd|4th|last) ${day} of (?:every|each|the) month\\b`, 'g')
  for (const m of text.matchAll(re)) {
    const want = ORDINALS[m[1]]
    if (!(want === nth || (want === -1 && last))) continue
    const t = /\b(\d{1,2})(?: (\d{2}))? ?(am|pm)\b/.exec(text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 120))
    if (t && Number(t[1]) === h && Number(t[2] ?? 0) === mi && t[3] === ap) return true
  }
  return false
}
/** A night's own parts in its zone: weekday, day of month, its ISO day, and its start as hour, minute and am or pm. */
export function nightParts(iso: string, zone: string) {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    day: get('weekday').toLowerCase(), date: Number(get('day')), h: Number(get('hour')), mi: Number(get('minute')),
    ap: get('dayPeriod').toLowerCase().replace(/\./g, ''),
    ymd: new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)),
  }
}
export const visibleFolded = (html: string) =>
  fold(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&#?[a-z0-9]+;/gi, ' '))
export const firstTimeIs = (s: string, p: ReturnType<typeof nightParts>) => {
  const t = /\b(\d{1,2})(?: (\d{2}))? ?(am|pm)\b/.exec(s)
  return Boolean(t && Number(t[1]) === p.h && Number(t[2] ?? 0) === p.mi && t[3] === p.ap)
}

/**
 * A dated gig list: 'SATURDAY 7TH CARL & MATTY O 7:00 pm' (Aireys Pub, read 7 November), the weekday and the day of the month
 * with no month beside them. The two together pin one date within the few months such a list holds; the first time within
 * 60 characters after must be the night's start.
 */
export function statedInGigList(html: string, iso: string, zone: string): boolean {
  const p = nightParts(iso, zone)
  const re = new RegExp(`\\b${p.day} ${p.date}(?:st|nd|rd|th)\\b`, 'g')
  const text = visibleFolded(html)
  for (const m of text.matchAll(re)) if (firstTimeIs(text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 60), p)) return true
  return false
}

/**
 * Every weekday inside a stated range: 'Thursday, October 08, 2026 - Thursday, December 17, 2026 10.30am, Every Thursday during
 * school terms' (the Eureka Centre's Show-and-Tell, read 7 November). The night falls inside the range, on the weekday the
 * page says every, and the first time after the range is its start.
 */
export const MONTH_NUMBER: Record<string, string> = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' }
export function statedEveryInRange(html: string, iso: string, zone: string): boolean {
  const p = nightParts(iso, zone)
  const text = visibleFolded(html)
  if (!new RegExp(`\\bevery ${p.day}\\b`).test(text)) return false
  const M = Object.keys(MONTH_NUMBER).join('|')
  const re = new RegExp(`(?:[a-z]+ )?(${M}) (\\d{1,2}) (\\d{4}) (?:[a-z]+ )?(${M}) (\\d{1,2}) (\\d{4})`, 'g')
  for (const m of text.matchAll(re)) {
    const from = `${m[3]}-${MONTH_NUMBER[m[1]]}-${m[2].padStart(2, '0')}`
    const to = `${m[6]}-${MONTH_NUMBER[m[4]]}-${m[5].padStart(2, '0')}`
    if (from <= p.ymd && p.ymd <= to && firstTimeIs(text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 40), p)) return true
  }
  return false
}
export const localDay = (iso: string, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
export const clock = (iso: string, zone: string) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).replace(/\u202f/g, ' ')

/**
 * One night judged on one page: the sweep's per night decision, unchanged but for returning what it found. `found` is what
 * the page's rule or the generic reader read from it; `links` are this night's own booking links; `recurring` is true when
 * its series is not a single night.
 */
export function judgeNight(
  e: ListedNight,
  recurring: boolean,
  body: string,
  found: readonly Found[],
  links: readonly { price_from_cents: number | null; availability: string }[],
): NightJudgement {
  const out: NightJudgement = { facts: [], pattern: undefined, unread: null }
  const page = { body }
  const zone = e.timezone ?? 'Australia/Melbourne'
  // recurring: the series rule is not once (the caller reads it)
  const mine = found.filter((f) => alike(f.title, e.title))
  const at = mine.find((f) => timed(f) && sameMinute(f.startsAt, e.start_date)) ?? (found.length === 1 && timed(found[0]) && sameMinute(found[0].startsAt, e.start_date) ? found[0] : undefined)
  if (at) {
    out.facts.push({ field: 'start', ok: true, detail: clock(e.start_date, zone) })
    const place = samePlace(e, at)
    if (place !== null) out.facts.push({ field: 'venue', ok: place, detail: `ours '${e.venue_name}' (${e.venue_address ?? 'no address'}), the page '${at.venueName}' (${at.venueAddress ?? 'no address'})` })
    const theirs = at.links.find((l) => l.priceFromCents !== null)?.priceFromCents ?? null
    const ours = links.find((l) => l.price_from_cents !== null)?.price_from_cents ?? null
    if (theirs !== null && ours !== null) out.facts.push({ field: 'price', ok: theirs === ours, detail: `ours $${(ours / 100).toFixed(2)}, the page $${(theirs / 100).toFixed(2)}` })
    const soldOut = at.links.length > 0 && at.links.every((l) => l.availability === 'sold_out')
    const oursOnSale = links.some((l) => l.availability === 'on_sale')
    out.facts.push({ field: 'status', ok: !at.calledOff && !(soldOut && oursOnSale), detail: at.calledOff ? 'the page calls it postponed or rescheduled' : soldOut && oursOnSale ? 'the page says sold out; we show it on sale' : 'as stated' })
    return out
  }
  const words = statedInWords(page.body, e.start_date, zone)
  // Asked of every listing, not only a weekly series: the libraries' storytimes are stored one dated night at a time, and
  // their page states each branch's weekday and start under the session's own heading (37 nights read so, 7 November).
  const weekly = words !== 'both' ? statedWeekly(page.body, e.title, e.venue_name ?? '', e.start_date, zone) : null
  if (words === 'both' || weekly === 'weekly') { out.pattern = 'weekly_words'; out.facts.push({ field: 'start', ok: true, detail: `${clock(e.start_date, zone)} (in the page's words)` }); return out }
  if (statedInGigList(page.body, e.start_date, zone)) { out.pattern = 'dated_gig_list'; out.facts.push({ field: 'start', ok: true, detail: `${clock(e.start_date, zone)} (its dated gig list)` }); return out }
  if (statedEveryInRange(page.body, e.start_date, zone)) { out.pattern = 'every_in_range'; out.facts.push({ field: 'start', ok: true, detail: `${clock(e.start_date, zone)} (every weekday in its stated range)` }); return out }
  if (statedMonthly(page.body, e.start_date, zone)) { out.pattern = 'monthly_words'; out.facts.push({ field: 'start', ok: true, detail: `${clock(e.start_date, zone)} (its monthly words)` }); return out }
  if (statedBesideTitle(page.body, e.title, e.start_date, zone)) { out.pattern = 'weekly_beside_title'; out.facts.push({ field: 'start', ok: true, detail: `${clock(e.start_date, zone)} (its weekday and start beside its title)` }); return out }
  if (weekly === 'outside_term') { out.pattern = null; out.facts.push({ field: 'start', ok: false, detail: `ours ${clock(e.start_date, zone)}, outside the term the page states` }); return out }
  // A season stated in one sentence (fbbg.org.au: 'Free Tours on Sunday at 11.00a.m. during September, ...'), 7 November.
  const seasonal = statedSeasonal(page.body, e.title, e.start_date, zone)
  if (seasonal === 'seasonal') { out.pattern = 'season_words'; out.facts.push({ field: 'start', ok: true, detail: `${clock(e.start_date, zone)} (its season in words)` }); return out }
  // The CONTROLLER's 17:05 bar: what a person reads is never 'silent' (a festival's gates; a dated list beside the title).
  if (statedUnderName(page.body, e.title, e.start_date, zone)) { out.pattern = 'under_name'; out.facts.push({ field: 'start', ok: true, detail: `${clock(e.start_date, zone)} (its days and hours under its name)` }); return out }
  if (statedDailyInRange(page.body, e.start_date, zone)) { out.pattern = 'daily_in_range'; out.facts.push({ field: 'start', ok: true, detail: `${clock(e.start_date, zone)} (its daily time over its stated range)` }); return out }
  if (statedByGates(page.body, e.start_date, zone)) { out.pattern = 'gates'; out.facts.push({ field: 'start', ok: true, detail: `${clock(e.start_date, zone)} (its gates)` }); return out }
  const every = statedEveryWeekday(page.body, e.title, e.start_date, zone)
  if (every === 'weekly') { out.pattern = 'every_weekday'; out.facts.push({ field: 'start', ok: true, detail: `${clock(e.start_date, zone)} (every weekday under its title)` }); return out }
  if (every === 'in_break') { out.pattern = null; out.facts.push({ field: 'start', ok: false, detail: `ours ${clock(e.start_date, zone)}, inside a break the page states` }); return out }
  if (statedInDatedList(page.body, e.title, e.start_date, zone)) { out.pattern = 'dated_list'; out.facts.push({ field: 'start', ok: true, detail: `${clock(e.start_date, zone)} (its dated list and session time)` }); return out }
  if (seasonal === 'outside_season') { out.pattern = null; out.facts.push({ field: 'start', ok: false, detail: `ours ${clock(e.start_date, zone)}, outside the months the page states` }); return out }
  const timedMine = mine.filter(timed)
  if (timedMine.length > 0 && !recurring) {
    out.facts.push({ field: 'start', ok: false, detail: `ours ${clock(e.start_date, zone)}; the page states ${timedMine.slice(0, 4).map((f) => clock(f.startsAt, zone)).join(', ')}` })
    return out
  }
  const day = localDay(e.start_date, zone)
  const why = words === 'date' || mine.some((f) => !timed(f) && localDay(f.startsAt, zone) === day)
    ? 'the page states the date and no start time the readers can find'
    : found.length > 0
      ? 'the page does not state this night (it may have ended its run, been cancelled or moved)'
      : 'no reader of ours finds a night on this page'
  out.pattern = null
  out.unread = why
  return out
}

/** The verdict a re-read acts on: agree (its start stated, nothing wrong on venue or status), disagree, or unread. */
export function verdictOf(j: NightJudgement): { verdict: 'agree' | 'disagree' | 'unread'; field: NightFact['field'] | null; detail: string } {
  const wrong = j.facts.find((f) => (f.field === 'start' || f.field === 'venue' || f.field === 'status') && !f.ok)
  if (wrong) return { verdict: 'disagree', field: wrong.field, detail: wrong.detail }
  const start = j.facts.find((f) => f.field === 'start' && f.ok)
  if (start) return { verdict: 'agree', field: null, detail: start.detail }
  return { verdict: 'unread', field: null, detail: j.unread ?? 'not judged' }
}
