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
 * id prefix so a dated or suffixed id still matches. Estimation only: the
 * authoritative bill is the Anthropic Console. Unknown models fall back to
 * the most expensive row so the guard can never under-count.
 */
const PRICE_PER_MTOK: Array<{ prefix: string; inputUsd: number; outputUsd: number }> = [
  { prefix: 'claude-opus-4', inputUsd: 5, outputUsd: 25 },
  { prefix: 'claude-sonnet', inputUsd: 3, outputUsd: 15 },
  { prefix: 'claude-haiku', inputUsd: 1, outputUsd: 5 },
]

const FALLBACK_PRICE = { inputUsd: 10, outputUsd: 50 }

export function estimateCostMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_PER_MTOK.find(p => model.startsWith(p.prefix)) ?? FALLBACK_PRICE
  // microUSD = tokens * (USD per MTok) since 1e6 micro / 1e6 tokens cancel.
  return Math.ceil(inputTokens * price.inputUsd + outputTokens * price.outputUsd)
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
