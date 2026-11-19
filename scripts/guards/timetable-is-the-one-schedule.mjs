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
console.log(`${TAG} ${rides.length} ride(s) read from ${TABLE}, ${crons.length} cron(s) from vercel.json, ${Object.keys(PHASE_READERS).length} phase reader(s) checked`)
if (rides.length === 0) faults.push(`no ride read from ${TABLE}: the RIDES lines no longer match this guard's reading`)
for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
if (faults.length > 0) process.exit(1)
console.log(`${TAG} OK`)
