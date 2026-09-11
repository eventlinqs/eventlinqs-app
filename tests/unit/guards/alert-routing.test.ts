// WHO GETS TOLD, AND HOW IT READS IN THE INBOX. Close-out UX4.3, UX4.5, H2.6.
//
// Proof from the owner's own inbox, 9 September 2026: the build was stalled for
// nine hours and NOT ONE EMAIL was sent, because nothing failed; six emails
// arrived for branch gates doing their job; and zero arrived when a real
// organiser published a paid event on production. The inbox was loud about the
// harmless and silent about the dangerous.
//
// The guard cannot make the owner's GitHub account stop emailing him about
// branch runs, which is his setting. What it CAN do, and what is tested here,
// is make it impossible for this repository to start emailing branch gates
// itself, and impossible for a drill to arrive looking like a real outage.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  readWorkflow,
  judgeWorkflow,
  judgeScriptCallers,
  judgeDrillMarker,
  judgeClassGrammar,
  judgeStallClock,
  classesDeclaredIn,
  withoutComments,
} from '../../../scripts/guards/alert-routing.mjs'

const ROOT = process.cwd()
const WORKFLOWS = join(ROOT, '.github', 'workflows')

const branchGateThatEmails = [
  'name: drill',
  'on:',
  '  pull_request:',
  '    branches: [main]',
  '    types: [opened, ready_for_review]',
  'jobs:',
  '  noisy:',
  "    if: ${{ github.event_name != 'pull_request' || github.event.pull_request.draft == false }}",
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: node scripts/ops/alert-dispatch.mjs --class outage --subject "branch gate failed"',
  '',
].join('\n')

describe('clause 2: no branch gate may email', () => {
  it('FAILS a pull-request job that dispatches an alert', () => {
    const verdict = judgeWorkflow('drill.yml', branchGateThatEmails)
    expect(verdict.problems).toHaveLength(1)
    expect(verdict.problems[0]).toContain('runs on pull requests')
    expect(verdict.problems[0]).toContain('UX4.5')
  })

  it('allows it when the job can only run on a push, which is ci.yml main-red-alert', () => {
    const pushOnly = branchGateThatEmails.replace(
      "    if: ${{ github.event_name != 'pull_request' || github.event.pull_request.draft == false }}",
      "    if: ${{ failure() && github.event_name == 'push' && github.ref == 'refs/heads/main' }}",
    )
    expect(judgeWorkflow('ci.yml', pushOnly).problems).toEqual([])
  })

  it('allows a dispatch from a workflow that has no pull-request trigger at all', () => {
    const smoke = branchGateThatEmails.replace('  pull_request:\n    branches: [main]\n    types: [opened, ready_for_review]', '  deployment_status:')
    expect(judgeWorkflow('post-deploy-smoke.yml', smoke).problems).toEqual([])
  })
})

describe('clause 1: every dispatch declares its class', () => {
  it('FAILS a dispatch with no --class, because a default is how a stall looks like a branch gate', () => {
    const undeclared = branchGateThatEmails
      .replace(' --class outage', '')
      .replace(
        "    if: ${{ github.event_name != 'pull_request' || github.event.pull_request.draft == false }}",
        "    if: ${{ github.event_name == 'push' }}",
      )
    const verdict = judgeWorkflow('drill.yml', undeclared)
    expect(verdict.problems.some((p) => p.includes('--class'))).toBe(true)
  })

  it('FAILS a class that is not one of the four', () => {
    const wrong = branchGateThatEmails
      .replace('--class outage', '--class shouting')
      .replace(
        "    if: ${{ github.event_name != 'pull_request' || github.event.pull_request.draft == false }}",
        "    if: ${{ github.event_name == 'push' }}",
      )
    expect(judgeWorkflow('drill.yml', wrong).problems.some((p) => p.includes('shouting'))).toBe(true)
  })

  it('reads every class flag in a file', () => {
    expect(classesDeclaredIn('--class outage ... --class daily')).toEqual(['outage', 'daily'])
  })
})

