/**
 * GUARD: THE DAILY STATE REPORT ARRIVES EVEN WHEN IT CANNOT READ ANYTHING.
 *
 * THE DEFECT, found on 13 September 2026 by reading the reporter against the
 * promise printed inside its own message. Close-out UX4.1 asks for a message
 * "once a day, at a fixed time, WHETHER OR NOT anything is wrong", and the
 * message itself tells the owner: "If it does not arrive, that is itself the
 * alert: the thing that sends it has stopped."
 *
 * The reporter broke that promise in the two cases where it mattered most.
 *
 *   NO GITHUB TOKEN   `collect` printed a line, set exit code 2 and returned
 *                     null; `main` returned without sending anything at all.
 *   ANY READ THROWING a timeout, a 5xx, a parse error - the top-level catch
 *                     exited 2, again with nothing sent.
 *
 * So a reporter that was itself broken produced exactly the signal the owner has
 * been taught means the build machine is dead. Worse, three collectors answered
 * a failed read with an EMPTY LIST, so a morning when the commits API was down
 * reported "Landed on main in 24 hours (0). Nothing." as though it were a quiet
 * day.
 *
 * The same hole ran through the stall check, where it is more dangerous still.
 * `judgeStall` cannot tell "no push was found" from "the push could not be
 * looked up", and answered both by staying quiet. A stall produces SILENCE - it
 * is the whole reason UX4.2 exists - so a blind check that says nothing is
 * indistinguishable from a healthy one, and what it would be hiding is precisely
 * what nothing else can see.
 *
 * WHAT IT CHECKS, all of it by EXECUTING the real code rather than reading it.
 *
 * 1. EVERY READ FAILS, AND A REPORT STILL COMES OUT. The real `collect` is
 *    called with readers that throw, through the same alias loader the scripts
 *    use. It must resolve, name one blind spot per failed read, and render a
 *    message whose subject does not say ALL GREEN and whose body carries every
 *    reason, in the text AND the HTML.
 * 2. NO TOKEN IS NOT THE END OF THE REPORT. The same, with the token resolver
 *    answering that there is no token.
 * 3. A BLIND STALL CHECK SPEAKS. `judgeStall` told that the last push could not
 *    be read must return `shouldAlert`, and must NOT claim the build stalled.
 * 4. A CLEAN DAY IS STILL CLEAN. With readers that all succeed, there are no
 *    blind spots and the headline is ALL GREEN, so this guard cannot be
 *    satisfied by a reporter that simply cries wolf every day.
 * 5. THE SENDER IS NOT SKIPPABLE. The daily dispatch in scripts/ops/state-report.mjs
 *    must not sit behind a `if (!state)` style early return, which is the exact
 *    shape the defect shipped in.
 *
 * WHAT IT COSTS. Under two seconds: one module load through the loader, then
 * pure calls. It touches no network: that is the point of the readers being a
 * parameter.
 *
 * Proven red as well as green in scripts/verify/guard-failure-drills.mjs.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const TAG = '[daily-state]'

export const REPORTER = 'scripts/ops/state-report.mjs'
/** The call that actually sends the daily message. */
export const DAILY_DISPATCH = "dispatch({ cls: 'daily'"
/** The shape the defect shipped in: the composer giving up on the whole report. */
export const FORBIDDEN_GIVE_UP = ['if (!state) return', 'return null']

/*
 * THE SENTENCES THAT ASSERT AN ABSENCE, which is the other half of this defect
 * and the half that survived the first pass of the fix.
 *
 * Each of these is the GOOD answer on a healthy day - nothing landed, no pull
 * request is open, nobody has pushed - which is exactly why a read that FAILED
 * must never be able to produce one. The last of them is the worst: it sends the
 * reader looking for a stalled build when what actually happened is that nobody
 * could see the repository. It was caught in the driven render at 390 after the
 * other three sections had already been fixed.
 */
export const ABSENCE_SENTENCES = ['Nothing.', 'None.', 'No push to a working branch could be found']

