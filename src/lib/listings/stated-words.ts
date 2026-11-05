/**
 * WHAT A SOURCE PAGE STATES IN ITS OWN WORDS (the engine verifier's reading of pages no reader of ours parses; the
 * CONTROLLER's 16:20 of 5 November 2026: 'a night the readers cannot parse is judged, not left unjudged'). Pure: no fetch,
 * no database. Two shapes a page states a night in:
 *   a DATED page names the night's date and, near it, its time ('Thursday 26 November ... 7.30pm');
 *   a WEEKLY TIMETABLE names the session under its own heading, then the venue, its weekday and its start
 *   ('Baby Rhyme Time' ... 'Bendigo Library: Friday, 10.30-11am'), inside the terms the page states.
 */
import { fold } from './headline-hunt'

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Entities and the spaces pages write their times with, decoded to plain text. */
function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;|&mdash;/g, '-')
    .replace(/&amp;/g, '&')
    .replace(/[   ]/g, ' ')
}

/** The visible text, one line per block element, lower case. */
function visibleLines(html: string): string[] {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/?(br|p|div|li|ul|ol|h[1-6]|tr|td|th|section|article|header|footer|table|dd|dt)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean)
}

/** The night's local clock in its zone. */
function localParts(iso: string, zone: string) {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-AU', { timeZone: zone, ...o }).format(new Date(iso))
  const h24 = Number(f({ hour: '2-digit', hourCycle: 'h23' }))
  const min = f({ minute: '2-digit' }).padStart(2, '0')
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  return { h24, h12: h24 % 12 || 12, min, ampm: h24 < 12 ? 'am' : 'pm', ymd, weekday: f({ weekday: 'long' }).toLowerCase() }
}

/**
 * Whether a page's visible text names the night's local date ('Thursday 26 November', '26 Nov', '07 NOVEMBER', 'November 26', '26/11')
 * and, within 300 characters of it, its local time ('7:00pm', '7.00pm', '7pm', '7:00 pm', '19:00'). 'both', 'date' or null.
 */
export function statedInWords(html: string, iso: string, zone: string): 'both' | 'date' | null {
  const text = visibleLines(html).join(' ').replace(/\s+(am|pm)\b/g, '$1')
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-AU', { timeZone: zone, ...o }).format(new Date(iso)).toLowerCase()
  const d = part({ day: 'numeric' })
  const dd = d.padStart(2, '0')
  const m = part({ month: 'numeric' })
  const mm = m.padStart(2, '0')
  const monthLong = part({ month: 'long' })
  const monthShort = monthLong.slice(0, 3)
  // A leading zero too ('07 NOVEMBER 2026', 'SAT 07 NOV'): tour sites write the day that way (Red Hot Summer Tour, 5 November).
  const dateForms = [...new Set([`${d} ${monthLong}`, `${d} ${monthShort}`, `${dd} ${monthLong}`, `${dd} ${monthShort}`, `${monthLong} ${d}`, `${monthShort} ${d}`, `${dd}/${mm}`, `${d}/${m}/`])]
  const { h24, h12, min, ampm } = localParts(iso, zone)
  const timeForms = [`${h12}:${min}${ampm}`, `${h12}.${min}${ampm}`, `${String(h24).padStart(2, '0')}:${min}`, ...(min === '00' ? [`${h12}${ampm}`] : [])]
  const at = (form: string) => {
    const out: number[] = []
    for (let i = text.indexOf(form); i >= 0; i = text.indexOf(form, i + 1)) {
      const before = text[i - 1] ?? ' '
      const after = text[i + form.length] ?? ' '
      if (!/[a-z0-9]/.test(before) && !/[0-9]/.test(after)) out.push(i)
    }
    return out
  }
  const dates = dateForms.flatMap(at)
  if (dates.length === 0) return null
  const times = timeForms.flatMap(at)
  return dates.some((i) => times.some((j) => Math.abs(i - j) <= 300)) ? 'both' : 'date'
}

/**
 * Whether one timetable line states the night's weekday ('Friday', 'Fridays', 'Tuesday & Thursday') and its start: the
 * first time of a range or a time standing alone ('10.30-11am', '10-10.30am', '9.45am', '19:00'), never a range's end,
 * with the next am or pm the night's own (or a morning range ending at 12 pm).
 */
function statesWeekdayAndStart(line: string, p: ReturnType<typeof localParts>): boolean {
  if (!new RegExp(`\\b${p.weekday}s?\\b`).test(line)) return false
  const notAfter = String.raw`(?<![\d.:])(?<![-–—]\s?)`
  const forms = [
    { re: new RegExp(`${notAfter}${String(p.h24).padStart(2, '0')}:${p.min}(?!\\d)`), clock24: true },
    { re: new RegExp(`${notAfter}${p.h12}[.:]${p.min}(?!\\d)`), clock24: false },
    ...(p.min === '00' ? [{ re: new RegExp(`${notAfter}${p.h12}(?![\\d.:])`), clock24: false }] : []),
  ]
  return forms.some(({ re, clock24 }) => {
    const hit = re.exec(line)
    if (!hit) return false
    if (clock24 && p.h24 >= 13) return true
    const rest = line.slice(hit.index + hit[0].length)
    const marker = /(am|pm)\b/.exec(rest)?.[1]
    if (marker === p.ampm) return true
    return p.ampm === 'am' && marker === 'pm' && /^\s*[-–—]\s*12([.:]\d\d)?\s*pm/.test(rest)
  })
}

/** Every date range the page states ('Monday 5 October - Friday 11 December'), as local YYYY-MM-DD pairs in that year. */
function termRanges(text: string, year: number): [string, string][] {
  const M = MONTHS.join('|')
  const W = '(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\\s+)?'
  const re = new RegExp(`${W}(\\d{1,2})\\s+(${M})\\s*[-–—]\\s*${W}(\\d{1,2})\\s+(${M})`, 'g')
  const ymd = (y: number, month: string, day: string) => `${y}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`
  return [...text.matchAll(re)].map((m) => {
    const from = ymd(year, m[2], m[1])
    const to = ymd(year, m[4], m[3])
    return [from, to < from ? ymd(year + 1, m[4], m[3]) : to] as [string, string]
  })
}

/**
 * A WEEKLY TIMETABLE'S STATEMENT OF THE NIGHT. Under a heading that is the night's title exactly (folded: 'Storytime',
 * never 'Saturday Storytime'), the first line naming its venue states its weekday and its start. 'weekly' when it does
 * and the night falls inside a term the page states (or the page states none); 'outside_term' when it does but the night
 * falls outside every term the page states (listed for a person, never passed); null when the page does not state it.
 */
export function statedWeekly(html: string, title: string, venue: string, iso: string, zone: string): 'weekly' | 'outside_term' | null {
  const want = fold(title)
  const place = fold(venue)
  if (!want || !place) return null
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    text: fold(decode(m[2].replace(/<[^>]+>/g, ' '))),
  }))
  const p = localParts(iso, zone)
  const stated = headings.some((h, k) => {
    if (h.text !== want) return false
    const section = html.slice(h.end, headings[k + 1]?.start ?? h.end + 6000)
    const line = visibleLines(section).find((l) => ` ${fold(l)} `.includes(` ${place} `))
    return line !== undefined && statesWeekdayAndStart(line, p)
  })
  if (!stated) return null
  const terms = termRanges(visibleLines(html).join('\n'), Number(p.ymd.slice(0, 4)))
  return terms.length > 0 && !terms.some(([from, to]) => from <= p.ymd && p.ymd <= to) ? 'outside_term' : 'weekly'
}
