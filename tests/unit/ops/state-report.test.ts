// THE DAILY STATE AND THE STALL. Close-out UX4.1 and UX4.2.
//
// From 00:23 to 09:28 on 9 September 2026 the build was stalled, six runs were
// killed, nothing was pushed for nine hours, and NOT ONE EMAIL was sent,
// because nothing failed. Every alerting mechanism the platform had was a
// FAILURE notification, and a stall produces silence.
//
// So two things are tested here, and they are different questions:
//   the DAILY report has to say the same shape of thing on a quiet day, because
//   its absence is what the owner is meant to notice;
//   the STALL judge has to fire once per band and not once per check, or the
//   alert becomes the noise it was built to replace.

import { describe, it, expect } from 'vitest'
import {
  judgeStall,
  guardsNamedIn,
  humanAge,
  hoursBetween,
  headlineFor,
  sectionsFor,
  renderStateReport,
  renderStallAlert,
  pickLastPush,
  nextLinkPath,
  BOOKKEEPING_REFS,
  STALL_THRESHOLD_HOURS,
} from '../../../scripts/lib/state-report.mjs'

const NOW = '2026-09-10T12:00:00.000Z'
const hoursAgo = (n: number) => new Date(Date.parse(NOW) - n * 3_600_000).toISOString()

const greenState = {
  generatedAt: NOW,
  main: { conclusion: 'success', shortSha: 'abc12345', runUrl: 'https://example.test/run' },
  production: { readyState: 'READY', shortSha: 'abc12345', ageHours: 3, url: 'https://example.test/dep' },
  landed: [{ shortSha: 'abc12345', subject: 'Something landed' }],
  openPullRequests: [],
  lastPush: { when: hoursAgo(1), ref: 'ops/session-log' },
  failingBranches: [],
  business: { eventsLive: 12, ticketsSold: 40, ticketsSold24h: 2, ordersPaid24h: 1, newOrganisers24h: 0 },
  stall: judgeStall({ lastPushIso: hoursAgo(1), nowIso: NOW }),
  watchdog: { confirmed: false, evidence: 'a scheduled run' },
}

describe('the stall judge, at the boundary', () => {
  it('is not a stall five point nine hours in', () => {
    const v = judgeStall({ lastPushIso: hoursAgo(5.9), nowIso: NOW })
    expect(v.stalled).toBe(false)
    expect(v.band).toBe(0)
    expect(v.reason).toContain('inside the 6 hour threshold')
  })

  it('IS a stall at six hours, which is the threshold close-out UX4.2 names', () => {
    const v = judgeStall({ lastPushIso: hoursAgo(6.01), nowIso: NOW })
    expect(v.stalled).toBe(true)
    expect(v.band).toBe(1)
    expect(STALL_THRESHOLD_HOURS).toBe(6)
  })

  it('counts a band per threshold, so a nine hour silence is band one and a thirteen hour one is band two', () => {
    expect(judgeStall({ lastPushIso: hoursAgo(9), nowIso: NOW }).band).toBe(1)
    expect(judgeStall({ lastPushIso: hoursAgo(13), nowIso: NOW }).band).toBe(2)
    // The stall that started this: 9 hours, six runs killed, nothing said.
    expect(judgeStall({ lastPushIso: hoursAgo(9), nowIso: NOW }).stalled).toBe(true)
  })

  it('does not alert twice in one band when the caller remembers the last one', () => {
    const first = judgeStall({ lastPushIso: hoursAgo(7), nowIso: NOW, alreadyAlertedBand: 0 })
    expect(first.shouldAlert).toBe(true)
    const second = judgeStall({ lastPushIso: hoursAgo(8), nowIso: NOW, alreadyAlertedBand: 1 })
    expect(second.shouldAlert).toBe(false)
    const nextBand = judgeStall({ lastPushIso: hoursAgo(12.5), nowIso: NOW, alreadyAlertedBand: 1 })
    expect(nextBand.shouldAlert).toBe(true)
  })

  it('does not alert twice in one band when the caller only knows how often it runs', () => {
    // The hourly cloud check. Exactly one run per band speaks, with no state.
    const crossing = judgeStall({ lastPushIso: hoursAgo(6.2), nowIso: NOW, checkPeriodHours: 1 })
    expect(crossing.shouldAlert).toBe(true)
    const inside = judgeStall({ lastPushIso: hoursAgo(8), nowIso: NOW, checkPeriodHours: 1 })
    expect(inside.shouldAlert).toBe(false)
    const nextCrossing = judgeStall({ lastPushIso: hoursAgo(12.4), nowIso: NOW, checkPeriodHours: 1 })
    expect(nextCrossing.shouldAlert).toBe(true)
  })

  it('an hourly check speaks exactly four times across a full day of silence', () => {
    let spoke = 0
    for (let h = 1; h <= 24; h += 1) {
      if (judgeStall({ lastPushIso: hoursAgo(h), nowIso: NOW, checkPeriodHours: 1 }).shouldAlert) spoke += 1
    }
    expect(spoke).toBe(4)
  })

  it('reports rather than guesses when there is no push to measure from', () => {
    const v = judgeStall({ lastPushIso: null, nowIso: NOW })
    expect(v.stalled).toBe(false)
    expect(v.shouldAlert).toBe(false)
    expect(v.reason).toContain('no push was found')
  })

  it('reports rather than throws on a timestamp it cannot read', () => {
    const v = judgeStall({ lastPushIso: 'the day before yesterday', nowIso: NOW })
    expect(v.shouldAlert).toBe(false)
    expect(v.reason).toContain('could not be read as a date')
  })
})

