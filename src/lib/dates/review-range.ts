/**
 * THE EVENT'S TIME ON THE REVIEW STEP, AS A PERSON READS IT (the PM's score of 14 November 2026, 22:42, fix 1).
 *
 * The review step printed "5 Dec 2026, 7:00 pm -> 5 Dec 2026, 10:00 pm" with "Australia/Melbourne" under it: the date
 * twice and a time zone id. This writes one date when the start and the end share a day, and the zone as its city:
 *   "Sat 5 Dec 2026, 7:00 to 10:00 pm, Melbourne time"
 *   "Sat 5 Dec 2026, 11:00 am to 2:00 pm, Melbourne time"
 *   "Sat 5 Dec 2026, 9:00 pm to Sun 6 Dec 2026, 2:00 am, Melbourne time"
 * The inputs are the form's own local values ("YYYY-MM-DDTHH:mm", already in the event's zone), so nothing is
 * converted here and the words match what the organiser typed.
 */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type Parts = { y: number; m: number; d: number; h: number; min: number }

function parse(local: string): Parts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!match) return null
  const [y, m, d, h, min] = match.slice(1).map(Number)
  return { y, m, d, h, min }
}

function dayOf(p: Parts): string {
  const weekday = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()
  return `${DAYS[weekday]} ${p.d} ${MONTHS[p.m - 1]} ${p.y}`
}

function clock(p: Parts): { time: string; meridiem: 'am' | 'pm' } {
  const meridiem = p.h < 12 ? 'am' : 'pm'
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12
  return { time: `${h12}:${String(p.min).padStart(2, '0')}`, meridiem }
}

/** "Australia/Melbourne" reads as "Melbourne time"; an unknown or empty zone adds nothing. */
export function zoneWords(timezone: string | null | undefined): string {
  const city = (timezone ?? '').split('/').pop()?.replace(/_/g, ' ').trim()
  return city ? `${city} time` : ''
}

export function formatReviewRange(startLocal: string, endLocal: string, timezone?: string | null): string {
  const start = parse(startLocal)
  if (!start) return '-'
  const end = parse(endLocal)
  const zone = zoneWords(timezone)
  const tail = zone ? `, ${zone}` : ''
  const s = clock(start)
  if (!end) return `${dayOf(start)}, ${s.time} ${s.meridiem}${tail}`
  const e = clock(end)
  const sameDay = start.y === end.y && start.m === end.m && start.d === end.d
  if (sameDay) {
    const from = s.meridiem === e.meridiem ? s.time : `${s.time} ${s.meridiem}`
    return `${dayOf(start)}, ${from} to ${e.time} ${e.meridiem}${tail}`
  }
  return `${dayOf(start)}, ${s.time} ${s.meridiem} to ${dayOf(end)}, ${e.time} ${e.meridiem}${tail}`
}
