import { describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  describeNoGit,
  gitAvailability,
  gitShape,
  noGitLine,
} from '../../../scripts/guards/lib/git-availability.mjs'
import { DECLARED } from '../../../scripts/guards/lib/build-host-needs.mjs'
import { importClosure } from '../../../scripts/guards/lib/build-time-scripts.mjs'

/**
 * EVERY GIT READER SAYS THE SAME SENTENCE. Close-out F2.4.
 *
 * The Vercel build log of ffded236 carries five different phrasings of one fact,
 * two of them wrong in a way that sends the reader somewhere useless ("no origin
 * remote could be read", on a host with no repository) and one stating a
 * mechanism that is the opposite of the truth that killed that build ("a source
 * tarball with no .git", when the host has a .git and it is empty).
 */

/** Build each of the four shapes on disk rather than describing them. */
function tree(kind: 'checkout' | 'worktree' | 'emptied' | 'absent') {
  const root = mkdtempSync(join(tmpdir(), `git-shape-${kind}-`))
  if (kind === 'checkout') {
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  } else if (kind === 'worktree') {
    writeFileSync(join(root, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n')
  } else if (kind === 'emptied') {
    // What Vercel leaves: the directory tree, with every matched FILE removed.
    mkdirSync(join(root, '.git', 'objects', 'pack'), { recursive: true })
    mkdirSync(join(root, '.git', 'refs', 'heads'), { recursive: true })
  }
  return root
}

describe('the four shapes .git actually takes', () => {
  test('a directory holding HEAD is an ordinary checkout, and git works', () => {
    expect(gitShape(tree('checkout'))).toBe('checkout')
    expect(gitAvailability(tree('checkout')).usable).toBe(true)
  })

  test('a .git FILE is a linked worktree, and this repository has nine of them', () => {
    expect(gitShape(tree('worktree'))).toBe('worktree')
    expect(gitAvailability(tree('worktree')).usable).toBe(true)
  })

  test('a directory with NO HEAD is the Vercel shape, and git does not work there', () => {
    // The one that has to be named out loud: every reasonable person's first
    // test is existsSync('.git'), and on that host it says yes. A guard that
    // believed it called git, threw, and killed the preview build of ffded236.
    const root = tree('emptied')
    expect(gitShape(root)).toBe('emptied')
    expect(gitAvailability(root).usable).toBe(false)
  })

  test('no .git at all is absent, and is a different fact from emptied', () => {
    expect(gitShape(tree('absent'))).toBe('absent')
    expect(gitAvailability(tree('absent')).usable).toBe(false)
  })

  test('this repository, whatever shape the checkout is, can use git', () => {
    expect(gitAvailability(process.cwd()).usable).toBe(true)
  })
})

describe('the sentence', () => {
  test('names the shape, so the emptied case is not read as an absent one', () => {
    const emptied = describeNoGit({ root: tree('emptied'), wanted: 'the branch' })
    expect(emptied).toContain('NO GIT REPOSITORY')
    expect(emptied).toContain('holds no HEAD')
    expect(emptied).toContain('Vercel build host shape')

    const absent = describeNoGit({ root: tree('absent'), wanted: 'the branch' })
    expect(absent).toContain('there is no .git here at all')
    expect(absent).not.toContain('holds no HEAD')
  })

  test('says what is NOT JUDGED, rather than that something went wrong', () => {
    // "no origin remote could be read" describes a failure to fetch. The fact is
    // that a question was not asked, and the difference is the reader's next step.
    const line = describeNoGit({ root: tree('emptied'), wanted: 'the open pull requests' })
    expect(line).toContain('the open pull requests is therefore NOT JUDGED here')
    expect(line).toContain('rather than judged and found absent')
  })

  test('noGitLine carries the tag, so which script it was is never lost', () => {
    const line = noGitLine('[branch-protection-required]', 'the repository name', tree('emptied'))
    expect(line.startsWith('[branch-protection-required] NO GIT REPOSITORY:')).toBe(true)
  })
})

describe('every git reader in this repository reaches the one sentence', () => {
  /*
   * The guard enforces this on every build; this pins it in the suite as well,
   * because the two of them fail for different reasons and a guard nobody has
   * run today is not evidence.
   */
  const gitReaders = Object.entries(DECLARED)
    .filter(([, needs]) => needs.git)
    .map(([entry]) => entry)

  test('there are seven of them, and the count is the answer F2.4 asks for', () => {
    expect(gitReaders).toHaveLength(7)
  })

  test.each(gitReaders)('%s reaches lib/git-availability.mjs', (entry) => {
    expect(importClosure(process.cwd(), [entry])).toContain('scripts/guards/lib/git-availability.mjs')
  })
})
