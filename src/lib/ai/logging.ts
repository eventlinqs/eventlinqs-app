import 'server-only'
import { createHash } from 'crypto'

/**
 * Structured logging for the AI layer. One JSON line per request with
 * operational metadata ONLY: no message content, no prompts, no user email,
 * no API key material, ever. User identity is a truncated hash so abuse
 * can be correlated without the log being PII.
 */

export type AiLogRecord = {
  evt: 'ai.request' | 'ai.blocked' | 'ai.handoff' | 'ai.error'
  assistant: string
  /** Truncated sha256 of the user id or IP. Never the raw identifier. */
  who: string
  ok?: boolean
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
  costMicroUsd?: number
  stopReason?: string | null
  model?: string
  /** Why a request was blocked: rate_limited | budget_exhausted | unconfigured | invalid */
  reason?: string
  /** Error class name only, never the message (messages can echo user content). */
  errorType?: string
  /** Resend message id for handoff emails - an opaque id, never content. */
  resendId?: string
}

export function hashIdentity(identity: string): string {
  return createHash('sha256').update(identity).digest('hex').slice(0, 12)
}

export function logAi(record: AiLogRecord): void {
  // Single-line JSON so Vercel log drains and grep both work.
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...record }))
}
