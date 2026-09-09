/**
 * WHO GETS TOLD, AND HOW IT READS IN THE INBOX. A build-failing guard.
 * Close-out UX4.3, UX4.5 and H2.6, which are three rulings about ONE thing:
 * the subject line, and which failures are allowed to produce one at all.
 *
 * WHY THIS EXISTS. Proof from the owner's own inbox, 9 September 2026: the
 * build was stalled from 00:23 to 09:28, six runs were killed, nothing was
 * pushed for nine hours, and NOT ONE EMAIL was sent, because nothing failed.
 * Meanwhile six emails arrived for branch gates doing their job, and zero
 * arrived when a real organiser published a paid event on production. The inbox
 * was loud about the harmless and silent about the dangerous.
 *
 * And on 8 September the alert drill fired correctly against
 * https://smoke-drill.invalid and arrived reading "EventLinqs production
 * homepage smoke FAILED", with nothing to say it was a test. The owner
 * reasonably read it as a real outage (H2.6).
 *
 * FIVE CLAUSES. Each one is a thing that has actually gone wrong.
 *
 *   1. EVERY DISPATCH DECLARES ITS CLASS. A workflow that calls
 *      alert-dispatch.mjs without `--class` gets the default, and a default is
 *      how a stall alert ends up looking like a branch gate.
 *
 *   2. NO BRANCH GATE MAY EMAIL (UX4.5). A job that can run on a pull request
 *      may not dispatch an alert. Branch failures stay in the run log and on the
 *      pull request, and appear as one line in the daily state email. The one
 *      job that dispatches from a pull-request workflow, ci.yml's
 *      `main-red-alert`, is allowed because its own condition requires
 *      `github.event_name == 'push'`, which makes a pull-request run impossible.
 *
 *   3. THE DRILL MARKER IS DERIVED AND CANNOT BE FORGOTTEN (H2.6). The real
 *      functions are EXECUTED here, not read: a `.invalid` target must produce
 *      the marker and the production host must not. RFC 2606 reserves
 *      `.invalid` for names that are sure to be invalid
 *      (https://www.rfc-editor.org/rfc/rfc2606.html, fetched 2026-09-10), so a
 *      host in it cannot be a real production smoke whatever a caller claims.
 *
 *   4. THE FOUR CLASSES STAY TELLABLE APART (UX4.3). Four distinct prefixes,
 *      each beginning with the platform's name so the owner can filter, and none
 *      a prefix of another, which is what "distinguishable at a glance" means
 *      when the glance is at a list of subject lines on a phone.
 *
 *   5. A SCRIPT THAT REACHES THE DISPATCHER DECLARES ITS CLASS TOO. The
 *      workflows are not the only callers: scripts/ops/state-report.mjs spawns
 *      it, and a class it forgot to pass would be invisible to clause 1, which
 *      reads YAML and nothing else.
 *
 * Run standalone:  node scripts/guards/alert-routing.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'
import { ALERT_CLASSES, DRILL_MARKER, alertSubject, judgeDrill } from '../lib/alert-classes.mjs'
import { cannotRunOnAPullRequest } from './workflows-skip-drafts.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const WORKFLOWS = join(ROOT, '.github', 'workflows')
const TAG = '[alert-routing]'
const DISPATCHER = 'scripts/ops/alert-dispatch.mjs'
const PRODUCTION_HOST = 'https://www.eventlinqs.com.au'

const indentOf = (line) => line.length - line.trimStart().length

/**
 * The workflow as { pullRequest, jobs: [{ name, condition, dispatches: [] }] }.
 *
 * A hand parser, the same shape workflows-skip-drafts.mjs already uses and for
 * the same reason: a YAML dependency in a guard is a dependency that can
 * disappear on somebody else's bump. Anything unreadable is REPORTED, never
 * assumed fine.
 */
export function readWorkflow(text) {
  const lines = text.split(/\r?\n/)
  let inJobs = false
  let inOn = false
  let pullRequest = false
  const jobs = []
  let current = null
  let conditionOpen = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const indent = indentOf(line)

    if (indent === 0) {
      inJobs = /^jobs:/.test(trimmed)
      inOn = /^on:/.test(trimmed)
      if (inOn && /pull_request\b/.test(trimmed)) pullRequest = true
      continue
    }
    if (inOn && indent === 2 && /^pull_request:/.test(trimmed)) pullRequest = true
    if (!inJobs) continue

    if (indent === 2 && /^[A-Za-z0-9_-]+:\s*$/.test(trimmed)) {
      current = { name: trimmed.slice(0, -1), condition: '', dispatches: [] }
      jobs.push(current)
      conditionOpen = false
      continue
    }
    if (!current) continue

    if (indent === 4 && /^if:/.test(trimmed)) {
      current.condition += trimmed.slice(3).trim()
      conditionOpen = true
      continue
    }
    if (conditionOpen && indent > 4 && !/^[A-Za-z0-9_-]+:/.test(trimmed)) {
      current.condition += ` ${trimmed}`
      continue
    }
    if (indent <= 4) conditionOpen = false

    if (line.includes(DISPATCHER)) current.dispatches.push({ line: trimmed })
  }
  return { pullRequest, jobs }
}

