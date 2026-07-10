import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { clientIp } from '@/lib/redis/rate-limit'
import { getAssistant, type AssistantContext } from '@/lib/ai/assistants'
import { runAssistant } from '@/lib/ai/service'
import { sendHandoffEmail } from '@/lib/ai/handoff'
import { hashIdentity, logAi } from '@/lib/ai/logging'
import {
  asUntrustedBlock,
  sanitiseInboundText,
  sanitiseTranscript,
  type ChatMessage,
} from '@/lib/ai/sanitise'
import { INPUT_LIMITS } from '@/lib/ai/config'
import { getLivePublicFee } from '@/lib/pricing/live-fee'

/**
 * POST /api/ai/chat - the single entry point for every platform assistant.
 *
 * Safety posture:
 * - The client sends an assistant id, a transcript, and (for the event
 *   helper) draft fields. It can NEVER send prompt or system text; prompts
 *   are locked server-side in src/lib/ai/assistants.ts.
 * - Per-identity rate limits (minute + daily) run before any token is
 *   spent, on top of the platform-wide monthly cost guard.
 * - Assistant context (organisation state, ticket state, category list) is
 *   derived server-side from the authenticated session, never trusted from
 *   the request body.
 * - No assistant has any tool or code path that reads or writes the
 *   database; the model only ever produces text.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type ChatRequestBody = {
  assistant?: unknown
  messages?: unknown
  draft?: { title?: unknown; description?: unknown }
  userEmail?: unknown
}

export async function POST(request: Request) {
  let body: ChatRequestBody
  try {
    body = (await request.json()) as ChatRequestBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const assistant = getAssistant(body.assistant)
  if (!assistant) {
    return NextResponse.json({ ok: false, error: 'unknown_assistant' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (assistant.requiresAuth && !user) {
    return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401 })
  }

  const identity = user?.id ?? clientIp(request)
  const who = hashIdentity(identity)

  // Two throttles: burst (per minute) and daily abuse cap.
  const blockedMinute = await applyRateLimit('ai-chat', request, identity)
  if (blockedMinute) {
    logAi({ evt: 'ai.blocked', assistant: assistant.id, who, reason: 'rate_limited' })
    return blockedMinute
  }
  const blockedDaily = await applyRateLimit('ai-chat-daily', request, identity)
  if (blockedDaily) {
    logAi({ evt: 'ai.blocked', assistant: assistant.id, who, reason: 'rate_limited' })
    return blockedDaily
  }

  const transcript = sanitiseTranscript(body.messages)
  if (!transcript) {
    return NextResponse.json({ ok: false, error: 'invalid_messages' }, { status: 400 })
  }

  // Server-derived context. Nothing here comes from the request body except
  // the event-helper draft fields, which are clamped and wrapped as
  // untrusted data below.
  const context: AssistantContext = {}
  const messages: ChatMessage[] = [...transcript]

  if (assistant.id === 'support') {
    const fee = await getLivePublicFee()
    context.feeLabel = fee.label
  }

  if (user && (assistant.id === 'organiser-onboarding' || assistant.id === 'buyer-onboarding')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
    const first = profile?.full_name?.split(' ')[0]
    if (first) context.firstName = sanitiseInboundText(first, 40)
  }

  if (user && assistant.id === 'organiser-onboarding') {
    const { data: org } = await supabase
      .from('organisations')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()
    context.hasOrganisation = Boolean(org)
    if (org) {
      const { count } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', org.id)
      context.eventCount = count ?? 0
    }
  }

  if (assistant.id === 'buyer-onboarding') {
    if (user) {
      const { count } = await supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', user.id)
      context.hasTickets = (count ?? 0) > 0
    } else {
      context.hasTickets = false
    }
  }

  if (assistant.id === 'event-helper') {
    const { data: categories } = await supabase
      .from('event_categories')
      .select('name')
      .eq('is_active', true)
      .order('sort_order')
    context.categoryNames = (categories ?? []).map(c => c.name)

    const draftTitle = sanitiseInboundText(body.draft?.title, 200)
    const draftDescription = sanitiseInboundText(
      body.draft?.description,
      INPUT_LIMITS.maxContextFieldChars
    )
    if (draftTitle || draftDescription) {
      const blocks = [
        draftTitle ? asUntrustedBlock('draft_title', draftTitle) : '',
        draftDescription ? asUntrustedBlock('draft_description', draftDescription) : '',
      ]
        .filter(Boolean)
        .join('\n')
      // Prepended as a user turn (the API merges consecutive same-role
      // messages) so untrusted draft data never enters the system prompt.
      messages.unshift({ role: 'user', content: `Current event draft for reference:\n${blocks}` })
    }
  }

  const result = await runAssistant({ assistant, context, transcript: messages, who })

  if (!result.ok) {
    if (result.reason === 'refused') {
      return NextResponse.json({
        ok: true,
        reply:
          'I am not able to help with that request. If you have a question about EventLinqs, tickets, or your event, I am happy to help with that.',
        handoff: false,
        handoffSent: false,
        suggestions: [],
      })
    }
    const status = result.reason === 'upstream_error' ? 502 : 503
    return NextResponse.json(
      {
        ok: false,
        error: result.reason,
        message:
          result.reason === 'unconfigured'
            ? 'The assistant is not available yet. Please use the contact form and our team will help.'
            : result.reason === 'budget_exhausted'
              ? 'The assistant is taking a break right now. Please use the contact form and our team will help.'
              : 'The assistant could not respond just now. Please try again in a moment.',
      },
      { status }
    )
  }

  let handoffSent = false
  if (result.handoff) {
    const providedEmail = sanitiseInboundText(body.userEmail, 254)
    const userEmail = user?.email ?? (EMAIL_RE.test(providedEmail) ? providedEmail : null)
    handoffSent = await sendHandoffEmail({
      assistant: assistant.id,
      transcript: [...transcript, { role: 'assistant', content: result.reply }],
      userEmail,
      who,
    })
  }

  return NextResponse.json({
    ok: true,
    reply: result.reply,
    handoff: result.handoff,
    handoffSent,
    suggestions: result.suggestions,
  })
}
