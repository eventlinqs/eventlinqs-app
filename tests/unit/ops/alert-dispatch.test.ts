// THE ALERT CHANNEL CONTRACT (close-out H2.4, 8 September 2026).
//
// When the post-deploy smoke failed on 7 September the alert email was never
// delivered. The step was:
//
//   curl -fsSL -X POST https://api.resend.com/emails ... \
//     || echo "::warning::Resend dispatch failed"
//
// Resend answered 429, `curl -f` discarded the body, and the step printed a
// warning and exited 0. Three separate ways to lose an alert in one line: no
// retry, no reason, and a failure that is not a failure.
//
// Resend publishes the limit as "10 requests per second per team"
// (https://resend.com/docs/api-reference/introduction, fetched 2026-09-08) and
// documents THREE different 429s: rate_limit_exceeded, daily_quota_exceeded and
// monthly_quota_exceeded (https://resend.com/docs/api-reference/errors, fetched
// 2026-09-08). One of those clears in a second and two do not clear today, so
// retrying blindly is as wrong as not retrying at all.

import { describe, it, expect } from 'vitest'
import { alertBackoffMs, judgeResendResponse, renderFailureLines } from '../../../scripts/ops/alert-dispatch.mjs'

describe('reading what Resend actually said', () => {
  it('accepts a 200', () => {
    const judged = judgeResendResponse(200, JSON.stringify({ id: 'abc' }))
    expect(judged.ok).toBe(true)
    expect(judged.retry).toBe(false)
  })

  it('RETRIES a rate_limit_exceeded, because that is a burst and it clears', () => {
    const judged = judgeResendResponse(429, JSON.stringify({ name: 'rate_limit_exceeded', message: 'Too many requests' }))
    expect(judged.ok).toBe(false)
    expect(judged.retry).toBe(true)
    expect(judged.reason).toContain('10 requests per second')
  })

  it('does NOT retry a daily quota, because retrying cannot clear a quota', () => {
    const judged = judgeResendResponse(429, JSON.stringify({ name: 'daily_quota_exceeded' }))
    expect(judged.ok).toBe(false)
    expect(judged.retry).toBe(false)
    expect(judged.reason).toContain('quota')
    expect(judged.name).toBe('daily_quota_exceeded')
  })

  it('does NOT retry a monthly quota either, and names it', () => {
    const judged = judgeResendResponse(429, JSON.stringify({ name: 'monthly_quota_exceeded' }))
    expect(judged.retry).toBe(false)
    expect(judged.name).toBe('monthly_quota_exceeded')
  })

  it('still reports a 429 with no error name rather than swallowing it', () => {
    // This is the exact evidence the old step destroyed: `curl -f` threw the
    // body away, so nobody could tell which 429 it was.
    const judged = judgeResendResponse(429, '')
    expect(judged.ok).toBe(false)
    expect(judged.reason).toContain('429')
  })

  it('retries a 5xx and refuses a 4xx that is not a rate limit', () => {
    expect(judgeResendResponse(503, '').retry).toBe(true)
    expect(judgeResendResponse(422, JSON.stringify({ name: 'validation_error' })).retry).toBe(false)
  })

  it('survives a non-JSON body instead of throwing inside the alert path', () => {
    const judged = judgeResendResponse(502, '<html>bad gateway</html>')
    expect(judged.ok).toBe(false)
    expect(judged.name).toBeNull()
  })

  it('backs off wider than the one-second bucket it is backing off from', () => {
    expect(alertBackoffMs(1)).toBe(0)
    expect(alertBackoffMs(2)).toBeGreaterThan(1_000)
    expect(alertBackoffMs(3)).toBeGreaterThan(alertBackoffMs(2))
    expect(alertBackoffMs(20)).toBeGreaterThan(0)
  })
})

describe('what the alert actually says', () => {
  it('names which check failed and what that means, not "at least one of the checks"', () => {
    const lines = renderFailureLines({
      site: 'https://www.eventlinqs.com.au',
      expectedSha: '449311ae',
      servedSha: '9ac4d885',
      deploymentId: 'dpl_x',
      failures: [{ name: 'homepage anonymous', reason: '4 of 4 attempts NEVER ANSWERED', meaning: 'the connection failed before a response arrived' }],
    })
    const text = lines.join('\n')
    expect(text).toContain('homepage anonymous')
    expect(text).toContain('4 of 4 attempts')
    expect(text).toContain('the connection failed before a response arrived')
    // The commit disagreement is the H2.3 fault; the alert must show both.
    expect(text).toContain('449311ae')
    expect(text).toContain('9ac4d885')
  })

  it('still says something useful when no report was produced', () => {
    expect(renderFailureLines(null).join('\n')).toContain('No smoke report')
  })

  it('flags a report that names no failing check, rather than reading as an all-clear', () => {
    const lines = renderFailureLines({ site: 'x', expectedSha: null, servedSha: null, deploymentId: null, failures: [] })
    expect(lines.join('\n')).toContain('names no failing check')
  })
})
