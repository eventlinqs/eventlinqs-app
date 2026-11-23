import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { estimateCostMicroUsd } from '@/lib/ai/config'
import { anthropicOrganisation, getAnthropicClient } from '@/lib/ai/client'
import { recordLesson } from '@/lib/ops/lessons'

/**
 * THE CREATIVE BUDGET (the PM's 13:20 and 13:21 of 23 November 2026; migration 20261124030002). Every generation or review
 * call the creative engine makes goes through creativeCall, which:
 *   1. reads the newest creative_budget row: the cap (US$ a credit month), the one switch and the day the credit renews.
 *      With no row the cap is zero and the switch is off, so nothing is generated. The service role can only read that
 *      table: a row is written by a logged production write alone (scripts/ops/apply-reviewed-sql-production.mjs);
 *   2. sums what creative work has spent since the credit month began (creative_spent_since, in the database);
 *   3. refuses with its reason while the switch is off, the cap is zero, or the cap is reached. At the cap it logs a line
 *      and leaves the PM one record for that month (ops_lessons, which /admin/today and the morning report read);
 *   4. otherwise makes the call it is given, prices it from the API's own usage fields (input, output and cache tokens;
 *      ai/config.ts estimateCostMicroUsd, its prices cited from Anthropic's pricing page) and records model, tokens, cost
 *      and the organisation Anthropic names (creative_calls).
 * It gates generation only: the publishing path never reads it, so a post already approved is never held by the budget.
 * Nothing here, or anywhere in the engine, buys credit or turns on auto reload; the tests hold that.
 */

type Db = SupabaseClient

export type BudgetSetting = { readonly capUsd: number; readonly generationOn: boolean; readonly monthStartsDay: number; readonly setAt: string | null }

/** No row: a zero cap, generation off. */
export const NO_SETTING: BudgetSetting = { capUsd: 0, generationOn: false, monthStartsDay: 1, setAt: null }

/** The start of the credit month holding `now`, on UTC's clock: that day of this month once reached, else of the last. Pure. */
export function cycleStart(now: Date, monthStartsDay: number): Date {
  const day = Math.min(28, Math.max(1, Math.trunc(monthStartsDay)))
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const thisMonth = Date.UTC(y, m, day)
  return new Date(now.getTime() >= thisMonth ? thisMonth : Date.UTC(y, m - 1, day))
}

export type Verdict = { readonly ok: true } | { readonly ok: false; readonly atCap: boolean; readonly reason: string }

const usd = (micro: number) => `US$${(micro / 1_000_000).toFixed(2)}`

/**
 * Whether a call may be made: the switch on, a cap above zero, and what is spent (with the call's own reserve, where the
 * caller states one) still under the cap. Pure.
 */
export function budgetVerdict(s: BudgetSetting, spentMicroUsd: number, reserveMicroUsd = 0): Verdict {
  if (!s.generationOn) return { ok: false, atCap: false, reason: 'Creative generation is off: its switch is turned on only by a logged production write, once the PM has confirmed the key\'s organisation.' }
  const cap = Math.round(s.capUsd * 1_000_000)
  if (cap <= 0) return { ok: false, atCap: false, reason: 'The creative cap is zero: no cap has been set by a logged production write, so nothing is generated.' }
  if (spentMicroUsd >= cap || spentMicroUsd + Math.max(0, reserveMicroUsd) > cap) {
    return { ok: false, atCap: true, reason: `The creative cap is reached: ${usd(spentMicroUsd)} spent this credit month against ${usd(cap)}; generation stops until the next.` }
  }
  return { ok: true }
}

/** The newest setting, or none; a read that fails is said, and generation is then refused. */
export async function readBudgetSetting(db: Db): Promise<{ readonly setting: BudgetSetting } | { readonly unread: string }> {
  const { data, error } = await db.from('creative_budget').select('cap_usd, generation_on, month_starts_day, set_at').order('set_at', { ascending: false }).limit(1)
  if (error) return { unread: `the creative budget could not be read (${error.message})` }
  const row = ((data ?? []) as Record<string, unknown>[])[0]
  if (!row) return { setting: NO_SETTING }
  const cap = Number(row.cap_usd)
  return {
    setting: {
      capUsd: Number.isFinite(cap) && cap > 0 ? cap : 0,
      generationOn: row.generation_on === true,
      monthStartsDay: Number(row.month_starts_day) || 1,
      setAt: (row.set_at as string | null) ?? null,
    },
  }
}