/** The `--class` value on a dispatch, read out of the whole run block. */
export function classesDeclaredIn(text) {
  const found = []
  const re = /--class\s+([a-z-]+)/g
  let m
  while ((m = re.exec(text)) !== null) found.push(m[1])
  return found
}

/** Clauses 1 and 2, over one workflow's text. */
export function judgeWorkflow(name, text) {
  const problems = []
  const parsed = readWorkflow(text)
  const dispatching = parsed.jobs.filter((j) => j.dispatches.length > 0)

  for (const job of dispatching) {
    if (parsed.pullRequest && !cannotRunOnAPullRequest(job.condition)) {
      problems.push(
        `${name}: job "${job.name}" dispatches an alert from a workflow that runs on pull requests, and its if: does not require github.event_name == 'push'. ` +
          'Close-out UX4.5: branch gate failures stop being email. They stay in the run log and on the pull request, and appear as one line in the daily state email.',
      )
    }
  }

  const declared = classesDeclaredIn(text)
  const dispatchCount = parsed.jobs.reduce((n, j) => n + j.dispatches.length, 0)
  if (declared.length < dispatchCount) {
    problems.push(
      `${name}: ${dispatchCount} dispatch(es) of ${DISPATCHER} and only ${declared.length} --class flag(s). ` +
        'An undeclared class takes the default, and a default is how a stall alert comes to look like a branch gate (UX4.3).',
    )
  }
  for (const cls of declared) {
    if (!Object.prototype.hasOwnProperty.call(ALERT_CLASSES, cls)) {
      problems.push(`${name}: --class ${cls} is not one of ${Object.keys(ALERT_CLASSES).join(', ')}`)
    }
  }
  return { problems, dispatchCount, jobs: parsed.jobs.length, pullRequest: parsed.pullRequest }
}

/** Clause 3, by EXECUTING the real functions rather than reading them. */
export function judgeDrillMarker() {
  const problems = []
  const drilled = judgeDrill({ target: 'https://smoke-drill.invalid' })
  if (!drilled.drill) {
    problems.push('a .invalid target did NOT produce the drill verdict, so a drill could arrive looking like a real outage (H2.6)')
  }
  const drilledSubject = alertSubject({ cls: 'outage', drill: drilled.drill, subject: 'the production homepage smoke FAILED' })
  if (!drilledSubject.startsWith(DRILL_MARKER)) {
    problems.push(`a drill subject did not begin with ${DRILL_MARKER.trim()}: ${drilledSubject}`)
  }

  const real = judgeDrill({ target: PRODUCTION_HOST })
  if (real.drill) {
    problems.push(`the production host ${PRODUCTION_HOST} was judged a drill, so a real outage would be marked as a test (H2.6)`)
  }
  const realSubject = alertSubject({ cls: 'outage', drill: real.drill, subject: 'the production homepage smoke FAILED' })
  if (realSubject.includes(DRILL_MARKER.trim())) {
    problems.push(`a real alert carried the drill marker: ${realSubject}`)
  }
  return problems
}

/**
 * Clause 5: a SCRIPT that reaches the dispatcher declares a class too.
 *
 * The workflows are not the only callers. scripts/ops/state-report.mjs spawns
 * the dispatcher itself, and a class it forgot to pass would be invisible to
 * clause 1, which only reads YAML.
 */
export function judgeScriptCallers(files) {
  const problems = []
  let callers = 0
  for (const { name, text } of files) {
    if (name.endsWith('alert-dispatch.mjs')) continue
    // This guard, whose own subject matter is the dispatcher's name. It holds
    // the path in a constant so its messages can print it, and it dispatches
    // nothing. The same self-exemption no-inherited-git-env.mjs carries, for
    // the same reason, and stated rather than silently skipped.
    if (name.endsWith('guards/alert-routing.mjs')) continue
    // COMMENTS ARE NOT CALLS. scripts/verify/post-deploy-smoke.mjs names the
    // dispatcher in its header to explain where the alerting lives, and a guard
    // that could not tell a sentence from a spawn would have made that comment
    // a build failure, which teaches people to delete comments.
    // An IMPORT is not a call either. This guard imports the dispatcher's pure
    // functions so it can execute them (clause 3); it never dispatches.
    const code = withoutComments(text)
      .split(/\r?\n/)
      .filter((line) => !/^\s*import\b/.test(line) && !/^\s*}\s*from\s*'/.test(line))
      .join('\n')
    if (!code.includes('alert-dispatch.mjs')) continue
    callers += 1
    if (!/'--class'|"--class"|--class /.test(code)) {
      problems.push(`${name} spawns ${DISPATCHER} and never passes --class, so its alerts take the default class (UX4.3)`)
    }
  }
  return { problems, callers }
}

