/**
 * GUARD: THE EVENT LIFECYCLE IS TOTAL, AND THE CODE AGREES WITH THE DOCUMENT.
 *
 * THE DEFECT, found by the founder on production, 6 September 2026: a
 * cancelled event could be edited, viewed or duplicated for ever and nothing
 * else. `cancelled: []` in src/lib/event-lifecycle.ts was a dead end, and no
 * test, guard or reviewer had a reason to notice, because a dead end compiles.
 *
 * WHAT IT CHECKS, each against the live source rather than a copy of it
 * (docs/EVENT-LIFECYCLE.md is the authority for every line):
 *
 *   1. NO DEAD END. Every value of the event_status enum has at least one way
 *      out. The lifecycle module is imported through the same alias loader the
 *      scripts use, so this reads the table the application runs, not a regex
 *      over its source.
 *   2. CANCELLED AND COMPLETED ARCHIVE, the two that could not before.
 *   3. ARCHIVED LEAVES ONLY BY RESTORE. No direct transition out of archived
 *      to any status, so nothing goes live by a side door.
 *   4. THE ONE PUBLIC RULE STILL PINS PUBLISHED. PUBLIC_EVENT_MATCH.status and
 *      its SQL twin both say 'published'; that is why an archived event is off
 *      every public surface without a line of new code.
 *   5. THE CONTROLS ARE RENDERED WHERE AN ORGANISER MANAGES EVENTS. The events
 *      list and the event overview both render <EventLifecycleActions>, and
 *      that component asks the lifecycle module (canArchive, restoreTarget)
 *      rather than carrying a status list of its own.
 *   6. THE DOOR NEVER READS EVENT STATUS. The effective definitions of
 *      scan_ticket, door_validation_set and sync_offline_scans (the LAST
 *      migration defining each) carry no events.status predicate, so a ticket
 *      to an archived event still validates at the door (close-out C13.5).
 *
 * IT PRINTS WHAT IT SCANNED and FAILS if it scanned nothing.
 *
 * Proven red by three drills in scripts/verify/guard-failure-drills.mjs: a
 * cancelled event losing its way out, the events list dropping the controls,
 * and the door starting to refuse on event status.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const TAG = '[event-lifecycle-total]'

/** The surfaces that must render the lifecycle controls. */
export const CONTROL_SURFACES = [
  'src/app/(dashboard)/dashboard/events/events-table.tsx',
  'src/app/(dashboard)/dashboard/events/[id]/page.tsx',
]
export const CONTROL_COMPONENT = 'src/components/features/dashboard/event-lifecycle-actions.tsx'
/** The door functions that must never read events.status. */
export const DOOR_FUNCTIONS = ['scan_ticket', 'door_validation_set', 'sync_offline_scans']

const EVENT_STATUS_PREDICATE = /\be\.status\b|\bevents\.status\b|\bstatus\s*=\s*'published'/

/**
 * The judgement, pure, over facts gathered by collectFacts(). Returns the list
 * of failures; empty is the pass.
 */
export function judgeLifecycle(facts) {
  const failures = []
  if (!Array.isArray(facts.statuses) || facts.statuses.length === 0) {
    failures.push('the event_status enum could not be read from the lifecycle module')
  }
  if (facts.deadEnds.length > 0) {
    failures.push(`dead end: ${facts.deadEnds.join(', ')} has no transition out and no restore (docs/EVENT-LIFECYCLE.md)`)
  }
  for (const status of ['cancelled', 'completed']) {
    if (!facts.canArchive[status]) failures.push(`${status} cannot be archived, so it is a dead end for the organiser`)
  }
  if (!(Array.isArray(facts.archivedExits) && facts.archivedExits.length === 1 && facts.archivedExits[0] === 'restore')) {
    failures.push(`archived must leave only by restore; the module says ${JSON.stringify(facts.archivedExits)}`)
  }
  for (const [status, direct] of Object.entries(facts.directFromArchived ?? {})) {
    if (direct) failures.push(`archived -> ${status} is a direct transition; an archived event must be restored first`)
  }
  if (facts.publishedStatus !== 'published') {
    failures.push(`PUBLIC_EVENT_MATCH.status is ${JSON.stringify(facts.publishedStatus)}, not 'published'`)
  }
  if (typeof facts.sqlForm !== 'string' || !facts.sqlForm.includes("status = 'published'")) {
    failures.push(`publicEventVisibilitySql() no longer pins status = 'published': ${facts.sqlForm}`)
  }
  for (const surface of facts.surfaces) {
    if (!surface.rendersControls) failures.push(`${surface.file} does not render <EventLifecycleActions>, so a status there can be a dead end`)
  }
  if (!facts.componentAsksModule) {
    failures.push(`${CONTROL_COMPONENT} must decide what to offer through canArchive() and restoreTarget(), never a status list of its own`)
  }
  for (const door of facts.doors) {
    if (!door.file) failures.push(`no migration defines ${door.fn}; the door check cannot aim`)
    else if (door.predicateAt.length > 0) {
      failures.push(`${door.fn} in ${door.file} reads event status (${door.predicateAt.join('; ')}); a ticket to an archived event would stop validating at the door`)
    }
  }
  return failures
}

