import { describe, expect, test } from 'vitest'
import {
  branchUnderTest,
  commitUnderTest,
  deploymentsUrl,
  judgeCommitDeployments,
  settleVerdict,
  stateOf,
} from '../../../scripts/guards/preview-deployment-state.mjs'

/**
 * THE DEPLOYMENT-STATE GUARD JUDGES THE COMMIT UNDER TEST (close-out C16,
 * 7 September 2026).
 *
 * The first version judged "the newest settled deployment for the branch",
 * and because a successful Vercel build lands after the CI job reaches the
 * guard, every green run on main had passed on the PREVIOUS commit's READY
 * and the merge after a red one would have failed on the red one. Every case
 * below is one of those two shapes, or the wait that ends them, proven with a
 * fake clock and a scripted listing so no network is needed.
 */

const SHA = 'c0ffee'.padEnd(40, '0')
const OLDER = 'dead00'.padEnd(40, '0')

const dep = (state: string, sha = SHA, createdAt = 10) => ({
  uid: `dpl_${state}_${createdAt}`,
  state,
  readyState: state,
  createdAt,
  inspectorUrl: `https://vercel.com/acme/app/${state}`,
  meta: { githubCommitSha: sha, githubCommitRef: 'main' },
})

describe('commitUnderTest', () => {
  test('a push judges GITHUB_SHA, the tip commit pushed', () => {
    const out = commitUnderTest({ GITHUB_EVENT_NAME: 'push', GITHUB_SHA: SHA }, () => null, () => OLDER)
    expect(out).toEqual({ sha: SHA, source: 'GITHUB_SHA' })
  })

  test('a pull request judges the head commit from the payload, never GITHUB_SHA (the merge commit Vercel does not build)', () => {
    const readPayload = (path: string | undefined) => (path === '/tmp/event.json' ? { pull_request: { head: { sha: SHA } } } : null)
    const out = commitUnderTest({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_SHA: OLDER, GITHUB_EVENT_PATH: '/tmp/event.json' }, readPayload, () => OLDER)
    expect(out.sha).toBe(SHA)
    expect(out.source).toMatch(/pull_request\.head\.sha/)
  })

  test('a pull request whose payload carries no head sha names no commit rather than the merge commit', () => {
    const out = commitUnderTest({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_SHA: OLDER }, () => null, () => OLDER)
    expect(out.sha).toBeNull()
    expect(out.source).toMatch(/merge commit/)
  })

  test('locally it is git HEAD, and no git checkout is no commit, never a wrong one', () => {
    expect(commitUnderTest({}, () => null, () => SHA)).toEqual({ sha: SHA, source: 'git HEAD' })
    expect(commitUnderTest({}, () => null, () => null).sha).toBeNull()
  })
})

describe('branchUnderTest', () => {
  test('GITHUB_HEAD_REF first, then GITHUB_REF_NAME, then git, and git absent is null', () => {
    expect(branchUnderTest({ GITHUB_HEAD_REF: 'feat/x', GITHUB_REF_NAME: '17/merge' }, () => 'local')).toBe('feat/x')
    expect(branchUnderTest({ GITHUB_REF_NAME: 'main' }, () => 'local')).toBe('main')
    expect(branchUnderTest({}, () => 'local')).toBe('local')
    expect(branchUnderTest({}, () => null)).toBeNull()
  })
})

describe('judgeCommitDeployments', () => {
  test('READY passes, ERROR and BLOCKED fail, CANCELED and DELETED are void, the rest are unsettled', () => {
    expect(judgeCommitDeployments([dep('READY')]).verdict).toBe('pass')
    expect(judgeCommitDeployments([dep('ERROR')]).verdict).toBe('fail')
    expect(judgeCommitDeployments([dep('BLOCKED')]).verdict).toBe('fail')
    expect(judgeCommitDeployments([dep('CANCELED')]).verdict).toBe('void')
    expect(judgeCommitDeployments([dep('DELETED')]).verdict).toBe('void')
    for (const s of ['QUEUED', 'INITIALIZING', 'BUILDING']) expect(judgeCommitDeployments([dep(s)]).verdict).toBe('unsettled')
  })

  test('no deployment is none, and a record with neither state field is a shape mismatch, never "still building"', () => {
    expect(judgeCommitDeployments([]).verdict).toBe('none')
    expect(judgeCommitDeployments([{ uid: 'dpl_x', meta: { githubCommitSha: SHA } }]).verdict).toBe('shape')
  })

  test('readyState is read when state is absent', () => {
    expect(stateOf({ readyState: 'READY' })).toBe('READY')
    expect(judgeCommitDeployments([{ readyState: 'ERROR', createdAt: 1 }]).verdict).toBe('fail')
  })

  test('a redeploy of the same commit is judged by its newest deployment', () => {
    const judged = judgeCommitDeployments([dep('ERROR', SHA, 5), dep('READY', SHA, 9)])
    expect(judged.verdict).toBe('pass')
    expect(judged.deployment.createdAt).toBe(9)
  })
})

