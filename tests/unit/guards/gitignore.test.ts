import { describe, expect, test } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  collectIgnoreRules,
  makeGitignoreJudge,
  parseGitignore,
  walkTrackedFiles,
} from '../../../scripts/guards/lib/gitignore.mjs'
import { filesForUpload, listTrackedFiles } from '../../../scripts/guards/lib/vercel-upload.mjs'
import { gitEnv } from '../../../scripts/lib/git-env.mjs'

/**
 * ENUMERATING A TREE WITHOUT GIT. Close-out F2.2.
 *
 * The upload simulation used to start with `git ls-files`, which is 100% right
 * and 0% available on a host with no repository - the fifth lost deployment. A
 * replacement that is 95% right would be far worse than either, because it would
 * silently simulate a tree that does not exist, which is the whole class of
 * defect this work exists to close.
 *
 * So the evaluator is tested against gitignore's actual rules, and then the walk
 * is tested against GIT ITSELF on this repository. That second test is the one
 * that matters: it cannot be satisfied by agreeing with my own assumptions.
 */

function judgeFor(text: string) {
  const { rules, errors } = parseGitignore(text)
  expect(errors).toEqual([])
  return makeGitignoreJudge(rules)
}

describe('the pattern grammar gitignore actually has', () => {
  test('a bare name matches that segment at any depth', () => {
    const judge = judgeFor('node_modules\n')
    expect(judge('node_modules/a.js')).toBe(true)
    expect(judge('packages/x/node_modules/a.js')).toBe(true)
    expect(judge('src/app/page.tsx')).toBe(false)
  })

  test('a pattern with a slash is anchored at the root', () => {
    const judge = judgeFor('build/out\n')
    expect(judge('build/out/a.js')).toBe(true)
    expect(judge('packages/build/out/a.js')).toBe(false)
  })

  test('a star never crosses a slash, which is the rule most often got wrong', () => {
    const judge = judgeFor('docs/*.png\n')
    expect(judge('docs/a.png')).toBe(true)
    expect(judge('docs/nested/a.png')).toBe(false)
  })

  test('a globstar does cross slashes, and may match no segments at all', () => {
    const judge = judgeFor('docs/**/*.png\n')
    expect(judge('docs/a.png')).toBe(true)
    expect(judge('docs/one/two/a.png')).toBe(true)
    expect(judge('other/a.png')).toBe(false)
  })

  test('a trailing slash means directories only', () => {
    const judge = judgeFor('cache/\n')
    expect(judge('cache', true)).toBe(true)
    // A FILE named cache is not the directory the rule excludes.
    expect(judge('cache', false)).toBe(false)
  })

  test('a question mark matches exactly one character inside a segment', () => {
    const judge = judgeFor('log?.txt\n')
    expect(judge('log1.txt')).toBe(true)
    expect(judge('log.txt')).toBe(false)
    expect(judge('log12.txt')).toBe(false)
  })

  test('a character class works, and gitignore spells its negation with !', () => {
    const judge = judgeFor('tmp[0-9].txt\nkeep[!x].md\n')
    expect(judge('tmp7.txt')).toBe(true)
    expect(judge('tmpa.txt')).toBe(false)
    expect(judge('keepy.md')).toBe(true)
    expect(judge('keepx.md')).toBe(false)
  })

  test('a dot in a pattern is a dot, never any character', () => {
    const judge = judgeFor('*.pem\n')
    expect(judge('key.pem')).toBe(true)
    expect(judge('keyXpem')).toBe(false)
  })

  test('the last matching rule wins, so a re-inclusion after an exclusion holds', () => {
    const judge = judgeFor('*.png\n!public/logo.png\n')
    expect(judge('a/b.png')).toBe(true)
    expect(judge('public/logo.png')).toBe(false)
  })

  test('nothing re-includes a file inside an excluded DIRECTORY, the rule that cost four deployments', () => {
    const judge = judgeFor('docs/\n!docs/PRICING.md\n')
    // git itself behaves this way: the directory is never descended into, so the
    // negation never gets a chance to match.
    expect(judge('docs/PRICING.md')).toBe(true)
  })

  test('brace expansion is REFUSED, never guessed at', () => {
    const { rules, errors } = parseGitignore('src/{a,b}/x.ts\n')
    expect(rules).toHaveLength(0)
    expect(errors[0]).toContain('brace expansion')
  })

  test('comments and blank lines are not patterns', () => {
    const { rules } = parseGitignore('# a comment\n\n   \nreal\n')
    expect(rules.map((r) => r.raw)).toEqual(['real'])
  })
})

