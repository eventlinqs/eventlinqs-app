/**
 * READING PRODUCTION WITHOUT HOLDING A CREDENTIAL THAT COULD WRITE IT.
 *
 * WHY THIS IS A MODULE RATHER THAN A FUNCTION IN EACH SCRIPT. Two scripts now
 * read production's own rows to establish what a surface should be showing, and
 * both must be incapable of writing rather than merely careful. The route is the
 * Supabase Management API query endpoint with the CLI access token, behind a
 * SELECT-only assertion, which is what `scripts/verify/published-url-graveyard.mjs`
 * and `scripts/verify/d1-production-dry-run.mjs` already used. A second copy of
 * that assertion is a second chance to get it wrong, so there is one.
 *
 * WHAT IT CANNOT DO, structurally rather than by promise: there is no insert,
 * update, upsert, delete or rpc on anything this module returns, and `select` is
 * the only statement it will send. A process using it never holds a production
 * service-role key.
 *
 * The token comes from the Credential Manager helper, never from a file:
 *   powershell -File scripts/ops/with-supabase-token.ps1 node <script>
 */

/** The production project ref. Named once, here, so no caller types it. */
export const PRODUCTION_REF = 'gndnldyfudbytbboxesk'

/** A SQL string literal with quotes doubled, the only escaping this needs. */
export const lit = (v) => `'${String(v).replace(/'/g, "''")}'`

/**
 * A SELECT-only reader against a project, through the Management API.
 *
 * @param {string} token the Supabase CLI access token
 * @param {string} ref the project ref, defaulting to production
 * @returns {(sql: string) => Promise<unknown[]>}
 */
export function productionSelect(token, ref = PRODUCTION_REF) {
  if (!token) throw new Error('no SUPABASE_ACCESS_TOKEN, so nothing can be read')
  return async function select(sql) {
    if (!/^\s*select/i.test(sql)) throw new Error(`this reader is SELECT-only and was handed: ${sql.slice(0, 40)}`)
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return res.json()
  }
}
