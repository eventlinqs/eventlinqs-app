/**
 * HOW MANY TIMES DID ONE PAGE VIEW ASK THE DATABASE THE SAME QUESTION?
 *
 * A Node preload (`--import`) for a production server under a drive, modelled
 * exactly on `scripts/verify/lib/blink-fetch-preload.mjs` and for the same
 * reason: the Supabase URL is inlined into the server bundle at build time, so
 * nothing about the environment can put an observer between the server and the
 * database. What CAN be reached is the global fetch. Every Supabase client on
 * this platform goes through `undedupedFetch`, which resolves `fetch` from the
 * global AT CALL TIME (src/lib/supabase/undeduped-fetch.ts), so wrapping
 * `globalThis.fetch` before the server starts sees every read it makes with the
 * real database on the other side.
 *
 * WHY A COUNT AND NOT A TIMING. C8B.1 says measure before optimising, and the
 * honest measure of "this route reads the same row three times" is the number
 * three, not a millisecond figure that moves with the machine, the pool and the
 * other two build lanes. A count is exactly true or exactly false and it does
 * not need a threshold. The timings are taken beside it and reported, but the
 * clause that passes or fails is the count.
 *
 * WHAT IT RECORDS. One JSON line per PostgREST call: the epoch millisecond, the
 * method, the table, and the `select` and the filters as sent. The drive brackets
 * a single page view between two timestamps and counts the lines inside it, which
 * is exact because the drive makes one request at a time.
 *
 * AN RPC'S ARGUMENTS ARE IN ITS BODY, NOT IN ITS QUERY STRING, AND THE FIRST
 * VERSION OF THIS FILE DID NOT RECORD THEM. The measurement it produced on
 * 21 September 2026 reported `rpc/get_current_tier_price` called twice on
 * /events/cat-indie-sounds-live-at-the-enmore-sydney as a DUPLICATE QUESTION.
 * It is not one: the event has several tiers and each call prices a different
 * one, so the two calls are two questions that happen to share a URL. A drive
 * that reports a duplicate that is not one accuses the product of a defect it
 * does not have, which is the most expensive kind of finding because it is
 * investigated before it is recognised. So a POST body is part of the question.
 *
 * IT IS RECORDED AS A DIGEST, NEVER AS ITS TEXT. A request body on this
 * platform can carry a reservation id, an email or a token, and a measurement
 * artefact is a file on disk that outlives the run. Twelve hex characters of
 * SHA-1 distinguish one set of arguments from another, which is all a duplicate
 * count needs, and say nothing about what they were.
 *
 * INERT UNLESS ASKED. With no SUPABASE_READ_LOG in the environment it installs
 * nothing at all, so a server started with this on its NODE_OPTIONS by accident
 * behaves exactly as it would without it.
 *
 * Local only, by construction: it is loaded only by a process a drive spawns.
 */
import { appendFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const LOG = process.env.SUPABASE_READ_LOG

function urlOf(input) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return typeof input?.url === 'string' ? input.url : ''
}

function methodOf(input, init) {
  if (init?.method) return String(init.method).toUpperCase()
  if (typeof input?.method === 'string') return input.method.toUpperCase()
  return 'GET'
}

/**
 * The arguments of a POST, as twelve hex characters. A body that is not a plain
 * string (a stream, a FormData) is reported as its own kind rather than hashed,
 * because a stream cannot be read here without consuming it, and a counter that
 * broke the request it measures would be worse than one that says so.
 */
function bodyDigest(init) {
  const body = init?.body
  if (body === undefined || body === null) return ''
  if (typeof body !== 'string') return `<${body?.constructor?.name ?? typeof body}>`
  return createHash('sha1').update(body).digest('hex').slice(0, 12)
}

if (LOG) {
  const realFetch = globalThis.fetch
  globalThis.fetch = function countingFetch(input, init) {
    const url = urlOf(input)
    const rest = url.indexOf('/rest/v1/')
    if (rest !== -1) {
      const tail = url.slice(rest + '/rest/v1/'.length)
      const [table, query = ''] = tail.split('?')
      // Written before the call, not after: a read that never comes back is
      // still a read the route asked for, and a counter that only records
      // successes would flatter a route that times out.
      appendFileSync(
        LOG,
        `${JSON.stringify({ t: Date.now(), method: methodOf(input, init), table, query, body: bodyDigest(init) })}\n`,
      )
    }
    return realFetch.call(globalThis, input, init)
  }
}
