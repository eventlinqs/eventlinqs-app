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
  // Its ordinal too ('WEDNESDAY 23RD DECEMBER 2026', Carols by Candlelight Geelong, 7 November): 1st, 2nd, 3rd, 11th to 13th, 21st.
  const n = Number(d)
  const ord = `${d}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`
  const dateForms = [...new Set([`${d} ${monthLong}`, `${d} ${monthShort}`, `${dd} ${monthLong}`, `${dd} ${monthShort}`, `${ord} ${monthLong}`, `${ord} ${monthShort}`, `${monthLong} ${d}`, `${monthShort} ${d}`, `${dd}/${mm}`, `${d}/${m}/`])]
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
  // A hyphen, an en dash or an em dash (written as escapes: no dash character lives in src, law 6's guard).
  const notAfter = String.raw`(?<![\d.:])(?<![-\u2013\u2014]\s?)`
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
    return p.ampm === 'am' && marker === 'pm' && /^\s*[-\u2013\u2014]\s*12([.:]\d\d)?\s*pm/.test(rest)
  })
}

/** Every date range the page states ('Monday 5 October - Friday 11 December'), as local YYYY-MM-DD pairs in that year. */
function termRanges(text: string, year: number): [string, string][] {
  const M = MONTHS.join('|')
  const W = '(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\\s+)?'
  const re = new RegExp(`${W}(\\d{1,2})\\s+(${M})\\s*[-\\u2013\\u2014]\\s*${W}(\\d{1,2})\\s+(${M})`, 'g')
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

/**
 * A SEASON'S STATEMENT OF THE NIGHT, IN ONE SENTENCE (fbbg.org.au, 7 November 2026: 'Free Tours on Sunday at 11.00a.m.
 * during September, October, November, February, March April. No need to book.'). The sentence must name a word of the
 * night's title (four letters or more, a weekday name aside), the night's weekday and its start ('a.m.' read as 'am'),
 * and the months it runs: 'seasonal' when the night's month is one of them; 'outside_season' when the weekday and start
 * are stated but its month is not (listed for a person, never passed); null when no sentence states it. Another sentence
 * on the same page (a meeting on the 4th Wednesday at 10.00 a.m.) never vouches for the night.
 */
export function statedSeasonal(html: string, title: string, iso: string, zone: string): 'seasonal' | 'outside_season' | null {
  const p = localParts(iso, zone)
  const words = fold(title)
    .split(' ')
    .filter((w) => w.length >= 4 && !w.endsWith('day'))
  if (words.length === 0) return null
  const month = MONTHS[Number(p.ymd.slice(5, 7)) - 1]
  /* A sentence never crosses a line (a block element): joined, Gallery Tots' title, its 'Every Friday, 9.30 to 10.15am'
     and its break 'No sessions from Friday 18 December 2026 to Friday 22 January 2027' read as one season of December
     and January (the first sweep with this reader, 7 November 16:45). */
  const sentences = visibleLines(html).flatMap((line) => line.replace(/([ap])\.m\.?/g, '$1m').split(/(?<=[.!?])\s+/))
  let outside = false
  for (const s of sentences) {
    // A sentence that says there is none (a break, a closure, an exception) is never a season.
    if (/\b(no (sessions?|tours?|classes|events?)|closed|except|excluding|not (running|held|on))\b/.test(s)) continue
    if (!words.some((w) => new RegExp(`\\b${w}`).test(s))) continue
    const named = MONTHS.filter((m) => new RegExp(`\\b${m}\\b`).test(s))
    if (named.length === 0 || !statesWeekdayAndStart(s, p)) continue
    if (named.includes(month)) return 'seasonal'
    outside = true
  }
  return outside ? 'outside_season' : null
}

/**
 * EVERY WEEKDAY UNDER ITS TITLE (geelonggallery.org.au, 7 November 2026: 'Gallery Tots', then 'Every Friday, 9.30 to
 * 10.15am', then 'No sessions from Friday 18 December 2026 to Friday 22 January 2027'). Within the three lines after a line
 * that is the night's title, a line 'every <weekday>' whose first time is the night's start: a range's am or pm, written
 * once after its end, is the start's too. 'weekly' when it is and the night is outside every break the page states
 * ('no sessions from <date> to <date>'); 'in_break' when it falls inside one (a wrong fact, never a pass); null otherwise.
 */
export function statedEveryWeekday(html: string, title: string, iso: string, zone: string): 'weekly' | 'in_break' | null {
  const want = fold(title)
  if (want.length < 4) return null
  const p = localParts(iso, zone)
  const lines = visibleLines(html)
  const range = /(?<![\d.:])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/
  const stated = lines.some((l, i) => {
    if (fold(l) !== want) return false
    return lines.slice(i + 1, i + 4).some((n) => {
      if (!new RegExp(`\\bevery\\s+${p.weekday}\\b`).test(n)) return false
      const m = range.exec(n)
      const startMin = m
        ? ((Number(m[1]) % 12) + ((m[3] ?? m[6]) === 'pm' ? 12 : 0)) * 60 + Number(m[2] ?? 0)
        : clockTimes(n)[0]
      return startMin === minutesOf(p)
    })
  })
  if (!stated) return null
  const breaks = lines
    .filter((l) => /\bno (sessions?|classes|tours?)\b/.test(l))
    .flatMap((l) => {
      const dates = [...l.matchAll(new RegExp(`(\\d{1,2})\\s+(${MONTHS.join('|')})\\s+(\\d{4})`, 'g'))].map(
        (d) => `${d[3]}-${String(MONTHS.indexOf(d[2]) + 1).padStart(2, '0')}-${d[1].padStart(2, '0')}`,
      )
      return dates.length === 2 ? [[dates[0], dates[1]] as const] : []
    })
  return breaks.some(([from, to]) => from <= p.ymd && p.ymd <= to) ? 'in_break' : 'weekly'
}

/**
 * A DAILY TIME OVER A STATED RANGE OF DATES (caravanshow.com.au, 7 November 2026: '20th November - 22nd November 2026:',
 * '9am - 4pm - Fri - Sun'). True when a line states a range of dates (ordinals allowed, the first month taken from the
 * second when it is not written) that holds the night's date, and the page states exactly one daily time line (a time range,
 * then perhaps its days, 'Fri - Sun'), whose start is the night's and whose days, when written, hold the night's weekday.
 * The middle days of a range are named by the range alone; a person reads them in one look.
 */
export function statedDailyInRange(html: string, iso: string, zone: string): boolean {
  const p = localParts(iso, zone)
  const lines = visibleLines(html)
  const M = MONTHS.join('|')
  const span = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(${M}))?\\s*(?:-|to)\\s*(?:[a-z]+day\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${M}),?\\s+(\\d{4})`, 'g')
  const ymd = (y: string, mon: string, day: string) => `${y}-${String(MONTHS.indexOf(mon) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`
  const inRange = lines.some((l) =>
    [...l.matchAll(span)].some((m) => ymd(m[5], m[2] ?? m[4], m[1]) <= p.ymd && p.ymd <= ymd(m[5], m[4], m[3])),
  )
  if (!inRange) return false
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const daily = new RegExp(
    `^\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)\\s*(?:-|to)\\s*\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)(?:\\s*-\\s*(${DAYS.join('|')})[a-z]*\\s*(?:-|to)\\s*(${DAYS.join('|')})[a-z]*)?\\s*$`,
  )
  const stated = lines.map((l) => daily.exec(l)).filter((m): m is RegExpExecArray => m !== null)
  const starts = new Set(stated.map((m) => ((Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0)) * 60 + Number(m[2] ?? 0)))
  if (starts.size !== 1 || !starts.has(minutesOf(p))) return false
  const day = DAYS.indexOf(p.weekday.slice(0, 3))
  return stated.every((m) => {
    if (!m[4] || !m[5]) return true
    const from = DAYS.indexOf(m[4])
    const to = DAYS.indexOf(m[5])
    return from <= to ? from <= day && day <= to : day >= from || day <= to
  })
}

/** Every clock time on one lowercased line ('12:30pm', '6.00 pm', '7pm', '19:00'), as minutes past midnight, in order. */
function clockTimes(line: string): number[] {
  const out: number[] = []
  const re = /(?<![\d.:])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b|(?<![\d.:])([01]?\d|2[0-3]):(\d{2})(?!\d)/g
  for (const m of line.replace(/([ap])\.m\.?/g, '$1m').matchAll(re)) {
    if (m[3]) out.push(((Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0)) * 60 + Number(m[2] ?? 0))
    else out.push(Number(m[4]) * 60 + Number(m[5]))
  }
  return out
}
const minutesOf = (p: ReturnType<typeof localParts>) => p.h24 * 60 + Number(p.min)

/**
 * A FESTIVAL DAY STARTS AT ITS GATES (redhotsummertour.com.au, 7 November 2026: '07 NOVEMBER 2026', '12:30pm ═ GATES',
 * then each act's set). True when the page states the night's date and exactly one gates time, and that time is the
 * night's start. A set time is never the start; a page of several gates times names none.
 */
export function statedByGates(html: string, iso: string, zone: string): boolean {
  if (statedInWords(html, iso, zone) === null) return false
  const gates = new Set(visibleLines(html).filter((l) => /\bgates?\b/.test(l)).map((l) => clockTimes(l)[0]).filter((t) => t !== undefined))
  return gates.size === 1 && gates.has(minutesOf(localParts(iso, zone)))
}

/**
 * A NIGHT LISTED BY DATE BESIDE ITS TITLE, WITH THE PAGE'S ONE SESSION TIME (sovereignhill.com.au, 7 November 2026: 'Friday
 * 13 November: 12 COLLABORATION', 'Friday 13 March: 09 ESSENCE', ... and once '6:00pm-8:00pm AEDT'). True when one line names
 * the night's date (its weekday, if written, its own) and a word of its title, and the page states exactly one session time
 * (a line that is only a time or a time range), which is the night's start. Opening hours carry other words and are never a
 * session; two session times name no start.
 */
export function statedInDatedList(html: string, title: string, iso: string, zone: string): boolean {
  const p = localParts(iso, zone)
  const lines = visibleLines(html)
  const words = fold(title)
    .split(' ')
    .filter((w) => w.length >= 4 && !w.endsWith('day') && !MONTHS.includes(w))
  if (words.length === 0) return false
  const [, mm, dd] = p.ymd.split('-')
  const month = MONTHS[Number(mm) - 1]
  const dated = new RegExp(`(?:^|[^0-9])${Number(dd)}(?:st|nd|rd|th)?\\s+${month}\\b`)
  const weekdayNamed = /\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/
  const listed = lines.some(
    (l) => dated.test(l) && words.some((w) => new RegExp(`\\b${w}\\b`).test(l)) && (!weekdayNamed.test(l) || new RegExp(`\\b${p.weekday}\\b`).test(l)),
  )
  if (!listed) return false
  const sessions = new Set(
    lines
      .filter((l) => /^\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\s*(?:(?:-|to)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)?\s*(?:aedt|aest)?\s*$/.test(l))
      .map((l) => clockTimes(l)[0])
      .filter((t) => t !== undefined),
  )
  return sessions.size === 1 && sessions.has(minutesOf(p))
}
