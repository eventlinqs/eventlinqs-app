import { NextResponse } from 'next/server'
import { isAiConfigured } from '@/lib/ai/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ai/status - is the assistant layer switched on for this deploy?
 *
 * The in-context guidance asks this before it offers an "ask a question"
 * affordance, so a deploy without an API key shows the written guides instead
 * of a control that would fail. It returns one boolean and nothing else: no
 * key, no model, no budget, no error detail, so it leaks nothing about the
 * configuration either way.
 *
 * It is also the answer to "is it on yet": hit /api/ai/status on any
 * environment and the response is the truth for that environment.
 */
export async function GET() {
  return NextResponse.json(
    { enabled: isAiConfigured() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
