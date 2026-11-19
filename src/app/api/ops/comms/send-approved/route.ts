import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { graphConfigFromEnv } from '@/lib/outreach/graph'
import { sendApprovedDraft } from '@/lib/outreach/send-approved'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * THE PLATFORM SENDS AN APPROVED DRAFT (the PM's 11:55 of 19 November 2026; src/lib/outreach/send-approved.ts).
 *
 * POST { id: <the draft's Graph id> }, authed with CRON_SECRET like every machine call here: the comms workflow that
 * holds the secret (.github/workflows/comms-send-approved.yml) calls it once the gateway has cleared the draft and its
 * approval is recorded. It sends the draft from the outreach mailbox the sender itself uses (outreach_sender), and only
 * when an approval record names it and its words are the cleared ones. It answers with the state and the ids, never the
 * words of the letter: the workflow's log is public.
 */
export async function POST(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  let id = ''
  try {
    const body = (await request.json()) as { id?: unknown }
    id = typeof body.id === 'string' ? body.id.trim() : ''
  } catch {
    return NextResponse.json({ ok: false, state: 'refused', reason: 'the request was not JSON with an id' }, { status: 400 })
  }
  if (!/^[A-Za-z0-9+/=_-]{10,512}$/.test(id)) return NextResponse.json({ ok: false, state: 'refused', reason: 'no draft id' }, { status: 400 })

  const db = createAdminClient()
  const sender = await db.from('outreach_sender').select('from_address').eq('id', true).single()
  if (sender.error) return NextResponse.json({ ok: false, state: 'refused', reason: `the sender could not be read: ${sender.error.message}` }, { status: 500 })
  const graph = graphConfigFromEnv(sender.data.from_address as string)
  if (!graph) return NextResponse.json({ ok: false, state: 'refused', reason: 'Graph is not configured on this deployment' }, { status: 503 })

  const answer = await sendApprovedDraft(db, graph, id)
  return NextResponse.json({ ok: answer.state === 'sent', ...answer }, { status: answer.state === 'sent' ? 200 : 409 })
}
