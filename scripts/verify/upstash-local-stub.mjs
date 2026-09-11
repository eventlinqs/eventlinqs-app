/**
 * Minimal in-memory Upstash REST stub, for local verification only.
 *
 * The abuse-sensitive rate-limit policies (auth-signup, auth-login,
 * auth-recover, auth-magic-link, auth-resend-verification) are `failClosed`, so
 * a production build with no Upstash configured correctly answers 429 to every
 * request. That is exactly the behaviour we want in production and exactly what
 * blocks a local end-to-end journey walk.
 *
 * The alternative was to point the local server at the production Upstash
 * instance. This stub exists so that is never necessary: nothing this harness
 * does touches shared infrastructure.
 *
 * Implements only what src/lib/redis/rate-limit.ts uses: INCR, EXPIRE, GET,
 * SET, DEL, and the /pipeline form. Not a Redis. Never deployed.
 *
 * THE ENCODING THE CLIENT ASKS FOR IS HONOURED (12 September 2026). The
 * @upstash/redis client defaults `responseEncoding` to "base64", sends
 * `Upstash-Encoding: base64`, and base64-DECODES every string in the answer.
 * Upstash therefore base64-ENCODES every string result when that header is
 * present; numbers and nulls travel as they are. This stub answered PING with a
 * plain "PONG", which the client decoded into three bytes of rubbish, so the
 * first route sweep against the gate's own served build found
 * /api/health/redis answering 503 with `result: "<(F"` and reported a server
 * error on a product that was fine. The rate limiter never noticed because
 * INCR answers a number. Now a string is encoded when asked, the way the real
 * service does it, and the health route reads PONG.
 *
 * Usage: PORT=54322 node scripts/verify/upstash-local-stub.mjs
 */
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const store = new Map()

export function exec(cmd) {
  const [nameRaw, ...args] = cmd
  const name = String(nameRaw).toUpperCase()
  const key = String(args[0] ?? '')
  switch (name) {
    case 'INCR': {
      const next = Number(store.get(key) ?? 0) + 1
      store.set(key, next)
      return next
    }
    case 'EXPIRE':
      return 1
    case 'GET':
      return store.has(key) ? store.get(key) : null
    case 'SET':
      store.set(key, args[1])
      return 'OK'
    case 'DEL':
      return store.delete(key) ? 1 : 0
    case 'PING':
      return 'PONG'
    default:
      return null
  }
}

/**
 * What Upstash puts on the wire for one result when the client sent
 * `Upstash-Encoding: base64`: strings base64-encoded, arrays element by
 * element, numbers and null untouched. Without the header, the value as is.
 * Pure, so it is tested without a server.
 */
export function encodeForClient(value, wantsBase64) {
  if (!wantsBase64) return value
  if (typeof value === 'string') return Buffer.from(value, 'utf8').toString('base64')
  if (Array.isArray(value)) return value.map((v) => encodeForClient(v, true))
  return value
}

/** Does this request ask for base64 results? Header names arrive lower-cased in Node. */
export function wantsBase64(headers) {
  return String(headers['upstash-encoding'] ?? '').toLowerCase() === 'base64'
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (invokedDirectly) {
  const PORT = Number(process.env.PORT ?? 54322)
  createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const raw = Buffer.concat(chunks).toString() || '[]'

    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      // Upstash also accepts the command in the path: /incr/<key>
      payload = req.url.split('/').filter(Boolean).map(decodeURIComponent)
    }

    const base64 = wantsBase64(req.headers)
    res.writeHead(200, { 'content-type': 'application/json' })

    if (req.url?.endsWith('/pipeline') || req.url?.endsWith('/multi-exec')) {
      res.end(JSON.stringify(payload.map((cmd) => ({ result: encodeForClient(exec(cmd), base64) }))))
      return
    }
    res.end(JSON.stringify({ result: encodeForClient(exec(payload), base64) }))
  }).listen(PORT, '127.0.0.1', () => {
    console.log(`upstash stub listening on http://127.0.0.1:${PORT} (in-memory, local only)`)
  })
}
