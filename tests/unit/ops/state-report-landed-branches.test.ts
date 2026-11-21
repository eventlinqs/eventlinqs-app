// A TRAIN THAT LANDED IS NOT A BRANCH RED (the PM's 14:19 of 21 November 2026, item 4 (b)). The daily state of 12:48
// that day listed 'BRANCHES RED IN 24 HOURS (2) feat/train-ai2-pr ... feat/train-p0-pr': both runs were inside the
// window (20 November 10:36 and 06:06 UTC) and both branches' pull requests merged after they went red (#324 at 11:18,
// #323 at 07:15 UTC). A red that a merged train put right is history, not a branch for Lawal to look at.

import { describe, it, expect } from 'vitest'
import { leaveOutLanded } from '../../../scripts/ops/state-report.mjs'

const run = (branch: string, created: string) => ({ head_branch: branch, created_at: created, name: 'CI' })

describe('the daily state leaves out a branch whose train landed after it went red', () => {
  it("leaves out 20 November's two merged trains and keeps a branch still red", () => {
    const runs = [
      run('feat/train-ai2-pr', '2026-11-20T10:36:49Z'),
      run('feat/train-p0-pr', '2026-11-20T06:06:51Z'),
      run('feat/still-red', '2026-11-20T12:00:00Z'),
    ]
    const merged = new Map([
      ['feat/train-ai2-pr', '2026-11-20T11:18:08Z'],
      ['feat/train-p0-pr', '2026-11-20T07:15:27Z'],
    ])
    expect(leaveOutLanded(runs, merged).map((r) => r.head_branch)).toEqual(['feat/still-red'])
  })

  it('keeps a branch that went red again after its pull request merged', () => {
    const runs = [run('feat/reopened', '2026-11-20T12:00:00Z')]
    expect(leaveOutLanded(runs, new Map([['feat/reopened', '2026-11-20T11:00:00Z']]))).toHaveLength(1)
  })
})
