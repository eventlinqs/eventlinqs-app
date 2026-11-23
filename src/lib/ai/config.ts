import 'server-only'

/**
 * AI layer configuration. One place for model selection, output caps, and
 * the monthly cost budget, all founder-tunable via env vars with reviewed
 * defaults, so no assistant ever hardcodes a model string or a cap at its
 * call site.
 *
 * The API key itself is read lazily in client.ts (ANTHROPIC_API_KEY,
 * server-side env only). It must never appear in client code, in the repo,
 * or in logs.
 */

/** Default model for every assistant. Override with AI_MODEL in Vercel env. */
export function getDefaultModel(): string {
  return process.env.AI_MODEL || 'claude-opus-4-8'
}

/**
 * Monthly spend ceiling in USD across all AI features. When the estimated
 * month-to-date spend reaches this number the assistants decline politely
 * instead of calling the API. Override with AI_MONTHLY_BUDGET_USD.
 */
export function getMonthlyBudgetUsd(): number {
  const raw = process.env.AI_MONTHLY_BUDGET_USD
  const parsed = raw ? Number(raw) : NaN
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return 50
}

/**
 * Price table for cost estimation, USD per million tokens. Keyed by model
 * id prefix so a dated or suffixed id still matches; the first match wins, so
 * a longer prefix stands before a shorter one. Estimation only: the
 * authoritative bill is the Anthropic Console. Unknown models fall back to
 * the most expensive row so the guard can never under-count.
 *
 * SOURCE (law 7): Anthropic's own pricing page, "Model pricing", base input and
 * output tokens, https://platform.claude.com/docs/en/about-claude/pricing,
 * read 23 November 2026. Claude Haiku 5.5 carries its price for prompts over
 * 100,000 tokens, the higher of its two, so a long prompt is never under-counted.
 */
export const PRICE_PER_MTOK: ReadonlyArray<{ prefix: string; inputUsd: number; outputUsd: number }> = [
  { prefix: 'claude-fable-5-2', inputUsd: 8, outputUsd: 40 }, // https://platform.claude.com/docs/en/about-claude/pricing
  { prefix: 'claude-fable-5', inputUsd: 10, outputUsd: 50 }, // https://platform.claude.com/docs/en/about-claude/pricing (5 and 5.1)
  { prefix: 'claude-opus-5-5', inputUsd: 4, outputUsd: 20 }, // https://platform.claude.com/docs/en/about-claude/pricing
  { prefix: 'claude-opus-5', inputUsd: 5, outputUsd: 25 }, // https://platform.claude.com/docs/en/about-claude/pricing
  { prefix: 'claude-opus-4', inputUsd: 5, outputUsd: 25 }, // https://platform.claude.com/docs/en/about-claude/pricing (4.5 to 4.8)
  { prefix: 'claude-sonnet-5', inputUsd: 2, outputUsd: 10 }, // https://platform.claude.com/docs/en/about-claude/pricing (5 and 5.5)
  { prefix: 'claude-sonnet', inputUsd: 3, outputUsd: 15 }, // https://platform.claude.com/docs/en/about-claude/pricing (4.5 and 4.6)
  { prefix: 'claude-haiku-5-5', inputUsd: 0.5, outputUsd: 2.5 }, // https://platform.claude.com/docs/en/about-claude/pricing (prompts over 100,000 tokens)
  { prefix: 'claude-haiku', inputUsd: 1, outputUsd: 5 }, // https://platform.claude.com/docs/en/about-claude/pricing (4.5)
]

const FALLBACK_PRICE = { inputUsd: 10, outputUsd: 50 }

/**
 * Prompt cache tokens, priced against the base input price (the same page, "Prompt caching"): a write costs 1.25x for five
 * minutes and 2x for an hour, a read at most 0.1x. Writes are counted at 2x and reads at 0.1x, the dearest of each, so the
 * estimate never under-counts. https://platform.claude.com/docs/en/about-claude/pricing
 */
export const CACHE_WRITE_MULTIPLIER = 2
export const CACHE_READ_MULTIPLIER = 0.1

export function estimateCostMicroUsd(model: string, inputTokens: number, outputTokens: number, cache: { readonly write?: number; readonly read?: number } = {}): number {
  const price = PRICE_PER_MTOK.find(p => model.startsWith(p.prefix)) ?? FALLBACK_PRICE
  const cachedInput = (cache.write ?? 0) * CACHE_WRITE_MULTIPLIER + (cache.read ?? 0) * CACHE_READ_MULTIPLIER
  // microUSD = tokens * (USD per MTok) since 1e6 micro / 1e6 tokens cancel.
  return Math.ceil((inputTokens + cachedInput) * price.inputUsd + outputTokens * price.outputUsd)
}

/** Hard clamps on what a client may send. Enforced server-side in the route. */
export const INPUT_LIMITS = {
  /** Max characters in a single chat message. */
  maxMessageChars: 2000,
  /** Max messages of history the client may replay. */
  maxHistoryMessages: 16,
  /** Max characters in any single context field (event draft title etc). */
  maxContextFieldChars: 4000,
} as const

/** Request timeout for the Anthropic API call, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 45_000

/** SDK retry count for 429/5xx with built-in exponential backoff. */
export const MAX_RETRIES = 2
