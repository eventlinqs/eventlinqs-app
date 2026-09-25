/**
 * THE CREDENTIAL A GUARD NEEDS TO READ A TABLE ANON IS NOT GRANTED.
 *
 * Pull request 159, 25 September 2026. `no-published-lane-b-fixture-on-test`
 * blocked the CI build with
 *
 *     could not reach the database to read organisations?slug=like.lane-b-*...:
 *     HTTP 401 {"code":"42501", ... "GRANT SELECT ON public.organisations TO anon"}
 *
 * The CI build carries CI_SUPABASE_URL and CI_SUPABASE_ANON_KEY and nothing
 * else (.github/workflows/ci.yml), and the manifest records the service-role key
 * as `githubActions: false`. The anon role is not granted public.organisations
 * on TEST, and granting it is the wrong fix. So that host can never answer the
 * question, and the guard reported a refusal it could never avoid as a finding.
 *
 * WHY A MODULE RATHER THAN A LINE IN THE GUARD. Importing this IS a token
 * dependence in scripts/guards/lib/build-host.mjs, exactly as importing
 * scripts/lib/vercel-login.mjs is, so a guard that reaches for it must declare
 * `token` in build-host-needs.mjs and build-host-needs-declared.mjs holds that
 * declaration to the code in both directions. A bare read of the key could not
 * be told apart from the twelve other guards that read it with a fallback.
 *
 * It returns the key or says why there is none. It never falls back to the anon
 * key: a fallback that cannot read the table is how the 401 above happened.
 */

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ key: string, source: string } | { key: null, reason: string }}
 */
export function tableReadCredential(env = process.env) {
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (key) return { key, source: 'SUPABASE_SERVICE_ROLE_KEY' }
  return {
    key: null,
    reason:
      'this host carries no SUPABASE_SERVICE_ROLE_KEY, and the anon key it may carry is not granted the table ' +
      '(the CI build is given the anon key only, by design)',
  }
}
