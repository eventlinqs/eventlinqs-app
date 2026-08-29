/**
 * A LOCAL UPSTASH-REST SHIM, so the money path can be driven THROTTLED.
 *
 * WHY THIS EXISTS. checkout-reserve is failClosed, and checkRateLimit blocks a
 * failClosed policy whenever the store is missing AND NODE_ENV is production.
 * `next start` sets NODE_ENV=production. So every local journey that touches
 * checkout, refund or transfer was refused before it began, with
 * "Too many attempts. Please wait a moment and try again." That is the limiter
 * working exactly as designed, and it is indistinguishable at the UI from a
 * limit the driver had genuinely exhausted, which is how it read for two
 * sessions.
 *
 * The alternatives were both worse. Dropping to `next dev` changes NODE_ENV and
 * therefore changes the very behaviour under test. Pointing local runs at the
 * real Upstash would put journey traffic in the production limiter's buckets.
 *
 * So: the smallest honest thing. The limiter uses exactly two commands, INCR
 * and EXPIRE (src/lib/redis/rate-limit.ts), and @upstash/redis speaks a simple
 * REST protocol. This serves those, in memory, on localhost. It holds no data
 * that matters, it is never reachable from anywhere else, and it makes the
 * local run take the SAME code path production takes rather than a bypass.
 *
 * Usage:  node scripts/dev/upstash-shim.mjs [port]
 * Then:   UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079
 *         UPSTASH_REDIS_REST_TOKEN=local
 */
import { createServer } from 'node:http'

const PORT = Number(process.argv[2] ?? 8079)

/** key -> { value, expiresAt } */
const store = new Map()

function now() {
  return Date.now()
}

function live(key) {
  const entry = store.get(key)
  if (!entry) return null
  if (entry.expiresAt !== null && entry.expiresAt <= now()) {
    store.delete(key)
    return null
  }
  return entry
}

function run(command) {
  const [rawName, ...args] = command
  const name = String(rawName).toLowerCase()

  switch (name) {
    case 'incr': {
      const key = String(args[0])
      const entry = live(key)
      const next = (entry ? Number(entry.value) : 0) + 1
      store.set(key, { value: next, expiresAt: entry?.expiresAt ?? null })
      return next
    }
    case 'expire': {
      const key = String(args[0])
      const seconds = Number(args[1])
      const entry = live(key)
      if (!entry) return 0
      entry.expiresAt = now() + seconds * 1000
      return 1
    }
    case 'get': {
      const entry = live(String(args[0]))
      return entry ? String(entry.value) : null
    }
    case 'set': {
      /*
       * THE TTL IS HONOURED, and ignoring it was a real bug in this shim.
       *
       * `set(key, value, { ex })` arrives as ["set", key, value, "ex", 3600].
       * This used to drop everything after the value and store the entry with
       * expiresAt: null, so a cached value lived for the life of the process
       * instead of for its TTL.
       *
       * That is not academic. On 29 August the feature-flag cache
       * (`<project>:ff:v2:broadcast_share`, written with a TTL by
       * src/lib/flags/broadcast.ts) held a stale value across a whole session,
       * and /api/organiser/events/[id]/poster answered 404 feature_off while
       * the database row said the flag was on. It read exactly like a product
       * defect in the Launch Kit, cost half an hour, and was this line.
       *
       * A shim that silently disagrees with the thing it stands in for is
       * worse than no shim, because every result it touches is suspect.
       */
      const opts = args.slice(2).map(a => String(a).toLowerCase())
      const exAt = opts.indexOf('ex')
      const pxAt = opts.indexOf('px')
      let expiresAt = null
      if (exAt !== -1 && args[exAt + 3] !== undefined) expiresAt = now() + Number(args[exAt + 3]) * 1000
      else if (pxAt !== -1 && args[pxAt + 3] !== undefined) expiresAt = now() + Number(args[pxAt + 3])
      store.set(String(args[0]), { value: args[1], expiresAt })
      return 'OK'
    }
    case 'del': {
      let removed = 0
      for (const k of args) if (store.delete(String(k))) removed++
      return removed
    }
    case 'ping':
      return 'PONG'
    case 'dbsize':
      return store.size
    case 'flushdb':
      store.clear()
      return 'OK'
    default:
      // Unknown on purpose: a silent wrong answer here would look like a
      // limiter that works and does not.
      return { error: `upstash-shim does not implement ${name}` }
  }
}

const server = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => {
    body += c
  })
  req.on('end', () => {
    res.setHeader('content-type', 'application/json')
    try {
      // @upstash/redis posts either one command array, or an array of them
      // when pipelining. A GET path form also exists; both are handled.
      let payload
      if (body) {
        payload = JSON.parse(body)
      } else {
        payload = decodeURIComponent(req.url ?? '/')
          .split('/')
          .filter(Boolean)
      }

      const isPipeline = Array.isArray(payload) && Array.isArray(payload[0])
      const out = isPipeline
        ? payload.map((c) => ({ result: run(c) }))
        : { result: run(payload) }

      res.statusCode = 200
      res.end(JSON.stringify(out))
    } catch (err) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: String(err) }))
    }
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[upstash-shim] INCR/EXPIRE on http://127.0.0.1:${PORT} (in memory, local only)`)
})
