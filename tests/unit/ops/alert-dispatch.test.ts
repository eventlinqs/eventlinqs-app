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

// THE SUBJECT GRAMMAR, close-out UX4.3, and THE DRILL MARKER, close-out H2.6.
//
// H2.6: the drill of 8 September fired correctly against
// https://smoke-drill.invalid and arrived reading "EventLinqs production
// homepage smoke FAILED", with nothing to say it was a test. The owner
// reasonably read it as a real outage. An alert that cannot be told apart from
// a real one trains the reader to panic or to ignore, and both destroy the
// channel.
//
// UX4.3: main going red produced only GitHub's own "Run failed: CI" email,
// which is the same shape as the one a branch gate sends. Six of those arrived
// for one pull request on 5 September.

import {
  ALERT_CLASSES,
  DRILL_MARKER,
  alertSubject,
  judgeDrill,
  secondChannelWanted,
  parseArgs,
} from '../../../scripts/ops/alert-dispatch.mjs'

describe('is this a drill, decided by the target and not by a flag', () => {
  it('marks a .invalid target, which RFC 2606 reserves for names sure to be invalid', () => {
    const v = judgeDrill({ target: 'https://smoke-drill.invalid' })
    expect(v.drill).toBe(true)
    expect(v.reason).toContain('.invalid')
    expect(v.reason).toContain('RFC 2606')
  })

  it('does NOT mark the real production host', () => {
    expect(judgeDrill({ target: 'https://www.eventlinqs.com.au' }).drill).toBe(false)
  })

  it('cannot be talked out of the marker on a .invalid target', () => {
    // `forced` can only ever ADD the marker. There is no flag that removes it.
    expect(judgeDrill({ target: 'https://smoke-drill.invalid', forced: false }).drill).toBe(true)
  })

  it('lets a caller declare a drill when there is no target to judge', () => {
    expect(judgeDrill({ target: null, forced: true }).drill).toBe(true)
    expect(judgeDrill({ target: null }).drill).toBe(false)
  })

  it('survives something that is not a URL at all', () => {
    expect(judgeDrill({ target: 'smoke-drill.invalid' }).drill).toBe(true)
    expect(judgeDrill({ target: 'not a url' }).drill).toBe(false)
  })

  it('does not mark a host that merely contains the word invalid', () => {
    expect(judgeDrill({ target: 'https://invalid-cache.eventlinqs.com.au' }).drill).toBe(false)
  })
})

describe('the subject a reader sees in a list', () => {
  it('leads with the drill marker, because the first characters are all a list shows', () => {
    const subject = alertSubject({ cls: 'outage', drill: true, subject: 'the production homepage smoke FAILED' })
    expect(subject.startsWith(DRILL_MARKER)).toBe(true)
    expect(subject).toContain('EventLinqs OUTAGE:')
  })

  it('never puts the marker on a real alert', () => {
    const subject = alertSubject({ cls: 'outage', drill: false, subject: 'the production homepage smoke FAILED' })
    expect(subject).not.toContain('[DRILL]')
    expect(subject).toBe('EventLinqs OUTAGE: the production homepage smoke FAILED')
  })

  it('gives the four kinds of message four different openings', () => {
    const prefixes = Object.values(ALERT_CLASSES).map((c) => c.prefix)
    expect(new Set(prefixes).size).toBe(prefixes.length)
    for (const prefix of prefixes) expect(prefix.startsWith('EventLinqs')).toBe(true)
    expect(ALERT_CLASSES.outage.prefix).toContain('OUTAGE')
    expect(ALERT_CLASSES.stall.prefix).toContain('BUILD STALLED')
  })

  it('does not double a prefix that is already there', () => {
    const once = alertSubject({ cls: 'outage', subject: 'EventLinqs OUTAGE: already prefixed' })
    expect(once).toBe('EventLinqs OUTAGE: already prefixed')
  })
})

describe('when the second channel is used', () => {
  it('opens both at once for an outage, which is what two channels are for', () => {
    expect(secondChannelWanted({ cls: 'outage', firstChannelFailed: false })).toBe(true)
  })

  it('holds the issue back on a daily digest unless the email failed', () => {
    expect(secondChannelWanted({ cls: 'daily', firstChannelFailed: false })).toBe(false)
    expect(secondChannelWanted({ cls: 'daily', firstChannelFailed: true })).toBe(true)
  })

  it('lets a caller override the policy in either direction', () => {
    expect(secondChannelWanted({ cls: 'daily', override: 'always', firstChannelFailed: false })).toBe(true)
    expect(secondChannelWanted({ cls: 'outage', override: 'on-failure', firstChannelFailed: false })).toBe(false)
  })
})

// parseArgs returns either the parsed shape or { error }, so the union is read
// through one narrow type rather than asserted field by field.
type ParsedArgs = { error?: string; cls?: string; target?: string | null; subject?: string | null }
const parse = (argv: string[]) => parseArgs(argv) as ParsedArgs

describe('the arguments, refused rather than guessed', () => {
  it('refuses a class it does not know', () => {
    expect(parse(['--subject', 'x', '--class', 'shouting']).error).toContain('is not one of')
  })

  it('refuses a second-channel policy it does not know', () => {
    expect(parse(['--subject', 'x', '--second-channel', 'sometimes']).error).toContain('always or on-failure')
  })

  it('still requires a subject', () => {
    expect(parse(['--class', 'daily']).error).toContain('--subject is required')
  })

  it('reads the whole line the workflows actually pass', () => {
    const args = parse(['--class', 'outage', '--target', 'https://x.invalid', '--subject', 'y', '--report', 'r.json'])
    expect(args.error).toBeUndefined()
    expect(args.cls).toBe('outage')
    expect(args.target).toBe('https://x.invalid')
  })
})
