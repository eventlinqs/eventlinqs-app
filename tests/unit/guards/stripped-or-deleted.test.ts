import { describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { callersOf, stateOf } from '../../../scripts/guards/lib/stripped-or-deleted.mjs'
import { reinclusionLines } from '../../../scripts/guards/lib/build-time-scripts.mjs'

/**
 * STRIPPED IS NOT DELETED. Close-out F1.9.2 PART THREE.
 *
 * A guard used to decide this by asking whether a parent DIRECTORY existed. On
 * 8 September 2026 that guess was wrong and blocked a deployment: Vercel deletes
 * the matched FILES and leaves the directory tree standing, so the directory
 * arrived present and empty and the guard read that as somebody deleting the
 * report.
 *
 * The determination now asks the only two questions that decide it: does
 * .vercelignore exclude this exact path, and is this the Vercel build host. These
 * tests drive every combination against real trees on disk, because a fake
 * filesystem would only prove the fake agrees with the assertion.
 */
function tree(ignoreText: string, files: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'strip-state-'))
  writeFileSync(join(root, '.vercelignore'), ignoreText)
  for (const [path, body] of Object.entries(files)) {
    const abs = join(root, path)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

const EXCLUDES_DOCS = 'docs/*\n!docs/PRICING.md\n'
const KEEPS_THE_REPORT = 'docs/*\n!docs/verification/\ndocs/verification/*\n!docs/verification/LAUNCH-READINESS.md\n'

describe('stateOf', () => {
  test('a file that is there is PRESENT, whatever the ignore rules say', () => {
    const root = tree(EXCLUDES_DOCS, { 'docs/verification/LAUNCH-READINESS.md': 'x' })
    try {
      expect(stateOf('docs/verification/LAUNCH-READINESS.md', { root, env: {} }).state).toBe('present')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('excluded AND on Vercel is STRIPPED, which is the case that cost a deployment', () => {
    const root = tree(EXCLUDES_DOCS)
    try {
      const v = stateOf('docs/verification/LAUNCH-READINESS.md', { root, env: { VERCEL: '1' } })
      expect(v.state).toBe('stripped')
      expect(v.why).toContain('never uploaded')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('excluded but NOT on Vercel is DELETED, because the whole tree is present here', () => {
    const root = tree(EXCLUDES_DOCS)
    try {
      expect(stateOf('docs/verification/LAUNCH-READINESS.md', { root, env: {} }).state).toBe('deleted')
      expect(stateOf('docs/verification/LAUNCH-READINESS.md', { root, env: { GITHUB_ACTIONS: 'true' } }).state).toBe(
        'deleted',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('re-included and missing is DELETED even on Vercel, which is the state after PART ONE', () => {
    const root = tree(KEEPS_THE_REPORT)
    try {
      const v = stateOf('docs/verification/LAUNCH-READINESS.md', { root, env: { VERCEL: '1' } })
      expect(v.state).toBe('deleted')
      expect(v.why).toContain('even a Vercel build would have received it')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('a directory left standing does not make a missing file look present', () => {
    // The exact shape of the upload: the directory arrives, the file does not.
    const root = tree(EXCLUDES_DOCS, { 'docs/verification/keep.txt': 'x' })
    rmSync(join(root, 'docs/verification/keep.txt'))
    try {
      expect(stateOf('docs/verification/LAUNCH-READINESS.md', { root, env: { VERCEL: '1' } }).state).toBe('stripped')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('no .vercelignore at all means nothing could have stripped it', () => {
    const root = mkdtempSync(join(tmpdir(), 'strip-state-none-'))
    try {
      const v = stateOf('docs/anything.md', { root, env: { VERCEL: '1' } })
      expect(v.state).toBe('deleted')
      expect(v.why).toContain('no .vercelignore')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('callersOf', () => {
  test('the determination is shared, and the count is measured rather than claimed', () => {
    const callers = callersOf()
    expect(callers).toContain('scripts/guards/launch-readiness-honest.mjs')
    expect(callers.length).toBeGreaterThan(0)
  })
})

describe('reinclusionLines derives the walk-down instead of describing it', () => {
  test('a file directly under docs/ needs one line', () => {
    expect(reinclusionLines('docs/PRICING.md')).toEqual(['!docs/PRICING.md'])
  })

  test('a file one level down needs the level opened, re-excluded, then named', () => {
    expect(reinclusionLines('docs/scope/community-layer-approved.json')).toEqual([
      '!docs/scope/',
      'docs/scope/*',
      '!docs/scope/community-layer-approved.json',
    ])
  })

  test('a DIRECTORY is re-included whole, so a new artefact inside it needs no edit', () => {
    expect(reinclusionLines('docs/verification/launch-readiness/')).toEqual([
      '!docs/verification/',
      'docs/verification/*',
      '!docs/verification/launch-readiness/',
    ])
  })

  test('two levels down opens both, which is the walk-down that cost a deployment when done by hand', () => {
    expect(reinclusionLines('docs/a/b/c.md')).toEqual(['!docs/a/', 'docs/a/*', '!docs/a/b/', 'docs/a/b/*', '!docs/a/b/c.md'])
  })
})
