/**
 * GUARD: a pull-request workflow never runs its jobs on a DRAFT, and every one
 * of them wakes up when the draft is marked ready.
 *
 * WHY (close-out C2.2 and C2.3, 5 September 2026). Six failed-run emails for
 * one pull request: every push to the branch ran every heavy job while the
 * branch was still being worked on, and CI was the first place four of those
 * checks ever ran. The rule now is: open the pull request as a DRAFT, work,
 * pass the pre-push gate locally (scripts/ops/pre-push-gate.mjs), mark it
 * ready, and CI runs exactly once. That rule lives in two places in every
 * pull-request workflow, and this guard holds both:
 *
 *   1. every job carries an `if:` containing
 *          github.event.pull_request.draft == false
 *      (tested after the event name where the workflow also runs on push,
 *      because that expression is empty on a push event and would skip main);
 *
 *   2. the pull_request trigger lists  ready_for_review  in its types. GitHub's
 *      default types are opened, synchronize and reopened, so a workflow whose
 *      jobs skip the draft and whose trigger never hears "ready" is a required
 *      check that never reports and a merge that waits for ever.
 *
 * Losing either half is silent, and they fail in opposite directions: no
 * condition is six emails again; no ready_for_review is a pull request nobody
 * can merge. So both are checked, on every workflow that has a pull_request
 * trigger, and a workflow without one is named as out of scope on every run.
 *
 * WHAT IT READS. `.github/workflows/*.yml`, line by line, with no YAML library:
 * the repository has none of its own, and a transitive one is a dependency
 * that disappears on somebody else's bump. The workflows are plain enough for
 * that, and steps-declare-work already reads them the same way: top-level keys
 * at column 0, jobs at two spaces, a job's `if:` at four, a block scalar
 * `if: >-` continued on deeper lines. Anything this cannot read is reported as
 * unreadable rather than assumed fine.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

export const DRAFT_CONDITION = 'github.event.pull_request.draft == false'
export const READY_EVENT = 'ready_for_review'
const WORKFLOWS = '.github/workflows'

/**
 * A condition that cannot run on a pull request AT ALL is stronger than the
 * draft condition, and demanding the draft clause on top of it would force a
 * job to carry a test for an event it has already excluded.
 *
 * Added 10 September 2026 for close-out UX4.3's `main-red-alert` job, which
 * runs only on a push to main. Reading `github.event_name == 'push'` as
 * satisfying the rule is not a loosening: `push` and `pull_request` are
 * different events, so a job requiring one can never fire on the other, draft
 * or ready. The string is matched exactly, both quote styles, so nothing
 * broader than that equality sneaks through.
 */
export const PULL_REQUEST_IMPOSSIBLE = ["github.event_name == 'push'", 'github.event_name == "push"']

/** Does this job's condition already make a pull-request run impossible? */
export function cannotRunOnAPullRequest(condition) {
  return PULL_REQUEST_IMPOSSIBLE.some((needle) => condition.includes(needle))
}

const indentOf = (line) => line.length - line.trimStart().length
const isBlank = (line) => line.trim() === '' || line.trim().startsWith('#')