/** Block and line comments removed, so a mention is not mistaken for a call. */
export function withoutComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n')
}

/** Clause 4: four classes, four prefixes, none a prefix of another. */
export function judgeClassGrammar() {
  const problems = []
  const entries = Object.entries(ALERT_CLASSES)
  if (entries.length < 4) {
    problems.push(`only ${entries.length} alert class(es) are defined; UX4 names four kinds of message the owner must tell apart`)
  }
  for (const [name, table] of entries) {
    if (!table.prefix.startsWith('EventLinqs')) {
      problems.push(`class ${name} has the prefix "${table.prefix}", which does not begin with EventLinqs, so it cannot be filtered with the others`)
    }
  }
  for (const [a, ta] of entries) {
    for (const [b, tb] of entries) {
      if (a === b) continue
      if (ta.prefix !== tb.prefix && tb.prefix.startsWith(ta.prefix) && ta.prefix.length < tb.prefix.length) continue
      if (ta.prefix === tb.prefix) {
        problems.push(`classes ${a} and ${b} share the prefix "${ta.prefix}", so the two cannot be told apart in a subject line`)
      }
    }
  }
  return problems
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('alert-routing.mjs')

if (invokedDirectly) {
  if (!existsSync(WORKFLOWS)) {
    console.error(`${TAG} FAIL - ${WORKFLOWS} does not exist, so nothing could be judged.`)
    process.exit(1)
  }
  const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))
  const problems = []
  let dispatchTotal = 0
  let jobTotal = 0

  for (const file of files) {
    const verdict = judgeWorkflow(file, readFileSync(join(WORKFLOWS, file), 'utf8'))
    problems.push(...verdict.problems)
    dispatchTotal += verdict.dispatchCount
    jobTotal += verdict.jobs
    console.log(
      `${TAG} ${file}: ${verdict.jobs} job(s), ${verdict.dispatchCount} alert dispatch(es)` +
        `${verdict.pullRequest ? ', runs on pull requests' : ''}`,
    )
  }

  const scriptFiles = []
  for (const dir of [join(ROOT, 'scripts', 'ops'), join(ROOT, 'scripts', 'verify'), join(ROOT, 'scripts', 'guards')]) {
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.mjs')) continue
      scriptFiles.push({ name: `${dir.slice(ROOT.length + 1).replace(/\\/g, '/')}/${entry}`, text: readFileSync(join(dir, entry), 'utf8') })
    }
  }
  const scriptVerdict = judgeScriptCallers(scriptFiles)
  problems.push(...scriptVerdict.problems)
  problems.push(...judgeDrillMarker())
  problems.push(...judgeClassGrammar())

  if (dispatchTotal === 0) {
    problems.push(
      'no workflow dispatches an alert at all. The post-deploy smoke and the main-red alert both should, and a guard that finds nothing to judge must say so rather than pass.',
    )
  }

  console.log(`${TAG} what this guard scanned:`)
  console.log(`${TAG}   ${files.length} workflow(s), ${jobTotal} job(s), ${dispatchTotal} alert dispatch(es)`)
  console.log(`${TAG}   ${scriptVerdict.callers} script(s) that reach the dispatcher, out of ${scriptFiles.length} read`)
  console.log(`${TAG}   ${Object.keys(ALERT_CLASSES).length} alert class(es), drill marker executed on a .invalid and on ${PRODUCTION_HOST}`)

  if (problems.length > 0) {
    console.error('')
    console.error(`${TAG} FAIL - ${problems.length} routing problem(s):`)
    for (const p of problems) console.error(`    ${p}`)
    console.error('')
    console.error('  The inbox was loud about the harmless and silent about the dangerous (close-out UX4).')
    process.exit(1)
  }

  declareWork('alert-routing', {
    did: {
      'workflow judged': files.length,
      'alert dispatch judged': dispatchTotal,
      'alert class judged': Object.keys(ALERT_CLASSES).length,
    },
    found: { 'routing problem': problems.length },
    zeroIsFine: {
      'routing problem':
        'no branch gate emailing and no unmarked drill is the goal state; the guard exists because both happened in the same week',
    },
    exitOnZero: false,
  })

  console.log(`${TAG} PASS - ${dispatchTotal} dispatch(es), every one classed, none reachable from a branch gate.`)
  process.exit(0)
}
