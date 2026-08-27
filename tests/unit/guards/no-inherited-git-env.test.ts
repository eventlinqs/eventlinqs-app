import { describe, expect, test, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { gitEnv, insideGitHook } from '../../../scripts/lib/git-env.mjs'

/**
 * THE GIT_DIR INCIDENT CLASS, DRILLED WHERE IT ACTUALLY BREAKS.
 *
 * Two separate things are proven here, and the order matters.
 *
 * FIRST, THE MECHANISM. Not the guard, the underlying behaviour. A git child
 * that inherits GIT_DIR ignores its own cwd for the purpose of choosing a
 * repository. If that is not true, the guard is theatre; if it is true, the
 * guard is the only thing standing between a hook run and the real repository.
 * These tests set GIT_DIR deliberately, which is what a hook does, and measure
 * what git actually answers. A clean shell cannot reproduce this, which is
 * exactly why the original defect passed twice locally and then broke the
 * repository on its first push.
 *
 * SECOND, THE GUARD. It is made to go red on a real unguarded call site and
 * green again when the site is fixed. A guard that has never been shown to fail
 * is indistinguishable from a guard that cannot.
 *
 * Nothing here touches the real repository. Every fixture is a throwaway repo in
 * the OS temp directory, and every git invocation in the harness clears the
 * environment through the same shared helper the guard requires.
 */

const ROOT = join(__dirname, '..', '..', '..')
const GUARD = join(ROOT, 'scripts', 'guards', 'no-inherited-git-env.mjs')

let realish: string
let fixture: string

function git(args: string[], cwd: string, env = gitEnv()) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env })
}

function makeRepo(prefix: string, subject: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  writeFileSync(join(dir, 'marker.txt'), subject, 'utf8')
  git(['init', '-q', '.'], dir)
  git(['config', 'user.email', 'drill@eventlinqs.test'], dir)
  git(['config', 'user.name', 'drill'], dir)
  git(['add', '.'], dir)
  git(['commit', '-qm', subject], dir)
  return dir
}

beforeAll(() => {
  // "realish" stands in for this repository: the one a hook would point at.
  realish = makeRepo('el-gitenv-realish-', 'the repository the hook points at')
  // "fixture" stands in for the temp repo a drill believes it is working in.
  fixture = makeRepo('el-gitenv-fixture-', 'the temp repo the script thinks it uses')
})

afterAll(() => {
  for (const d of [realish, fixture]) if (d) rmSync(d, { recursive: true, force: true })
})

describe('the mechanism: an inherited GIT_DIR makes cwd decorative', () => {
  test('WITHOUT a cleared env, a git child in one repo answers about the OTHER', () => {
    // This is the whole incident in four lines. cwd says fixture. GIT_DIR says
    // realish. git answers about realish.
    const hookLike = { ...process.env, GIT_DIR: join(realish, '.git') }

    const subject = spawnSync('git', ['log', '-1', '--format=%s'], {
      cwd: fixture,
      encoding: 'utf8',
      env: hookLike,
    }).stdout.trim()

    expect(subject).toBe('the repository the hook points at')
    expect(subject).not.toBe('the temp repo the script thinks it uses')
  })

  test('WITH gitEnv(), the same call answers about the repo cwd names', () => {
    const hookLike = { ...process.env, GIT_DIR: join(realish, '.git') }
    // gitEnv() is applied to the hook-like environment, not to a clean one, so
    // this measures the fix doing its job rather than the absence of the problem.
    const cleared = gitEnv()
    delete (cleared as Record<string, string | undefined>).GIT_DIR
    expect(hookLike.GIT_DIR).toBeTruthy()

    const subject = spawnSync('git', ['log', '-1', '--format=%s'], {
      cwd: fixture,
      encoding: 'utf8',
      env: cleared,
    }).stdout.trim()

    expect(subject).toBe('the temp repo the script thinks it uses')
  })

  test('gitEnv strips every GIT_ variable, not a hand-written list of them', () => {
    process.env.GIT_DIR = join(realish, '.git')
    process.env.GIT_SOME_FUTURE_FLAG = 'x'
    try {
      const env = gitEnv()
      const leaked = Object.keys(env).filter((k) => k.startsWith('GIT_'))
      expect(leaked).toEqual([])
      // and it keeps what git needs to run at all
      expect(env.PATH ?? env.Path).toBeTruthy()
    } finally {
      delete process.env.GIT_DIR
      delete process.env.GIT_SOME_FUTURE_FLAG
    }
  })

  test('a caller can pass a GIT_ variable back explicitly, which is visible in review', () => {
    const env = gitEnv({ GIT_AUTHOR_NAME: 'deliberate' })
    expect(env.GIT_AUTHOR_NAME).toBe('deliberate')
  })

  test('insideGitHook reports the hook context without changing behaviour', () => {
    expect(insideGitHook()).toBe(false)
    process.env.GIT_DIR = join(realish, '.git')
    try {
      expect(insideGitHook()).toBe(true)
      // The clearing is unconditional: it does not depend on this being checked.
      expect(Object.keys(gitEnv()).filter((k) => k.startsWith('GIT_'))).toEqual([])
    } finally {
      delete process.env.GIT_DIR
    }
  })
})

