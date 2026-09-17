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
  PARITY_CADENCE,
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

  it('carries the table-stakes parity line PARITY1 asks for', () => {
    expect(sectionsFor(greenState).map((s) => s.title)).toContain('Table-stakes parity')
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
    // MARKUP IS NOT COPY. The HTML body is a complete document, so it opens with
    // a doctype, and a doctype carries an exclamation mark that no reader ever
    // sees. The law is about the words, exactly as CLAUDE.md says of a Tailwind
    // `!important` modifier, so the tags are stripped before the words are
    // judged rather than the doctype being dropped to please a regular
    // expression.
    const words = (html: string) => html.replace(/<[^>]*>/g, ' ')
    for (const body of [renderStateReport(greenState).text, words(renderStateReport(greenState).html)]) {
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


/*
 * THE REPORTER MUST NOT GO SILENT WHEN ITS OWN READS FAIL. 13 September 2026.
 *
 * UX4.1 says the daily message arrives "WHETHER OR NOT anything is wrong" and
 * that "its absence is itself the alert". The reporter took that promise and
 * broke it in the one case that matters most: if the GitHub token could not be
 * resolved, `collect` returned null and `main` returned without sending
 * anything at all, and if any collector threw, the top-level catch exited 2 with
 * nothing sent. So a broken reporter produced exactly the signal the owner has
 * been taught means the build machine is dead.
 *
 * UX4.2 had the same hole and worse consequences. `judgeStall` treats a missing
 * last push as "nothing to judge" and does not alert, which is right when the
 * repository genuinely has no push, and catastrophic when the read simply
 * failed: the one alert whose whole purpose is to break a silence is itself
 * silenced by a failure to read.
 */
describe('a report that could not read everything still arrives', () => {
  const partial = {
    ...greenState,
    main: { conclusion: 'unknown', reason: 'the head of main could not be read (HTTP 401)' },
    unreadable: [
      { what: 'main', why: 'the head of main could not be read (HTTP 401)' },
      { what: 'the last push', why: 'the activity list answered 403' },
    ],
  }

  it('never says ALL GREEN about a day it could not see', () => {
    expect(headlineFor(greenState).word).toBe('ALL GREEN')
    expect(headlineFor(partial).word).not.toBe('ALL GREEN')
    expect(headlineFor(partial).word).toContain('COULD NOT BE READ')
  })

  it('leads with what it could not read, rather than burying it', () => {
    const titles = sectionsFor(partial).map((s) => s.title)
    expect(titles[0]).toContain('Could not be read')
    expect(titles[0]).toContain('2')
  })

  it('names every reason, in the text and in the HTML', () => {
    const rendered = renderStateReport(partial)
    for (const body of [rendered.text, rendered.html]) {
      expect(body).toContain('the head of main could not be read')
      expect(body).toContain('the activity list answered 403')
    }
  })

  it('never prints a zero it could not read', () => {
    const blindLists = {
      ...greenState,
      landed: [],
      openPullRequests: [],
      failingBranches: [],
      unreadable: [
        { what: 'what landed in 24 hours', why: 'the commits on main could not be read (HTTP 500)' },
        { what: 'the open pull requests', why: 'the open pull requests could not be read (HTTP 500)' },
        { what: 'the branches that went red', why: 'the failing workflow runs could not be read (HTTP 500)' },
      ],
    }
    const titles = sectionsFor(blindLists).map((s) => s.title)
    // An empty count is the GOOD answer for all three, which is exactly why a
    // failed read must never be able to print it.
    expect(titles).toContain('Landed on main in 24 hours (not known)')
    expect(titles).toContain('Open pull requests (not known)')
    expect(titles).toContain('Branches red in 24 hours (not known)')
    const text = renderStateReport(blindLists).text
    expect(text).not.toContain('Nothing.')
    expect(text).not.toContain('None.')
  })

  it('does not answer a failed last-push read with "no push could be found"', () => {
    // THE WORST OF THE ABSENCE SENTENCES, and the one that survived the first
    // pass of this fix. An absence here is what the stall alert exists for, so a
    // failed read wearing it sends the reader hunting a stalled build when the
    // truth is that nobody could see the repository.
    const blindPush = {
      ...greenState,
      lastPush: { when: null, reason: 'the repository activity could not be read (HTTP 404)' },
      unreadable: [{ what: 'the last push', why: 'the repository activity could not be read (HTTP 404)' }],
    }
    const titles = sectionsFor(blindPush).map((s) => s.title)
    expect(titles).toContain('When the build last pushed (not known)')
    const text = renderStateReport(blindPush).text
    expect(text).not.toContain('No push to a working branch could be found')
    expect(text).toContain('this is NOT a report that nothing has')
  })

  it('still says plainly that nothing was pushed when it could read and found nothing', () => {
    const quiet = {
      ...greenState,
      lastPush: { when: null, reason: 'no push to a working branch appears in the last 500 activity records' },
      unreadable: [],
    }
    const text = renderStateReport(quiet).text
    expect(text).toContain('No push to a working branch could be found')
  })

  it('adds nothing to a report that read everything', () => {
    const titles = sectionsFor(greenState).map((s) => s.title)
    expect(titles.some((t) => t.includes('Could not be read'))).toBe(false)
  })
})

describe('the stall check when it cannot see the repository', () => {
  it('alerts rather than going quiet, because silence is the thing it watches for', () => {
    const blind = judgeStall({ lastPushIso: null, nowIso: NOW, unreadable: 'the activity list answered 403' })
    expect(blind.blind).toBe(true)
    expect(blind.shouldAlert).toBe(true)
    expect(blind.reason).toContain('403')
  })

  it('still reports rather than alerting when the repository genuinely has no push', () => {
    const empty = judgeStall({ lastPushIso: null, nowIso: NOW })
    expect(empty.blind).toBeFalsy()
    expect(empty.shouldAlert).toBe(false)
  })

  it('says in the message that it is blind, not that the build has stalled', () => {
    const state = {
      ...greenState,
      lastPush: {},
      stall: judgeStall({ lastPushIso: null, nowIso: NOW, unreadable: 'the activity list answered 403' }),
    }
    const message = renderStallAlert(state)
    expect(message.subject).toContain('cannot see')
    expect(message.text).toContain('403')
    expect(message.text).not.toContain('Nothing has been pushed to the repository for')
  })
})

/**
 * THE PARITY LINE (close-out PARITY1 step 4): "One line in the owner digest:
 * parity checks passed, parity checks failed, and the worst failure."
 *
 * The check runs on two days a month and this report runs every day, so most
 * days carry a result that is up to a fortnight old, or none at all. Every one
 * of those states has to read as itself: a stale result must not look like
 * today's, and an absent one must not look like an alarm OR like good news.
 */
describe('the table-stakes parity line', () => {
  const parityLines = (parity: unknown) =>
    sectionsFor({ ...greenState, parity }).find((s) => s.title === 'Table-stakes parity')!.lines

  it('names the cadence when there is no result, rather than raising an alarm', () => {
    const lines = parityLines(null).join(' ')
    expect(lines).toContain(PARITY_CADENCE)
    expect(lines).not.toMatch(/never/i)
  })

  it('carries the headline and the age when there is one', () => {
    const lines = parityLines({
      headline: 'Parity: 12 passed, 3 failed. Worst: wallet pass - none exists',
      site: 'https://www.eventlinqs.com.au',
      ageHours: 26,
      stale: false,
      failures: [],
    }).join('\n')
    expect(lines).toContain('Parity: 12 passed, 3 failed')
    expect(lines).toContain('https://www.eventlinqs.com.au')
    expect(lines).toContain('Last run')
  })

  it('lists every failing line, not only the worst', () => {
    const lines = parityLines({
      headline: 'Parity: 13 passed, 2 failed.',
      site: 'https://example.test',
      ageHours: 1,
      stale: false,
      failures: [
        { line: 'wallet pass', observation: 'no route serves one' },
        { line: 'add to calendar', observation: 'the event page offers none' },
      ],
    }).join('\n')
    expect(lines).toContain('FAILED: wallet pass - no route serves one')
    expect(lines).toContain('FAILED: add to calendar - the event page offers none')
  })

  it('says OVERDUE about a result older than the cadence, rather than printing it as fresh', () => {
    const lines = parityLines({
      headline: 'Parity: 15 passed, 0 failed.',
      site: 'https://example.test',
      ageHours: 24 * 40,
      stale: true,
      failures: [],
    }).join('\n')
    expect(lines).toContain('THIS IS OVERDUE')
  })

  it('reports a result it could not read rather than printing a clean bill of health', () => {
    const lines = parityLines({ error: 'the parity result could not be parsed' }).join('\n')
    expect(lines).toContain('Not known: the parity result could not be parsed')
    expect(lines).not.toMatch(/passed/)
  })
})