describe('a nested ignore file is relative to its own directory', () => {
  test('and does not reach outside it', () => {
    const root = mkdtempSync(join(tmpdir(), 'nested-ignore-'))
    for (const rel of ['keep.log', 'sub/drop.log', 'sub/keep.txt']) {
      const abs = join(root, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, 'x')
    }
    writeFileSync(join(root, 'sub', '.gitignore'), '*.log\n')

    const { rules, files } = collectIgnoreRules(root)
    expect(files).toContain('sub/.gitignore')
    const judge = makeGitignoreJudge(rules)
    expect(judge('sub/drop.log')).toBe(true)
    // The same name at the root is untouched: sub/.gitignore governs sub/ only.
    expect(judge('keep.log')).toBe(false)
    expect(judge('sub/keep.txt')).toBe(false)
  })
})

/**
 * THE TEST THAT CANNOT BE SATISFIED BY AGREEING WITH ITSELF.
 *
 * Everything above asserts the evaluator matches what I believe gitignore does.
 * This one asks git.
 */
describe('the walk, against git itself, on this repository', () => {
  const root = process.cwd()
  const walked = new Set(walkTrackedFiles(root))
  const tracked = listTrackedFiles(root)

  test('every file git tracks that the walk drops is force-added, confirmed by asking git', () => {
    /*
     * ASKING GIT, NOT MYSELF. `git check-ignore -q` exits 0 when a path IS
     * ignored and 1 when it is not, so a path git tracks AND would ignore is
     * force-added: `git add -f` overriding the rules, a fact that lives only in
     * the index and that no evaluator can recover.
     *
     * The first version of this test let execFileSync throw on exit 1 and so
     * never reached its assertion. Fixing it found a real bug: `.claude/*` was
     * matching four levels deep, so six tracked skill files were being dropped
     * by the walk and were NOT force-added at all.
     */
    /*
     * ONE GIT PROCESS, NOT ONE PER PATH, AND A SPAWN FAILURE IS NOT A VERDICT.
     *
     * Found on 10 September 2026. The suite went red inside the pre-push gate,
     * naming this test, and green three times standalone on the same tree. It was
     * never a flake: this test spawned `git check-ignore` once per dropped path
     * and took 16.2 seconds ON ITS OWN. Inside a 352-file run on a machine
     * throttled to 57% (it was on battery), it simply ran out of test timeout,
     * and vitest reports a timeout as an error at the test's declaration line
     * with no assertion in it, which is why two passes went looking for a missing
     * force-add that was never missing.
     *
     * `--stdin` takes every path in one call and PRINTS the ones that are
     * ignored, so the per-path resolution is unchanged and the process count
     * drops from N to 1. `-z` on both sides, because a repository path may
     * contain anything a filename may contain.
     *
     * The spawn is also separated from the verdict: `spawnSync` reports a process
     * that could not be STARTED as `status: null`, and reading that as "git says
     * not ignored" would be the opposite of what happened.
     */
    const droppedByWalk = tracked.filter((f) => !walked.has(f))
    const ask = spawnSync('git', ['check-ignore', '--stdin', '-z', '--no-index'], {
      cwd: root,
      encoding: 'utf8',
      env: gitEnv(),
      input: droppedByWalk.join('\0'),
      maxBuffer: 64 * 1024 * 1024,
    })
    // Exit 0 means at least one path is ignored, 1 means none are; anything else
    // (or a null status) is git failing to answer, which is not a verdict.
    expect(
      ask.error ? `${ask.error.message}` : ask.status === 0 || ask.status === 1 ? null : `git exited ${ask.status}: ${ask.stderr}`,
      'git check-ignore could not be run, so nothing here is a verdict about the tree',
    ).toBeNull()
    const ignored = new Set((ask.stdout ?? '').split('\0').filter(Boolean))
    const notForceAdded = droppedByWalk.filter((f) => !ignored.has(f))
    expect(notForceAdded).toEqual([])
    // and there really are some, so this test is not passing on an empty set
    expect(droppedByWalk.length).toBeGreaterThan(0)
  })

  test('the walk never invents a file git would not have', () => {
    // The only paths the walk may hold that git does not are files not yet
    // committed. Everything else would be the evaluator failing to exclude.
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
      cwd: root,
      encoding: 'utf8',
      env: gitEnv(),
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean)
    const untrackedSet = new Set(untracked)
    /*
     * A PATH THAT IS GONE BY NOW WAS NEVER INVENTED. On 12 September 2026 this
     * failed once inside the push gate as "expected [ Array(1) ] to deeply equal
     * []" and passed on the next three runs of the same tree. The walk is taken
     * when this file loads and git is asked here, seconds later, in a suite
     * whose other workers create and remove files inside this repository as
     * they run; a file that existed for the walk and not for git is a race,
     * not an evaluator that lets a path through. So a path is held against the
     * evaluator only if it is still on disk, and the message names it.
     */
    const invented = [...walked]
      .filter((f) => !tracked.includes(f) && !untrackedSet.has(f))
      .filter((f) => existsSync(join(root, f)))
    expect(
      invented,
      `the walk holds ${invented.length} path(s) git has neither tracked nor listed as untracked: ${invented.join(', ')}`,
    ).toEqual([])
  })
})