/** A scripted listing and a fake clock: each poll returns the next entry, and sleep advances time. */
function harness(script: Array<ReturnType<typeof dep>[]>) {
  let t = 0
  const asked: string[] = []
  let i = 0
  return {
    asked,
    now: () => t,
    sleep: async (ms: number) => {
      t += ms
    },
    list: async (sha: string) => {
      asked.push(sha)
      const entry = script[Math.min(i, script.length - 1)]
      i += 1
      return entry
    },
  }
}

describe('settleVerdict', () => {
  test('THE RACE: the commit is still building while an older commit sits in ERROR; the guard waits for the commit and passes on its own READY', async () => {
    const h = harness([[dep('QUEUED')], [dep('BUILDING')], [dep('READY')]])
    const out = await settleVerdict({ ...h, sha: SHA, inCi: true, waitMs: 600_000, graceMs: 90_000, intervalMs: 15_000 })
    expect(out.verdict).toBe('pass')
    expect(out.polls).toBe(3)
    expect(out.waitedMs).toBe(30_000)
    // only ever asked about the commit under test; the older ERROR is never in the listing
    expect(new Set(h.asked)).toEqual(new Set([SHA]))
  })

  test('THE FALSE GREEN: the commit is still building while the older commit is READY; the guard waits and fails on the commit\'s own ERROR', async () => {
    const h = harness([[dep('BUILDING')], [dep('BUILDING')], [dep('ERROR')]])
    const out = await settleVerdict({ ...h, sha: SHA, inCi: true, waitMs: 600_000, graceMs: 90_000, intervalMs: 15_000 })
    expect(out.verdict).toBe('fail')
    expect(out.state).toBe('ERROR')
  })

  test('a build that never settles inside the wait is a timeout, not a pass', async () => {
    const h = harness([[dep('BUILDING')]])
    const out = await settleVerdict({ ...h, sha: SHA, inCi: true, waitMs: 60_000, graceMs: 90_000, intervalMs: 15_000 })
    expect(out.verdict).toBe('timeout')
    expect(out.waitedMs).toBeGreaterThanOrEqual(60_000)
    expect(out.polls).toBe(5)
  })

  test('in CI, Vercel is given the grace to create the deployment, then the commit is judged', async () => {
    const h = harness([[], [], [dep('BUILDING')], [dep('READY')]])
    const out = await settleVerdict({ ...h, sha: SHA, inCi: true, waitMs: 600_000, graceMs: 30_000, intervalMs: 15_000 })
    expect(out.verdict).toBe('pass')
    expect(out.polls).toBe(4)
  })

  test('in CI, no deployment after the grace is none (a loud skip), not a pass and not a wait for the full window', async () => {
    const h = harness([[]])
    const out = await settleVerdict({ ...h, sha: SHA, inCi: true, waitMs: 600_000, graceMs: 30_000, intervalMs: 15_000 })
    expect(out.verdict).toBe('none')
    expect(out.polls).toBe(3)
    expect(out.waitedMs).toBe(30_000)
  })

  test('outside CI nothing waits: no deployment is none and a running one is building, after one poll each', async () => {
    const none = await settleVerdict({ ...harness([[]]), sha: SHA, inCi: false })
    expect(none).toMatchObject({ verdict: 'none', polls: 1, waitedMs: 0 })
    const running = await settleVerdict({ ...harness([[dep('BUILDING')]]), sha: SHA, inCi: false })
    expect(running).toMatchObject({ verdict: 'building', polls: 1, waitedMs: 0 })
  })

  test('a settled deployment is answered on the first poll in CI as well', async () => {
    const out = await settleVerdict({ ...harness([[dep('ERROR')]]), sha: SHA, inCi: true })
    expect(out).toMatchObject({ verdict: 'fail', polls: 1 })
  })

  test('the listing throwing propagates, so the caller can report the API rather than guess', async () => {
    const h = { ...harness([[]]), list: async () => { throw new Error('Vercel API answered 401') } }
    await expect(settleVerdict({ ...h, sha: SHA, inCi: true })).rejects.toThrow(/401/)
  })
})

describe('deploymentsUrl', () => {
  test('asks v7 for the commit itself, never the branch', () => {
    const url = deploymentsUrl({ projectId: 'prj_1', teamId: 'team_1', sha: SHA })
    expect(url).toMatch(/^https:\/\/api\.vercel\.com\/v7\/deployments\?/)
    expect(url).toContain(`sha=${SHA}`)
    expect(url).toContain('projectId=prj_1')
    expect(url).toContain('teamId=team_1')
    expect(url).not.toMatch(/branch=/)
  })
})
