import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { clientIp } from '@/lib/redis/rate-limit'
import { hashIdentity, logAi } from '@/lib/ai/logging'
import { sanitiseInboundText } from '@/lib/ai/sanitise'
import { extractEventDraft } from '@/lib/ai/magic-start'
import { isFlagEnabled } from '@/lib/flags'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/ai/magic-start - one description becomes an editable event draft.
 *
 * Same safety spine as /api/ai/chat: organiser-authenticated, the per-minute
 * and per-day AI rate limits run before any token is spent, the monthly cost
 * guard sits inside extractEventDraft, and the category list is derived
 * server-side (never trusted from the body). The client sends only its free
 * description text, which is sanitised and passed as untrusted data. The
 * result is a draft the wizard prefills; nothing is written or published.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!(await isFlagEnabled('magic_start'))) {
    return NextResponse.json({ ok: false, error: 'feature_off' }, { status: 404 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401 })
  }

  const identity = user.id
  const who = hashIdentity(identity)

  const blockedMinute = await applyRateLimit('ai-chat', request, identity)
  if (blockedMinute) {
    logAi({ evt: 'ai.blocked', assistant: 'magic-start', who, reason: 'rate_limited' })
    return blockedMinute
  }
  const blockedDaily = await applyRateLimit('ai-chat-daily', request, identity)
  if (blockedDaily) {
    logAi({ evt: 'ai.blocked', assistant: 'magic-start', who, reason: 'rate_limited' })
    return blockedDaily
  }

  let body: { description?: unknown }
  try {
    body = (await request.json()) as { description?: unknown }
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  // Untrusted free text: sanitise + clamp (the description can be a couple of
  // sentences of speech, so a slightly larger clamp than a chat turn).
  const description = sanitiseInboundText(body.description, 2000)
  if (description.length < 12) {
    return NextResponse.json({ ok: false, error: 'too_short' }, { status: 400 })
  }

  // Live category names, server-derived from the events schema.
  const admin = createAdminClient()
  const { data: cats } = await admin
    .from('event_categories')
    .select('name')
    .eq('is_active', true)
    .order('sort_order')
  const categoryNames = (cats ?? []).map(c => c.name).filter((n): n is string => !!n)

  const result = await extractEventDraft({
    description,
    categoryNames,
    nowIso: new Date().toISOString(),
    who,
  })

  if (!result.ok) {
    const status = result.reason === 'unconfigured' ? 503 : result.reason === 'budget_exhausted' ? 429 : 502
    return NextResponse.json({ ok: false, error: result.reason }, { status })
  }

  return NextResponse.json({ ok: true, draft: result.draft })
}