/** What creative work has spent since `from`, in micro US dollars, summed by the database. */
export async function spentSince(db: Db, from: Date): Promise<{ readonly spent: number } | { readonly unread: string }> {
  const { data, error } = await db.rpc('creative_spent_since', { p_from: from.toISOString() })
  if (error) return { unread: `what creative work has spent could not be read (${error.message})` }
  const spent = Number(data ?? 0)
  return Number.isFinite(spent) ? { spent } : { unread: 'what creative work has spent read as no number' }
}

/** The API's own usage fields (Messages API response.usage). */
export type CallUsage = {
  readonly input_tokens: number
  readonly output_tokens: number
  readonly cache_creation_input_tokens?: number | null
  readonly cache_read_input_tokens?: number | null
}

/** A call the budget may make: the value it returns, the model that answered and that response's own usage. */
export type CreativeCaller<T> = () => Promise<{ readonly value: T; readonly model: string; readonly usage: CallUsage; readonly requestId?: string | null }>

export type Called<T> =
  | { readonly state: 'called'; readonly value: T; readonly costMicroUsd: number; readonly recorded: true | string }
  | { readonly state: 'refused'; readonly atCap: boolean; readonly reason: string }

function logLine(record: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...record }))
}

/**
 * ONE CREATIVE CALL, INSIDE THE BUDGET. `call` is made only when the budget allows it; refused, it is never made. The
 * real call is anthropicCreativeCall below; tests pass their own, so no test reaches the API.
 */
export async function creativeCall<T>(
  db: Db,
  input: { readonly purpose: 'generation' | 'review'; readonly now: Date; readonly briefId?: string | null; readonly reserveMicroUsd?: number },
  call: CreativeCaller<T>,
): Promise<Called<T>> {
  const read = await readBudgetSetting(db)
  if ('unread' in read) return { state: 'refused', atCap: false, reason: `Not called: ${read.unread}.` }
  const from = cycleStart(input.now, read.setting.monthStartsDay)
  const spent = await spentSince(db, from)
  if ('unread' in spent) return { state: 'refused', atCap: false, reason: `Not called: ${spent.unread}.` }
  const verdict = budgetVerdict(read.setting, spent.spent, input.reserveMicroUsd ?? 0)
  if (!verdict.ok) {
    logLine({ evt: 'creative.budget_refused', purpose: input.purpose, atCap: verdict.atCap, spentMicroUsd: spent.spent, capUsd: read.setting.capUsd, since: from.toISOString() })
    if (verdict.atCap) {
      const month = from.toISOString().slice(0, 10)
      const kept = await recordLesson(db, {
        learnedAt: input.now,
        phase: null,
        wentWrong: `Creative generation reached its cap for the credit month from ${month}: ${usd(spent.spent)} spent against US$${read.setting.capUsd.toFixed(2)}.`,
        cause: 'The monthly cap for creative work (creative_budget), set by a logged production write, is reached.',
        nowDoes: 'Generation and review calls are refused until the next credit month; posts already approved publish as before.',
        heldBy: 'src/lib/creative/budget.ts creativeCall',
        evidence: `creative_calls since ${from.toISOString()}`,
        source: 'engine',
        sourceKey: `creative-cap-reached-${month}`,
      })
      if (typeof kept === 'object') logLine({ evt: 'creative.budget_record_failed', error: kept.failed })
    }
    return { state: 'refused', atCap: verdict.atCap, reason: `Not called: ${verdict.reason}` }
  }
  const done = await call()
  const u = done.usage
  const costMicroUsd = estimateCostMicroUsd(done.model, u.input_tokens, u.output_tokens, { write: u.cache_creation_input_tokens ?? 0, read: u.cache_read_input_tokens ?? 0 })
  const organisation = anthropicOrganisation()
  const { error } = await db.from('creative_calls').insert({
    called_at: input.now.toISOString(),
    purpose: input.purpose,
    model: done.model,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_write_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_tokens: u.cache_read_input_tokens ?? 0,
    cost_micro_usd: costMicroUsd,
    brief_id: input.briefId ?? null,
    organisation,
    request_id: done.requestId ?? null,
  })
  logLine({ evt: 'creative.call', purpose: input.purpose, model: done.model, inputTokens: u.input_tokens, outputTokens: u.output_tokens, costMicroUsd, org: organisation, recorded: error ? error.message : true })
  return { state: 'called', value: done.value, costMicroUsd, recorded: error ? `not recorded: ${error.message}` : true }
}

/** The real call: one Messages API request through the engine's one client, its usage as the API returns it. */
export function anthropicCreativeCall(params: Anthropic.MessageCreateParamsNonStreaming): CreativeCaller<Anthropic.Message> {
  return async () => {
    const message = await getAnthropicClient().messages.create(params)
    return { value: message, model: message.model, usage: message.usage, requestId: message.id }
  }
}
