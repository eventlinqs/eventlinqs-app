/**
 * The post-deploy production smoke, as a script in this repository.
 *
 * WHY IT IS A SCRIPT (close-out H2, 8 September 2026). It used to be six
 * inline bash steps in .github/workflows/post-deploy-smoke.yml. Nothing about
 * it could be run before pushing, nothing about it could be tested, and its
 * central comparison was a string:
 *
 *     HTTP=$(curl ... || echo "curl-failed")
 *     if [ "$HTTP" != "200" ]; then exit 1; fi
 *
 * On 7 September that produced `HTTP=000curl-failed, expected 200` and an
 * email saying production was down, from a single dropped TCP connection,
 * while the site was serving correctly. The four faults that run exposed are
 * fixed here and each is named where it is fixed:
 *
 *   H2.2  one attempt, no retry, and three faults printed identically
 *   H2.3  the deployment under test was never identified, so the run judged
 *         the PREVIOUS build
 *   H2.4  the alert channel silently dropped its own alert (see
 *         scripts/ops/alert-dispatch.mjs)
 *
 * BOUNDARY. Read only. This script issues GET requests to the live site and
 * writes nothing anywhere except its own report file. It is the one thing
 * pointed at production on every deploy, so that boundary is stated as a rule
 * rather than left to be inferred.
 *
 * Usage:
 *   node scripts/verify/post-deploy-smoke.mjs \
 *     --url https://www.eventlinqs.com.au \
 *     --expect-sha <40-char commit sha> \
 *     [--wait-seconds 240] [--attempts 4] [--report smoke-report.json]
 *
 * --expect-sha may be omitted, and then the smoke judges whatever is live and
 * says so. It is never silently inferred.
 *
 * Exit codes:
 *   0  every check passed
 *   1  a check failed (the report names which, and in which of the three ways)
 *   2  the script was asked for something it cannot do (bad arguments, missing
 *      secret). This is not a production verdict.
 */

import { writeFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'
import {
  OUTCOME,
  backoffMsForAttempt,
  classifyThrown,
  describeOutcome,
  describeThrown,
  isRetryable,
  judgeDeploymentWait,
  readBuildMarkers,
  shaMatches,
  verdictFromAttempts,
} from '../lib/smoke-transport.mjs'

const USER_AGENT = 'eventlinqs-post-deploy-smoke/2.0'
const REQUEST_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 15_000

/** Phrases that mean the page rendered an error while answering 200. */
const BODY_FAILURE_SIGNATURES = ['We hit a snag loading this page', 'Minified React error']

function parseArgs(argv) {
  const out = {
    url: null,
    expectSha: null,
    waitSeconds: 240,
    attempts: 4,
    report: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => argv[(i += 1)]
    if (arg === '--url') out.url = next()
    else if (arg === '--expect-sha') out.expectSha = next()
    else if (arg === '--wait-seconds') out.waitSeconds = Number(next())
    else if (arg === '--attempts') out.attempts = Number(next())
    else if (arg === '--report') out.report = next()
    else return { error: `unrecognised argument ${arg}` }
  }
  if (!out.url) return { error: 'a --url is required; this script never guesses which site it is smoking' }
  if (!Number.isFinite(out.waitSeconds) || out.waitSeconds < 0) return { error: '--wait-seconds must be a number' }
  if (!Number.isFinite(out.attempts) || out.attempts < 3) {
    return { error: '--attempts must be at least 3; a single failed request must never declare production down (H2.2)' }
  }
  // An unset secret arrives as the empty string from a GitHub expression, and a
  // literal empty --expect-sha is the same thing as not pinning one.
  if (out.expectSha !== null && out.expectSha.trim() === '') out.expectSha = null
  return out
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One request, classified. Never throws for a transport fault: the fault IS
 * the return value, because the caller has to be able to tell the three apart.
 */
async function attemptRequest(url, { headers = {}, expectStatus = 200, allowRedirects = true } = {}) {
  const started = Date.now()
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, ...headers },
      redirect: allowRedirects ? 'follow' : 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const body = await res.text()
    const elapsedMs = Date.now() - started
    if (res.status !== expectStatus) {
      return { outcome: OUTCOME.HTTP_STATUS, status: res.status, elapsedMs, body, redirected: res.redirected }
    }
    return { outcome: OUTCOME.OK, status: res.status, elapsedMs, body, redirected: res.redirected }
  } catch (err) {
    // NOT a silent catch: the fault is classified, returned, and printed by
    // the caller on the line for that attempt.
    const outcome = classifyThrown(err)
    return {
      outcome,
      status: null,
      elapsedMs: Date.now() - started,
      body: '',
      error: describeThrown(err),
    }
  }
}