describe('naming the guard out of a failing run log', () => {
  it('reads the line close-out F1.1 made the gate print', () => {
    const log = [
      '2026-09-09T03:44:18Z [guards] 1 of 86 guard(s) FAILED. Build blocked.',
      '2026-09-09T03:44:18Z [guards] FAILED: scripts/guards/preview-deployment-state.mjs',
    ].join('\n')
    expect(guardsNamedIn(log)).toEqual(['scripts/guards/preview-deployment-state.mjs'])
  })

  it('reads more than one name off one line', () => {
    expect(guardsNamedIn('[guards] FAILED: a.mjs b.mjs')).toEqual(['a.mjs', 'b.mjs'])
  })

  it('says nothing when the log names nothing, rather than inventing a guard', () => {
    expect(guardsNamedIn('everything was fine')).toEqual([])
    expect(guardsNamedIn('')).toEqual([])
    expect(guardsNamedIn(null)).toEqual([])
  })
})

describe('reading a duration the way a person does', () => {
  it('rounds sensibly across the three scales', () => {
    expect(humanAge(0.5)).toBe('30 minutes')
    expect(humanAge(9)).toBe('9 hours')
    expect(humanAge(102 * 24)).toBe('102 days')
    expect(humanAge(null)).toBe('unknown')
  })

  it('measures the gap between two instants', () => {
    expect(hoursBetween(hoursAgo(6), NOW)).toBeCloseTo(6, 5)
    expect(hoursBetween('not a date', NOW)).toBe(null)
  })
})

describe('the headline, which is the only word most readings get', () => {
  it('says ALL GREEN when everything is', () => {
    expect(headlineFor(greenState).word).toBe('ALL GREEN')
  })

  it('puts an outage above a stall, and a stall above a red branch', () => {
    expect(headlineFor({ ...greenState, production: { readyState: 'ERROR' } }).word).toBe('PRODUCTION IS NOT READY')
    expect(headlineFor({ ...greenState, main: { conclusion: 'failure' } }).word).toBe('MAIN IS RED')
    expect(headlineFor({ ...greenState, stall: { stalled: true } }).word).toBe('THE BUILD HAS STALLED')
    expect(headlineFor({ ...greenState, failingBranches: [{ branch: 'x' }] }).word).toBe('GREEN, WITH BRANCHES RED')
  })
})

describe('the report itself', () => {
  const rendered = renderStateReport(greenState)

  it('carries every one of the eight things UX4.1 asks for', () => {
    const titles = sectionsFor(greenState).map((s) => s.title)
    expect(titles[0]).toBe('Main')
    expect(titles[1]).toBe('Production')
    expect(titles.some((t) => t.startsWith('Landed on main'))).toBe(true)
    expect(titles).toContain('When the build last pushed')
    expect(titles.some((t) => t.startsWith('Open pull requests'))).toBe(true)
    expect(titles.some((t) => t.startsWith('Branches red'))).toBe(true)
    expect(titles).toContain('The platform')
  })

  it('says in the message itself that its absence is the alert', () => {
    expect(rendered.text).toContain('whether or not anything is wrong')
    expect(rendered.text).toContain('itself the alert')
    expect(rendered.html).toContain('itself the alert')
  })

  it('leads the subject with the headline, because a list truncates the end', () => {
    expect(rendered.subject.startsWith('ALL GREEN')).toBe(true)
  })

  it('says the same things in the text and the HTML, so the two cannot drift', () => {
    for (const section of sectionsFor(greenState)) {
      expect(rendered.text).toContain(section.title.toUpperCase())
      expect(rendered.html).toContain(section.title)
    }
  })

  it('escapes what it renders, so a commit subject cannot inject markup', () => {
    const nasty = { ...greenState, landed: [{ shortSha: 'aaa', subject: '<img src=x onerror=alert(1)>' }] }
    expect(renderStateReport(nasty).html).not.toContain('<img src=x')
    expect(renderStateReport(nasty).html).toContain('&lt;img')
  })

  it('reports a count it could not read rather than printing zero events live', () => {
    const blind = { ...greenState, business: { error: 'the endpoint answered 500' } }
    expect(renderStateReport(blind).text).toContain('Not known: the endpoint answered 500')
    expect(renderStateReport(blind).text).not.toContain('0 events live')
  })

  it('obeys the copy law: no em dash, no en dash, no exclamation mark', () => {
    for (const body of [renderStateReport(greenState).text, renderStateReport(greenState).html]) {
      expect(body).not.toContain('—')
      expect(body).not.toContain('–')
      expect(body).not.toContain('!')
    }
  })
})

