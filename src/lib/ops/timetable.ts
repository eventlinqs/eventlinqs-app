/**
 * THE DAILY TIMETABLE OF THE ENGINE, ONE TABLE (Lawal, 20 November 2026, 00:17: "everything live every day by 6 am ...
 * the engine knows the estimate ... a real hierarchy and a real structure"; locked in
 * C:\dev\START-16OCT\DAILY-TIMETABLE-LOCKED-20NOV.md; the PM's order of that night, train Y). Every phase, its slot and its
 * cutoff, in Melbourne time, and the existing run it rides: no new cron and no quickened one (law 14 (d), law 20). Every
 * run reads its phase from here; scripts/guards/timetable-is-the-one-schedule.mjs refuses a vercel.json schedule this
 * table does not name.
 *
 * WORKING BACKWARDS FROM THE CUTOFF: each morning a phase's start is its cutoff minus today's count times the 90th
 * percentile time per unit over the last 14 days of its runs (ops_phase_runs), plus half again, and never less than 15
 * minutes; a phase whose start falls before its slot is late before it begins and goes to the founder queue (plannedStart
 * and lateBy below). Pure.
 */

export const TIMETABLE_ZONE = 'Australia/Melbourne'

/** The existing scheduled runs a phase can ride, each with its vercel.json path and schedule (UTC). */
export const RIDES = {
  // 03:25, 09:25, 15:25 and 21:25 Melbourne in daylight time (UTC+11), so a full read lands before the 04:40 freeze;
  // the same four runs a day as before ('25 */6 * * *'), none added or quickened (law 14 (d)). In standard time
  // (UTC+10, from April) the same UTC hours read 02:25, 08:25, 14:25 and 20:25.
  collection: { path: '/api/cron/collection-run', schedule: '25 4,10,16,22 * * *' },
  listings: { path: '/api/cron/listing-occurrences', schedule: '10 * * * *' },
  social: { path: '/api/cron/social-publish', schedule: '40 * * * *' },
  outreach: { path: '/api/cron/outreach-run', schedule: '*/15 * * * *' },
  heartbeat: { path: '/api/cron/health-heartbeat', schedule: '0 21 * * *' },
  // 04:20 Melbourne in daylight time, inside verify (04:20 to 04:40); it ran at 05:00, after verify's cutoff, so verify
  // had no run in its window (the PM's 04:51 of 20 November 2026). The same one run a day, moved, never added.
  linkCheck: { path: '/api/cron/booking-link-check', schedule: '20 17 * * *' },
  // The engine verifier, a GitHub workflow (no Vercel cron): 04:20 Melbourne in daylight time, inside verify, moved from
  // 05:30 by the PM's 05:38 of 20 November 2026, the same once a day; it records 'verify' by scripts/ops/record-phase-run-api.mjs.
  // In standard time (from April) every UTC slot here reads an hour earlier and timetable-is-the-one-schedule names the phase.
  engineVerifier: { path: '.github/workflows/engine-verifier.yml', schedule: '20 17 * * *' },
} as const
export type Ride = keyof typeof RIDES

/**
 * WHAT ONE UNIT OF A RIDE'S WORK IS, where it is fixed whatever phase the ride serves (train AL, 20 November 2026): the
 * hourly listings run records nights under Collect, whose own unit is a source, and the board read '1171 sources'.
 * A ride not named here counts in its phase's unit.
 */
export const RIDE_UNITS: Partial<Record<Ride, string>> = { collection: 'source', listings: 'night', linkCheck: 'link', engineVerifier: 'night' }

/** The unit a run's count is said in: its ride's own, else its phase's. */
export function unitOfRun(phase: Pick<Phase, 'unit'>, ride: string | null): string {
  return (ride !== null && ride in RIDE_UNITS ? RIDE_UNITS[ride as Ride] : undefined) ?? phase.unit
}

export interface Phase {
  readonly key: string
  readonly label: string
  /** When it may start, Melbourne time, HH:MM; the day before when `nightBefore`. */
  readonly slot: string
  /** When its output must be live, Melbourne time, HH:MM. */
  readonly cutoff: string
  readonly nightBefore?: boolean
  /** What one unit of its work is, for the measured time per unit. */
  readonly unit: string
  readonly rides: readonly Ride[]
  readonly what: string
}