describe('filesForUpload', () => {
  const root = process.cwd()

  test('is the index where the index can be read, so force-added files are not lost', () => {
    const r = filesForUpload(root)
    expect(r.source).toContain('corrected by the git index')
    expect(r.files.length).toBe(listTrackedFiles(root).length)
  })

  test('reports how far the walk and the index disagreed rather than folding it away', () => {
    const r = filesForUpload(root)
    // This repository force-adds the skill files, the Lighthouse baselines and
    // sixteen rasters under public/. If that ever reaches zero the walk has
    // become exact, which is worth noticing rather than assuming.
    expect(r.addedByIndex.length).toBeGreaterThan(0)
    expect(Array.isArray(r.droppedAsUntracked)).toBe(true)
  })

  test('falls back to the walk alone in a tree with no usable git, and says so', () => {
    // The Vercel shape: a .git that exists and is empty, which is what killed the
    // preview build of ffded236.
    const fake = mkdtempSync(join(tmpdir(), 'no-usable-git-'))
    mkdirSync(join(fake, '.git', 'objects'), { recursive: true })
    mkdirSync(join(fake, 'src'), { recursive: true })
    writeFileSync(join(fake, 'src', 'a.ts'), 'x')
    writeFileSync(join(fake, '.gitignore'), 'ignored.txt\n')
    writeFileSync(join(fake, 'ignored.txt'), 'x')

    const r = filesForUpload(fake)
    // The source NAMES the shape (close-out F2.4): `emptied` is the Vercel host,
    // which is a different fact from `absent`, and conflating the two is what
    // killed the ffded236 deployment.
    expect(r.source).toContain('emptied .git')
    expect(r.files).toContain('src/a.ts')
    expect(r.files).not.toContain('ignored.txt')
    // and it never claims a correction it could not have made
    expect(r.addedByIndex).toEqual([])
  })
})
