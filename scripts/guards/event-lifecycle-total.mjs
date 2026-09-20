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
 *   7. THE FOUR AFTER-THE-FACT STATES ARE PUBLIC PAGES. paused, postponed,
 *      cancelled and completed answer a full page with a banner, which the
 *      document says in four rows and which was FALSE for months: the RLS
 *      policies admit published alone, so all four served a real 404 and the
 *      page's banner code for them had never run for a stranger. The route
 *      guard and the page must both consult the one door
 *      (src/lib/events/after-the-fact-view.ts), that door must constrain both
 *      status and visibility in the query, and the classification must cover
 *      every value of the enum so a new status cannot default into a 404.
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
import { buildImportGraph, pathToTarget, norm } from './lib/import-graph.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const TAG = '[event-lifecycle-total]'

/** The surfaces that must render the lifecycle controls. */
export const CONTROL_SURFACES = [
  'src/app/(dashboard)/dashboard/events/events-table.tsx',
  'src/app/(dashboard)/dashboard/events/[id]/page.tsx',
]
export const CONTROL_COMPONENT = 'src/components/features/dashboard/event-lifecycle-actions.tsx'
/**
 * The two surfaces that must consult the after-the-fact door, and the door.
 *
 * BOTH, not either. The route's layout answers before the page renders, so a
 * page that consults the door under a layout that does not would still 404;
 * that exact split is recorded in src/lib/events/archived-view.ts, where the
 * first drive found the page's holder branch never ran.
 */
/*
 * WHICH CALL COUNTS AS CONSULTING IT IS DERIVED FROM THE DOOR, NOT TYPED HERE,
 * AND IT IS FOLLOWED THROUGH IMPORTS RATHER THAN READ OFF ONE FILE.
 *
 * Until 20 September 2026 the layout's entry named `afterTheFactEventExists`
 * and the page's named `fetchAfterTheFactEvent`, one literal each. Both are
 * exported by the same module and both apply the same two constraints (the
 * clauses below prove that separately, per read). When the layout moved to the
 * row-returning reader this guard failed while the behaviour was unchanged,
 * because it was matching a name rather than the thing the name stands for. So
 * the accepted calls became every function the door EXPORTS.
 *
 * ON 21 SEPTEMBER 2026 IT WENT WRONG THE SECOND WAY, AND FOR THE SAME REASON.
 * Close-out C8 collapsed this route's three reads of one row into one, through
 * `src/lib/events/event-detail-read.ts` memoised with React's `cache`. Both
 * surfaces still answer exactly as they did, through exactly this door, and
 * neither of them now NAMES it: the shared resolver does. A guard that reads
 * one file can only ever ask whether the call is typed in that file, which is a
 * question about layout and not about behaviour.
 *
 * So a surface consults the door if it calls one of the door's exports ITSELF,
 * or if it reaches a module that does by following value imports (the same
 * graph two client-boundary guards already use). The module that does the
 * consulting is reported beside the surface, so the answer names its own path
 * instead of asserting one. A surface that stops reaching the door at all still
 * fails, which is what the clause is for.
 */
