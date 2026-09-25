/**
 * ONE DOOR FOR A BUILD GUARD'S NETWORK READ OF THE DATABASE.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS. Two separate incidents on 13 September 2026, four hours
 * apart, on a laptop carrying three build lanes.
 *
 *   FIRST. `curated-categories-exist` blocked the build with "could not read
 *   event_categories: TypeError: fetch failed". Run by hand thirty seconds
 *   later against the same TEST project it read all 22 rows and passed. It
 *   read the database exactly ONCE, so it could not tell a down database from
 *   a dropped packet. It was given a retry, and the survey that went with it
 *   asked "which guards call createClient" - which found exactly one, and was
 *   the wrong question.
 *
 *   SECOND, the same evening, on the very next push: `event-lifecycle-installed`
 *   and `community-layer-protected` failed together, both with `fetch failed`,
 *   both reaching the database by a RAW fetch rather than through the client.
 *   The narrow fix had not touched them.
 *
 * So the rule is now a shared door rather than a habit, and the survey that
 * matters is "what reads the database over a network", never "what imports a
 * particular library".
 *
 * ---------------------------------------------------------------------------
 * THE DISTINCTION THIS EXISTS TO DRAW, and it is the important half.
 *
 * A network read can fail in two ways that look identical in a `catch` and
 * mean opposite things:
 *
 *   TRANSPORT   the request never got an answer. DNS, a socket, a timeout.
 *               This says NOTHING about the database's contents. It is worth
 *               retrying, and it must never be described as a finding.
 *
 *   ANSWERED    the server replied, and the reply was a refusal or was not
 *               what was asked for. This IS information. Retrying it just
 *               asks a question that has already been answered.
 *
 * Conflating them is not a style point; it produced an actively false
 * instruction. `event-lifecycle-installed` printed
 *
 *     event_lifecycle_guards() could not be asked (fetch failed);
 *     apply 20260906000001_... and 20260906000002_... to this project
 *
 * on a project where BOTH migrations were long since applied. A reader who
 * trusted it would have gone looking at migrations for an hour. A guard that
 * cannot say whether it failed to look or looked and disliked what it saw is
 * worse than no guard, because it is confidently wrong.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES NOT DO. It does not decide whether an unreachable database is
 * a PASS or a FAIL. That is each guard's own call and they differ legitimately:
 * `curated-categories-exist` fails, because a build that cannot see the
 * taxonomy cannot know whether the homepage is about to drop a tile. This
 * module's job is to make the two cases distinguishable and to stop a single
 * dropped packet deciding anything.
 */

/**
 * The shape every function here hands back. Written as JSDoc rather than left
 * to inference because the consumers are .ts tests and future guards, and an
 * inferred union collapses `value` and `status` away the moment a branch is
 * added: the typecheck step refused this file's own test for exactly that.
 *
 * @typedef {object} ReadOutcome
 * @property {boolean} ok           true when the read succeeded
 * @property {any} [value]          the parsed body, when ok
 * @property {string} [kind]        'transport' | 'answered' | 'unparseable', when not ok
 * @property {string} [detail]      what went wrong, in words
 * @property {number} [status]      the HTTP status, when the server answered
 * @property {number} [attempts]    how many times it was asked
 * @property {number} [ms]          how long the asking took
 */

/** Attempts, and the pause before each RETRY. The first try is never delayed. */
export const ATTEMPTS = 3
export const BACKOFF_MS = [0, 1500, 4000]

const message = (e) => (e instanceof Error ? e.message : String(e))

/**
 * Run `attempt` until it returns a non-transport outcome, or the attempts run
 * out. `attempt` must resolve to one of:
 *
 *   { ok: true, value }                 read it
 *   { ok: false, kind: 'transport', detail }   never got an answer, retry me
 *   { ok: false, kind: <anything else>, detail } the server answered, do not retry
 *
 * Returns the last outcome, with `attempts` and `ms` added so a refusal can
 * say how hard it tried rather than implying one glance.
 *
 * @param {(attempt: number) => Promise<ReadOutcome>} attempt
 * @param {{ attempts?: number, backoff?: number[], onRetry?: (n: number, detail: string) => void }} [opts]
 * @returns {Promise<ReadOutcome>}
 */
