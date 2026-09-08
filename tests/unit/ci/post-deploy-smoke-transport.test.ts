// THE POST-DEPLOY SMOKE'S TRANSPORT CONTRACT (close-out H2, 8 September 2026).
//
// Run 34143506887 on main at 9ac4d885 emailed the owner to say production was
// down. Production was fine. The whole verdict came from this line:
//
//   HTTP=$(curl -fsSL ... || echo "curl-failed")
//   if [ "$HTTP" != "200" ]; then exit 1; fi
//
// One request, no retry, and a bad status, a dead connection and a timeout all
// collapsed into the string `000curl-failed`. These tests hold the three rules
// that replace it:
//
//   1. a transport fault is retried, an ANSWER never is
//   2. the three faults are told apart and described differently
//   3. a run that cannot see the commit under test refuses to judge anything

import { describe, it, expect } from 'vitest'
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
} from '../../../scripts/lib/smoke-transport.mjs'

/** undici's real shape: a TypeError whose `cause` carries the fact. */
function undiciError(code: string, message: string): Error {
  const cause = Object.assign(new Error(message), { code })
  return Object.assign(new TypeError('fetch failed'), { cause })
}

describe('what gets retried', () => {
  it('retries a connection failure and a timeout, because asking again is free', () => {
    expect(isRetryable(OUTCOME.CONNECTION)).toBe(true)
    expect(isRetryable(OUTCOME.TIMEOUT)).toBe(true)
  })

  it('never retries an answer, because re-asking until it changes launders it', () => {
    expect(isRetryable(OUTCOME.HTTP_STATUS)).toBe(false)
    expect(isRetryable(OUTCOME.BODY)).toBe(false)
  })

  it('never retries a missing input, because asking again cannot conjure a secret', () => {
    expect(isRetryable(OUTCOME.CONFIG)).toBe(false)
  })

  it('backs off far enough to outlast a mitigation decision, not 200ms', () => {
    expect(backoffMsForAttempt(1)).toBe(0)
    expect(backoffMsForAttempt(2)).toBeGreaterThanOrEqual(5_000)
    expect(backoffMsForAttempt(3)).toBeGreaterThan(backoffMsForAttempt(2))
    expect(backoffMsForAttempt(4)).toBeGreaterThan(backoffMsForAttempt(3))
    // Past the ladder it must still be a number, never undefined turning a
    // sleep into an immediate retry storm.
    expect(backoffMsForAttempt(9)).toBeGreaterThan(0)
  })
})

describe('telling the three faults apart', () => {
  it('reads a reset connection as a connection fault, which is what killed run 34143506887', () => {
    expect(classifyThrown(undiciError('ECONNRESET', 'read ECONNRESET'))).toBe(OUTCOME.CONNECTION)
  })

  it('reads a refused connection and a DNS failure as connection faults too', () => {
    expect(classifyThrown(undiciError('ECONNREFUSED', 'connect ECONNREFUSED'))).toBe(OUTCOME.CONNECTION)
    expect(classifyThrown(undiciError('ENOTFOUND', 'getaddrinfo ENOTFOUND'))).toBe(OUTCOME.CONNECTION)
  })

  it('reads an AbortSignal.timeout rejection as a timeout, not as a connection fault', () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    expect(classifyThrown(timeout)).toBe(OUTCOME.TIMEOUT)
  })

  it('reads a connect timeout carried on the cause as a timeout', () => {
    expect(classifyThrown(undiciError('UND_ERR_CONNECT_TIMEOUT', 'Connect Timeout Error'))).toBe(OUTCOME.TIMEOUT)
  })

  it('describes each fault differently, so one line cannot mean several things', () => {
    const said = [OUTCOME.HTTP_STATUS, OUTCOME.BODY, OUTCOME.CONNECTION, OUTCOME.TIMEOUT, OUTCOME.CONFIG, OUTCOME.WRONG_BUILD].map(describeOutcome)
    expect(new Set(said).size).toBe(said.length)
  })

  it('never blames the site for serving a different build than the one under test', () => {
    // Driving the pinned wait against real production printed "the deployment
    // is serving something it should not" for a site that was serving
    // perfectly, because the refusal borrowed the wrong-status sentence.
    expect(describeOutcome(OUTCOME.WRONG_BUILD)).toContain('answered well')
    expect(describeOutcome(OUTCOME.WRONG_BUILD)).not.toContain('should not')
  })

  it('never retries a wrong build, because waiting is the wait step, not the check', () => {
    expect(isRetryable(OUTCOME.WRONG_BUILD)).toBe(false)
  })

  it('says plainly that a connection fault is not proof the site is down', () => {
    expect(describeOutcome(OUTCOME.CONNECTION)).toContain('not proof the site is down')
  })

  it('surfaces the cause, because three identical "fetch failed" lines are three lost investigations', () => {
    const described = describeThrown(undiciError('ECONNRESET', 'read ECONNRESET'))
    expect(described).toContain('fetch failed')
    expect(described).toContain('ECONNRESET')
  })
})

