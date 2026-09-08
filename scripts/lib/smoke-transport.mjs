/**
 * Transport classification and retry policy for the post-deploy smoke.
 *
 * WHY THIS FILE EXISTS (close-out H2, 8 September 2026).
 *
 * Run 34143506887 on main at 9ac4d885 declared production down. It was not.
 * The step was:
 *
 *     HTTP=$(curl -fsSL -o "$BODY_FILE" -w '%{http_code}' ... || echo "curl-failed")
 *     if [ "$HTTP" != "200" ]; then ... exit 1; fi
 *
 * curl exited 35 with "Recv failure: Connection reset by peer", the shell
 * appended the word `curl-failed` to an empty status, and the gate reported
 * `HTTP=000curl-failed, expected 200`. One request, no retry, and three
 * different faults rendered as one string:
 *
 *   a non-200 answer          the product is broken            (do not retry)
 *   a connection failure      nothing was ever answered        (retry)
 *   a timeout                 something answered too slowly    (retry)
 *
 * curl's own error table (https://curl.se/libcurl/c/libcurl-errors.html,
 * fetched 2026-09-08) defines 35 as CURLE_SSL_CONNECT_ERROR, "A problem
 * occurred somewhere in the SSL/TLS handshake". The handshake is BEFORE the
 * request line, so production never saw the path, the cookie or the
 * `eventlinqs-post-deploy-smoke/1.0` user agent that run was later suspected
 * of tripping over. The reset cannot have been a reply to any of them.
 *
 * WHAT IS RETRIED, AND WHAT IS NEVER RETRIED.
 *
 * Transport failures are retried, because a single dropped connection is not
 * evidence of anything and asking again is free. An ANSWER is never retried:
 * a 500, a 404 or an error boundary inside a 200 is the product's own reply,
 * and re-asking until it changes launders it into a pass. That rule is not new
 * here; scripts/verify/axe-urls.mjs adopted it on 8 September for the same
 * reason, and this file states it in one place so both agree.
 */

/** How a single attempt ended. Order matters only for reading. */
export const OUTCOME = {
  OK: 'ok',
  /** The server answered, with a status we did not expect. */
  HTTP_STATUS: 'http-status',
  /** The server answered 200 and the body carries a failure signature. */
  BODY: 'body',
  /** Nothing was answered: DNS, TCP, TLS or a reset mid-flight. */
  CONNECTION: 'connection',
  /** Something was answering, too slowly, and we gave up on it. */
  TIMEOUT: 'timeout',
  /**
   * The site answered, correctly, from a DIFFERENT build than the one this run
   * is about. Found by driving the pinned wait against real production: the
   * refusal was classified as HTTP_STATUS and therefore explained as "the
   * deployment is serving something it should not", which is a false accusation
   * about a site that was serving perfectly. It is its own fault because the
   * response to it is its own: wait, or re-run against the right commit.
   */
  WRONG_BUILD: 'wrong-build',
  /**
   * The check could not be asked at all, because something the GATE needs is
   * missing. Driving the first version of this file found it printing "the
   * deployment is serving something it should not" for an unset CRON_SECRET,
   * which is a false accusation against production for a fault of ours. A
   * missing input is still a FAILURE, never a skip, but it is our failure.
   */
  CONFIG: 'configuration',
}

/** Outcomes that are worth asking again about. */
const RETRYABLE = new Set([OUTCOME.CONNECTION, OUTCOME.TIMEOUT])

export function isRetryable(outcome) {
  return RETRYABLE.has(outcome)
}

/**
 * Flatten the cause chain into one readable line.
 *
 * undici reports every transport fault as `TypeError: fetch failed` and hides
 * the fact on `.cause`. Driving this file against a closed port printed three
 * identical `TypeError: fetch failed` lines, which is the same "three faults,
 * one string" defect the whole item exists to end: a reader cannot tell a
 * refused connection from a reset one from a DNS failure, and those are three
 * different investigations.
 */