export async function retryTransport(attempt, { attempts = ATTEMPTS, backoff = BACKOFF_MS, onRetry } = {}) {
  const startedAt = Date.now()
  let last = { ok: false, kind: 'transport', detail: 'not attempted' }
  for (let i = 0; i < attempts; i++) {
    // The FIRST attempt is always immediate. Gating on `i > 0` rather than on
    // `backoff[0] > 0` means a caller cannot accidentally delay the first try
    // by passing a non-zero first element; the pause belongs before a RETRY.
    if (i > 0 && backoff[i] > 0) await new Promise((r) => setTimeout(r, backoff[i]))
    last = await attempt(i + 1)
    if (last.ok || last.kind !== 'transport') {
      return { ...last, attempts: i + 1, ms: Date.now() - startedAt }
    }
    if (i < attempts - 1 && onRetry) onRetry(i + 1, last.detail)
  }
  return { ...last, attempts, ms: Date.now() - startedAt }
}

/**
 * GET a PostgREST URL and parse JSON, classifying the failure.
 *
 * A GET, never a POST: PostgREST serves a STABLE function on GET, and these
 * guards carry an admin credential, so they must hold no write verb at all.
 * That rule predates this module and is preserved by it.
 *
 * @param {string} target
 * @param {{ key?: string, fetchImpl?: any }} [opts]
 * @returns {Promise<ReadOutcome>}
 */
export async function getJson(target, { key, fetchImpl = fetch } = {}) {
  return retryTransport(async () => {
    let res
    try {
      res = await fetchImpl(target, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
      })
    } catch (e) {
      // Nothing answered. Says nothing about the data.
      return { ok: false, kind: 'transport', detail: message(e) }
    }
    let text
    try {
      text = await res.text()
    } catch (e) {
      // The body died mid-read: still a transport problem, not an answer.
      return { ok: false, kind: 'transport', detail: `body not readable: ${message(e)}` }
    }
    if (!res.ok) return { ok: false, kind: 'answered', status: res.status, detail: `HTTP ${res.status} ${text.slice(0, 160)}` }
    try {
      return { ok: true, value: JSON.parse(text) }
    } catch {
      return { ok: false, kind: 'unparseable', detail: `unparseable answer ${text.slice(0, 80)}` }
    }
  })
}

/**
 * `${url}/rest/v1/rpc/${rpc}`, read only, with the classification above.
 * @param {{ url: string, key?: string, rpc: string, fetchImpl?: any }} opts
 * @returns {Promise<ReadOutcome>}
 */
export function callRpc({ url, key, rpc, fetchImpl = fetch }) {
  return getJson(`${String(url).replace(/\/$/, '')}/rest/v1/rpc/${rpc}`, { key, fetchImpl })
}

/**
 * `${url}/rest/v1/${query}`, read only, with the classification above.
 * @param {{ url: string, key?: string, query: string, fetchImpl?: any }} opts
 * @returns {Promise<ReadOutcome>}
 */
export function selectRest({ url, key, query, fetchImpl = fetch }) {
  return getJson(`${String(url).replace(/\/$/, '')}/rest/v1/${query}`, { key, fetchImpl })
}

/**
 * The sentence a guard prints when it could not look. Shared so that every
 * guard says the same true thing, and so none of them can accidentally
 * prescribe a migration for a dropped packet again.
 *
 * @param {string} what
 * @param {{ detail?: string, attempts?: number, ms?: number }} outcome
 * @returns {string}
 */
export function couldNotLook(what, outcome) {
  return (
    `could not reach the database to read ${what}: ${outcome.detail} ` +
    `(${outcome.attempts} attempt(s) over ${(outcome.ms / 1000).toFixed(1)}s). ` +
    `This is a transport failure and says NOTHING about what the database contains: ` +
    `do not read it as a missing migration or a missing row.`
  )
}