/** The file as column-0 sections: { key, inline, lines }. */
function sectionsOf(text) {
  const sections = []
  let current = null
  for (const raw of text.split(/\r?\n/)) {
    if (isBlank(raw)) continue
    const m = /^(["']?)([A-Za-z_][\w-]*)\1:(.*)$/.exec(raw)
    if (m && indentOf(raw) === 0) {
      current = { key: m[2], inline: m[3].trim(), lines: [] }
      sections.push(current)
      continue
    }
    if (current) current.lines.push(raw)
  }
  return sections
}

const listOf = (inline) =>
  inline
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)

/** Whether `on:` carries a pull_request trigger, and the types it lists. */
function readPullRequestTrigger(on) {
  if (!on) return { present: false, types: [] }
  if (on.inline !== '') {
    // on: [push, pull_request]   or   on: pull_request
    return { present: listOf(on.inline).includes('pull_request'), types: [] }
  }
  let present = false
  const types = []
  let prIndent = -1
  let inPr = false
  let typesIndent = -1
  let inTypes = false
  for (const raw of on.lines) {
    const ind = indentOf(raw)
    const t = raw.trim()
    if (inTypes) {
      if (ind > typesIndent && t.startsWith('- ')) {
        types.push(t.slice(2).trim().replace(/^["']|["']$/g, ''))
        continue
      }
      inTypes = false
    }
    if (inPr && ind <= prIndent) inPr = false
    if (!inPr && /^pull_request:/.test(t) && (prIndent === -1 || ind <= prIndent)) {
      present = true
      inPr = true
      prIndent = ind
      continue
    }
    if (inPr && ind > prIndent) {
      const m = /^types:\s*(.*)$/.exec(t)
      if (!m) continue
      const inline = m[1].trim()
      if (inline.startsWith('[')) types.push(...listOf(inline))
      else {
        inTypes = true
        typesIndent = ind
      }
    }
  }
  return { present, types }
}

/** Every job under `jobs:` with its `if:` expression, block scalars joined. */
function readJobs(lines) {
  const jobs = []
  let job = null
  let block = null
  for (const raw of lines) {
    const ind = indentOf(raw)
    const t = raw.trim()
    if (block) {
      if (ind > block.indent) {
        block.parts.push(t)
        continue
      }
      job.condition = block.parts.join(' ')
      block = null
    }
    const jm = /^([A-Za-z_][\w-]*):\s*$/.exec(t)
    if (ind === 2 && jm) {
      job = { name: jm[1], condition: '' }
      jobs.push(job)
      continue
    }
    if (job && ind === 4) {
      const im = /^if:\s*(.*)$/.exec(t)
      if (!im) continue
      const value = im[1].trim()
      if (value === '' || /^[>|][-+]?$/.test(value)) block = { indent: 4, parts: [] }
      else job.condition = value
    }
  }
  if (block && job) job.condition = block.parts.join(' ')
  return jobs
}

/**
 * One workflow, judged. Exported so the parser and the two rules are tested
 * on fixtures as well as on the real files.
 */
export function analyseWorkflow(text) {
  const sections = sectionsOf(text)
  const trigger = readPullRequestTrigger(sections.find((s) => s.key === 'on'))
  const jobsSection = sections.find((s) => s.key === 'jobs')
  const jobs = jobsSection ? readJobs(jobsSection.lines) : []
  const problems = []
  if (trigger.present) {
    if (!trigger.types.includes(READY_EVENT)) {
      problems.push(
        `the pull_request trigger does not list ${READY_EVENT} in its types (it lists [${trigger.types.join(', ')}]), so a draft marked ready never runs this workflow`,
      )
    }
    if (jobs.length === 0) problems.push('no job could be read under jobs:, so nothing here is known to skip a draft')
    for (const job of jobs) {
      if (job.condition.includes(DRAFT_CONDITION)) continue
      if (cannotRunOnAPullRequest(job.condition)) continue
      problems.push(`job "${job.name}" would run on a draft pull request: its if: does not carry  ${DRAFT_CONDITION}`)
    }
  }
  return { pullRequest: trigger.present, types: trigger.types, jobs, problems }
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const dir = join(root, WORKFLOWS)
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort() : []
  let checked = 0
  let jobsChecked = 0
  const problems = []
  for (const f of files) {
    let text
    try {
      text = readFileSync(join(dir, f), 'utf8')
    } catch (error) {
      problems.push(`${WORKFLOWS}/${f}: unreadable (${error.message}); a workflow this cannot read is one it cannot police`)
      continue
    }
    const a = analyseWorkflow(text)
    if (!a.pullRequest) {
      console.log(`[workflows-skip-drafts] ${f}: no pull_request trigger, so the draft rule does not apply`)
      continue
    }
    checked += 1
    jobsChecked += a.jobs.length
    console.log(`[workflows-skip-drafts] ${f}: pull_request types [${a.types.join(', ')}], ${a.jobs.length} job(s): ${a.jobs.map((j) => j.name).join(', ')}`)
    for (const p of a.problems) problems.push(`${WORKFLOWS}/${f}: ${p}`)
  }

  declareWork('workflows-skip-drafts', {
    did: { 'workflow read': files.length, 'pull-request workflow checked': checked, 'job checked': jobsChecked },
    found: { 'workflow that would run on a draft, or never wake': problems.length },
  })

  if (problems.length > 0) {
    console.error('')
    console.error(`[workflows-skip-drafts] FAIL - ${problems.length} problem(s):`)
    for (const p of problems) console.error(`    ${p}`)
    console.error('')
    console.error('  Every job in a pull-request workflow carries')
    console.error(`    if: \${{ github.event_name != 'pull_request' || ${DRAFT_CONDITION} }}`)
    console.error(`  and the trigger lists  types: [opened, synchronize, reopened, ${READY_EVENT}].`)
    console.error('  Open pull requests as drafts, pass npm run gate:push locally, mark ready: CI runs once.')
    process.exitCode = 1
    return
  }
  console.log(`[workflows-skip-drafts] PASS - ${checked} pull-request workflow(s), ${jobsChecked} job(s), every one skips a draft and wakes on ${READY_EVENT}.`)
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) main()