export function describeThrown(err) {
  const parts = []
  let node = err
  for (let depth = 0; node && depth < 6; depth += 1) {
    const name = typeof node.name === 'string' ? node.name : 'Error'
    const code = typeof node.code === 'string' ? ` ${node.code}` : ''
    const message = typeof node.message === 'string' ? node.message : String(node)
    parts.push(`${name}${code}: ${message}`)
    node = node.cause
  }
  return parts.join(' <- ')
}

/**
 * Turn a thrown fetch error into one of the transport outcomes.
 *
 * undici reports almost everything as `TypeError: fetch failed` and puts the
 * real fault on `.cause`, so the cause chain is walked rather than the message
 * matched. An AbortSignal.timeout rejection arrives as a DOMException named
 * TimeoutError and carries no cause at all.
 */
export function classifyThrown(err) {
  const names = []
  const codes = []
  let node = err
  for (let depth = 0; node && depth < 6; depth += 1) {
    if (typeof node.name === 'string') names.push(node.name)
    if (typeof node.code === 'string') codes.push(node.code)
    node = node.cause
  }

  if (names.includes('TimeoutError') || names.includes('AbortError')) return OUTCOME.TIMEOUT
  if (codes.some((c) => c.includes('TIMEOUT') || c === 'ETIMEDOUT')) return OUTCOME.TIMEOUT

  // Everything else that threw is a connection that never produced a response:
  // ECONNRESET, ECONNREFUSED, ENOTFOUND, EAI_AGAIN, UND_ERR_SOCKET, a TLS
  // handshake failure. They are one class because the response to all of them
  // is the same: ask again.
  return OUTCOME.CONNECTION
}

/**
 * The one sentence a reader needs for an outcome. A gate that prints the same
 * line for three different problems teaches the reader to stop reading it.
 */
export function describeOutcome(outcome) {
  switch (outcome) {
    case OUTCOME.OK:
      return 'answered as expected'
    case OUTCOME.HTTP_STATUS:
      return 'ANSWERED with the wrong status: the deployment is serving something it should not'
    case OUTCOME.BODY:
      return 'ANSWERED 200 carrying a failure signature in the response body: the page or the endpoint reported an error while answering'
    case OUTCOME.WRONG_BUILD:
      return 'ANSWERED, and answered well, but from a DIFFERENT build than the commit this run is about, so nothing here would be evidence about it'
    case OUTCOME.CONNECTION:
      return 'NEVER ANSWERED: the connection failed before a response arrived, which is a network or edge fault and not proof the site is down'
    case OUTCOME.TIMEOUT:
      return 'TOO SLOW: the deadline passed with no complete response'
    case OUTCOME.CONFIG:
      return 'NOT ASKED: the gate is missing something it needs, so this says nothing about production'
    default:
      return `unrecognised outcome ${String(outcome)}`
  }
}

/**
 * Backoff before attempt n (1-indexed). Deliberately long rather than tight:
 * the fault this exists for is a scrubbing layer dropping a shared datacentre
 * address, and those decisions last seconds to minutes, so three retries
 * 200ms apart would only produce three identical failures and the same false
 * alarm with more log.
 */
export function backoffMsForAttempt(attempt) {
  const ladder = [0, 5_000, 15_000, 30_000]
  return ladder[Math.min(attempt - 1, ladder.length - 1)] ?? 30_000
}

/**
 * Decide the verdict for one check from every attempt it made.
 *
 * PASS as soon as any attempt is OK: a check that succeeds on the second try
 * succeeded. FAIL when the last attempt failed, and name WHICH failure,
 * because "consistent" for a transport fault means every attempt failed at
 * the transport, and that is a different report from a single 500.
 */
