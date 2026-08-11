import 'server-only'
import { getRedisClient } from '@/lib/redis/client'
import { getMonthlyBudgetUsd } from './config'

/**
 * Monthly cost guard backed by Upstash Redis. Every completed API call
 * records its estimated cost in micro-USD against a month-scoped counter;
 * before each call we check the counter against the founder-set budget.
 *
 * THE FAIL MODE IS THE CALLER'S CHOICE, and it must be, because the two
 * callers have opposite risks (F3).
 *
 * - `open` (the chat assistants): a Redis blip must not take down support
 *   chat. Those callers are authenticated and separately rate limited per
 *   user, so the blast radius of a wobble is small and bounded.
 * - `closed` (draft generation, and anything an unauthenticated visitor can
 *   reach): a Redis outage would otherwise mean an UNCAPPED bill for as long
 *   as the outage lasts, because the counter is the only thing standing
 *   between anonymous traffic and the API. Callers that fail closed have a
 *   deterministic, zero-cost path to fall back to, so the visitor still gets
 *   a complete result and only the model call is skipped.
 *
 * There is no safe global default here, so the parameter is REQUIRED: a new
 * call site cannot inherit the wrong risk posture by forgetting to think
 * about it.
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
  /** True when the verdict came from an unreachable meter, not a real count. */
  unmetered?: boolean
}

/**
 * `open` keeps working when the meter is unreachable. `closed` refuses, so an
 * outage can never become an uncapped bill. See the module comment.
 */
export type BudgetFailMode = 'open' | 'closed'

export async function checkMonthlyBudget(failMode: BudgetFailMode): Promise<BudgetStatus> {
  const budgetMicroUsd = Math.round(getMonthlyBudgetUsd() * 1_000_000)
  const openWhenBlind = failMode === 'open'

  const redis = getRedisClient()
  if (!redis) {
    // No Redis configured at all. Same reasoning as an outage: a caller that
    // spends on behalf of strangers must not run unmetered.
    if (!openWhenBlind) {
      console.error('[ai.cost-guard] no redis configured, failing closed')
    }
    return { ok: openWhenBlind, spentMicroUsd: 0, budgetMicroUsd, unmetered: true }
  }
  try {
    const raw = await redis.get<number>(currentMonthKey())
    const spentMicroUsd = typeof raw === 'number' ? raw : Number(raw ?? 0)
    return { ok: spentMicroUsd < budgetMicroUsd, spentMicroUsd, budgetMicroUsd }
  } catch (err) {
    console.error(
      `[ai.cost-guard] redis read failed, failing ${failMode}:`,
      err,
    )
    return { ok: openWhenBlind, spentMicroUsd: 0, budgetMicroUsd, unmetered: true }
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