describe('clause 5: a script that reaches the dispatcher declares a class too', () => {
  it('FAILS a script that spawns it with no class', () => {
    const verdict = judgeScriptCallers([
      { name: 'scripts/ops/thing.mjs', text: "spawnSync(node, ['scripts/ops/alert-dispatch.mjs', '--subject', s])" },
    ])
    expect(verdict.callers).toBe(1)
    expect(verdict.problems).toHaveLength(1)
  })

  it('passes a script that does', () => {
    const verdict = judgeScriptCallers([
      { name: 'scripts/ops/thing.mjs', text: "spawnSync(node, ['scripts/ops/alert-dispatch.mjs', '--class', 'daily'])" },
    ])
    expect(verdict.problems).toEqual([])
  })

  it('does not mistake a comment for a call, so naming it in a header stays free', () => {
    const verdict = judgeScriptCallers([
      { name: 'scripts/verify/post-deploy-smoke.mjs', text: '/**\n * the alerting lives in scripts/ops/alert-dispatch.mjs\n */\nconst x = 1\n' },
    ])
    expect(verdict.callers).toBe(0)
    expect(verdict.problems).toEqual([])
  })

  it('strips both comment styles and leaves the code', () => {
    expect(withoutComments('a // gone\n/* also gone */ b')).toContain('a')
    expect(withoutComments('a // gone\n/* also gone */ b')).not.toContain('gone')
  })
})

describe('clause 3: the drill marker, executed rather than read', () => {
  it('is intact on the real functions', () => {
    expect(judgeDrillMarker()).toEqual([])
  })
})

describe('clause 4: the four classes stay tellable apart', () => {
  it('is intact on the real table', () => {
    expect(judgeClassGrammar()).toEqual([])
  })
})

describe('against the workflows as they actually stand', () => {
  const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))

  it.each(files)('%s routes its alerts lawfully', (file) => {
    const verdict = judgeWorkflow(file, readFileSync(join(WORKFLOWS, file), 'utf8'))
    expect(verdict.problems, verdict.problems.join('\n')).toEqual([])
  })

  it('the smoke and the main-red alert both still dispatch, so the scope has not collapsed', () => {
    const total = files.reduce((n, f) => n + judgeWorkflow(f, readFileSync(join(WORKFLOWS, f), 'utf8')).dispatchCount, 0)
    expect(total).toBeGreaterThanOrEqual(3)
  })

  it('ci.yml runs on pull requests and still dispatches exactly one alert, on a push only', () => {
    const parsed = readWorkflow(readFileSync(join(WORKFLOWS, 'ci.yml'), 'utf8'))
    expect(parsed.pullRequest).toBe(true)
    const dispatching = parsed.jobs.filter((j) => j.dispatches.length > 0)
    expect(dispatching).toHaveLength(1)
    expect(dispatching[0].name).toBe('main-red-alert')
    expect(dispatching[0].condition).toContain("github.event_name == 'push'")
  })
})

// Clause 6. On 11 September 2026 twelve runs of the build loop were refused at
// the same gate step, each pushed its ledger files to ops/session-log, and the
// stall judge read "0.1 hours ago" across a 44 hour silence on every working
// branch. The alert built for that silence was blind while the loop confessed.
describe('clause 6: the stall clock is not reset by bookkeeping', () => {
  it('is intact on the real picker and the real collector', () => {
    expect(judgeStallClock()).toEqual([])
  })

  it('FAILS a picker that lets a session-log push count as the build moving', () => {
    const naive = (feed: Array<{ activity_type?: string; ref?: string; timestamp?: string }>) => {
      const push = feed.find((a) => a.activity_type === 'push')
      return { when: push?.timestamp ?? null, ref: push?.ref?.replace('refs/heads/', '') ?? null, actor: null, bookkeepingSkipped: 0 }
    }
    const problems = judgeStallClock({ pick: naive })
    expect(problems.length).toBeGreaterThanOrEqual(2)
    expect(problems.join('\n')).toContain('ops/session-log counted as the build moving')
    expect(problems.join('\n')).toContain('only pushes to ops/session-log produced a last push')
  })

  it('FAILS a collector that no longer routes through the picker', () => {
    const problems = judgeStallClock({ collectorSource: 'async function collectLastPush() { return { when: null } }' })
    expect(problems.join('\n')).toContain('no longer picks the last push through pickLastPush')
  })

  it('does not mistake a comment naming the picker for the call', () => {
    const problems = judgeStallClock({ collectorSource: withoutComments('// pickLastPush( is named here only\nasync function collectLastPush() {}') })
    expect(problems.join('\n')).toContain('no longer picks the last push through pickLastPush')
  })
})