export function verdictFromAttempts(attempts) {
  if (attempts.length === 0) {
    return { ok: false, outcome: OUTCOME.CONNECTION, consistent: false, attempts: 0, reason: 'no attempt was made' }
  }
  const passing = attempts.find((a) => a.outcome === OUTCOME.OK)
  if (passing) {
    return {
      ok: true,
      outcome: OUTCOME.OK,
      consistent: attempts.length === 1,
      attempts: attempts.length,
      reason:
        attempts.length === 1
          ? 'answered on the first attempt'
          : `answered on attempt ${attempts.indexOf(passing) + 1} of ${attempts.length}`,
    }
  }
  const last = attempts[attempts.length - 1]
  const allSame = attempts.every((a) => a.outcome === last.outcome)
  return {
    ok: false,
    outcome: last.outcome,
    consistent: allSame,
    attempts: attempts.length,
    reason: allSame
      ? `${attempts.length} of ${attempts.length} attempts ${describeOutcome(last.outcome)}`
      : `attempts disagreed (${attempts.map((a) => a.outcome).join(', ')}); the last one ${describeOutcome(last.outcome)}`,
  }
}

/**
 * Read the two markers the production HTML carries about itself.
 *
 * `sentry-release=<sha>` names the COMMIT the running build was made from,
 * which is what "the deployment under test" actually means. `data-dpl-id`
 * names the Vercel deployment, which is what tells us the build did not change
 * underneath the run.
 */
export function readBuildMarkers(html) {
  const sha = html.match(/sentry-release=([0-9a-f]{7,40})/)
  const dpl = html.match(/data-dpl-id="(dpl_[A-Za-z0-9]+)"/)
  return { sha: sha ? sha[1] : null, deploymentId: dpl ? dpl[1] : null }
}

/** Do two shas name the same commit, allowing either to be abbreviated. */
export function shaMatches(expected, observed) {
  if (!expected || !observed) return false
  const a = expected.toLowerCase()
  const b = observed.toLowerCase()
  const n = Math.min(a.length, b.length)
  if (n < 7) return false
  return a.slice(0, n) === b.slice(0, n)
}

/**
 * Judge a finished wait for the deployment under test.
 *
 * THE FAULT THIS REPLACES. The old step captured a deployment id, polled six
 * times for it to CHANGE, and then carried on regardless of what it saw. In
 * run 34143506887 the id never changed across all six polls, so the smoke
 * judged the PREVIOUS build and reported on it as though it were the new one.
 * A gate that silently tests something other than the thing under test is not
 * a gate.
 *
 * Three endings, three different messages:
 *   arrived   the commit under test is live and named itself
 *   absent    the budget passed and a DIFFERENT commit was live the whole time
 *   blind     the budget passed and we never got an answer to read at all
 */
export function judgeDeploymentWait({ expectedSha, lastSeenSha, lastSeenDeploymentId, polls, transportFailures, budgetSeconds }) {
  // BLIND IS JUDGED FIRST, and it is judged for a pinned run and an unpinned
  // one alike. The first version of this function answered `unpinned, ok` for
  // a run in which every single poll had failed at the transport, so a smoke
  // pointed at a host that answered nothing at all reported its wait as passed
  // and went on to "check" it. Found by driving it against a closed port.
  const blind = polls > 0 && transportFailures === polls
  if (blind) {
    return {
      state: 'blind',
      ok: false,
      message: `Could not read the live build at all: ${transportFailures} of ${polls} polls failed at the transport inside ${budgetSeconds}s. This is a connection fault, NOT evidence that the deploy failed.`,
    }
  }
  if (!expectedSha) {
    return {
      state: 'unpinned',
      ok: true,
      message: `No commit was pinned for this run, so the smoke judges whatever is live: ${lastSeenSha ?? 'unknown commit'} (${lastSeenDeploymentId ?? 'unknown deployment'}).`,
    }
  }
  if (shaMatches(expectedSha, lastSeenSha)) {
    return {
      state: 'arrived',
      ok: true,
      message: `The deployment under test is live: commit ${lastSeenSha} as ${lastSeenDeploymentId ?? 'an unnamed deployment'}.`,
    }
  }
  return {
    state: 'absent',
    ok: false,
    message: `The deployment for ${expectedSha} never became live inside ${budgetSeconds}s. The site is serving ${lastSeenSha ?? 'a build with no release marker'} (${lastSeenDeploymentId ?? 'unknown deployment'}). Refusing to smoke a build this run is not about.`,
  }
}
