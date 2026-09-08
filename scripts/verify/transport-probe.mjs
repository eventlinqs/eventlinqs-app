/**
 * Try to reproduce the dropped connection, from the place it was dropped.
 *
 * WHY (close-out H2.1, 8 September 2026). On 7 September a request from a
 * GitHub Actions runner to https://www.eventlinqs.com.au was reset by the peer
 * during the TLS handshake, and the smoke reported production down. Three
 * explanations were on the table and all three are testable from a runner:
 *
 *   1. the platform's own rate limiter refused it
 *   2. Vercel bot or attack protection challenged or blocked it
 *   3. the user agent `eventlinqs-post-deploy-smoke/1.0` was being filtered
 *
 * Explanation 1 and 3 are already improbable from the error alone: curl exited
 * 35, CURLE_SSL_CONNECT_ERROR, "A problem occurred somewhere in the SSL/TLS
 * handshake" (https://curl.se/libcurl/c/libcurl-errors.html, fetched
 * 2026-09-08). The handshake completes BEFORE the request line, so no header,
 * no path and no user agent had been sent when the reset arrived. Nothing that
 * reads an HTTP request can have been the thing that answered.
 *
 * This probe measures rather than argues. It sends the same request under
 * three different user agents and against a control host, from the runner, and
 * reports the failure rate of each cohort. It answers:
 *
 *   does it reproduce at all from here
 *   does the smoke user agent fail more often than a browser one (hypothesis 3)
 *   does the control host fail at the same time (a runner-side egress fault)
 *
 * BOUNDARY. Read only, GET only, and deliberately small: the default is 20
 * requests per cohort spread over the run, which is ordinary traffic for a
 * public site and is not a load test. It never writes anything anywhere.
 *
 * Usage:
 *   node scripts/verify/transport-probe.mjs --url https://www.eventlinqs.com.au
 *        [--rounds 20] [--gap-ms 500] [--report probe.json]
 */

import { writeFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'
import { OUTCOME, classifyThrown, describeThrown } from '../lib/smoke-transport.mjs'

/**
 * The cohorts. A cohort is one hypothesis: if the smoke agent is being
 * filtered, its column is the only one that fails.
 */
const COHORTS = [
  { key: 'smoke-agent', headers: { 'User-Agent': 'eventlinqs-post-deploy-smoke/1.0' }, why: 'the exact agent the failing run used' },
  {
    key: 'browser-agent',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' },
    why: 'an ordinary visitor, to isolate agent filtering from address filtering',
  },
  { key: 'no-agent', headers: {}, why: 'undici default, to show the agent is not the variable' },
]

/**
 * The control. Operated by AWS and documented by them as the plain-text
 * check-your-address endpoint (https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html
 * references checkip.amazonaws.com). Its job here is only to answer, so that a
 * runner whose egress is broken cannot be mistaken for production refusing us.
 */
const CONTROL_URL = 'https://checkip.amazonaws.com'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function once(url, headers) {
  const started = Date.now()
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(30_000) })
    const body = await res.text()
    return { outcome: res.status === 200 ? OUTCOME.OK : OUTCOME.HTTP_STATUS, status: res.status, ms: Date.now() - started, bytes: body.length, body }
  } catch (err) {
    // Reported, never swallowed: this failure IS the measurement.
    return { outcome: classifyThrown(err), status: null, ms: Date.now() - started, bytes: 0, error: describeThrown(err) }
  }
}

function parseArgs(argv) {
  const out = { url: null, rounds: 20, gapMs: 500, report: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => argv[(i += 1)]
    if (arg === '--url') out.url = next()
    else if (arg === '--rounds') out.rounds = Number(next())
    else if (arg === '--gap-ms') out.gapMs = Number(next())
    else if (arg === '--report') out.report = next()
    else return { error: `unrecognised argument ${arg}` }
  }
  if (!out.url) return { error: 'a --url is required' }
  if (!Number.isFinite(out.rounds) || out.rounds < 1) return { error: '--rounds must be a positive number' }
  return out
}

/** Summarise one cohort's attempts into the line a reader needs. */
export function summariseCohort(key, attempts) {
  const total = attempts.length
  const byOutcome = {}
  for (const attempt of attempts) byOutcome[attempt.outcome] = (byOutcome[attempt.outcome] ?? 0) + 1
  const failures = total - (byOutcome[OUTCOME.OK] ?? 0)
  const times = attempts.filter((a) => a.outcome === OUTCOME.OK).map((a) => a.ms).sort((a, b) => a - b)
  const median = times.length > 0 ? times[Math.floor(times.length / 2)] : null
  return { key, total, failures, byOutcome, medianMs: median, slowestMs: times.length > 0 ? times[times.length - 1] : null }
}

/**
 * The verdict, stated so an inconclusive run cannot be read as a clean bill of
 * health. "It did not reproduce" is an honest and common answer for an
 * intermittent network fault, and saying so is the point.
 */
