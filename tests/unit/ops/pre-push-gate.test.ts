import { describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { STEPS, classifyPush, judgeLighthouseRun, killTree, parseEnvFile, readCollectedReports } from '../../../scripts/ops/pre-push-gate.mjs'

/**
 * THE GATE RUNS WHAT CI RUNS, AND SKIPS ONLY WHAT SENDS NOTHING.
 *
 * Close-out C2.1 (5 September 2026): one command, every CI check, wired as the
 * pre-push hook. Two things about it are decided in code and pinned here.
 *
 * 1. WHICH PUSHES ARE JUDGED. A deletion sends nothing; a tree without
 *    package.json is not the application. Everything else runs the whole gate,
 *    and a hand run with no ref list runs it too.
 *
 * 2. THAT NO CI CHECK IS MISSING. The step list carries the exact command each
 *    step stands in for, and this test derives CI's command list from the
 *    workflow file rather than from memory: a check added to ci.yml with no
 *    twin in the gate goes red here, on the next local run, before CI sees it.
 */

const ROOT = join(__dirname, '..', '..', '..')
const ZERO = '0'.repeat(40)
const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

describe('classifyPush', () => {
  test('no ref list is a hand run: the whole gate runs', () => {
    expect(classifyPush('', () => true).verdict).toBe('run')
  })

  test('deletions only send nothing', () => {
    const r = classifyPush(`(delete) ${ZERO} refs/heads/integration/launch ${SHA_A}\n`, () => true)
    expect(r.verdict).toBe('skip')
    expect(r.reason).toContain('deletion')
  })

  test('a tree without package.json is not the application', () => {
    const r = classifyPush(`refs/heads/ops/session-log ${SHA_A} refs/heads/ops/session-log ${SHA_B}\n`, () => false)
    expect(r.verdict).toBe('skip')
    expect(r.reason).toContain('package.json')
    expect(r.reason).toContain('refs/heads/ops/session-log')
  })

  test('a tree with package.json runs, and a mixed push runs', () => {
    expect(classifyPush(`refs/heads/x ${SHA_A} refs/heads/x ${SHA_B}\n`, () => true).verdict).toBe('run')
    const mixed = [`refs/heads/logs ${SHA_A} refs/heads/logs ${ZERO}`, `refs/heads/code ${SHA_B} refs/heads/code ${ZERO}`].join('\n')
    const r = classifyPush(mixed, (sha: string) => sha === SHA_B)
    expect(r.verdict).toBe('run')
    expect(r.reason).toContain('refs/heads/code')
  })
})

describe('judgeLighthouseRun', () => {
  /**
   * The Windows profile-cleanup race: Lighthouse finishes the audit, writes
   * the report, then chrome-launcher's rmSync throws EPERM and the process
   * exits 1. The first push through the gate (5 September 2026) lost every run
   * to it with a complete report on disk each time. The tolerance is narrow:
   * a finished audit on Windows, and nothing else.
   */
  const report = { lighthouseVersion: '12.1.0', categories: { performance: { score: 0.9 } } }
  const finished = 'LH:status Generating results...\nRuntime error encountered: EPERM, Permission denied'

  test('exit 0 with a report is a measurement', () => {
    expect(judgeLighthouseRun({ code: 0, platform: 'linux', stderr: '', report }).ok).toBe(true)
  })

  test('the Windows cleanup race after a finished audit is a measurement', () => {
    const v = judgeLighthouseRun({ code: 1, platform: 'win32', stderr: finished, report })
    expect(v.ok).toBe(true)
    expect(v.why).toContain('after the audit finished')
  })

  test('exit 1 without the audit finishing is not, even on Windows', () => {
    expect(judgeLighthouseRun({ code: 1, platform: 'win32', stderr: 'Unable to connect to Chrome', report }).ok).toBe(false)
  })

  test('the same race on another platform is not tolerated', () => {
    expect(judgeLighthouseRun({ code: 1, platform: 'linux', stderr: finished, report }).ok).toBe(false)
  })

  test('no report, a report without a version, or a runtime error all fail regardless of exit', () => {
    expect(judgeLighthouseRun({ code: 0, platform: 'win32', stderr: finished, report: null }).ok).toBe(false)
    expect(judgeLighthouseRun({ code: 0, platform: 'win32', stderr: finished, report: { audits: {} } }).ok).toBe(false)
    const errored = { ...report, runtimeError: { code: 'NO_FCP', message: 'nothing painted' } }
    const v = judgeLighthouseRun({ code: 0, platform: 'win32', stderr: finished, report: errored })
    expect(v.ok).toBe(false)
    expect(v.why).toContain('NO_FCP')
  })
})

describe('parseEnvFile', () => {
  test('the repository shape: comments, quotes, empty values', () => {
    const parsed = parseEnvFile(['# comment', 'A=1', 'B="two"', "C='three'", 'D=', 'E=# not a value', 'not a pair', 'F=x=y'].join('\n'))
    expect(parsed).toEqual({ A: '1', B: 'two', C: 'three', E: '# not a value', F: 'x=y' })
  })
})

describe('the step list against the CI workflow', () => {
  const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
  /** Every single-line `run:` command in ci.yml. Block scalars (`run: |`) are shell, not a check. */
  const ciCommands = [...ci.matchAll(/^\s*(?:- )?run:\s*([^|>\s][^\n]*)$/gm)].map((m) => m[1].trim())
  const INSTALLS = new Set(['npm ci'])
  const mirrored = new Set(STEPS.flatMap((s) => s.mirrors))

  test('the workflow has single-line checks to mirror', () => {
    expect(ciCommands.length).toBeGreaterThanOrEqual(7)
  })

  test.each(ciCommands.filter((c) => !INSTALLS.has(c)))('CI runs `%s`, and the gate has a step for it', (command) => {
    expect(mirrored.has(command), `add a step to scripts/ops/pre-push-gate.mjs whose mirrors include ${JSON.stringify(command)}`).toBe(true)
  })

  test('the Lighthouse job is mirrored by name', () => {
    const lighthouse = readFileSync(join(ROOT, '.github', 'workflows', 'lighthouse.yml'), 'utf8')
    expect(lighthouse).toContain('name: Lighthouse mobile gate')
    expect(mirrored.has('Lighthouse mobile gate')).toBe(true)
  })

  test('step ids are unique and every step names the CI step it stands in for', () => {
    const ids = STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of STEPS) {
      expect(s.ci, s.id).toMatch(/\S/)
      expect(typeof s.run, s.id).toBe('function')
      expect(['plain', 'local'], s.id).toContain(s.env)
    }
    for (const id of ['typecheck', 'lint', 'guards', 'types-drift', 'suite', 'build', 'lighthouse']) expect(ids).toContain(id)
  })

  test('the build comes after the suite and before Lighthouse, so a red suite never pays for a build', () => {
    const at = (id: string) => STEPS.findIndex((s) => s.id === id)
    expect(at('suite')).toBeLessThan(at('build'))
    expect(at('build')).toBeLessThan(at('lighthouse'))
    expect(at('typecheck')).toBeLessThan(at('suite'))
  })
})

