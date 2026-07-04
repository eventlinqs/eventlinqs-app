import 'server-only'
import { INPUT_LIMITS } from './config'

/**
 * Input and output hygiene for the AI layer.
 *
 * Inbound: everything a client sends is untrusted. We clamp lengths, strip
 * control characters, validate roles, and require the transcript to end on
 * a user turn. Anything outside the clamp is truncated, not rejected, so a
 * long paste degrades gracefully instead of erroring.
 *
 * Outbound: the copy laws (no em-dashes, no en-dashes) are enforced
 * mechanically here as a hard guarantee on top of the prompt instruction,
 * because a model instruction alone is not a gate.
 */

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

function stripControlChars(s: string): string {
  // Keep \n and \t; drop the rest of C0/C1 plus zero-width characters that
  // are a common prompt-smuggling vector.
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    if (code === 0x0a || code === 0x09) {
      out += ch
      continue
    }
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue
    if (code === 0x200b || code === 0x200c || code === 0x200d || code === 0xfeff) continue
    out += ch
  }
  return out
}

export function sanitiseInboundText(raw: unknown, maxChars: number = INPUT_LIMITS.maxMessageChars): string {
  if (typeof raw !== 'string') return ''
  return stripControlChars(raw).slice(0, maxChars).trim()
}

/**
 * Validates and clamps a client-supplied transcript. Returns null when the
 * shape is unusable (wrong types, empty, does not end on a user message).
 */
export function sanitiseTranscript(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const clamped = raw.slice(-INPUT_LIMITS.maxHistoryMessages)
  const out: ChatMessage[] = []
  for (const item of clamped) {
    if (!item || typeof item !== 'object') return null
    const role = (item as { role?: unknown }).role
    if (role !== 'user' && role !== 'assistant') return null
    const content = sanitiseInboundText((item as { content?: unknown }).content)
    if (!content) continue
    out.push({ role, content })
  }
  if (out.length === 0) return null
  if (out[out.length - 1]!.role !== 'user') return null
  return out
}

/** Copy-law enforcement on model output: dashes become simple punctuation. */
export function enforceCopyLaws(text: string): string {
  return text
    .replace(/\s*—\s*/g, ' - ') // em-dash
    .replace(/\s*–\s*/g, ' - ') // en-dash
    .replace(/‑/g, '-') // non-breaking hyphen
}

/**
 * Wraps untrusted user-provided data (event drafts, context fields) in a
 * clearly delimited block so the system prompt can instruct the model to
 * treat the contents as data, never as instructions.
 */
export function asUntrustedBlock(label: string, value: string): string {
  // The delimiter is spelled out to the model in the shared guardrails.
  return `<untrusted_${label}>\n${value}\n</untrusted_${label}>`
}
