/**
 * WHICH MACHINE IS THIS BUILD RUNNING ON, decided once and named out loud.
 *
 * Close-out F1.3. On 8 September 2026 `scripts/check-public-env.mjs` printed
 *
 *     [public-env] WARNING (not blocking - local build): 4 critical public var(s)
 *
 * while running inside GitHub Actions, on a hosted runner, in a job whose whole
 * purpose is to refuse a commit Vercel would refuse. It called itself a local
 * build because its only test was "is VERCEL set", and everything that is not
 * Vercel was a developer's laptop.
 *
 * That is a two-way classification of a three-way world, and the middle case is
 * the one that matters: a CI runner is not a laptop. A laptop may be a fresh
 * clone with no environment at all, and blocking it would stop somebody building
 * the project for the first time. A CI runner is configured by the repository
 * and has no excuse; anything it would block on in production, it blocks on
 * here.
 *
 * THE DECISION IS NAMED, NEVER INFERRED SILENTLY. Every caller prints the scope
 * AND the variable that decided it, because the previous version's mistake was
 * invisible precisely because it never said what it had concluded.
 *
 *   vercel   VERCEL or VERCEL_ENV is set. Vercel publishes `VERCEL=1` as
 *            "available at both build and runtime" and VERCEL_ENV as the
 *            deployment environment
 *            (https://vercel.com/docs/environment-variables/system-environment-variables,
 *            fetched 2026-09-09).
 *   ci       GITHUB_ACTIONS, or the CI convention every hosted runner sets.
 *            GitHub publishes GITHUB_ACTIONS as "always set to true when GitHub
 *            Actions is running the workflow" and CI as "always set to true"
 *            (https://docs.github.com/en/actions/reference/variables-reference,
 *            fetched 2026-09-09).
 *   local    everything else: a developer machine, which may legitimately be a
 *            fresh clone with nothing configured.
 *
 * VERCEL IS CHECKED FIRST AND DELIBERATELY. The same Vercel page publishes
 * `CI=1`, "available at build time", so testing CI first would classify every
 * deployment as a CI runner and lose the scope that carries the real project.
 *
 * WHAT THIS CANNOT SEE, said rather than assumed: both Vercel variables are
 * documented under "Enable system environment variables", a project setting. If
 * that setting were ever turned off, a Vercel build would fall through to the
 * `local` verdict and WARN where it used to BLOCK. That is the behaviour the
 * platform had before this module existed, so it is a loss of new strictness
 * rather than a regression, and every caller prints the scope it decided on, so
 * the fall-through is visible in the build log rather than silent.
 */

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ scope: 'vercel' | 'ci' | 'local', by: string, blocks: boolean }}
 *   `by` names the variable that decided it, so the verdict can be argued with.
 *   `blocks` is true where a configured machine has no excuse for a bad value.
 */
export function resolveBuildScope(env) {
  if (env.VERCEL || env.VERCEL_ENV) {
    return { scope: 'vercel', by: env.VERCEL ? 'VERCEL' : 'VERCEL_ENV', blocks: true }
  }
  if (env.GITHUB_ACTIONS) return { scope: 'ci', by: 'GITHUB_ACTIONS', blocks: true }
  if (env.CI) return { scope: 'ci', by: 'CI', blocks: true }
  return { scope: 'local', by: 'no VERCEL, VERCEL_ENV, GITHUB_ACTIONS or CI in the environment', blocks: false }
}

/** The one sentence every caller prints, so the verdict is never left implicit. */
export function describeBuildScope(env) {
  const { scope, by, blocks } = resolveBuildScope(env)
  return (
    `scope=${scope} (decided by ${by}); ` +
    (blocks
      ? 'a configured machine, so a failure here BLOCKS'
      : 'a developer machine, which may be a fresh clone, so a failure here WARNS')
  )
}
