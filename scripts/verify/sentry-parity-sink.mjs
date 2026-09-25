/**
 * THE SENTRY PARITY SINK. A local endpoint that swallows envelopes so the
 * client SDK's own network request SUCCEEDS during a local audit.
 *
 * WHY THIS EXISTS, and it was found by the gate rather than by reasoning.
 *
 * Close-out P0.2 gave the local gate a DSN so its builds carry the same client
 * SDK the deployed preview carries (see PARITY_SENTRY_DSN in
 * scripts/ops/pre-push-gate.mjs). The first attempt pointed that DSN at an
 * RFC 2606 `.invalid` host, on the reasoning that a host which can never
 * resolve can never receive anything. It cannot, and that is the problem: the
 * SDK opens a session envelope on EVERY page load, the request failed with
 * ERR_NAME_NOT_RESOLVED, and Chrome logged
 *
 *     Failed to load resource: net::ERR_NAME_NOT_RESOLVED
 *
 * which fails Lighthouse's `errors-in-console` audit. Best practices went from
 * 1.00 to 0.93 on all thirteen gated URLs, on every one of five runs, and the
 * gate refused the push. Correctly: a build that logs a console error is not the
 * build that deploys, and the parity fix had introduced a difference of its own
 * while removing a bigger one.
 *
 * So the parity DSN now points at 127.0.0.1 on a fixed port and THIS answers it.
 * The SDK loads, parses, evaluates, arms and SENDS exactly as it does in
 * production. Nothing leaves the machine, and no console error is logged.
 *
 * IT REFUSES RATHER THAN DEGRADES. If the port is already taken it exits
 * non-zero and says so, because the failure mode it exists to prevent is silent:
 * a sink that did not start would put the console error straight back and cost
 * a point that reads like a regression in the product.
 *
 * BUT "I COULD NOT BIND" IS NOT "THERE IS NO SINK", and on this machine those
 * two came apart on 20 September 2026. Three lanes share one laptop and one
 * fixed port, so the ordinary case is that a SIBLING LANE'S IDENTICAL SINK is
 * already listening. A push that had passed 15 of 16 steps was refused in 11
 * seconds with "the server exited with 1 before answering", and a probe sent to
 * that port a moment later answered `200 {"id":"000...0"}` with
 * `access-control-allow-origin: *`: the condition the gate actually needs was
 * satisfied the whole time.
 *
 * The condition is "a sink ANSWERS on this port", never "this process owns the
 * socket". `parityStandInAnswers` below is how a caller asks the first question
 * instead of inferring it from the second, and it is deliberately strict: a
 * foreign server that happens to hold the port fails it.
 *
 * Usage:
 *   node scripts/verify/sentry-parity-sink.mjs            (blocks, prints a count on exit)
 *   node scripts/verify/sentry-parity-sink.mjs --port 9411
 */
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

/**
 * The port the parity DSN names. FIXED, because a DSN is inlined into the
 * browser bundle at BUILD time and a build cannot know a port chosen later.
 * scripts/ops/pre-push-gate.mjs and tests/unit/ci/gate-client-sdk-parity.test.ts
 * both read this, so the three can never drift.
 */
export const PARITY_SINK_PORT = 9411

/**
 * The answer a parity sink gives, as a shape a caller can recognise. Written
 * beside the handler that produces it so the two cannot drift.
 */
export const PARITY_SINK_EVENT_ID = '0'.repeat(32)

/**
 * Is a parity sink ALREADY answering on this port?
 *
 * STRICT ON PURPOSE. It sends an envelope-shaped POST and requires all three
 * things the real handler does: 200, `access-control-allow-origin: *`, and a
 * JSON body whose `id` is 32 characters. A foreign server holding the port, a
 * proxy, or a dev server answering 404 all fail it, which is the point: the
 * caller is about to spend half an hour measuring a build, and borrowing
 * something that is not a sink would put the console error straight back while
 * reporting that everything was fine.
 *
 * Never throws. A refusal is an answer, so the caller can print the reason.
 *
 * @returns {Promise<{ ok: boolean, detail: string }>}
 */
export async function parityStandInAnswers(port = PARITY_SINK_PORT, timeoutMs = 3000) {
  let res
  try {
    res = await fetch(`http://127.0.0.1:${port}/api/1/envelope/`, {
      method: 'POST',
      body: '{}',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    return { ok: false, detail: `nothing answered: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (res.status !== 200) return { ok: false, detail: `answered ${res.status}, not 200` }
  const cors = res.headers.get('access-control-allow-origin')
  if (cors !== '*') return { ok: false, detail: `answered without the sink's CORS header (got ${cors ?? 'none'})` }
  let body
  try {
    body = await res.json()
  } catch {
    return { ok: false, detail: 'answered 200 with a body that is not JSON' }
  }
  if (typeof body?.id !== 'string' || body.id.length !== 32) {
    return { ok: false, detail: `answered 200 with no 32-character event id (got ${JSON.stringify(body?.id)})` }
  }
  return { ok: true, detail: `200 with a ${body.id.length}-character event id and the sink's CORS header` }
}

function parsePort(argv) {
  const at = argv.indexOf('--port')
  if (at < 0) return PARITY_SINK_PORT
  const value = Number(argv[at + 1])
  return Number.isInteger(value) && value > 0 ? value : PARITY_SINK_PORT
}

// pathToFileURL, never a hand-built `file://` string: on Windows the hand-built
// form is missing a slash (`file://C:/...` against Node's `file:///C:/...`), the
// comparison silently fails, and this file exits 0 having started nothing. Which
// is exactly what it did on the first run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = parsePort(process.argv.slice(2))
  let envelopes = 0

  const server = createServer((req, res) => {
    envelopes += 1
    // Drain the body. Leaving it unread can leave the client waiting on
    // backpressure, and a hung telemetry request is exactly the kind of thing
    // that would show up as a slower page in the audit this exists to keep
    // honest.
    req.resume()
    req.on('end', () => {
      // Sentry's ingest answers 200 with an event id. The SDK does not parse it
      // on the happy path, but answering the documented shape costs nothing and
      // means a future SDK that does parse it is not surprised.
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
      res.end(JSON.stringify({ id: '0'.repeat(32) }))
    })
  })

  server.on('error', (error) => {
    console.error(`[sentry-parity-sink] could not listen on 127.0.0.1:${port}: ${error.message}`)
    console.error('[sentry-parity-sink] Without this sink the audited build logs a console error on')
    console.error('[sentry-parity-sink] every page and best practices drops from 1.00 to 0.93.')
    process.exitCode = 1
  })

  server.listen(port, '127.0.0.1', () => {
    console.log(`[sentry-parity-sink] listening on 127.0.0.1:${port}; envelopes are counted and discarded`)
  })

  const stop = () => {
    console.log(`[sentry-parity-sink] swallowed ${envelopes} envelope(s)`)
    server.close(() => process.exit(0))
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
