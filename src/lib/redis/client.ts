import { Redis } from '@upstash/redis'

/**
 * The Upstash client, and the environment namespace every key carries.
 *
 * ---------------------------------------------------------------------------
 * WHY THE NAMESPACE EXISTS, measured 8 August 2026.
 *
 * A local dev server, pointed at the TEST database, wrote TEST values into the
 * Redis that PRODUCTION reads:
 *
 *     ff:v1:broadcast_artists = "true"   (production's row says false)
 *
 * The keys carried no environment. The Upstash credentials live in
 * `.env.local`; the database credentials that would have redirected them do
 * not. So any process pointed at another database shared production's store.
 *
 * Namespacing the one flag key would have fixed that instance and left the
 * cause. FIVE more key families had the identical shape, and two of them are
 * far worse than a feature flag:
 *
 *   pr:v2:<type>:<country>:<currency>:<org>   THE FEE. getPricingRule returns
 *       the cached entry BEFORE touching the database, and the region key
 *       carries no UUID, so TEST and production collide exactly. A TEST fee
 *       cached here is served by production as the authoritative fee, on the
 *       charge path and the display path, for up to 60 seconds. The
 *       constitution's single-source fee law says the displayed fee always
 *       equals the charged fee; a shared cache breaks that from outside the
 *       fee system entirely.
 *   ai:spend:<YYYY-MM>                        THE AI BUDGET. One global monthly
 *       counter. A local session's spend counts against production's budget and
 *       can trip the fail-closed guard, disabling the AI features on the live
 *       platform.
 *
 *   rl:<key>:<window>          shared rate-limit buckets
 *   queue:join:<ip>            shared queue admission buckets
 *   tier:<id>:inventory        collision-proof only by accident: the ids are
 *   event:<id>:inventory       UUIDs, which differ per database. Accidental
 *                              safety is not safety.
 *
 * So the namespace is applied HERE, once, to every key, rather than at six call
 * sites that can each be forgotten. A new call site is namespaced by default,
 * and a method this wrapper does not know about THROWS rather than quietly
 * escaping the namespace.
 *
 * The identity is the Supabase project ref, because in this repo the database
 * IS the environment: TEST and production are two projects, and the value is
 * already in `NEXT_PUBLIC_SUPABASE_URL` wherever the app runs.
 */

/** Methods that take a Redis key as their first argument. */
const KEY_FIRST_METHODS = new Set([
  'get', 'set', 'setex', 'getdel', 'getset', 'del', 'unlink', 'exists', 'expire',
  'pexpire', 'ttl', 'pttl', 'incr', 'incrby', 'decr', 'decrby', 'append',
  'hget', 'hset', 'hdel', 'hgetall', 'hincrby', 'sadd', 'srem', 'smembers',
  'sismember', 'scard', 'lpush', 'rpush', 'lpop', 'rpop', 'lrange', 'llen',
  'zadd', 'zrem', 'zscore', 'zrange', 'zcard', 'mget',
])

/** Methods that take no key at all and are safe to pass straight through. */
const KEYLESS_METHODS = new Set(['ping', 'dbsize', 'flushdb', 'scan', 'keys'])

export function redisNamespace(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  // e.g. https://vkapkibzokmfaxqogypq.supabase.co -> vkapkibzokmfaxqogypq
  return /https?:\/\/([a-z0-9]+)\.supabase\./i.exec(url)?.[1] ?? 'unknown'
}

/** Prefix a single key. Exported so tests can assert the exact shape. */
export function namespacedKey(key: string): string {
  return `${redisNamespace()}:${key}`
}

type RedisLike = Redis

let _redis: RedisLike | null = null

/**
 * Wrap the client so every key-taking call is namespaced, and any method this
 * file has not classified throws instead of writing an unnamespaced key.
 *
 * Throwing on an unknown method is the load-bearing part. A silent pass-through
 * would mean the next Upstash method somebody reaches for reintroduces exactly
 * the defect this wrapper exists to close, and it would do so invisibly.
 */
function namespaceClient(raw: RedisLike): RedisLike {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function' || typeof prop !== 'string') return value
      if (KEYLESS_METHODS.has(prop)) return value.bind(target)
      if (!KEY_FIRST_METHODS.has(prop)) {
        return () => {
          throw new Error(
            `[redis] "${prop}" is not classified in src/lib/redis/client.ts. Add it to KEY_FIRST_METHODS or KEYLESS_METHODS. Until then it is refused, because an unclassified method writes an unnamespaced key and a shared key is how a TEST process last reached production's store.`,
          )
        }
      }
      return (...args: unknown[]) => {
        // Every method here takes keys leading; del and mget take several.
        const mapped = args.map((arg, i) =>
          typeof arg === 'string' && (i === 0 || prop === 'del' || prop === 'unlink' || prop === 'mget')
            ? namespacedKey(arg)
            : arg,
        )
        return (value as (...a: unknown[]) => unknown).apply(target, mapped)
      }
    },
  }) as RedisLike
}

function getRedisClient(): RedisLike | null {
  if (_redis) return _redis

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    console.warn('[redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set - Redis disabled')
    return null
  }

  try {
    _redis = namespaceClient(new Redis({ url, token }))
    return _redis
  } catch (err) {
    console.error('[redis] Failed to initialise Redis client:', err)
    return null
  }
}

/** Test seam: drop the memoised client so a namespace change takes effect. */
export function resetRedisClientForTests(): void {
  _redis = null
}

export { getRedisClient }