describe('the verdict for a check', () => {
  const attempt = (outcome: string) => ({ outcome })

  it('passes when a later attempt succeeds, which is the whole point of retrying', () => {
    const verdict = verdictFromAttempts([attempt(OUTCOME.CONNECTION), attempt(OUTCOME.OK)])
    expect(verdict.ok).toBe(true)
    expect(verdict.reason).toContain('attempt 2 of 2')
  })

  it('fails, and says CONSISTENT, when every attempt failed the same way', () => {
    const verdict = verdictFromAttempts([attempt(OUTCOME.CONNECTION), attempt(OUTCOME.CONNECTION), attempt(OUTCOME.CONNECTION)])
    expect(verdict.ok).toBe(false)
    expect(verdict.consistent).toBe(true)
    expect(verdict.reason).toContain('3 of 3')
  })

  it('fails, and says the attempts DISAGREED, when they did', () => {
    const verdict = verdictFromAttempts([attempt(OUTCOME.CONNECTION), attempt(OUTCOME.HTTP_STATUS)])
    expect(verdict.ok).toBe(false)
    expect(verdict.consistent).toBe(false)
    expect(verdict.reason).toContain('disagreed')
  })

  it('refuses to call zero attempts a pass', () => {
    expect(verdictFromAttempts([]).ok).toBe(false)
  })
})

describe('reading the build the site says it is', () => {
  const html = '<html data-dpl-id="dpl_6RzyCmyByKLG7tG3q8KxsjjLQwNo"><script>sentry-release=449311aedc29695ef540fbe708bd1273840e1ed4</script>'

  it('finds both markers production actually serves', () => {
    expect(readBuildMarkers(html)).toEqual({
      sha: '449311aedc29695ef540fbe708bd1273840e1ed4',
      deploymentId: 'dpl_6RzyCmyByKLG7tG3q8KxsjjLQwNo',
    })
  })

  it('returns nulls rather than guessing when the markers are absent', () => {
    expect(readBuildMarkers('<html></html>')).toEqual({ sha: null, deploymentId: null })
  })

  it('matches an abbreviated sha against a full one, and refuses anything shorter than seven', () => {
    expect(shaMatches('449311aedc29695ef540fbe708bd1273840e1ed4', '449311ae')).toBe(true)
    expect(shaMatches('449311ae', '449311aedc29695ef540fbe708bd1273840e1ed4')).toBe(true)
    expect(shaMatches('449311ae', '9ac4d885')).toBe(false)
    expect(shaMatches('44931', '44931')).toBe(false)
    expect(shaMatches(null, '449311ae')).toBe(false)
  })
})

describe('the deployment under test (H2.3)', () => {
  const base = { polls: 6, transportFailures: 0, budgetSeconds: 240, lastSeenDeploymentId: 'dpl_old' }

  it('passes when the commit under test is the one being served', () => {
    const judged = judgeDeploymentWait({ ...base, expectedSha: '449311ae', lastSeenSha: '449311aedc29695ef540fbe708bd1273840e1ed4' })
    expect(judged.ok).toBe(true)
    expect(judged.state).toBe('arrived')
  })

  it('REFUSES when a different commit is live, which is the fault that made the run judge the previous build', () => {
    const judged = judgeDeploymentWait({ ...base, expectedSha: '449311ae', lastSeenSha: '9ac4d885ad5caec9f68123e3a65813546ad9f975' })
    expect(judged.ok).toBe(false)
    expect(judged.state).toBe('absent')
    expect(judged.message).toContain('never became live')
    expect(judged.message).toContain('9ac4d885')
  })

  it('says BLIND, not "the deploy failed", when every poll failed at the transport', () => {
    const judged = judgeDeploymentWait({ ...base, polls: 6, transportFailures: 6, expectedSha: '449311ae', lastSeenSha: null })
    expect(judged.ok).toBe(false)
    expect(judged.state).toBe('blind')
    expect(judged.message).toContain('NOT evidence that the deploy failed')
  })

  it('is blind for an UNPINNED run too: seeing nothing is never a pass', () => {
    // The first version of this function answered `unpinned, ok` here, so a
    // smoke pointed at a host that answered nothing reported its wait as passed
    // and went on to check it. Found by driving it at a closed port.
    const judged = judgeDeploymentWait({ ...base, polls: 3, transportFailures: 3, expectedSha: null, lastSeenSha: null })
    expect(judged.ok).toBe(false)
    expect(judged.state).toBe('blind')
  })

  it('says out loud that it is judging whatever is live when no commit was pinned', () => {
    const judged = judgeDeploymentWait({ ...base, expectedSha: null, lastSeenSha: '449311ae' })
    expect(judged.ok).toBe(true)
    expect(judged.state).toBe('unpinned')
    expect(judged.message).toContain('No commit was pinned')
  })
})
