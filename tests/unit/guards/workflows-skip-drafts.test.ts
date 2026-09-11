import { describe, expect, test } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  analyseWorkflow,
  cannotRunOnAPullRequest,
  DRAFT_CONDITION,
  READY_EVENT,
} from '../../../scripts/guards/workflows-skip-drafts.mjs'

/**
 * THE DRAFT RULE HAS TWO HALVES AND BOTH DIE QUIETLY.
 *
 * Close-out C2.2 (5 September 2026): CI runs once per pull request, when the
 * draft is marked ready, because six failed-run emails arrived for one pull
 * request that used CI as its test runner. A job without the draft condition
 * is six emails again; a trigger without ready_for_review is a required check
 * that never reports. The guard reads the workflows without a YAML library, so
 * the parser is pinned here on fixtures shaped like the real files, and then
 * every real file is judged.
 */

const ROOT = join(__dirname, '..', '..', '..')
const COND = `\${{ github.event_name != 'pull_request' || ${DRAFT_CONDITION} }}`

const compliant = [
  'name: X',
  '',
  'on:',
  '  push:',
  '    branches: [main]',
  '  pull_request:',
  '    branches: [main]',
  '    # a comment between keys',
  `    types: [opened, synchronize, reopened, ${READY_EVENT}]`,
  '',
  'jobs:',
  '  # -------- a comment at job indent is not a job --------',
  '  a:',
  '    name: A',
  `    if: ${COND}`,
  '    runs-on: ubuntu-latest',
  '  b:',
  '    needs: a',
  '    if: >-',
  "      ${{ vars.X == 'true' &&",
  `      (github.event_name != 'pull_request' || ${DRAFT_CONDITION}) }}`,
  '    runs-on: ubuntu-latest',
  '',
].join('\n')

describe('analyseWorkflow', () => {
  test('a compliant workflow: pull_request seen, types read past a comment, both job shapes carry the condition', () => {
    const a = analyseWorkflow(compliant)
    expect(a.pullRequest).toBe(true)
    expect(a.types).toContain(READY_EVENT)
    expect(a.jobs.map((j) => j.name)).toEqual(['a', 'b'])
    expect(a.jobs[1].condition).toContain(DRAFT_CONDITION)
    expect(a.problems).toEqual([])
  })

  test('a job that loses the condition is named', () => {
    const a = analyseWorkflow(compliant.replace(`    if: ${COND}\n`, ''))
    expect(a.problems).toHaveLength(1)
    expect(a.problems[0]).toContain('job "a"')
    expect(a.problems[0]).toContain('would run on a draft')
  })

  test('a trigger without ready_for_review is a workflow that never wakes', () => {
    const a = analyseWorkflow(compliant.replace(`, ${READY_EVENT}]`, ']'))
    expect(a.problems).toHaveLength(1)
    expect(a.problems[0]).toContain(READY_EVENT)
    expect(a.problems[0]).toContain('never runs this workflow')
  })

  test('a trigger with no types at all falls to the GitHub defaults, which exclude ready_for_review', () => {
    const a = analyseWorkflow(compliant.replace(/    types: .*\n/, ''))
    expect(a.types).toEqual([])
    expect(a.problems.some((p) => p.includes(READY_EVENT))).toBe(true)
  })

  test('types written as a block list are read too', () => {
    const block = compliant.replace(
      `    types: [opened, synchronize, reopened, ${READY_EVENT}]`,
      `    types:\n      - opened\n      - ${READY_EVENT}`,
    )
    const a = analyseWorkflow(block)
    expect(a.types).toEqual(['opened', READY_EVENT])
    expect(a.problems).toEqual([])
  })

  test('a push-only workflow is out of scope, never a problem', () => {
    const a = analyseWorkflow('name: Y\n\non:\n  push:\n    branches: ["**"]\n\njobs:\n  locks:\n    runs-on: ubuntu-latest\n')
    expect(a.pullRequest).toBe(false)
    expect(a.problems).toEqual([])
  })

  test('the inline trigger list is read, and carries no types', () => {
    const a = analyseWorkflow('on: [push, pull_request]\n\njobs:\n  a:\n    runs-on: ubuntu-latest\n')
    expect(a.pullRequest).toBe(true)
    expect(a.problems.some((p) => p.includes(READY_EVENT))).toBe(true)
    expect(a.problems.some((p) => p.includes('job "a"'))).toBe(true)
  })

  test('a job that can only run on a push is not asked for the draft clause', () => {
    // Close-out UX4.3 added ci.yml's main-red-alert, which fires only on a push
    // to main. `push` and `pull_request` are different events, so that job can
    // never see a draft, and demanding the draft test on top of it would be a
    // test for an event it has already excluded.
    const a = analyseWorkflow(
      'on:\n  pull_request:\n    types: [opened, ready_for_review]\n\njobs:\n' +
        "  a:\n    if: ${{ failure() && github.event_name == 'push' && github.ref == 'refs/heads/main' }}\n    runs-on: ubuntu-latest\n",
    )
    expect(a.problems).toEqual([])
  })

  test('nothing broader than the exact push equality gets that exemption', () => {
    expect(cannotRunOnAPullRequest("github.event_name == 'push'")).toBe(true)
    expect(cannotRunOnAPullRequest('github.event_name == "push"')).toBe(true)
    expect(cannotRunOnAPullRequest("github.event_name != 'push'")).toBe(false)
    expect(cannotRunOnAPullRequest("contains(github.event_name, 'push')")).toBe(false)
    expect(cannotRunOnAPullRequest('always()')).toBe(false)
  })

  test('pull_request_target is not mistaken for pull_request', () => {
    const a = analyseWorkflow('on:\n  pull_request_target:\n    branches: [main]\n\njobs:\n  a:\n    runs-on: ubuntu-latest\n')
    expect(a.pullRequest).toBe(false)
  })
})

describe('the real workflows', () => {
  const dir = join(ROOT, '.github', 'workflows')
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))

  test('there are pull-request workflows to hold to the rule', () => {
    const withPr = files.filter((f) => analyseWorkflow(readFileSync(join(dir, f), 'utf8')).pullRequest)
    expect(withPr.length).toBeGreaterThanOrEqual(2)
  })

  test.each(files)('%s skips drafts on every job and wakes on ready_for_review', (f) => {
    const a = analyseWorkflow(readFileSync(join(dir, f), 'utf8'))
    expect(a.problems, a.problems.join('\n')).toEqual([])
  })
})