describe('the stall message', () => {
  it('says plainly that it could not confirm the build was meant to be running', () => {
    const state = {
      ...greenState,
      lastPush: { when: hoursAgo(9), ref: 'ops/session-log' },
      stall: judgeStall({ lastPushIso: hoursAgo(9), nowIso: NOW, checkPeriodHours: 1 }),
      watchdog: { confirmed: false, evidence: 'this check ran on a schedule with no view of the build machine' },
    }
    const message = renderStallAlert(state)
    expect(message.subject).toContain('9 hours')
    expect(message.text).toContain('could NOT be confirmed')
    expect(message.text).toContain('deliberately stopped')
  })

  it('says so without a qualifier when the watchdog itself invoked the check', () => {
    const state = {
      ...greenState,
      lastPush: { when: hoursAgo(9), ref: 'ops/session-log' },
      stall: judgeStall({ lastPushIso: hoursAgo(9), nowIso: NOW, checkPeriodHours: 1 }),
      watchdog: { confirmed: true, evidence: 'this check was invoked by the watchdog loop itself, so the loop is alive' },
    }
    const message = renderStallAlert(state)
    expect(message.text).toContain('The watchdog was confirmed running')
    expect(message.text).not.toContain('could NOT be confirmed')
  })

  it('explains why a stall is the one thing a failure notification cannot see', () => {
    const state = { ...greenState, stall: judgeStall({ lastPushIso: hoursAgo(9), nowIso: NOW }) }
    expect(renderStallAlert(state).text).toContain('produces SILENCE')
  })
})

// WHAT COUNTS AS A PUSH. On 11 September 2026 twelve runs of the build loop were
// each refused at the same gate step and each pushed its ledger files to
// ops/session-log, so the stall judge read "0.1 hours ago" across a 44 hour
// silence on every working branch. The alert built for that silence was blind
// for as long as the loop kept confessing to it.
describe('what counts as a push, so the stall clock is not reset by bookkeeping', () => {
  const log = (ts: string) => ({ activity_type: 'push', ref: 'refs/heads/ops/session-log', timestamp: ts, actor: { login: 'eventlinqs' } })
  const work = (ts: string, ref = 'refs/heads/verify/l5-launch-readiness') => ({ activity_type: 'push', ref, timestamp: ts, actor: { login: 'eventlinqs' } })

  it('passes over the session log and finds the working branch behind it, and that IS a stall', () => {
    const pick = pickLastPush([log(hoursAgo(0.1)), log(hoursAgo(0.2)), work(hoursAgo(44))])
    expect(pick.ref).toBe('verify/l5-launch-readiness')
    expect(pick.when).toBe(hoursAgo(44))
    expect(pick.bookkeepingSkipped).toBe(2)
    expect(judgeStall({ lastPushIso: pick.when, nowIso: NOW }).stalled).toBe(true)
  })

  it('finds nothing in a feed that is only the session log, and counts what it passed over', () => {
    const pick = pickLastPush([log(hoursAgo(0.1)), log(hoursAgo(0.2))])
    expect(pick.when).toBeNull()
    expect(pick.bookkeepingSkipped).toBe(2)
  })

  it('counts a force push to a working branch, and ignores records that are not pushes', () => {
    const pick = pickLastPush([{ activity_type: 'branch_creation', ref: 'refs/heads/x', timestamp: hoursAgo(0.1) }, { ...work(hoursAgo(2)), activity_type: 'force_push' }])
    expect(pick.ref).toBe('verify/l5-launch-readiness')
    expect(pick.when).toBe(hoursAgo(2))
  })

  it('names the bookkeeping in the report rather than hiding it', () => {
    const lastPush = { ...pickLastPush([log(hoursAgo(0.1)), work(hoursAgo(44))]) }
    const state = { ...greenState, lastPush, stall: judgeStall({ lastPushIso: lastPush.when, nowIso: NOW }) }
    const section = sectionsFor(state).find((s) => s.title === 'When the build last pushed')
    expect(section?.lines.join('\n')).toContain('1 newer push(es) to ops/session-log were the build writing its own log')
    expect(renderStallAlert(state).text).toContain('were the build writing its own log')
  })

  it('keeps the bookkeeping list to the session log, under ops/', () => {
    expect(BOOKKEEPING_REFS).toEqual(['ops/session-log'])
  })

  it('reads the next cursor from a Link header and nothing from the last page', () => {
    const link = '<https://api.github.com/repositories/1/activity?per_page=100&after=abc>; rel="next"'
    expect(nextLinkPath(link)).toBe('/repositories/1/activity?per_page=100&after=abc')
    expect(nextLinkPath('<https://api.github.com/x?page=1>; rel="prev"')).toBeNull()
    expect(nextLinkPath(null)).toBeNull()
  })
})
