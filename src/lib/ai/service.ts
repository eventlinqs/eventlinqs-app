import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient, isAiConfigured } from './client'
import { estimateCostMicroUsd, getDefaultModel } from './config'
import { checkMonthlyBudget, recordSpend } from './cost-guard'
import { logAi } from './logging'
import { enforceCopyLaws, type ChatMessage } from './sanitise'
import type { AssistantContext, AssistantDefinition } from './assistants'

/**
 * The one code path from an assistant request to the Anthropic Messages
 * API. Every assistant goes through here so the cost guard, structured
 * logging, output caps, copy-law enforcement, and error mapping are
 * uniform. Timeouts and retry-with-backoff for 429/5xx are handled by the
 * SDK client configuration (see client.ts).
 */

export type Suggestion = {
  kind: 'title' | 'description' | 'category'
  value: string
}

export type AssistantSuccess = {
  ok: true
  reply: string
  handoff: boolean
  suggestions: Suggestion[]
}

export type AssistantFailure = {
  ok: false
  reason: 'unconfigured' | 'budget_exhausted' | 'upstream_error' | 'refused'
}

export type AssistantResult = AssistantSuccess | AssistantFailure

/**
 * Structured-output schema for every assistant reply. Constraining the
 * response server-side means the handoff decision is a typed boolean, not
 * a string we regex out of prose.
 */
const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    reply: {
      type: 'string',
      description: 'The assistant reply shown to the user.',
    },
    handoff: {
      type: 'boolean',
      description: 'True only when the conversation should be passed to the human support team.',
    },
    suggestions: {
      type: 'array',
      description: 'Concrete field suggestions for the event form. Empty when not applicable.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['title', 'description', 'category'] },
          value: { type: 'string' },
        },
        required: ['kind', 'value'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'handoff', 'suggestions'],
  additionalProperties: false,
} as const

type ParsedReply = {
  reply: string
  handoff: boolean
  suggestions: Suggestion[]
}

function parseModelJson(text: string): ParsedReply | null {
  try {
    const parsed = JSON.parse(text) as Partial<ParsedReply>
    if (typeof parsed.reply !== 'string' || typeof parsed.handoff !== 'boolean') return null
    const suggestions: Suggestion[] = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter(
          (s): s is Suggestion =>
            !!s &&
            typeof s === 'object' &&
            (s.kind === 'title' || s.kind === 'description' || s.kind === 'category') &&
            typeof s.value === 'string'
        )
      : []
    return { reply: parsed.reply, handoff: parsed.handoff, suggestions }
  } catch {
    return null
  }
}

export async function runAssistant(opts: {
  assistant: AssistantDefinition
  context: AssistantContext
  transcript: ChatMessage[]
  /** Truncated identity hash for logs, produced by the route. */
  who: string
}): Promise<AssistantResult> {
  const { assistant, context, transcript, who } = opts

  if (!isAiConfigured()) {
    logAi({ evt: 'ai.blocked', assistant: assistant.id, who, reason: 'unconfigured' })
    return { ok: false, reason: 'unconfigured' }
  }

  const budget = await checkMonthlyBudget()
  if (!budget.ok) {
    logAi({ evt: 'ai.blocked', assistant: assistant.id, who, reason: 'budget_exhausted' })
    return { ok: false, reason: 'budget_exhausted' }
  }

  const model = getDefaultModel()
  const system = assistant.buildSystem(context)
  const started = Date.now()

  let response: Anthropic.Message
  try {
    response = await getAnthropicClient().messages.create({
      model,
      max_tokens: assistant.maxOutputTokens,
      // Stable system prefix first so prompt caching can engage; the
      // transcript (volatile) follows in messages.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: transcript.map(m => ({ role: m.role, content: m.content })),
      output_config: { format: { type: 'json_schema', schema: REPLY_SCHEMA } },
    })
  } catch (err) {
    logAi({
      evt: 'ai.error',
      assistant: assistant.id,
      who,
      latencyMs: Date.now() - started,
      errorType: err instanceof Error ? err.constructor.name : 'Unknown',
      model,
    })
    return { ok: false, reason: 'upstream_error' }
  }

  const inputTokens =
    response.usage.input_tokens +
    (response.usage.cache_creation_input_tokens ?? 0) +
    (response.usage.cache_read_input_tokens ?? 0)
  const outputTokens = response.usage.output_tokens
  const costMicroUsd = estimateCostMicroUsd(model, inputTokens, outputTokens)
  await recordSpend(costMicroUsd)

  logAi({
    evt: 'ai.request',
    assistant: assistant.id,
    who,
    ok: true,
    latencyMs: Date.now() - started,
    inputTokens,
    outputTokens,
    costMicroUsd,
    stopReason: response.stop_reason,
    model,
  })

  if (response.stop_reason === 'refusal') {
    return { ok: false, reason: 'refused' }
  }

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text'
  )
  const parsed = textBlock ? parseModelJson(textBlock.text) : null
  if (!parsed) {
    // Structured output should make this unreachable; treat as upstream noise.
    logAi({ evt: 'ai.error', assistant: assistant.id, who, errorType: 'UnparseableReply', model })
    return { ok: false, reason: 'upstream_error' }
  }

  return {
    ok: true,
    reply: enforceCopyLaws(parsed.reply),
    handoff: assistant.allowHandoff ? parsed.handoff : false,
    suggestions: parsed.suggestions.map(s => ({ ...s, value: enforceCopyLaws(s.value) })),
  }
}
