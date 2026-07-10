import 'server-only'
import { getRedisClient } from '@/lib/redis/client'
import { getMonthlyBudgetUsd } from './config'

/**
 * Monthly cost guard backed by Upstash Redis. Every completed API call
 * records its estimated cost in micro-USD against a month-scoped counter;
 * before each call we check the counter against the founder-set budget.
 *
 * Fail-open by design: if Redis is unreachable the assistants keep working
 * (a Redis blip must not take down support chat), but every spend is still
 * logged so the Anthropic Console remains the authoritative meter. This is
 * a runaway-cost circuit breaker, not a billing system.
 */

const KEY_PREFIX = 'ai:spend:'
// Keep the counter around ~40 days so a month boundary never truncates it early.
const KEY_TTL_SEC = 40 * 24 * 60 * 60

export function currentMonthKey(now = new Date()): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${KEY_PREFIX}${y}-${m}`
}

export type BudgetStatus = {
  ok: boolean
  spentMicroUsd: number
  budgetMicroUsd: number
}

export async function checkMonthlyBudget(): Promise<BudgetStatus> {
  const budgetMicroUsd = Math.round(getMonthlyBudgetUsd() * 1_000_000)
  const redis = getRedisClient()
  if (!redis) return { ok: true, spentMicroUsd: 0, budgetMicroUsd }
  try {
    const raw = await redis.get<number>(currentMonthKey())
    const spentMicroUsd = typeof raw === 'number' ? raw : Number(raw ?? 0)
    return { ok: spentMicroUsd < budgetMicroUsd, spentMicroUsd, budgetMicroUsd }
  } catch (err) {
    console.error('[ai.cost-guard] redis read failed, failing open:', err)
    return { ok: true, spentMicroUsd: 0, budgetMicroUsd }
  }
}

export async function recordSpend(costMicroUsd: number): Promise<void> {
  if (!Number.isFinite(costMicroUsd) || costMicroUsd <= 0) return
  const redis = getRedisClient()
  if (!redis) return
  try {
    const key = currentMonthKey()
    const total = await redis.incrby(key, Math.ceil(costMicroUsd))
    if (total === Math.ceil(costMicroUsd)) {
      await redis.expire(key, KEY_TTL_SEC)
    }
  } catch (err) {
    console.error('[ai.cost-guard] redis write failed:', err)
  }
}
