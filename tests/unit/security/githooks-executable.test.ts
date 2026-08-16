/**
 * THE HOOKS MUST BE EXECUTABLE IN THE INDEX, or Law 8's first defence is absent.
 *
 * WHAT WAS FOUND, 14 August 2026. `.githooks/commit-msg` and `.githooks/pre-push`
 * were both committed with mode `100644`, not `100755`. On Windows this is
 * invisible: `core.fileMode` is effectively off, git does not consult the bit,
 * and both hooks run perfectly. On any POSIX checkout, Linux or macOS or CI, git
 * requires the executable bit to run a hook and SILENTLY SKIPS one that lacks it.
 * No error, no warning, no output at all.
 *
 * The consequence is specific rather than theoretical. `.githooks/commit-msg` is
 * the layer that rejects a `Co-Authored-By` trailer naming an AI before it
 * becomes history, which CLAUDE.md Law 8 names as the only point at which such a
 * rejection is free. `.githooks/pre-push` is the layer that runs the suite
 * before work leaves the machine. On a POSIX clone neither was running, and the
 * failure mode of a hook that is skipped is indistinguishable from a hook that
 * passed.
 *
 * WHY THIS IS A TEST RATHER THAN A NOTE. The mode is a property of the git
 * INDEX, not of the working tree, so it is not visible in a diff of file
 * contents and it survives every review that reads the code. A tool that
 * rewrites a hook can drop the bit without the change appearing anywhere a human
 * looks. Asserting it is the only way it stays true.
 *
 * The index is read rather than the filesystem deliberately: `fs.statSync().mode`
 * on Windows reports 0666 for every file regardless, so a filesystem check would
 * pass vacuously on the machine where the defect was introduced.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'

import { gitEnv } from '../../../scripts/lib/git-env.mjs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')

/** `git ls-files -s .githooks/` -> [{ mode, file }], read from the index. */
function hooksInIndex(): { mode: string; file: string }[] {
  // env: gitEnv() because this test runs inside the pre-push hook, where git
  // exports GIT_DIR and an inheriting child reads the real repository whatever
  // cwd says. See scripts/lib/git-env.mjs.
  const out = execFileSync('git', ['ls-files', '-s', '.githooks/'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: gitEnv(),
  })
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      // "100755 <sha> 0\t.githooks/pre-push"
      const [meta, file] = line.split('\t')
      return { mode: meta!.split(' ')[0]!, file: file! }
    })
}

describe('the git hooks are executable where git actually checks', () => {
  const hooks = hooksInIndex()

  it('finds the hooks in the index at all, so this cannot pass vacuously', () => {
    // A rename or a move would otherwise turn every assertion below into a
    // no-op over an empty list, which is the shape of failure this whole
    // branch exists to stop.
    expect(hooks.length, 'no files found under .githooks/ in the git index').toBeGreaterThanOrEqual(2)
    const names = hooks.map((h) => h.file)
    expect(names).toContain('.githooks/commit-msg')
    expect(names).toContain('.githooks/pre-push')
  })

  it.each(hooksInIndex())('$file is mode 100755, so a POSIX checkout will run it', ({ mode, file }) => {
    expect(
      mode,
      `${file} is committed as ${mode}. git will silently SKIP a hook without the ` +
        'executable bit on Linux and macOS, so this hook does not run there. ' +
        'Fix with:  git update-index --chmod=+x ' + file,
    ).toBe('100755')
  })
})