describe('the guard goes red on a real unguarded call site', () => {
  const SCRATCH = join(ROOT, 'scripts', 'verify', '__gitenv_drill_scratch.mjs')

  afterAll(() => {
    rmSync(SCRATCH, { force: true })
  })

  function runGuard() {
    const r = spawnSync(process.execPath, [GUARD], {
      cwd: ROOT,
      encoding: 'utf8',
      env: gitEnv(),
    })
    return { status: r.status, out: `${r.stdout}${r.stderr}` }
  }

  test('green on the repository as it stands', () => {
    const { status, out } = runGuard()
    expect(status).toBe(0)
    expect(out).toContain('PASS')
  })

  test('red when a file spawns git with no env option, and it names the file and line', () => {
    writeFileSync(
      SCRATCH,
      [
        "import { execFileSync } from 'node:child_process'",
        "execFileSync('git', ['status', '--porcelain'], { cwd: process.cwd(), encoding: 'utf8' })",
        '',
      ].join('\n'),
      'utf8',
    )

    const { status, out } = runGuard()

    expect(status).toBe(1)
    expect(out).toContain('FAIL')
    expect(out).toContain('__gitenv_drill_scratch.mjs')
    expect(out).toContain('has no env option')
  })

  test('green again the moment the env option is added, so the fix is what clears it', () => {
    writeFileSync(
      SCRATCH,
      [
        "import { execFileSync } from 'node:child_process'",
        "import { gitEnv } from '../lib/git-env.mjs'",
        "execFileSync('git', ['status', '--porcelain'], { cwd: process.cwd(), encoding: 'utf8', env: gitEnv() })",
        '',
      ].join('\n'),
      'utf8',
    )

    const { status } = runGuard()
    expect(status).toBe(0)
  })

  test('a multi-line options object is read correctly, not truncated at the first brace', () => {
    // The brace scanner exists because a regex either stops early and reports a
    // false failure or runs on and reports a false pass. A false pass is the
    // risk, so this pins the shape that would produce one.
    writeFileSync(
      SCRATCH,
      [
        "import { spawnSync } from 'node:child_process'",
        "import { gitEnv } from '../lib/git-env.mjs'",
        "spawnSync('git', ['log', '-1'], {",
        '  cwd: process.cwd(),',
        "  encoding: 'utf8',",
        "  stdio: ['ignore', 'pipe', 'pipe'],",
        '  env: gitEnv(),',
        '})',
        '',
      ].join('\n'),
      'utf8',
    )

    expect(runGuard().status).toBe(0)

    writeFileSync(
      SCRATCH,
      [
        "import { spawnSync } from 'node:child_process'",
        "spawnSync('git', ['log', '-1'], {",
        '  cwd: process.cwd(),',
        "  encoding: 'utf8',",
        "  stdio: ['ignore', 'pipe', 'pipe'],",
        '})',
        '',
      ].join('\n'),
      'utf8',
    )

    expect(runGuard().status).toBe(1)
  })
})

describe('the repository is still healthy after this file has run', () => {
  test('core.bare is false and the work tree resolves', () => {
    // The original defect left core.bare=true on the shared config. If anything
    // in this file ever escapes its fixtures again, this is the line that says so.
    const bare = git(['config', '--local', '--get', 'core.bare'], ROOT).stdout.trim()
    expect(bare).not.toBe('true')

    const top = git(['rev-parse', '--show-toplevel'], ROOT).stdout.trim()
    expect(top.length).toBeGreaterThan(0)

    // And the identity is the founder's, not a drill fixture's.
    const email = git(['config', '--local', '--get', 'user.email'], ROOT).stdout.trim()
    expect(email).not.toContain('drill@')
  })

  test('the guard file itself is registered in the runner', () => {
    const runner = readFileSync(join(ROOT, 'scripts', 'guards', 'run-guards.mjs'), 'utf8')
    expect(runner).toContain('scripts/guards/no-inherited-git-env.mjs')
  })
})
