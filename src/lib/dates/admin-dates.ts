/**
 * DATES IN THE ADMIN READ AS PEOPLE READ THEM (the PM's 02:45 of 16 November 2026, fix 4): '2026-12-13' becomes
 * '13 Dec 2026' and '2026-12-09 08:30' becomes 'Wed 9 Dec, 8:30 am', in Melbourne's time, on Today's Command Centre, the
 * events list and an event's own page. A bare calendar date ('2026-12-13', a plan gate's due day) is a day, never an
 * instant, so it is never moved by a time zone.
 */
const ZONE = 'Australia/Melbourne'
const BARE_DAY = /^\d{4}-\d{2}-\d{2}$/

/** '13 Dec 2026'. */
export function dayDate(value: string): string {
  const bare = BARE_DAY.test(value)
  const at = bare ? new Date(`${value}T12:00:00Z`) : new Date(value)
  if (Number.isNaN(at.getTime())) return value
  return new Intl.DateTimeFormat('en-AU', { timeZone: bare ? 'UTC' : ZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(at)
}

/** 'Wed 9 Dec, 8:30 am' (the year is added when it is not the year of `now`). */
export function dayTime(value: string, now: Date = new Date()): string {
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return value
  const part = (opts: Intl.DateTimeFormatOptions, d: Date) =>
    Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: ZONE, ...opts }).formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>
  const p = part({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }, at)
  const thisYear = part({ year: 'numeric' }, now).year
  const clock = `${p.hour}:${p.minute} ${String(p.dayPeriod ?? '').toLowerCase()}`.trim()
  return `${p.weekday} ${p.day} ${p.month}${p.year !== thisYear ? ` ${p.year}` : ''}, ${clock}`
}