/** Run the real composer under every failure it has to survive. */
function loadUnderTest() {
  const script = [
    "import { collect } from '@/../scripts/ops/state-report.mjs'",
    "import { renderStateReport, judgeStall } from '@/../scripts/lib/state-report.mjs'",
    "const NOW = '2026-09-13T12:00:00.000Z'",
    "const keys = ['main', 'landed', 'pullRequests', 'lastPush', 'failingBranches', 'production', 'business']",
    'const healthy = {',
    "  main: async () => ({ conclusion: 'success', shortSha: 'aaaaaaaa' }),",
    '  landed: async () => [],',
    '  pullRequests: async () => [],',
    "  lastPush: async () => ({ when: '2026-09-13T11:30:00.000Z', ref: 'lane/x' }),",
    '  failingBranches: async () => [],',
    "  production: async () => ({ readyState: 'READY', shortSha: 'aaaaaaaa', ageHours: 1 }),",
    '  business: async () => ({ eventsLive: 1, ticketsSold: 1 }),',
    '}',
    'const failing = Object.fromEntries(',
    "  keys.map((k) => [k, async () => { throw new Error(k + ' could not be read (HTTP 500)') }]),",
    ')',
    "const withToken = () => ({ token: 'pretend', source: 'handed to the guard' })",
    "const withoutToken = () => ({ token: null, reason: 'no GITHUB_TOKEN in the environment and no usable gh CLI login' })",
    'const base = { nowIso: NOW, fromWatchdog: false, alertedBand: null, checkPeriodHours: 1, env: {} }',
    // A COMPOSER THAT THROWS IS THE DEFECT, not a reason the guard cannot run.
    // Caught here and reported as an answer, so the judgement below can say what
    // it means - no message was produced - instead of the loader dying.
    'const attempt = async (opts) => { try { return { state: await collect(opts) } } catch (err) { return { threw: err instanceof Error ? err.message : String(err) } } }',
    'const blind = await attempt({ ...base, readers: failing, resolveToken: withToken })',
    'const tokenless = await attempt({ ...base, readers: healthy, resolveToken: withoutToken })',
    'const clean = await attempt({ ...base, readers: healthy, resolveToken: withToken })',
    'const shape = (attempted) => {',
    '  if (attempted.threw) return { threw: attempted.threw }',
    '  const state = attempted.state',
    '  return {',
    '    unreadable: state.unreadable,',
    '    stall: state.stall,',
    '    rendered: (({ subject, text, html }) => ({ subject, text, html }))(renderStateReport(state)),',
    '  }',
    '}',
    'console.log(JSON.stringify({',
    '  keys,',
    '  blind: shape(blind),',
    '  tokenless: shape(tokenless),',
    '  clean: shape(clean),',
    "  blindStall: judgeStall({ lastPushIso: null, nowIso: NOW, unreadable: 'the activity list answered 403' }),",
    '}))',
  ].join('\n')
  const r = spawnSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      './scripts/lib/src-alias-loader.mjs',
      '--input-type=module',
      '-e',
      script,
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  if (r.status !== 0) {
    throw new Error(`could not run the reporter through the alias loader: ${(r.stderr || r.stdout).trim().slice(0, 500)}`)
  }
  const line = r.stdout.trim().split('\n').find((l) => l.startsWith('{'))
  if (!line) throw new Error(`the reporter printed no answer: ${r.stdout.slice(0, 300)}`)
  return JSON.parse(line)
}

