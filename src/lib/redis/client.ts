import { Redis } from '@upstash/redis'

let _redis: Redis | null = null

function getRedisClient(): Redis | null {
  if (_redis) return _redis

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    console.warn('[redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set — Redis disabled')
    return null
  }

  try {
    _redis = new Redis({ url, token })
    return _redis
  } catch (err) {
    console.error('[redis] Failed to initialise Redis client:', err)
    return null
  }
}

export { getRedisClient }