/**
 * THE GATE STOPS WHAT IT STARTED, AND SAYS SO WHEN IT CANNOT.
 *
 * 7 September 2026: the red Lighthouse path left the served build and the
 * Upstash stub alive, taskkill's verdict was ignored, and the gate process hung
 * on the two child handles with git waiting for the hook. Each way a kill can
 * go is pinned here with a fake child and a fake taskkill.
 */
describe('killTree', () => {
  const fakeChild = (over: Record<string, unknown> = {}) => {
    const calls = { kill: [] as string[], unref: 0 }
    const proc = {
      pid: 4242,
      exitCode: null as number | null,
      kill: (signal: string) => {
        calls.kill.push(signal)
        return true
      },
      unref: () => {
        calls.unref += 1
      },
      ...over,
    }
    return { calls, proc }
  }
  const quiet = () => {}

  test('a child that already exited is left alone', () => {
    const c = fakeChild({ exitCode: 1 })
    let ran = 0
    const outcome = killTree(c.proc, { run: () => { ran += 1; return { status: 0 } }, platform: 'win32', warn: quiet })
    expect(outcome).toBe('exited')
    expect(ran).toBe(0)
    expect(c.calls.kill).toEqual([])
    expect(c.calls.unref).toBe(0)
  })

  test('on Windows a clean taskkill is the kill, and the handle is released', () => {
    const c = fakeChild()
    const warned: string[] = []
    const seen: unknown[] = []
    const outcome = killTree(c.proc, {
      run: (cmd: string, args: string[]) => { seen.push([cmd, args]); return { status: 0, stdout: 'SUCCESS', stderr: '' } },
      platform: 'win32',
      warn: (m: string) => warned.push(m),
    })
    expect(outcome).toBe('killed')
    expect(seen).toEqual([['taskkill', ['/PID', '4242', '/T', '/F']]])
    expect(c.calls.kill).toEqual([])
    expect(c.calls.unref).toBe(1)
    expect(warned).toEqual([])
  })

  test('on Windows a taskkill that exits non-zero is said out loud and SIGTERM follows', () => {
    const c = fakeChild()
    const warned: string[] = []
    const outcome = killTree(c.proc, {
      run: () => ({ status: 128, stdout: '', stderr: 'ERROR: The process "4242" not found.\r\n' }),
      platform: 'win32',
      warn: (m: string) => warned.push(m),
    })
    expect(outcome).toBe('fallback')
    expect(warned).toHaveLength(1)
    expect(warned[0]).toContain('exited 128')
    expect(warned[0]).toContain('not found')
    expect(c.calls.kill).toEqual(['SIGTERM'])
    expect(c.calls.unref).toBe(1)
  })

  test('on Windows a taskkill that cannot start is said out loud and SIGTERM follows', () => {
    const c = fakeChild()
    const warned: string[] = []
    const outcome = killTree(c.proc, {
      run: () => ({ error: new Error('spawn taskkill ENOENT'), status: null }),
      platform: 'win32',
      warn: (m: string) => warned.push(m),
    })
    expect(outcome).toBe('fallback')
    expect(warned[0]).toContain('ENOENT')
    expect(c.calls.kill).toEqual(['SIGTERM'])
    expect(c.calls.unref).toBe(1)
  })

  test('elsewhere SIGTERM is the kill and the handle is released', () => {
    const c = fakeChild()
    let ran = 0
    const outcome = killTree(c.proc, { run: () => { ran += 1; return { status: 0 } }, platform: 'linux', warn: quiet })
    expect(outcome).toBe('signalled')
    expect(ran).toBe(0)
    expect(c.calls.kill).toEqual(['SIGTERM'])
    expect(c.calls.unref).toBe(1)
  })
})

