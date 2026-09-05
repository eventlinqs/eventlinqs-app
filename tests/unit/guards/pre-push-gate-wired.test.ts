import { describe, expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GATE, HOOK, NPM_SCRIPT, inspectHook, inspectPackage } from '../../../scripts/guards/pre-push-gate-wired.mjs'

/**
 * THE HOOK RUNS THE WHOLE GATE, OR IT IS NOT A GATE.
 *
 * Close-out C2.1 and C2.3 (5 September 2026). The one command that runs every
 * CI check locally is wired as the pre-push hook. Every way that wiring can
 * quietly stop being true is a state in which a push looks gated and is not,
 * so the reader that judges the hook text is pinned here on each of them.
 */

const ROOT = join(__dirname, '..', '..', '..')

const good = ['#!/bin/sh', '# a comment mentioning node scripts/ops/pre-push-gate.mjs --only is not code', 'node scripts/ops/pre-push-gate.mjs', 'status=$?', 'exit $status', ''].join('\n')

describe('inspectHook', () => {
  test('the correct shape has no problems', () => {
    expect(inspectHook(good)).toEqual([])
  })

  test('exec is an acceptable way to propagate the verdict', () => {
    expect(inspectHook('#!/bin/sh\nexec node scripts/ops/pre-push-gate.mjs\n')).toEqual([])
  })

  test('an empty hook', () => {
    expect(inspectHook('')).toEqual(['is empty'])
  })

  test('a hook that never invokes the gate', () => {
    const problems = inspectHook('#!/bin/sh\nnpx tsc --noEmit\nexit $?\n')
    expect(problems.some((p) => p.includes(`never invokes ${GATE}`))).toBe(true)
  })

  test('a hook that selects a subset', () => {
    const problems = inspectHook(good.replace('pre-push-gate.mjs\n', 'pre-push-gate.mjs --only typecheck\n'))
    expect(problems.some((p) => p.includes('step selection'))).toBe(true)
  })

  test('a hook that swallows the verdict', () => {
    const problems = inspectHook('#!/bin/sh\nnode scripts/ops/pre-push-gate.mjs\nexit 0\n')
    expect(problems.some((p) => p.includes('does not exit with the gate result'))).toBe(true)
  })

  test('a hook without the shebang', () => {
    const problems = inspectHook('node scripts/ops/pre-push-gate.mjs\nexit $?\n')
    expect(problems.some((p) => p.includes('#!/bin/sh'))).toBe(true)
  })
})

describe('inspectPackage', () => {
  test('the one command must exist and point at the gate', () => {
    expect(inspectPackage({ scripts: { [NPM_SCRIPT]: `node ${GATE}` } })).toEqual([])
    expect(inspectPackage({ scripts: {} })[0]).toContain('missing')
    expect(inspectPackage({ scripts: { [NPM_SCRIPT]: 'node scripts/ops/pre-push-gate.mjs --only lint' } })[0]).toContain('--only lint')
  })
})

describe('the repository as it stands', () => {
  test('the hook, the gate and the npm script are all wired', () => {
    expect(existsSync(join(ROOT, GATE))).toBe(true)
    expect(inspectHook(readFileSync(join(ROOT, HOOK), 'utf8'))).toEqual([])
    expect(inspectPackage(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')))).toEqual([])
  })
})