export function judgeProbe(summaries, controlSummary) {
  const site = summaries.filter((s) => s.failures > 0)
  const controlFailed = controlSummary.failures > 0
  if (site.length === 0 && !controlFailed) {
    return { state: 'not-reproduced', message: 'Every request from this runner was answered. The drop did NOT reproduce here, which does not disprove it: an intermittent mitigation decision is not on all the time.' }
  }
  if (controlFailed && site.length > 0) {
    return { state: 'runner-egress', message: `The control host failed too (${controlSummary.failures} of ${controlSummary.total}). This runner's egress is unhealthy, so nothing here is evidence about production.` }
  }
  const smoke = summaries.find((s) => s.key === 'smoke-agent')
  const browser = summaries.find((s) => s.key === 'browser-agent')
  if (smoke && browser && smoke.failures > 0 && browser.failures === 0) {
    return { state: 'agent-filtered', message: `Only the smoke user agent failed (${smoke.failures} of ${smoke.total}) while the browser agent did not. The agent IS the variable.` }
  }
  return {
    state: 'reproduced-address',
    message: `Requests failed across ${site.length} cohort(s) regardless of user agent while the control host answered. The address, not the agent, is the variable, which is what a network-layer mitigation of a shared datacentre address looks like.`,
  }
}

/*
 * EXIT WITH process.exitCode AND LET THE LOOP DRAIN, never process.exit().
 *
 * Driving the machine-callers guard's failure drill on Windows produced exit
 * 3221226505 and a libuv assertion on UV_HANDLE_CLOSING instead of exit 1:
 * process.exit() tears the loop down while undici still holds the socket the
 * last fetch opened. A script that CRASHES instead of failing sends its next
 * reader looking for a bug in Node. Every script here that makes a request
 * ends the same way for the same reason.
 */

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.error) {
    console.error(`transport-probe: ${args.error}`)
    process.exit(2)
  }
  const base = args.url.replace(/\/$/, '')

  console.log('TRANSPORT PROBE (read only, GET only)')
  console.log(`  target   ${base}/`)
  console.log(`  control  ${CONTROL_URL}`)
  console.log(`  rounds   ${args.rounds} per cohort, ${args.gapMs}ms apart`)
  const whoami = await once(CONTROL_URL, {})
  const egress = whoami.outcome === OUTCOME.OK ? (whoami.body ?? '').trim() : 'unknown'
  console.log(`  egress   ${egress}`)
  console.log('')

  const attempts = { control: [] }
  for (const cohort of COHORTS) attempts[cohort.key] = []

  for (let round = 1; round <= args.rounds; round += 1) {
    for (const cohort of COHORTS) {
      const result = await once(`${base}/`, cohort.headers)
      attempts[cohort.key].push(result)
      if (result.outcome !== OUTCOME.OK) {
        console.log(`  round ${round} ${cohort.key}: ${result.outcome} ${result.error ?? result.status} after ${result.ms}ms`)
      }
      await sleep(args.gapMs)
    }
    const control = await once(CONTROL_URL, {})
    attempts.control.push(control)
    if (control.outcome !== OUTCOME.OK) {
      console.log(`  round ${round} control: ${control.outcome} ${control.error ?? control.status} after ${control.ms}ms`)
    }
    if (round % 5 === 0) console.log(`  ...${round} of ${args.rounds} rounds`)
  }

  const summaries = COHORTS.map((c) => summariseCohort(c.key, attempts[c.key]))
  const controlSummary = summariseCohort('control', attempts.control)
  const verdict = judgeProbe(summaries, controlSummary)

  console.log('')
  console.log('='.repeat(78))
  for (const summary of [...summaries, controlSummary]) {
    const outcomes = Object.entries(summary.byOutcome).map(([k, v]) => `${k}=${v}`).join(' ')
    console.log(`${summary.key.padEnd(14)} ${summary.total - summary.failures}/${summary.total} answered, median ${summary.medianMs ?? 'n/a'}ms, slowest ${summary.slowestMs ?? 'n/a'}ms  [${outcomes}]`)
  }
  console.log('='.repeat(78))
  console.log(`VERDICT ${verdict.state}`)
  console.log(verdict.message)

  if (args.report) {
    writeFileSync(args.report, JSON.stringify({ egress, ranAt: new Date().toISOString(), target: base, summaries, control: controlSummary, verdict }, null, 2))
    console.log(`report written to ${args.report}`)
  }

  const requests = [...summaries, controlSummary].reduce((n, s) => n + s.total, 0)
  const transportFailures = [...summaries, controlSummary].reduce((n, s) => n + s.failures, 0)
  declareWork('transport-probe', {
    did: { 'request made': requests, cohort: summaries.length + 1 },
    found: { 'request that did not answer': transportFailures },
    exitOnZero: false,
  })

  // The probe never fails the job. It is an instrument, and an instrument that
  // reddens a pipeline gets pointed away from the thing it was built to watch.
  process.exitCode = 0
}

if (process.argv[1] && process.argv[1].endsWith('transport-probe.mjs')) {
  main().catch((err) => {
    console.error('transport-probe: the probe itself failed')
    console.error(err)
    process.exit(2)
  })
}