/**
 * A check: attempt it, retry the transport faults with backoff, never retry an
 * answer. Prints one line per attempt so the report of a flaky run reads as a
 * flaky run rather than as an outage.
 */
async function runCheck(name, url, options = {}) {
  const { attempts: maxAttempts = 4, judgeBody = false, ...requestOptions } = options
  const attempts = []
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const wait = backoffMsForAttempt(attempt)
    if (wait > 0) {
      console.log(`    waiting ${wait / 1000}s before attempt ${attempt}`)
      await sleep(wait)
    }
    const result = await attemptRequest(url, requestOptions)
    if (result.outcome === OUTCOME.OK && judgeBody) {
      const hit = BODY_FAILURE_SIGNATURES.find((phrase) => result.body.includes(phrase))
      if (hit) {
        result.outcome = OUTCOME.BODY
        result.bodySignature = hit
      }
    }
    attempts.push(result)
    const detail =
      result.outcome === OUTCOME.OK
        ? `${result.status} in ${result.elapsedMs}ms`
        : `${result.outcome}${result.status ? ` (${result.status})` : ''}${result.error ? ` ${result.error}` : ''}${result.bodySignature ? ` "${result.bodySignature}"` : ''} after ${result.elapsedMs}ms`
    console.log(`    attempt ${attempt}/${maxAttempts}: ${detail}`)
    if (result.outcome === OUTCOME.OK) break
    if (!isRetryable(result.outcome)) {
      console.log(`    not retrying: ${describeOutcome(result.outcome)}`)
      break
    }
  }
  const verdict = verdictFromAttempts(attempts)
  return { name, url, verdict, attempts: attempts.map(({ body, ...rest }) => ({ ...rest, bodyBytes: body.length })), lastBody: attempts[attempts.length - 1]?.body ?? '' }
}

/**
 * H2.3. Wait for the commit under test to be the one production is serving,
 * identified by the release marker the build stamps into its own HTML, and
 * refuse to judge anything else.
 */
