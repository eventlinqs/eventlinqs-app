/**
 * SCHEMA PROBE: does a named table or column exist on the project a set of
 * credentials points at?
 *
 * READ ONLY. One HTTP GET per object, with `limit=0`, so no row is ever fetched,
 * and the only things a caller ever prints are a verdict, a status code and a
 * PostgREST error code. Neither the key nor a row is available to print.
 *
 * WHAT POSTGREST ANSWERS, verified against the TEST project on 4 September 2026
 * with both the service role and the anon key
 * (C:\dev\EVIDENCE\A2\schema-probe-calibration.txt), not taken from memory:
 *
 *   200                the column exists and this key may read it     PRESENT
 *   400 + 42703        the table exists and the column does not       ABSENT
 *   404 + PGRST205     the table is not in the schema cache           ABSENT
 *   401 + 42501        the object exists and this key may not read it PRESENT
 *
 * The last line matters: a table with no anon grant (event_stream_links) answers
 * "permission denied" to the anon key, which is proof the table is there. Any
 * other answer is "could not look" and is reported as UNKNOWN, never as absent,
 * because a guard that turns an outage into "the column is missing" would send
 * the founder to apply a migration that has already landed.
 */

/** @typedef {{ state: 'present' | 'absent' | 'unknown', status: number, code: string, message: string }} ProbeResult */

/**
 * Turn a PostgREST status and error code into a verdict.
 * @param {number} status
 * @param {string} code
 * @returns {'present' | 'absent' | 'unknown'}
 */
export function interpretProbe(status, code) {
  if (status === 200 || status === 206) return 'present'
  if (status === 400 && code === '42703') return 'absent'
  if (status === 404 && code === 'PGRST205') return 'absent'
  if ((status === 401 || status === 403) && code === '42501') return 'present'
  return 'unknown'
}

/**
 * @param {{ url: string, key: string, table: string, column: string, fetchImpl?: typeof fetch }} input
 * @returns {Promise<ProbeResult>}
 */
export async function probeSchemaObject({ url, key, table, column, fetchImpl = fetch }) {
  const base = url.replace(/\/+$/, '')
  const target = `${base}/rest/v1/${encodeURIComponent(table)}?select=${encodeURIComponent(column)}&limit=0`
  let response
  try {
    response = await fetchImpl(target, {
      method: 'GET',
      headers: { apikey: key, authorization: `Bearer ${key}` },
    })
  } catch (err) {
    return {
      state: 'unknown',
      status: 0,
      code: 'FETCH_FAILED',
      message: err instanceof Error ? err.message : String(err),
    }
  }
  let code = ''
  let message = ''
  if (response.status !== 200 && response.status !== 206) {
    let text = ''
    try {
      text = await response.text()
    } catch (err) {
      // The body is only read to name the error; an unreadable body is itself
      // the message, so the verdict below still lands as UNKNOWN with a reason.
      text = `unreadable body: ${err instanceof Error ? err.message : String(err)}`
    }
    try {
      const parsed = JSON.parse(text)
      code = typeof parsed?.code === 'string' ? parsed.code : ''
      message = typeof parsed?.message === 'string' ? parsed.message : ''
    } catch {
      // Not JSON: PostgREST always answers JSON, so a non-JSON body is a proxy or
      // an outage page. The first line is kept as the message so the reason is
      // visible in the verdict, which is the recording this catch performs.
      message = text.split('\n')[0]?.slice(0, 120) ?? ''
    }
  }
  return { state: interpretProbe(response.status, code), status: response.status, code, message }
}

/** The project ref in a Supabase URL, for printing. Never the key. */
export function projectRefOf(url) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec((url ?? '').trim())
  return m ? m[1] : null
}
