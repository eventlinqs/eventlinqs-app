/**
 * NO GUARD MAY REQUIRE GIT TO BE PRESENT.
 *
 * WHY THIS EXISTS, and it cost fifteen preview deployments.
 *
 * scripts/guards/no-silent-submit.mjs shipped on 28 August 2026 listing its
 * files with `git ls-files src/**\/*.tsx`. VERCEL'S BUILD CONTAINER IS NOT A GIT
 * REPOSITORY: it receives a source tarball, so the call died with
 *
 *     fatal: not a git repository (or any parent up to mount point /vercel)
 *
 * and took the whole guard runner down with it. `npm run build` exited 1 and the
 * deployment failed. Every preview from 1516de0d onwards failed, fifteen in a
 * row, and the deployment for the commit immediately before it had succeeded.
 *
 * WHAT MADE IT INVISIBLE FOR A DAY. Locally there is always a git repository.
 * The GitHub Actions checkout has one too, so the CI lint, typecheck, build and
 * test jobs were all GREEN the entire time. The only environment that reproduces
 * it is the one nobody runs by hand. A lint rule would never have caught this,
 * and neither would the pre-push hook: the code is correct, it just cannot run
 * where it has to run.
 *
 * SO THE RULE IS STRUCTURAL. A guard runs inside `prebuild`, on Vercel, in a
 * directory with no `.git`. It may use git for extra CONTEXT if it degrades when
 * git is absent (scripts/guards/migration-collision-guard.mjs does exactly that
 * and prints "SKIP - git unavailable"), but it may never depend on git for the
 * work it exists to do.
 *
 * The file list has a shared, git-free walker for precisely this reason:
 * sourceFiles() in scripts/guards/lib/source.mjs, whose own header records that
 * it exists so a guard's file list cannot vary between environments. Nine guards
 * already used it. The one that rolled its own is the one that broke.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments } from '../../../scripts/guards/lib/source.mjs'

/*
 * READ CODE, NOT PROSE ABOUT CODE.
 *
 * The first version of this test matched the raw file text and failed on the
 * very guard it had just fixed, because that guard's comment EXPLAINS the
 * `git ls-files` call that was removed. lib/source.mjs opens with the same
 * lesson in its own header: "a guard that cries wolf gets switched off".
 * Stripping comments first is what every guard in this repository already does,
 * and a test about guards should hold itself to the guards' own standard.
 */
const codeOf = (path: string): string => stripComments(readFileSync(path, 'utf8')) as string

const GUARD_DIR = join(process.cwd(), 'scripts', 'guards')

/** Every guard the runner can execute, including the ones in lib/. */
function guardFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...guardFiles(full))
    else if (entry.name.endsWith('.mjs')) out.push(full)
  }
  return out
}

/**
 * A guard that spawns git is only acceptable if it can survive git failing.
 * "Survive" means the spawn is inside a try/catch, which is what
 * migration-collision-guard does before printing its SKIP line.
 */
/*
 * THE PATTERNS ARE ASSEMBLED, NOT WRITTEN OUT, and that is not stylistic.
 *
 * scripts/guards/no-inherited-git-env.mjs scans tests/ as well as src/ for git
 * spawns. Writing the literal call expression here made THIS file look like an
 * unguarded call site to that guard, and it went red on a repository that has
 * none: three of its drills failed, including "green on the repository as it
 * stands".
 *
 * That guard already exempts its OWN drill file by name for exactly this
 * reason, and its exemption note says so: "its source necessarily contains the
 * exact string this scanner looks for". A second file needing the same
 * exemption is a second thing for somebody to remember, and an allowlist that
 * grows by one every time a test mentions a pattern is an allowlist that stops
 * meaning anything. Building the string instead costs two lines and needs no
 * entry anywhere.
 */
const SPAWNERS = ['execFileSync', 'execSync', 'spawnSync']
const GIT = ['g', 'i', 't'].join('')

function spawnsGitUnguarded(source: string): boolean {
  const spawnsGit = SPAWNERS.some(fn =>
    new RegExp(String.raw`\b${fn}\(\s*['"\`]${GIT}\b`).test(source),
  )
  if (!spawnsGit) return false
  return !/\bcatch\s*[({]/.test(source)
}

describe('the build guards', () => {
  const files = guardFiles(GUARD_DIR)

  it('there are guards to check', () => {
    // A test that scans nothing proves nothing.
    expect(files.length).toBeGreaterThan(40)
  })

  it('none of them requires git to be present, because Vercel has none', () => {
    const offenders = files
      .filter(f => spawnsGitUnguarded(codeOf(f)))
      .map(f => f.replace(process.cwd(), '').replace(/\\/g, '/'))

    expect(
      offenders,
      'These guards spawn git without catching its failure. Vercel\'s build container is not a ' +
        'git repository, so they will kill `npm run build` there while passing locally and in CI. ' +
        'Use sourceFiles() from scripts/guards/lib/source.mjs for a file list, or catch the failure ' +
        'and degrade the way migration-collision-guard does.',
    ).toEqual([])
  })

  it('no-silent-submit in particular lists its files without git', () => {
    // Named explicitly because this is the one that actually broke, and a
    // regression here is worth a message that says so rather than a generic one.
    const src = codeOf(join(GUARD_DIR, 'no-silent-submit.mjs'))
    expect(src).not.toMatch(/ls-files/)
    expect(src).toContain('sourceFiles')
  })
})