/** The judgement, pure, so the drill can substitute an answer set. */
export function judgeReports({ keys, blind, tokenless, clean, blindStall }) {
  const failures = []
  let judged = 0

  const mustRender = (label, shaped, { expectBlindSpots }) => {
    judged += 1
    if (shaped?.threw) {
      failures.push(
        `${label}: no message was produced at all, which is the one outcome UX4.1 forbids. The composer threw: ${shaped.threw}`,
      )
      return
    }
    if (!shaped?.rendered?.text || !shaped.rendered.html || !shaped.rendered.subject) {
      failures.push(`${label}: no message was produced at all, which is the one outcome UX4.1 forbids`)
      return
    }
    if (expectBlindSpots) {
      if ((shaped.unreadable ?? []).length === 0) {
        failures.push(`${label}: every read failed and the report listed NO blind spot, so it reads like a calm day`)
      }
      if (/ALL GREEN/.test(shaped.rendered.subject)) {
        failures.push(`${label}: the subject says ALL GREEN about a day it could not see`)
      }
      for (const sentence of ABSENCE_SENTENCES) {
        if (shaped.rendered.text.includes(sentence)) {
          failures.push(
            `${label}: the report says "${sentence}" about a read that failed. That sentence is the GOOD answer on a healthy day, so a failed read wearing it is the defect this guard exists for.`,
          )
        }
      }
      for (const entry of shaped.unreadable ?? []) {
        if (!shaped.rendered.text.includes(entry.why)) {
          failures.push(`${label}: the reason "${entry.why}" is missing from the plain text, so a reader cannot act on it`)
        }
        if (!shaped.rendered.html.includes(entry.why.replace(/&/g, '&amp;'))) {
          failures.push(`${label}: the reason "${entry.why}" is missing from the HTML, so the two bodies disagree`)
        }
      }
    } else {
      if ((shaped.unreadable ?? []).length > 0) {
        failures.push(
          `${label}: readers that all succeeded still produced ${shaped.unreadable.length} blind spot(s), so this guard could be satisfied by a reporter that cries wolf every day`,
        )
      }
      if (!/ALL GREEN/.test(shaped.rendered.subject)) {
        failures.push(`${label}: a day where every read succeeded did not read ALL GREEN (${shaped.rendered.subject})`)
      }
    }
  }

  mustRender('every read failing', blind, { expectBlindSpots: true })
  mustRender('no GitHub token', tokenless, { expectBlindSpots: true })
  mustRender('every read succeeding', clean, { expectBlindSpots: false })

  if (!blind?.threw && (blind?.unreadable ?? []).length !== keys.length) {
    failures.push(
      `every read failing produced ${(blind?.unreadable ?? []).length} blind spot(s) for ${keys.length} reader(s): a failure that is not listed is a failure nobody sees`,
    )
  }

  judged += 1
  if (!blind?.threw && (!blind?.stall?.blind || blind?.stall?.shouldAlert !== true)) {
    failures.push(
      'the composer handed on a stall judgement that is not BLIND and not alerting, after the last push could not be read. A stall produces silence, so a blind check that stays quiet is indistinguishable from a healthy one.',
    )
  }

  judged += 1
  if (blindStall?.shouldAlert !== true) {
    failures.push('judgeStall told the last push could not be read did not alert')
  }
  if (blindStall?.stalled === true) {
    failures.push('judgeStall told the last push could not be read CLAIMED the build has stalled, which it cannot know')
  }

  return { failures, judged }
}

/** Clause 5, pure: the sender is not behind an early return. */
export function judgeSender(source) {
  const failures = []
  if (!source.includes(DAILY_DISPATCH)) {
    failures.push(
      `${REPORTER} no longer contains ${DAILY_DISPATCH}...): the daily message is sent somewhere this guard cannot see, so it cannot judge whether it can be skipped.`,
    )
  }
  const before = source.slice(0, source.indexOf(DAILY_DISPATCH))
  const composeAt = before.lastIndexOf('await collect(')
  if (composeAt < 0) {
    failures.push(`${REPORTER} does not call collect() before the daily dispatch, so the report is composed somewhere unexpected.`)
    return { failures, judged: 1 }
  }
  const between = before.slice(composeAt)
  for (const shape of FORBIDDEN_GIVE_UP) {
    if (between.includes(shape)) {
      failures.push(
        `${REPORTER} can reach "${shape}" between composing the report and sending it. That is the exact shape the defect shipped in: a reporter that could not read gave up instead of sending what it had.`,
      )
    }
  }
  return { failures, judged: 1 }
}

const isMain = process.argv[1] && /the-daily-state-cannot-go-silent\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  const answers = loadUnderTest()
  const reports = judgeReports(answers)
  const sender = judgeSender(readFileSync(join(ROOT, REPORTER), 'utf8'))
  const failures = [...reports.failures, ...sender.failures]

  declareWork('the-daily-state-cannot-go-silent', {
    did: {
      'report composed under a failure it must survive': reports.judged,
      'send path read': sender.judged,
    },
    found: { 'silent path in the daily state': failures.length },
  })
  console.log(
    `${TAG} ${answers.keys.length} reader(s) judged; blind spots listed when every read failed: ${(answers.blind?.unreadable ?? []).length}`,
  )
  if (failures.length > 0) {
    console.error(`\n${TAG} FAILED\n`)
    for (const f of failures) console.error(`    ${f}`)
    console.error('')
    process.exit(1)
  }
  console.log(
    `${TAG} PASS - the report is composed and sent even when nothing can be read, it names what it could not see, and a blind stall check speaks rather than going quiet`,
  )
}