async function waitForDeployment(baseUrl, expectSha, waitSeconds) {
  const deadline = Date.now() + waitSeconds * 1000
  let polls = 0
  let transportFailures = 0
  let lastSeenSha = null
  let lastSeenDeploymentId = null

  for (;;) {
    polls += 1
    const result = await attemptRequest(baseUrl)
    if (result.outcome === OUTCOME.OK) {
      const markers = readBuildMarkers(result.body)
      lastSeenSha = markers.sha
      lastSeenDeploymentId = markers.deploymentId
      console.log(`    poll ${polls}: live commit ${markers.sha ?? 'unmarked'} (${markers.deploymentId ?? 'unknown deployment'})`)
      if (!expectSha || shaMatches(expectSha, markers.sha)) break
    } else {
      transportFailures += 1
      console.log(`    poll ${polls}: ${result.outcome} ${result.error ?? ''}`.trimEnd())
    }
    if (Date.now() >= deadline) break
    await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())))
  }

  const judgement = judgeDeploymentWait({
    expectedSha: expectSha,
    lastSeenSha,
    lastSeenDeploymentId,
    polls,
    transportFailures,
    budgetSeconds: waitSeconds,
  })
  return { ...judgement, polls, transportFailures, lastSeenSha, lastSeenDeploymentId }
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
    console.error(`post-deploy-smoke: ${args.error}`)
    process.exit(2)
  }

  const base = args.url.replace(/\/$/, '')
  console.log('POST-DEPLOY SMOKE (read only, GET only)')
  console.log(`  site           ${base}`)
  console.log(`  commit pinned  ${args.expectSha ?? 'none, judging whatever is live'}`)
  console.log(`  attempts       up to ${args.attempts} per check, transport faults only`)
  console.log('')

  const cronSecret = process.env.CRON_SECRET ?? ''
  // The step numbers are counted, not typed. The first version printed
  // "[4/6]" then "[6/6]" whenever the sentinel branch collapsed, which reads
  // as a step that vanished.
  const totalSteps = cronSecret ? 6 : 5
  let step = 1
  const stepLabel = () => `[${step++}/${totalSteps}]`

  console.log(`${stepLabel()} waiting for the deployment under test (budget ${args.waitSeconds}s)`)
  const deployment = await waitForDeployment(base, args.expectSha, args.waitSeconds)
  console.log(`    ${deployment.message}`)
  console.log('')

  const checks = []
  const record = (check) => {
    checks.push(check)
    const mark = check.verdict.ok ? 'PASS' : 'FAIL'
    console.log(`    ${mark} ${check.name} :: ${check.verdict.reason}`)
    console.log('')
    return check
  }

  if (!deployment.ok) {
    // Refusing to judge the wrong build is itself the verdict. Running the
    // checks anyway would produce a green tick for a deployment this run is
    // not about, which is exactly the fault H2.3 names.
    checks.push({
      name: 'the deployment under test is live',
      url: base,
      verdict: { ok: false, outcome: deployment.state === 'blind' ? OUTCOME.CONNECTION : OUTCOME.HTTP_STATUS, consistent: true, attempts: deployment.polls, reason: deployment.message },
      attempts: [],
      lastBody: '',
    })
  } else {
    checks.push({
      name: 'the deployment under test is live',
      url: base,
      verdict: { ok: true, outcome: OUTCOME.OK, consistent: true, attempts: deployment.polls, reason: deployment.message },
      attempts: [],
      lastBody: '',
    })

    const cookieValue = encodeURIComponent('{"city":"Melbourne","region":"Victoria","country":"AU","source":"picker"}')

    console.log(`${stepLabel()} homepage, anonymous`)
    record(await runCheck('homepage anonymous', `${base}/`, { attempts: args.attempts, judgeBody: true }))

    console.log(`${stepLabel()} homepage, el_city cookie set (replays the 2026-05-24 React #185 trigger state)`)
    record(
      await runCheck('homepage with el_city', `${base}/`, {
        attempts: args.attempts,
        judgeBody: true,
        headers: { Cookie: `el_city=${cookieValue}` },
      }),
    )

    if (!cronSecret) {
      // A MISSING SECRET IS A FAILURE, NOT A SKIP. From 2026-07-12 to
      // 2026-07-30 this step warned and exited 0, so production deployed with
      // no sentinel probe at all and the gate reported green every time.
      console.error(`${stepLabel()} CRON_SECRET is not configured, so neither sentinel can be probed.`)
      console.error('      Fix: gh secret set CRON_SECRET (the same value as the Vercel Production scope).')
      console.error('      See docs/payments/WEBHOOK-CANON.md and docs/ops/HEALTH-ALERTS.md.')
      checks.push({
        name: 'sentinels probed',
        url: `${base}/api/cron/webhook-sentinel`,
        verdict: { ok: false, outcome: OUTCOME.CONFIG, consistent: true, attempts: 0, reason: 'CRON_SECRET is not configured as a GitHub Actions secret, so the sentinels were never asked' },
        attempts: [],
        lastBody: '',
      })
    } else {
      // NO REDIRECTS. curl and fetch both DROP the Authorization header across
      // a cross-host redirect, so probing a host that 301s to the canonical one
      // arrives unauthenticated and 401s, which reads exactly like a wrong
      // secret. Asserting zero redirects names the real fault instead.
      console.log(`${stepLabel()} payment sentinel`)
      const payment = record(
        await runCheck('payment sentinel', `${base}/api/cron/webhook-sentinel`, {
          attempts: args.attempts,
          allowRedirects: false,
          headers: { Authorization: `Bearer ${cronSecret}` },
        }),
      )
      if (payment.verdict.ok && !payment.lastBody.includes('"ok":true')) {
        payment.verdict = { ok: false, outcome: OUTCOME.BODY, consistent: true, attempts: payment.verdict.attempts, reason: 'the payment sentinel answered 200 and reported RED' }
        console.log(`    FAIL payment sentinel :: ${payment.verdict.reason}`)
      }

      console.log(`${stepLabel()} platform health sentinel`)
      const health = record(
        await runCheck('platform health sentinel', `${base}/api/cron/health-sentinel`, {
          attempts: args.attempts,
          allowRedirects: false,
          headers: { Authorization: `Bearer ${cronSecret}` },
        }),
      )
      if (health.verdict.ok && health.lastBody.includes('"status":"critical"')) {
        health.verdict = { ok: false, outcome: OUTCOME.BODY, consistent: true, attempts: health.verdict.attempts, reason: 'the platform health sentinel reported CRITICAL' }
        console.log(`    FAIL platform health sentinel :: ${health.verdict.reason}`)
      }
    }

    console.log(`${stepLabel()} confirming the build did not change underneath this run`)
    const after = await attemptRequest(`${base}/`)
    if (after.outcome === OUTCOME.OK) {
      const markers = readBuildMarkers(after.body)
      if (markers.deploymentId && deployment.lastSeenDeploymentId && markers.deploymentId !== deployment.lastSeenDeploymentId) {
        console.log(`    NOTE the live deployment changed mid-run: ${deployment.lastSeenDeploymentId} to ${markers.deploymentId}. The verdicts above belong to the first one.`)
      } else {
        console.log(`    still ${markers.deploymentId ?? 'unknown deployment'}`)
      }
    } else {
      console.log(`    could not re-read the build marker (${after.outcome}); the verdicts above stand on their own attempts`)
    }
    console.log('')
  }

  const failed = checks.filter((c) => !c.verdict.ok)
  const summary = {
    site: base,
    expectedSha: args.expectSha,
    servedSha: deployment.lastSeenSha,
    deploymentId: deployment.lastSeenDeploymentId,
    deploymentState: deployment.state,
    ranAt: new Date().toISOString(),
    ok: failed.length === 0,
    checks: checks.map((c) => ({ name: c.name, url: c.url, ...c.verdict })),
    failures: failed.map((c) => ({ name: c.name, url: c.url, outcome: c.verdict.outcome, reason: c.verdict.reason, meaning: describeOutcome(c.verdict.outcome) })),
  }

  if (args.report) {
    writeFileSync(args.report, JSON.stringify(summary, null, 2))
    console.log(`report written to ${args.report}`)
  }

  console.log('='.repeat(78))
  for (const check of checks) {
    console.log(`${check.verdict.ok ? 'PASS' : 'FAIL'}  ${check.name}`)
    if (!check.verdict.ok) {
      console.log(`      ${check.verdict.reason}`)
      console.log(`      what that means: ${describeOutcome(check.verdict.outcome)}`)
    }
  }
  console.log('='.repeat(78))

  // Declare the work, so a smoke that silently checked nothing cannot report a
  // pass. exitOnZero is false because this script exits with its own verdict
  // three lines down, and a zero here would mask which check failed.
  const requestsMade = checks.reduce((n, c) => n + c.attempts.length, 0) + deployment.polls
  declareWork('post-deploy-smoke', {
    did: { 'check judged': checks.length, 'request made': requestsMade },
    found: { failure: failed.length },
    exitOnZero: false,
  })

  if (failed.length > 0) {
    for (const check of failed) {
      console.log(`::error::${check.name}: ${check.verdict.reason}`)
    }
    process.exitCode = 1
    return
  }
  console.log('post-deploy smoke: every check passed')
}

main().catch((err) => {
  // The script itself broke, which is not a verdict about production. Exit 2
  // so the alert can say so rather than reporting an outage that was ours.
  console.error('post-deploy-smoke: the smoke script itself failed')
  console.error(err)
  process.exit(2)
})