/** The last migration, in version order, that defines a function, and the body it defines. */
export function effectiveDefinition(fnName, migrationsDir = join(ROOT, 'supabase', 'migrations')) {
  const re = new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+(public\\.)?${fnName}\\s*\\(`, 'i')
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  let hit = null
  for (const f of files) {
    const text = readFileSync(join(migrationsDir, f), 'utf8')
    if (re.test(text)) hit = { file: f, text }
  }
  if (!hit) return { file: null, body: '' }
  // The function body: from the LAST definition of this name to its closing $$;
  const start = hit.text.search(re)
  const tail = hit.text.slice(start)
  const end = tail.search(/\n\$\$;/)
  return { file: hit.file, body: end >= 0 ? tail.slice(0, end) : tail }
}

/** Where an event-status predicate appears inside a function body, as "line: text". */
export function predicateLines(body) {
  return body
    .split('\n')
    .map((line, i) => ({ i: i + 1, line }))
    .filter(({ line }) => !line.trim().startsWith('--') && EVENT_STATUS_PREDICATE.test(line))
    .map(({ i, line }) => `line ${i}: ${line.trim()}`)
}

function readSource(rel) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

/** Gather every fact the judgement needs from the live tree. */
export function collectFacts() {
  const script = [
    "import { deadEnds, exitsOf, EVENT_STATUSES, canArchive, canTransition } from './src/lib/event-lifecycle.ts'",
    "import { PUBLIC_EVENT_MATCH, publicEventVisibilitySql } from './src/lib/events/public-visibility.ts'",
    'const directFromArchived = {}',
    "for (const s of EVENT_STATUSES) directFromArchived[s] = canTransition('archived', s)",
    'console.log(JSON.stringify({',
    '  statuses: EVENT_STATUSES,',
    '  deadEnds: deadEnds(),',
    "  archivedExits: exitsOf('archived'),",
    "  canArchive: { cancelled: canArchive('cancelled'), completed: canArchive('completed') },",
    '  directFromArchived,',
    '  publishedStatus: PUBLIC_EVENT_MATCH.status,',
    '  sqlForm: publicEventVisibilitySql(),',
    '}))',
  ].join('\n')
  const r = spawnSync(
    process.execPath,
    ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/src-alias-loader.mjs', '--input-type=module', '-e', script],
    { cwd: ROOT, encoding: 'utf8' },
  )
  if (r.status !== 0) {
    throw new Error(`could not load the lifecycle module through the alias loader: ${(r.stderr || r.stdout).trim().slice(0, 400)}`)
  }
  const line = r.stdout.trim().split('\n').find((l) => l.startsWith('{'))
  if (!line) throw new Error(`the lifecycle module printed no facts: ${r.stdout.slice(0, 200)}`)
  const loaded = JSON.parse(line)

  const surfaces = CONTROL_SURFACES.map((file) => ({ file, rendersControls: /<EventLifecycleActions\b/.test(readSource(file)) }))
  const component = readSource(CONTROL_COMPONENT)
  const componentAsksModule = /\bcanArchive\(/.test(component) && /\brestoreTarget\(/.test(component)
  const doors = DOOR_FUNCTIONS.map((fn) => {
    const { file, body } = effectiveDefinition(fn)
    return { fn, file, predicateAt: predicateLines(body) }
  })
  return { ...loaded, surfaces, componentAsksModule, doors }
}

const isMain = process.argv[1] && /event-lifecycle-total\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  const facts = collectFacts()
  const failures = judgeLifecycle(facts)
  declareWork('event-lifecycle-total', {
    did: {
      'status judged': facts.statuses.length,
      'control surface read': facts.surfaces.length,
      'door function read': facts.doors.filter((d) => d.file).length,
    },
    found: { 'lifecycle defect': failures.length },
  })
  console.log(`${TAG} statuses: ${facts.statuses.join(', ')}`)
  console.log(`${TAG} doors: ${facts.doors.map((d) => `${d.fn} (${d.file ?? 'MISSING'})`).join(', ')}`)
  if (failures.length > 0) {
    console.error(`\n${TAG} FAILED\n`)
    for (const f of failures) console.error(`    ${f}`)
    console.error('')
    process.exit(1)
  }
  console.log(`${TAG} PASS - no dead end, archived leaves only by restore, the public rule pins published, both surfaces render the controls, the door reads no event status`)
}
