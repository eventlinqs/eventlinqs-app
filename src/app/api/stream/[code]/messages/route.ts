import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveStreamAccess, type StreamAccessResult } from '@/lib/stream/access'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { captureException } from '@/lib/observability/sentry'

/*
 * THE ROOM'S ONE DOOR (Scope v5, 3.11): chat, questions and reactions for a
 * livestream ticket holder.
 *
 * Auth model: BEARER, exactly as /t/[code] and /api/tickets/[code]/qr. The
 * (ticket_code, secret) pair IS the credential. On every call, GET or POST,
 * resolveStreamAccess verifies the pair, the ticket status, the tier's access
 * mode against the event type, and the viewer's country against the
 * organiser's allow-list, and only then is the service role used to read or
 * write stream_messages. A missing ticket and a wrong secret are both a 404 so
 * the address is not an oracle; every other refusal is a 403 with its reason.
 *
 * Rate limit: 'stream-message', keyed by the TICKET ID (see the policy's
 * rationale), applied after the gate because the bucket cannot be named before
 * the ticket is.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KINDS = new Set(['chat', 'question', 'reaction'])
const REACTION_KEYS = new Set(['fire', 'heart', 'clap', 'laugh'])
const MAX_BODY = 500
const PAGE = 200

type MessageRow = {
  id: string
  ticket_id: string | null
  author_kind: string
  author_name: string
  kind: string
  body: string
  answer_body: string | null
  answered_at: string | null
  created_at: string
}

async function gate(request: NextRequest, code: string): Promise<{ admin: ReturnType<typeof createAdminClient>; access: StreamAccessResult }> {
  const secret = request.nextUrl.searchParams.get('k')
  const country = request.headers.get('x-vercel-ip-country')
  const admin = createAdminClient()
  const access = await resolveStreamAccess(admin, code, secret, country)
  return { admin, access }
}

function refuse(access: Extract<StreamAccessResult, { ok: false }>): NextResponse {
  if (access.reason === 'not_found' || access.reason === 'wrong_secret') {
    return new NextResponse('Not found', { status: 404 })
  }
  return NextResponse.json(
    { ok: false, reason: access.reason, message: 'This room is not open to your ticket.' },
    { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!code) return new NextResponse('Not found', { status: 404 })
  const { admin, access } = await gate(request, code)
  if (!access.ok) return refuse(access)

  const { data, error } = await admin
    .from('stream_messages')
    .select('id, ticket_id, author_kind, author_name, kind, body, answer_body, answered_at, created_at')
    .eq('event_id', access.room.eventId)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(PAGE)
  if (error) {
    captureException(error, { where: 'api/stream/messages:GET', eventId: access.room.eventId })
    return NextResponse.json({ ok: false, message: 'The room could not be read.' }, { status: 500 })
  }

  const rows = (data ?? []) as MessageRow[]
  const reactions: Record<string, number> = {}
  const messages = []
  for (const r of rows.slice().reverse()) {
    if (r.kind === 'reaction') {
      reactions[r.body] = (reactions[r.body] ?? 0) + 1
      continue
    }
    messages.push({
      id: r.id,
      kind: r.kind,
      authorKind: r.author_kind,
      authorName: r.author_name,
      body: r.body,
      answerBody: r.answer_body,
      answeredAt: r.answered_at,
      createdAt: r.created_at,
      mine: r.ticket_id === access.room.ticketId,
    })
  }

  return NextResponse.json(
    { ok: true, now: new Date().toISOString(), messages, reactions },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!code) return new NextResponse('Not found', { status: 404 })
  const { admin, access } = await gate(request, code)
  if (!access.ok) return refuse(access)

  const blocked = await applyRateLimit('stream-message', request, `t:${access.room.ticketId}`)
  if (blocked) return blocked

  let payload: { kind?: unknown; body?: unknown } = {}
  try {
    payload = (await request.json()) as { kind?: unknown; body?: unknown }
  } catch {
    // A body that is not JSON is a client mistake, answered below as invalid.
    payload = {}
  }
  const kind = typeof payload.kind === 'string' ? payload.kind : ''
  const body = typeof payload.body === 'string' ? payload.body.trim() : ''
  if (!KINDS.has(kind)) {
    return NextResponse.json({ ok: false, message: 'Say something, ask a question, or react.' }, { status: 400 })
  }
  if (kind === 'reaction' && !REACTION_KEYS.has(body)) {
    return NextResponse.json({ ok: false, message: 'That reaction is not one of the four offered.' }, { status: 400 })
  }
  if (kind !== 'reaction' && (body.length === 0 || body.length > MAX_BODY)) {
    return NextResponse.json({ ok: false, message: `Write between 1 and ${MAX_BODY} characters.` }, { status: 400 })
  }

  const { data, error } = await admin
    .from('stream_messages')
    .insert({
      event_id: access.room.eventId,
      ticket_id: access.room.ticketId,
      author_kind: 'attendee',
      author_name: access.room.holderName.slice(0, 80),
      kind,
      body,
    })
    .select('id, created_at')
    .single()
  if (error || !data) {
    captureException(error ?? new Error('stream message insert returned no row'), {
      where: 'api/stream/messages:POST',
      eventId: access.room.eventId,
    })
    return NextResponse.json({ ok: false, message: 'That could not be posted. Try again.' }, { status: 500 })
  }

  return NextResponse.json(
    { ok: true, message: { id: data.id, kind, body, createdAt: data.created_at } },
    { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
