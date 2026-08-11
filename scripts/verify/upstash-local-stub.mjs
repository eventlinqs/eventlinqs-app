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
 * Usage: PORT=54322 node scripts/verify/upstash-local-stub.mjs
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 54322)
const store = new Map()

function exec(cmd) {
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

  res.writeHead(200, { 'content-type': 'application/json' })

  if (req.url?.endsWith('/pipeline') || req.url?.endsWith('/multi-exec')) {
    res.end(JSON.stringify(payload.map((cmd) => ({ result: exec(cmd) }))))
    return
  }
  res.end(JSON.stringify({ result: exec(payload) }))
}).listen(PORT, '127.0.0.1', () => {
  console.log(`upstash stub listening on http://127.0.0.1:${PORT} (in-memory, local only)`)
})