export const AFTER_THE_FACT_CALLERS = [
  'src/app/events/[slug]/layout.tsx',
  'src/app/events/[slug]/page.tsx',
]
export const AFTER_THE_FACT_DOOR = 'src/lib/events/after-the-fact-view.ts'

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
  /*
   * CLAUSE 7. The four after-the-fact states reach their page.
   */
  /*
   * THE PER-STATUS REPORT RUNS EVEN WHEN THE COUNT IS WRONG. It used to sit in
   * an `else`, so dropping a status produced only "should name the four
   * states" and the reader had to work out which one had gone. Naming it is the
   * whole value of the check.
   */
  if (!Array.isArray(facts.afterTheFact)) {
    failures.push(
      `PUBLIC_AFTER_THE_FACT_STATUSES is not a list; the module says ${JSON.stringify(facts.afterTheFact)}`,
    )
  } else {
    for (const status of ['paused', 'postponed', 'cancelled', 'completed']) {
      if (!facts.afterTheFact.includes(status)) {
        failures.push(
          `${status} is not in PUBLIC_AFTER_THE_FACT_STATUSES, so its public URL answers 404. ` +
            `docs/EVENT-LIFECYCLE.md says it is a full page with a banner.`,
        )
      }
    }
    if (facts.afterTheFact.includes('archived')) {
      failures.push(
        'archived is in PUBLIC_AFTER_THE_FACT_STATUSES. Its page is per viewer and belongs to ' +
          'src/lib/events/archived-view.ts; admitting it here publishes every archived event.',
      )
    }
  }
  for (const caller of facts.afterTheFactCallers ?? []) {
    if (!caller.consults) {
      failures.push(
        `${caller.file} no longer consults the after-the-fact door, so a cancelled or completed ` +
          `event answers 404 there (src/lib/events/after-the-fact-view.ts).`,
      )
    }
  }
  if (!(facts.afterTheFactDoorReads > 0)) {
    failures.push(`${AFTER_THE_FACT_DOOR} makes no read of events; the after-the-fact check cannot aim`)
  }
  if (!facts.afterTheFactDoorConstrainsStatus) {
    failures.push(
      `${AFTER_THE_FACT_DOOR} has a read that does not constrain status. It reads with the service ` +
        `role, so an unconstrained query publishes drafts and archived events.`,
    )
  }
  if (!facts.afterTheFactDoorConstrainsVisibility) {
    failures.push(
      `${AFTER_THE_FACT_DOOR} has a read that does not constrain visibility. A private event would ` +
        `become a public page the moment it was cancelled.`,
    )
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
    "import { deadEnds, exitsOf, EVENT_STATUSES, canArchive, canTransition, PUBLIC_AFTER_THE_FACT_STATUSES } from './src/lib/event-lifecycle.ts'",
    "import { PUBLIC_EVENT_MATCH, publicEventVisibilitySql } from './src/lib/events/public-visibility.ts'",
    'const directFromArchived = {}',
    "for (const s of EVENT_STATUSES) directFromArchived[s] = canTransition('archived', s)",
    'console.log(JSON.stringify({',
    '  statuses: EVENT_STATUSES,',
    '  deadEnds: deadEnds(),',
    "  archivedExits: exitsOf('archived'),",
    "  canArchive: { cancelled: canArchive('cancelled'), completed: canArchive('completed') },",
    '  directFromArchived,',
    '  afterTheFact: [...PUBLIC_AFTER_THE_FACT_STATUSES],',
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
  const doorSource = readSource(AFTER_THE_FACT_DOOR)
  /** Every reader the door exports; a caller consulting ANY of them consults it. */
  const doorExports = [...doorSource.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)].map(m => m[1])
  // A call site, not a mention: the name followed by its call or its type
  // argument. Matched with includes rather than a built regex, because a
  // function name needs no escaping and a hand-built pattern is one more thing
  // that can be silently wrong.
  const callsTheDoor = (file) => {
    const src = readSource(file)
    return doorExports.some(fn => src.includes(fn + '(') || src.includes(fn + '<'))
  }
  const graph = buildImportGraph(ROOT)
  const stripExt = (file) => file.replace(/\.(tsx?)$/, '')
  /*
   * The graph is keyed WITHOUT an extension, and a module id has to be turned
   * back into the file it came from to be read. The mapping is taken from the
   * graph's own file list rather than guessed by appending `.ts`, which is how
   * the first version of this clause tried to read `layout.ts` and threw.
   */
  const fileOfModule = new Map(graph.files.map((f) => {
    const rel = norm(f)
    return [stripExt(rel), rel]
  }))
  const afterTheFactCallers = AFTER_THE_FACT_CALLERS.map((file) => {
    if (callsTheDoor(file)) return { file, consults: true, via: file }
    /*
     * The door is reached through somebody. `pathToTarget` returns the first
     * value-import path to it, and the module that CALLS an export is the one
     * on that path that says a door name - never the door itself, whose source
     * necessarily contains every one of them as a definition.
     */
    const path = pathToTarget(graph, stripExt(file), stripExt(AFTER_THE_FACT_DOOR)) ?? []
    const via = path
      .slice(0, -1)
      .map((mod) => fileOfModule.get(mod))
      .filter(Boolean)
      .find((mod) => callsTheDoor(mod))
    return { file, consults: Boolean(via), via: via ?? null }
  })
  /*
   * EVERY READ IN THE DOOR, NOT THE FILE AS A WHOLE.
   *
   * The first version asked whether the constraint appeared anywhere in the
   * file, and the drill that removed it from one of the two queries PASSED: the
   * other query's copy satisfied the search. The door has an existence check
   * and a row fetch, and an unconstrained existence check alone would answer
   * "yes, there is a page here" for a draft. So the source is split on each
   * read and each segment is judged on its own.
   */
  const reads = doorSource.split(/\.from\('events'\)/).slice(1)
  const afterTheFactDoorReads = reads.length
  const afterTheFactDoorConstrainsStatus =
    reads.length > 0 && reads.every(read => /\.in\('status',/.test(read))
  const afterTheFactDoorConstrainsVisibility =
    reads.length > 0 && reads.every(read => /\.in\('visibility',/.test(read))

  return {
    ...loaded,
    surfaces,
    componentAsksModule,
    doors,
    afterTheFactCallers,
    afterTheFactDoorReads,
    afterTheFactDoorConstrainsStatus,
    afterTheFactDoorConstrainsVisibility,
  }
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
      'after-the-fact caller read': (facts.afterTheFactCallers ?? []).length,
      'after-the-fact read judged': facts.afterTheFactDoorReads ?? 0,
    },
    found: { 'lifecycle defect': failures.length },
  })
  console.log(`${TAG} statuses: ${facts.statuses.join(', ')}`)
  console.log(`${TAG} doors: ${facts.doors.map((d) => `${d.fn} (${d.file ?? 'MISSING'})`).join(', ')}`)
  console.log(`${TAG} public after the fact: ${(facts.afterTheFact ?? []).join(', ')}`)
  // The path is printed, not asserted: a reader can see WHICH module consults
  // the door for each surface rather than taking "consults" on trust.
  for (const caller of facts.afterTheFactCallers ?? []) {
    console.log(`${TAG} ${caller.file} consults the after-the-fact door ${caller.via ? `via ${caller.via}` : 'NOWHERE'}`)
  }
  if (failures.length > 0) {
    console.error(`\n${TAG} FAILED\n`)
    for (const f of failures) console.error(`    ${f}`)
    console.error('')
    process.exit(1)
  }
  console.log(`${TAG} PASS - no dead end, archived leaves only by restore, the public rule pins published, both surfaces render the controls, the door reads no event status, and the four after-the-fact states reach their page`)
}
