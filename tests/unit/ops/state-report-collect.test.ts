// THE REPORTER MUST STILL REPORT WHEN ITS OWN READS FAIL.
//
// UX4.1: the daily state arrives "WHETHER OR NOT anything is wrong", and "its
// absence is itself the alert". Until 13 September 2026 the composer broke that
// promise in the two cases where it mattered most. With no GitHub token it
// returned null and the caller returned without sending anything. With any
// collector throwing - a timeout, a 5xx, a parse - the top-level catch exited 2,
// again with nothing sent. A reporter that was itself broken therefore produced
// exactly the signal the owner has been taught means the build machine is dead.
//
// These drive the composer directly, with readers that fail on purpose, because
// that is the only way to see the behaviour without waiting for GitHub to have a
// bad morning.

import { describe, it, expect } from 'vitest'
import { collect, DEFAULT_READERS } from '../../../scripts/ops/state-report.mjs'
import { renderStateReport } from '../../../scripts/lib/state-report.mjs'

const NOW = '2026-09-13T12:00:00.000Z'

const withToken = () => ({ token: 'ghp_pretend', source: 'a token handed to the test' })
const withoutToken = () => ({ token: null, reason: 'no GITHUB_TOKEN in the environment and no usable gh CLI login' })

const healthy = {
  // THE FIXTURES CARRY THE SHAPE THE REAL READERS RETURN, field for field, so a
  // reader whose contract changes is visible here rather than only on a morning
  // the owner reads the message. A shorter object described a successful CI run
  // with no run URL and no time, which no run ever is.
  main: async () => ({
    conclusion: 'success',
    sha: 'a'.repeat(40),
    shortSha: 'aaaaaaaa',
    runUrl: 'https://github.com/eventlinqs/eventlinqs-app/actions/runs/1',
    when: '2026-09-13T11:05:00.000Z',
  }),
  landed: async () => [],
  pullRequests: async () => [],
  lastPush: async () => ({ when: '2026-09-13T11:00:00.000Z', ref: 'lane/c-ux', actor: 'EventLinqs', bookkeepingSkipped: 0 }),
  failingBranches: async () => [],
  production: async () => ({ readyState: 'READY', shortSha: 'aaaaaaaa', ageHours: 2 }),
  business: async () => ({ eventsLive: 3, ticketsSold: 9 }),
}

/*
 * EVERY READER NAMED, rather than mapped over the keys of the fixture above.
 *
 * The annotation is the point: a reader added to the composer and not added here
 * stops this file compiling, so the next reader cannot arrive with nothing
 * proving it survives its own failure.
 */
const failsWith = (what: string) => async () => {
  throw new Error(`${what} could not be read (HTTP 500)`)
}

const everythingFails: typeof DEFAULT_READERS = {
  main: failsWith('main'),
  landed: failsWith('landed'),
  pullRequests: failsWith('pullRequests'),
  lastPush: failsWith('lastPush'),
  failingBranches: failsWith('failingBranches'),
  production: failsWith('production'),
  business: failsWith('business'),
}

// An EMPTY environment on purpose: the composer must not be able to pick up the
// repository name, or a token, from the machine the test happens to run on.
const base = {
  nowIso: NOW,
  fromWatchdog: false,
  alertedBand: null,
  checkPeriodHours: 1,
  env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv,
}

describe('composing the daily state when nothing can be read', () => {
  it('still produces a report rather than nothing at all', async () => {
    const state = await collect({ ...base, readers: everythingFails, resolveToken: withToken })
    expect(state).not.toBeNull()
    expect(state.generatedAt).toBe(NOW)
  })

  it('names every blind spot, one per read that failed', async () => {
    const state = await collect({ ...base, readers: everythingFails, resolveToken: withToken })
    expect(state.unreadable).toHaveLength(Object.keys(healthy).length)
    for (const entry of state.unreadable) {
      expect(entry.what.length).toBeGreaterThan(0)
      expect(entry.why).toContain('HTTP 500')
    }
  })

  it('renders a message a person can act on, with the reasons in it', async () => {
    const state = await collect({ ...base, readers: everythingFails, resolveToken: withToken })
    const rendered = renderStateReport(state)
    expect(rendered.subject).not.toContain('ALL GREEN')
    // The plain text upper-cases its section titles; the HTML does not.
    expect(rendered.text).toContain('COULD NOT BE READ')
    expect(rendered.html).toContain('Could not be read')
    expect(rendered.text).toContain('HTTP 500')
    expect(rendered.html).toContain('HTTP 500')
  })

  it('still produces a report when there is no GitHub token at all', async () => {
    const state = await collect({ ...base, readers: healthy, resolveToken: withoutToken })
    expect(state).not.toBeNull()
    // The Vercel and platform reads do not need a GitHub token and must still run.
    expect(state.production.readyState).toBe('READY')
    expect(state.business.eventsLive).toBe(3)
    // The GitHub half is reported as unreadable, with the resolver's own reason.
    expect(state.unreadable.map((u) => u.what)).toContain('main')
    expect(state.unreadable[0].why).toContain('no GITHUB_TOKEN')
  })

  it('says nothing about blind spots on a day it could read everything', async () => {
    const state = await collect({ ...base, readers: healthy, resolveToken: withToken })
    expect(state.unreadable).toHaveLength(0)
    expect(renderStateReport(state).subject.startsWith('ALL GREEN')).toBe(true)
  })
})

describe('the stall judgement the composer hands on', () => {
  it('is BLIND, and therefore alerting, when the last push could not be read', async () => {
    const state = await collect({ ...base, readers: everythingFails, resolveToken: withToken })
    expect(state.stall.blind).toBe(true)
    expect(state.stall.shouldAlert).toBe(true)
    expect(state.stall.reason).toContain('could not be read')
  })

  it('is quiet when the repository is genuinely quiet but readable', async () => {
    const readers = {
      ...healthy,
      lastPush: async () => ({ when: '2026-09-13T11:30:00.000Z', ref: 'lane/c-ux', actor: 'EventLinqs', bookkeepingSkipped: 0 }),
    }
    const state = await collect({ ...base, readers, resolveToken: withToken })
    expect(state.stall.blind).toBeFalsy()
    expect(state.stall.shouldAlert).toBe(false)
  })

  it('still alerts on a real stall, which is the case it was built for', async () => {
    const readers = {
      ...healthy,
      lastPush: async () => ({ when: '2026-09-12T12:00:00.000Z', ref: 'lane/c-ux', actor: 'EventLinqs', bookkeepingSkipped: 0 }),
    }
    const state = await collect({ ...base, readers, resolveToken: withToken })
    expect(state.stall.stalled).toBe(true)
    expect(state.stall.shouldAlert).toBe(true)
  })
})