/** The day, in the locked document's order. */
export const PHASES: readonly Phase[] = [
  { key: 'prepare', label: 'Prepare tomorrow', slot: '22:00', cutoff: '23:30', nightBefore: true, unit: 'piece', rides: ['social', 'outreach'], what: "Tomorrow's posts drafted from the night's rows; tomorrow's letters drafted and passed through the gateway." },
  { key: 'collect', label: 'Collect', slot: '00:25', cutoff: '04:15', unit: 'source', rides: ['collection', 'listings'], what: 'Listing sources read; IndexNow sent for changes and ended nights.' },
  { key: 'verify', label: 'Verify', slot: '04:20', cutoff: '04:40', unit: 'night', rides: ['listings', 'linkCheck', 'engineVerifier'], what: 'Engine verifier, booking link sweep, ended nights off every list, structured data spot check.' },
  { key: 'freeze', label: 'Freeze and redraw', slot: '04:40', cutoff: '05:30', unit: 'piece', rides: ['social'], what: "Today's rows frozen; any piece whose facts changed drawn again; the publish gate run on every piece." },
  { key: 'schedule', label: 'Schedule', slot: '05:40', cutoff: '05:55', unit: 'piece', rides: ['social'], what: "Every passed piece scheduled into its band; the city guides revalidated." },
  { key: 'live', label: 'Live', slot: '06:00', cutoff: '06:00', unit: 'piece', rides: ['social'], what: 'The site current for today; the morning post published; the first story out.' },
  { key: 'queue', label: 'Queue', slot: '05:40', cutoff: '05:55', unit: 'letter', rides: ['outreach'], what: "The day's acquisition and permission letters queued, each CLEARED_TO_SEND, before the window opens at 06:00 (law 44)." },
  { key: 'report', label: 'Report', slot: '08:00', cutoff: '08:00', unit: 'area', rides: ['heartbeat'], what: 'The morning report emailed to Lawal from production records.' },
  { key: 'send', label: 'Send', slot: '06:00', cutoff: '08:59', unit: 'letter', rides: ['outreach'], what: 'Letters sent Monday to Saturday from 06:00, out before 09:00 in their city, spread across the window (law 44).' },
  { key: 'inbox', label: 'Inbox', slot: '07:00', cutoff: '22:00', unit: 'message', rides: ['outreach'], what: 'hello@ and lawal@ read every 15 minutes; replies matched, classified and answered or raised.' },
  { key: 'midday', label: 'Midday post', slot: '12:00', cutoff: '12:00', unit: 'piece', rides: ['social'], what: 'Feed post and story for the week ahead or a venue spotlight.' },
  { key: 'tonight', label: 'Tonight', slot: '17:30', cutoff: '17:30', unit: 'piece', rides: ['social'], what: 'Tonight story and evening feed post.' },
  { key: 'evening', label: 'Evening story', slot: '19:00', cutoff: '19:00', unit: 'piece', rides: ['social'], what: 'Second story for tonight and this weekend.' },
]
export type PhaseKey = (typeof PHASES)[number]['key']

export function phaseOf(key: string): Phase {
  const p = PHASES.find((x) => x.key === key)
  if (!p) throw new Error(`no phase '${key}' in the timetable`)
  return p
}

/** Minutes after midnight of an HH:MM. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** The 90th percentile of a list of numbers (nearest rank); null for none. */
export function p90(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)]
}

/**
 * When a phase must start, in minutes after its day's midnight: its cutoff minus today's count times the 90th
 * percentile seconds per unit, plus half again, at least 15 minutes. With no measured runs yet, its slot.
 */
export function plannedStart(phase: Phase, count: number, secondsPerUnit: readonly number[]): number {
  // Minutes in the phase's own day: a night-before phase is measured on the evening before, so its slot and cutoff
  // compare directly.
  const cutoff = minutesOf(phase.cutoff)
  const unit = p90(secondsPerUnit)
  if (unit === null) return minutesOf(phase.slot)
  const needed = Math.max(15, Math.ceil(((count * unit) / 60) * 1.5))
  return cutoff - needed
}

/** How many minutes before its slot a phase would have to start to meet its cutoff; 0 when its slot is in time. */
export function lateBy(phase: Phase, count: number, secondsPerUnit: readonly number[]): number {
  return Math.max(0, minutesOf(phase.slot) - plannedStart(phase, count, secondsPerUnit))
}

/**
 * The phase an hourly social run (at 40 past, src/app/api/cron/social-publish) serves, by its Melbourne hour: the hour
 * whose slot it falls in. Null for an hour the timetable gives the social run nothing to do. Pure.
 */
export function socialPhaseAt(melbourneHour: number): PhaseKey | null {
  const byHour: Readonly<Record<number, PhaseKey>> = { 4: 'freeze', 5: 'schedule', 6: 'live', 12: 'midday', 17: 'tonight', 19: 'evening', 22: 'prepare', 23: 'prepare' }
  return byHour[melbourneHour] ?? null
}

/**
 * The phase a 15 minute outreach run (src/app/api/cron/outreach-run) serves, by its Melbourne minute of the day: the
 * queue 07:00 to 08:29, the send 08:30 to 10:30, the inbox otherwise from 07:00 to 22:00; null outside. Pure.
 */
export function outreachPhaseAt(melbourneMinutes: number): PhaseKey | null {
  // The engine plan of 21 November 2026 (section 3; law 44): queue 05:40 to 05:55, send 06:00 to 08:59, inbox to 22:00.
  if (melbourneMinutes < minutesOf('05:40') || melbourneMinutes > minutesOf('22:00')) return null
  if (melbourneMinutes < minutesOf('06:00')) return 'queue'
  if (melbourneMinutes < minutesOf('09:00')) return 'send'
  return 'inbox'
}

/** Minutes after midnight in Melbourne for an instant. Pure. */
export function melbourneMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: TIMETABLE_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return get('hour') * 60 + get('minute')
}

/**
 * A run's state for the day's board: done in time, running, late, failed, missed (the watchdog's alarm row,
 * src/lib/ops/missed-runs.ts: no run an hour past the cutoff), or not yet due. Pure.
 */
export function phaseState(
  phase: Phase,
  run: { readonly startedAt: string; readonly endedAt: string | null; readonly failed?: boolean; readonly ride?: string } | null,
  nowMinutes: number,
  endedMinutes: number | null,
): 'done' | 'running' | 'late' | 'failed' | 'missed' | 'not yet' {
  if (run?.ride === 'watchdog') return 'missed'
  if (run?.failed) return 'failed'
  if (run && run.endedAt) return endedMinutes !== null && endedMinutes > minutesOf(phase.cutoff) ? 'late' : 'done'
  if (run) return nowMinutes > minutesOf(phase.cutoff) ? 'late' : 'running'
  return nowMinutes > minutesOf(phase.cutoff) ? 'late' : 'not yet'
}
