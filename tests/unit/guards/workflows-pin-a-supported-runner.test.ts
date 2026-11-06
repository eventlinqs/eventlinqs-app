// EVERY WORKFLOW RUNS ON A NAMED IMAGE PLAYWRIGHT SUPPORTS (the CONTROLLER's 23:23 of 6 November 2026, read from the run's own
// log: the scheduled engine verifier on main failed at 23:20, run 42216739826, 'Error: ERROR: Playwright does not support
// chromium on ubuntu26.04-x64', because GitHub moved ubuntu-latest to Ubuntu 26.04 and Playwright 1.59.1 has no build for it).
// A workflow names its image, never 'latest', and only one the installed Playwright's own support list names.

import { describe, expect, test } from 'vitest'
import { judgeRunners, playwrightUbuntus } from '../../../scripts/guards/workflows-pin-a-supported-runner.mjs'

const supported = new Set(['ubuntu20.04', 'ubuntu22.04', 'ubuntu24.04'])
const wf = (runsOn: string) => `name: x\njobs:\n  a:\n    runs-on: ${runsOn}\n    steps:\n      - run: echo hi\n`

describe('the runner every workflow names', () => {
  test("'ubuntu-latest' fails: it moved to 26.04 under us", () => {
    expect(judgeRunners({ 'ci.yml': wf('ubuntu-latest') }, supported)).toEqual([expect.stringContaining("ci.yml:4 runs on 'ubuntu-latest'")])
  })

  test('an image Playwright does not name fails, a named supported one passes', () => {
    expect(judgeRunners({ 'a.yml': wf('ubuntu-26.04') }, supported)).toHaveLength(1)
    expect(judgeRunners({ 'a.yml': wf('ubuntu-24.04') }, supported)).toEqual([])
    expect(judgeRunners({ 'a.yml': wf("'ubuntu-24.04'") }, supported)).toEqual([])
  })

  test("the installed Playwright's own list is read, and it names 24.04 and not 26.04", () => {
    const list = playwrightUbuntus()
    expect(list.has('ubuntu24.04')).toBe(true)
    expect(list.has('ubuntu26.04')).toBe(false)
  })
})
