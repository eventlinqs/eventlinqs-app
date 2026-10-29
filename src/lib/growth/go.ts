import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { isPreviewCrawler } from '@/lib/broadcast/crawler'
import { visitorHash } from '@/lib/broadcast/share-links'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { liveGoLinks, pressDay, type GoLink, type GoNight, type GoPieceRow, type GoVia } from './go-math'

/**
 * The rows behind /go and its hop (the rules and why are in ./go-math.ts). Read live on every request: an event row is
 * never cached (public-visibility.ts), and a piece leaves the page the minute its last night ends.
 */

/** How far back a posting is read: a weekly campaign's nights are at most a few weeks ahead of its post. */
const POSTINGS_READ_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

type Versions = { instagram?: { hook?: unknown } }

export async function readGoLinks(now: Date = new Date()): Promise<GoLink[]> {
  const admin = createAdminClient()
  const since = new Date(now.getTime() - POSTINGS_READ_DAYS * DAY_MS).toISOString()
  const postings = await readOrThrow('the postings for /go', () =>
    admin
      .from('social_piece_postings')
      .select('piece_id, post_url, posted_at, social_piece_approvals(revision), social_pieces(id, kind, city, link)')
      .gte('posted_at', since)
      .neq('post_url', 'sent')
      .order('posted_at', { ascending: false })
      .limit(200),
  )
  const rows = (postings ?? []).flatMap((p) => {
    const approval = Array.isArray(p.social_piece_approvals) ? p.social_piece_approvals[0] : p.social_piece_approvals
    const sp = Array.isArray(p.social_pieces) ? p.social_pieces[0] : p.social_pieces
    return approval && sp ? [{ pieceId: p.piece_id, revision: approval.revision, postUrl: p.post_url, postedAt: p.posted_at, piece: sp }] : []
  })
  if (rows.length === 0) return []

  const revisions = await readOrThrow('the approved revisions for /go', () =>
    admin
      .from('social_piece_revisions')
      .select('piece_id, version, versions, event_ids')
      .in('piece_id', rows.map((r) => r.pieceId))
      .limit(2000),
  )
  const approved = new Map<string, { hook: string; nightIds: string[] }>()
  for (const r of rows) {
    const rev = (revisions ?? []).find((v) => v.piece_id === r.pieceId && v.version === r.revision)
    if (!rev) continue
    const hook = (rev.versions as Versions | null)?.instagram?.hook
    approved.set(r.pieceId, { hook: typeof hook === 'string' ? hook : '', nightIds: rev.event_ids ?? [] })
  }

  const nightIds = [...new Set([...approved.values()].flatMap((a) => a.nightIds))]
  const nights = new Map<string, GoNight>()
  if (nightIds.length > 0) {
    const all = await readOrThrow('the nights /go names', () =>
      admin.from('events').select('id, start_date, end_date, timezone').in('id', nightIds).limit(nightIds.length),
    )
    const visible = await readOrThrow('the public nights /go names', () =>
      applyPublicEventVisibility(admin.from('events').select('id').in('id', nightIds), { includeExternal: true }).limit(nightIds.length),
    )
    const isPublic = new Set((visible ?? []).map((v) => v.id))
    for (const e of all ?? []) nights.set(e.id, { id: e.id, startDate: e.start_date, endDate: e.end_date, timezone: e.timezone ?? null, isPublic: isPublic.has(e.id) })
  }

  const pieces: GoPieceRow[] = rows.flatMap((r) => {
    const a = approved.get(r.pieceId)
    return a
      ? [{ id: r.pieceId, kind: r.piece.kind, city: r.piece.city, link: r.piece.link, postUrl: r.postUrl, postedAt: r.postedAt, hook: a.hook, nightIds: a.nightIds }]
      : []
  })
  return liveGoLinks(pieces, nights, now)
}

/** The stored link of a piece that went to a platform, or null: the hop follows nothing else. */
export async function readGoPieceLink(pieceId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(pieceId)) return null
  const admin = createAdminClient()
  const row = await readOrThrow('the piece a /go press names', () =>
    admin
      .from('social_piece_postings')
      .select('post_url, social_pieces(link, kind)')
      .eq('piece_id', pieceId)
      .neq('post_url', 'sent')
      .limit(1)
      .maybeSingle(),
  )
  const sp = row ? (Array.isArray(row.social_pieces) ? row.social_pieces[0] : row.social_pieces) : null
  return sp && sp.kind !== 'partner_kit' ? sp.link : null
}

/** One press per visitor per piece per Melbourne day, never a crawler; a lost count never strands the visitor. */
export async function recordGoPress(input: { pieceId: string; via: GoVia; ip: string | null; userAgent: string | null; now?: Date }): Promise<boolean> {
  if (isPreviewCrawler(input.userAgent)) return false
  try {
    const now = input.now ?? new Date()
    const { error } = await createAdminClient()
      .from('go_presses')
      .upsert(
        { piece_id: input.pieceId, via: input.via, visitor: visitorHash(input.ip, input.userAgent), day: pressDay(now, PLATFORM_TIME_ZONE), pressed_at: now.toISOString() },
        { onConflict: 'piece_id,visitor,day', ignoreDuplicates: true },
      )
    if (error) throw new Error(error.message)
    return true
  } catch (err) {
    console.warn('[go] the press was not counted', err instanceof Error ? err.message : String(err))
    return false
  }
}
