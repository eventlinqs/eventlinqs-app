/**
 * GIT SUBPROCESS ENVIRONMENT - the one place inherited GIT_ variables are cleared.
 *
 * WHY THIS EXISTS. A git hook runs with GIT_DIR exported by git, pointing at the
 * real repository, and usually GIT_INDEX_FILE and GIT_PREFIX with it. Any child
 * process that shells out to `git` inherits them, and from that moment the child's
 * `cwd` option is decorative for the purpose of choosing a repository: the command
 * operates on the repository GIT_DIR names, not on the directory it was pointed at.
 *
 * That is not a hypothetical. On 15 August 2026 a test drill built a fixture
 * repository in a temp directory, ran `git init` there during the pre-push hook,
 * and set `core.bare=true` on the SHARED worktree config, which broke
 * `git status` with "this operation must be run in a work tree" in all nine
 * worktrees at once. The same run wrote `user.name=drill` into that config, and
 * two commits went to the remote authored by a test fixture. Nothing was lost
 * only because the failing `git init` also stopped the `git add .` that would
 * have staged temp files into the real index.
 *
 * THE FAILURE IS INVISIBLE OUTSIDE A HOOK. In an ordinary shell GIT_DIR is not
 * set, so every one of these call sites behaves correctly and every test passes.
 * The suite is run BY the pre-push hook, which is the one context where the
 * variables are present, and it is the context nobody develops in.
 *
 * WHAT IS CLEARED, and why it is all of them rather than a list. Git documents a
 * large family of GIT_ variables that redirect where and how a command operates
 * (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY,
 * GIT_ALTERNATE_OBJECT_DIRECTORIES, GIT_CEILING_DIRECTORIES, GIT_CONFIG,
 * GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM, GIT_CONFIG_COUNT, GIT_NAMESPACE,
 * GIT_COMMON_DIR and more), and the set grows between versions. Enumerating the
 * dangerous ones means the list is wrong the next time git adds one, so the rule
 * is the prefix: nothing beginning GIT_ is passed through. A caller that genuinely
 * needs one passes it back explicitly, which is visible in review.
 *
 * USAGE. Every spawn of `git` in this repository passes this as its env:
 *
 *   import { gitEnv } from '../lib/git-env.mjs'
 *   spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8', env: gitEnv() })
 *
 * ENFORCEMENT. scripts/guards/no-inherited-git-env.mjs is registered in
 * run-guards.mjs and fails the build when a git spawn does not carry a cleared
 * environment. Its drill runs INSIDE a hook, because a clean shell cannot
 * reproduce the failure.
 */

/** Every environment variable name this module refuses to pass to a git child. */
export const GIT_ENV_PREFIX = 'GIT_'

/**
 * The current environment with every GIT_ variable removed.
 *
 * Built by DELETION from a copy of process.env rather than by construction of a
 * fresh object. Two reasons, both learned the hard way: a freshly built
 * Record<string, string> is not assignable to NodeJS.ProcessEnv under this
 * project's TypeScript config, which types NODE_ENV as required; and copying
 * keeps PATH, SystemRoot and the rest, without which git does not run at all on
 * Windows.
 *
 * @param {Record<string, string>} [extra] variables to set on top, including any
 *   GIT_ variable the caller genuinely means to pass. Applied last, so it wins.
 * @returns {NodeJS.ProcessEnv}
 */
export function gitEnv(extra = {}) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith(GIT_ENV_PREFIX)) delete env[key]
  }
  return { ...env, ...extra }
}

/**
 * True when this process is running inside a git hook.
 *
 * Useful for a script that wants to say so in its output rather than behave
 * differently. Behaviour should NOT branch on this: the environment is cleared
 * unconditionally, because a script that is safe only when it remembers to check
 * is a script that is unsafe.
 */
export function insideGitHook() {
  return typeof process.env.GIT_DIR === 'string' && process.env.GIT_DIR.length > 0
}

export default gitEnv
