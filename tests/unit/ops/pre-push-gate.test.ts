import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STEPS, classifyPush, parseEnvFile } from '../../../scripts/ops/pre-push-gate.mjs'

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
