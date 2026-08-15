import { describe, expect, test, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * THE MIGRATION COLLISION GUARD ACTUALLY CATCHES A COLLISION.
 *
 * WHY THIS TEST EXISTS. The guard was registered in run-guards.mjs on 12 August
 * 2026 and has reported green ever since, which is exactly the state it was in
 * before it was registered, when it was wired to nothing. A guard that has never
 * been shown to go red is indistinguishable from a guard that cannot. This makes
 * it go red on demand, so the green means something.
 *
 * It is a DRILL: every case spawns the real guard against a real directory of
 * real files and reads its real exit code. Nothing here inspects the guard's
 * source, because a source-reading test would pass against a guard whose
 * comparison had been inverted.
 *
 * The second half pins the SKIP behaviour. Before 15 August 2026 the remote
 * check printed a lower-case `[skip]` line and the run still ended
 * `===== ALL GREEN =====`, so three answered questions and four answered
 * questions produced the same banner. That is the shape that let a real
 * collision hazard sit unexamined: on that date `20260808000004` was claimed by
 * DIFFERENT files on main and on integration/launch, and only the remote half
 * could say whether the version was already applied to production.
 */

const ROOT = join(__dirname, '..', '..', '..')
const GUARD = join(ROOT, 'scripts', 'verify', 'migration-collision-guard.mjs')

let repo: string

/**
 * EVERY GIT_* VARIABLE IS STRIPPED, AND THIS IS NOT DEFENSIVE TIDINESS.
 *
 * This drill spawns `git init` and `git commit` inside a temp directory. The
 * suite is run by `.githooks/pre-push`, and git sets GIT_DIR (among others) for
 * a hook, pointing at the REAL repository. A child `git` inherits it, and then
 * `cwd` is decorative: the command operates on this repository instead of the
 * fixture.
 *
 * That is not hypothetical. The first version of this file had no such
 * stripping, and on its first push it set `core.bare=true` in the shared
 * worktree config, which made `git status` fail with "this operation must be run
 * in a work tree" in ALL NINE worktrees at once. Nothing was lost, because the
 * failing `git init` also stopped the `git add .` that would have staged temp
 * files into the real index, but the next arrangement of the same bug would not
 * have been so tidy.
 *
 * So: no GIT_ variable reaches a child of this file, ever.
 */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  // Built by DELETION from process.env rather than by construction. This project
  // types NODE_ENV as a required property of ProcessEnv, so a freshly built
  // Record<string, string> is not assignable and tsc rejects every spawnSync
  // call below. Copying and deleting keeps the type and the required key.
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key]
  }
  return { ...env, ...extra }
}

function git(args: string[], cwd: string) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
}

/** Build a throwaway git repo whose only content is the migrations given. */
function makeRepo(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'el-collision-drill-'))
  mkdirSync(join(dir, 'supabase', 'migrations'), { recursive: true })
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, 'supabase', 'migrations', name), body, 'utf8')
  }
  git(['init', '-q', '.'], dir)
  git(['config', 'user.email', 'drill@eventlinqs.test'], dir)
  git(['config', 'user.name', 'drill'], dir)
  git(['add', '.'], dir)
  git(['commit', '-qm', 'drill fixture'], dir)

  // PROVE THE ISOLATION RATHER THAN TRUST IT. If a GIT_ variable ever leaks
  // again, these two reads answer about the wrong repository and this throws
  // here, loudly, instead of quietly mutating the real one.
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: dir,
    encoding: 'utf8',
    env: cleanEnv(),
  }).stdout.trim()
  if (!top.toLowerCase().includes('el-collision-drill-')) {
    throw new Error(`fixture git escaped its temp dir: rev-parse says ${top}`)
  }
  const subject = spawnSync('git', ['log', '-1', '--format=%s'], {
    cwd: dir,
    encoding: 'utf8',
    env: cleanEnv(),
  }).stdout.trim()
  if (subject !== 'drill fixture') {
    throw new Error(`fixture repo HEAD is "${subject}", not the fixture commit`)
  }

  return dir
}

function runGuard(cwd: string, args: string[] = []) {
  // The guard itself shells out to git. Same reasoning: without a clean
  // environment it would read this repository's refs while claiming to read the
  // fixture, and the drill would pass while proving nothing.
  const r = spawnSync(process.execPath, [GUARD, ...args], {
    cwd,
    encoding: 'utf8',
    env: cleanEnv(),
  })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true })
})

describe('migration collision guard: it goes red on a real collision', () => {
  test('two files claiming ONE version FAIL the guard', () => {
    // The exact shape of the failure it exists for: two sessions on the same day
    // both counting from 000001, neither able to see the other's file.
    repo = makeRepo({
      '20260901000001_first_session.sql': 'select 1;\n',
      '20260901000001_second_session.sql': 'select 2;\n',
    })

    const { status, out } = runGuard(repo)

    expect(status).toBe(1)
    expect(out).toContain('FAILED')
    expect(out).toContain('20260901000001')
    expect(out).not.toContain('ALL GREEN')
    rmSync(repo, { recursive: true, force: true })
  })

  test('the failure explains that the loser NEVER RUNS, which is the whole point', () => {
    repo = makeRepo({
      '20260901000001_first_session.sql': 'select 1;\n',
      '20260901000001_second_session.sql': 'select 2;\n',
    })

    const { out } = runGuard(repo)

    // If this wording ever softens to "duplicate version", the reader loses the
    // one fact that makes it urgent: db push records the version and moves on.
    expect(out).toMatch(/never runs?/i)
    rmSync(repo, { recursive: true, force: true })
  })

  test('distinct versions PASS', () => {
    repo = makeRepo({
      '20260901000001_first.sql': 'select 1;\n',
      '20260901000002_second.sql': 'select 2;\n',
    })

    const { status } = runGuard(repo)

    expect(status).toBe(0)
    rmSync(repo, { recursive: true, force: true })
  })
})

describe('migration collision guard: a skipped check is never a pass', () => {
  test('without --remote the banner says SKIPPED and never says ALL GREEN', () => {
    repo = makeRepo({
      '20260901000001_first.sql': 'select 1;\n',
      '20260901000002_second.sql': 'select 2;\n',
    })

    const { status, out } = runGuard(repo)

    // Exits 0 on purpose: a machine with no database credentials must still be
    // able to build. The caveat therefore has to live in the output.
    expect(status).toBe(0)
    expect(out).toContain('SKIP')
    expect(out).toContain('CHECK(S) SKIPPED')
    expect(out).not.toContain('ALL GREEN')
    rmSync(repo, { recursive: true, force: true })
  })

  test('the skip names the remote check and how to answer it', () => {
    repo = makeRepo({ '20260901000001_first.sql': 'select 1;\n' })

    const { out } = runGuard(repo)

    expect(out).toContain('--remote')
    expect(out).toContain('UNKNOWN')
    rmSync(repo, { recursive: true, force: true })
  })
})
