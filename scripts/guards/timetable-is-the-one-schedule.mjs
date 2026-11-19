/**
 * GUARD: THE TIMETABLE IS THE ONE SCHEDULE (the daily timetable, locked 20 November 2026; the PM's order of that night,
 * train Y item 1: "One table in code (src/lib/ops/timetable.ts) holds every phase, its slot and its cutoff; every run
 * reads its phase from it; a guard refuses a schedule written anywhere else").
 *
 * The runs the phases ride are Vercel crons. This fails the build when vercel.json schedules one of them differently from
 * the table's RIDES (so a slot cannot be moved in one place and not the other), when a ride the table names has no cron,
 * or when a cron route under src/app/api/cron that a ride names reads a Melbourne hour of its own for a phase instead of
 * the table's socialPhaseAt or outreachPhaseAt. Reads src and vercel.json only (both on the build host).
 */
import { readFileSync } from 'node:fs'

const TAG = '[timetable-is-the-one-schedule]'
const TABLE = 'src/lib/ops/timetable.ts'
const table = readFileSync(TABLE, 'utf8').replace(/\r\n/g, '\n')
const ridesBlock = table.match(/export const RIDES = \{([\s\S]*?)\n\} as const/)
if (!ridesBlock) {
  console.error(`${TAG} FAIL: ${TABLE} has no RIDES table`)
  process.exit(1)
}
const rides = [...ridesBlock[1].matchAll(/(\w+): \{ path: '([^']+)', schedule: '([^']+)' \}/g)].map((m) => ({ ride: m[1], path: m[2], schedule: m[3] }))
const crons = JSON.parse(readFileSync('vercel.json', 'utf8')).crons ?? []
const faults = []
for (const r of rides) {
  const c = crons.find((x) => x.path === r.path)
  if (!c) faults.push(`the table's ride '${r.ride}' names ${r.path}, which vercel.json does not schedule`)
  else if (c.schedule !== r.schedule) faults.push(`vercel.json schedules ${r.path} at '${c.schedule}'; the timetable says '${r.schedule}'. Change both in one change, the table first.`)
}
// The phase-reading routes take their phase from the table, never from a clock of their own.
const PHASE_READERS = { 'src/app/api/cron/social-publish/route.ts': 'socialPhaseAt', 'src/app/api/cron/outreach-run/route.ts': 'outreachPhaseAt' }
for (const [file, reader] of Object.entries(PHASE_READERS)) {
  const text = readFileSync(file, 'utf8')
  if (!text.includes(`${reader}(`)) faults.push(`${file} records a timetable phase without the table's ${reader}`)
}

// NO PHASE IS SILENT (the PM's 04:51 of 20 November 2026: the walk found the 03:25 collection run had written no row, and
// verify, 04:20 to 04:40, had no run in its window at all: its link check fired at 05:00). Two rules, read from the
// table itself:
// (1) every ride's route records itself, by its own ride name, through recordPhaseRun;
for (const r of rides) {
  const file = `src/app${r.path}/route.ts`
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    faults.push(`the ride '${r.ride}' names ${r.path}, which has no route at ${file}`)
    continue
  }
  if (!text.includes('recordPhaseRun(') || !text.includes(`ride: '${r.ride}'`)) {
    faults.push(`${file} (the ride '${r.ride}') never records its run with ride: '${r.ride}', so the phases it serves have no row from it`)
  }
}
// (2) every phase has at least one of its rides firing inside its window: from its slot to its cutoff, or the hour before
// a cutoff that equals its slot. Fired in Melbourne's offset in force when this runs, since a cron is written in UTC
// and the offset moves twice a year (a schedule that holds in daylight time is read again when standard time begins).
const melbourneOffsetMinutes = (() => {
  const now = new Date()
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]))
  return (((Number(parts.hour) * 60 + Number(parts.minute)) - (now.getUTCHours() * 60 + now.getUTCMinutes())) % 1440 + 1440) % 1440
})()
const field = (f, max) => {
  if (f === '*') return [...Array(max).keys()]
  if (f.startsWith('*/')) return [...Array(max).keys()].filter((x) => x % Number(f.slice(2)) === 0)
  return f.split(',').map(Number)
}
const firesAt = (schedule) => {
  const [m, h] = schedule.split(' ')
  return field(h, 24).flatMap((hh) => field(m, 60).map((mm) => (hh * 60 + mm + melbourneOffsetMinutes) % 1440))
}
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const phaseLines = [...table.matchAll(/\{ key: '(\w+)', label: '([^']+)', slot: '(\d\d:\d\d)', cutoff: '(\d\d:\d\d)',[^\n]*?rides: \[([^\]]*)\]/g)]
for (const [, key, label, slot, cutoff, rideList] of phaseLines) {
  const to = minutes(cutoff)
  const from = to > minutes(slot) ? minutes(slot) : to - 60
  const named = [...rideList.matchAll(/'(\w+)'/g)].map((x) => x[1])
  const fired = named.flatMap((name) => {
    const ride = rides.find((r) => r.ride === name)
    return ride ? firesAt(ride.schedule).filter((t) => t >= from && t <= to) : []
  })
  if (fired.length === 0) {
    faults.push(`the phase '${key}' (${label}, ${slot} to ${cutoff}) has no ride firing inside its window: ${named.join(' and ')} never run(s) between ${Math.floor(from / 60).toString().padStart(2, '0')}:${(from % 60).toString().padStart(2, '0')} and ${cutoff} Melbourne, so it can never write its row`)
  }
}
console.log(`${TAG} ${rides.length} ride(s) read from ${TABLE}, ${crons.length} cron(s) from vercel.json, ${Object.keys(PHASE_READERS).length} phase reader(s) checked, ${phaseLines.length} phase window(s) read at Melbourne's offset of ${melbourneOffsetMinutes / 60} hours`)
if (rides.length === 0) faults.push(`no ride read from ${TABLE}: the RIDES lines no longer match this guard's reading`)
if (phaseLines.length === 0) faults.push(`no phase read from ${TABLE}: the PHASES lines no longer match this guard's reading`)
for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
if (faults.length > 0) process.exit(1)
console.log(`${TAG} OK`)
