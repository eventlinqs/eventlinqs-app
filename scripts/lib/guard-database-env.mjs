/**
 * THE GUARDS NEED A DATABASE TO LOOK AT (the guard audit of 14 November 2026,
 * C:\dev\START-16OCT\GUARD-AUDIT-14NOV.md, Lawal's 02:37: the guards must help, not block). In the week before it,
 * eighteen guard stops were six database guards each failing 'no Supabase URL or key in the environment ... could not
 * look' on runs that had no database environment: one missing env file read as six faults. Each of those guards is
 * right to fail rather than pass when it cannot look; what was wrong was learning it six times, at the end of a long
 * run. So the push gate's guard step asks first, through this, and says it once.
 *
 * A module of its own, read only, for the reason scripts/guards/lib keeps its detectors apart: the push gate is a
 * script that runs things, and naming the service-role key in it made no-unguarded-production-write read the gate as
 * a write-capable script (its checks of 14 November). This file only reads whether variables are set.
 */
const set = (v) => typeof v === 'string' && v.trim().length > 0

/**
 * @param {Record<string, string | undefined>} env the step's environment, .env.local already merged
 * @returns {string | null} why the guards cannot look, or null when they can
 */
export function missingGuardDatabase(env) {
  const url = set(env.NEXT_PUBLIC_SUPABASE_URL)
  const key = set(env.SUPABASE_SERVICE_ROLE_KEY) || set(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  if (url && key) return null
  const lacking = [url ? null : 'NEXT_PUBLIC_SUPABASE_URL', key ? null : 'SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY']
    .filter(Boolean)
    .join(' and ')
  return (
    `the guards would run with no database (${lacking} not set, and no .env.local in this tree carries them), so every ` +
    'guard that reads the database would fail with "could not look". Run the gate with --env-file pointing at an ' +
    '.env.local for the TEST project, or put one in this tree, then run it again. Nothing was judged.'
  )
}
