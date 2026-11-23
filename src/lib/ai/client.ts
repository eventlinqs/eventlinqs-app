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

/**
 * THE ORGANISATION THE KEY BELONGS TO (the PM's 13:20 and 13:32 of 23 November 2026, item 4): Anthropic names it on every
 * response, "anthropic-organization-id: The ID of the organization that the API key or access token used in the request
 * belongs to" (docs.claude.com/en/api/overview). The client's own fetch notes it from each response so the ai.request log
 * line can carry it: an organisation id, never the key.
 */
let lastOrganisation: string | null = null

/** The anthropic-organization-id of the last response this process received, or null before any. */
export function anthropicOrganisation(): string | null {
  return lastOrganisation
}

const notingFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init)
  const org = res.headers.get('anthropic-organization-id')
  if (org) lastOrganisation = org
  return res
}

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
    fetch: notingFetch,
  })
  return client
}