describe('readCollectedReports', () => {
  /*
   * It runs on the FAILURE path, to add the machine reading beside a red score.
   * A diagnosis that can throw would replace the failure the reader came for, so
   * every shape it can meet on disk is pinned here rather than assumed.
   */
  const dir = mkdtempSync(join(tmpdir(), 'el-lhr-'))

  test('reads every lhr-*.json and ignores everything else', () => {
    writeFileSync(join(dir, 'lhr-1.json'), JSON.stringify({ environment: { benchmarkIndex: 2700 } }))
    writeFileSync(join(dir, 'lhr-2.json'), JSON.stringify({ environment: { benchmarkIndex: 1100 } }))
    writeFileSync(join(dir, 'flags-gate.json'), JSON.stringify({ formFactor: 'mobile' }))
    writeFileSync(join(dir, 'notes.txt'), 'not a report')
    const found = readCollectedReports(dir)
    expect(found.map((r: { environment?: { benchmarkIndex?: number } }) => r.environment?.benchmarkIndex).sort()).toEqual([1100, 2700])
  })

  test('skips an unparseable report instead of throwing', () => {
    writeFileSync(join(dir, 'lhr-3.json'), '{ truncated')
    expect(() => readCollectedReports(dir)).not.toThrow()
    expect(readCollectedReports(dir)).toHaveLength(2)
  })

  test('answers empty for a directory that is not there', () => {
    expect(readCollectedReports(join(dir, 'gone'))).toEqual([])
  })
})
