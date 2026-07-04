import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { MAX_RETRIES, REQUEST_TIMEOUT_MS } from './config'

/**
 * Lazy module-singleton for the Anthropic client, mirroring the Resend
 * pattern in src/lib/email/send.ts. Building with an unset ANTHROPIC_API_KEY
 * (CI typecheck, fresh clone, key-not-yet-provisioned) must succeed; the
 * client is only constructed when a request actually reaches the AI layer.
 *
 * The key lives ONLY in the server-side env (Vercel: `vercel env add
 * ANTHROPIC_API_KEY`). It is never logged, never echoed in errors, and no
 * module under src/lib/ai may be imported from client components
 * ('server-only' enforces that at build time).
 */
let client: Anthropic | null = null

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export function getAnthropicClient(): Anthropic {
  if (client) return client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }
  client = new Anthropic({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  })
  return client
}
