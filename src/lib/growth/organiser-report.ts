import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { readWalkInNumbers } from '@/lib/walk-in/organiser-numbers'
import { fetchReachSummary } from '@/lib/broadcast/reach'
import {
  nightFigures,
  nightsDue,
  REPORT_AFTER_HOURS,
  REPORT_LOOKBACK_DAYS,
  type EndedNight,
  type NightFigures,
  type NightPost,
  type NightRows,
} from './organiser-report-math'

/**
 * The rows behind each organiser's report after a night, and the hourly sweep that keeps it (the rules and why are in
 * ./organiser-report-math.ts). Written once per night into organiser_night_reports (20261028203001), held for Lawal:
 * nothing here sends an email or posts anything.
 */

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** A run reports at most this many nights; the next hour takes the rest. */
const NIGHTS_PER_RUN = 40

type Admin = ReturnType<typeof createAdminClient>

/** Each night that ended inside the lookback, public or not, so the pure rule decides. */
async function endedNights(admin: Admin, now: Date): Promise<EndedNight[]> {
  const from = new Date(now.getTime() - REPORT_LOOKBACK_DAYS * DAY_MS).toISOString()
  const to = new Date(now.getTime() - REPORT_AFTER_HOURS * HOUR_MS).toISOString()
  const [all, published] = await Promise.all([
    readEveryRow<{ id: string; organisation_id: string; end_date: string; is_seed_data: boolean | null }>('the nights that ended', (f, t) =>
      admin.from('events').select('id, organisation_id, end_date, is_seed_data').gte('end_date', from).lte('end_date', to).order('id', { ascending: true }).range(f, t),
    ),
    // Published and public as the night ended. The listing window is not applied: an ended night is outside it by definition.
    readEveryRow<{ id: string }>('the public nights that ended', (f, t) =>
      admin.from('events').select('id').match(PUBLIC_EVENT_MATCH).gte('end_date', from).lte('end_date', to).order('id', { ascending: true }).range(f, t),
    ),
  ])
  const isPublic = new Set(published.map((p) => p.id))
  return all.map((e) => ({ id: e.id, organisationId: e.organisation_id, endDate: e.end_date, isPublic: isPublic.has(e.id), isSeed: e.is_seed_data === true }))
}

/** Everything one night's report keeps: item 20's own figures as it reads them, then what this adds. */
export async function readNightRows(night: { id: string; endDate: string }, admin: Admin = createAdminClient()): Promise<NightRows> {
  const [numbers, reach] = await Promise.all([readWalkInNumbers(night.id), fetchReachSummary(night.id)])

  const links = await readOrThrow('the night share links', () => admin.from('share_links').select('id').eq('event_id', night.id).limit(500))
  const linkIds = (links ?? []).map((l) => l.id)
  const pressRows =
    linkIds.length === 0
      ? []
      : await readEveryRow<{ id: string; visitor_hash: string | null; provider: string | null }>('the night presses out', (f, t) =>
          admin.from('share_link_events').select('id, visitor_hash, provider').in('link_id', linkIds).eq('kind', 'outbound').order('id', { ascending: true }).range(f, t),
        )

  const tiers = await readOrThrow('the night ticket types', () => admin.from('ticket_tiers').select('id').eq('event_id', night.id).limit(1))
  let orders: NightRows['orders'] = null
  if ((tiers ?? []).length > 0) {
    const rows = await readEveryRow<{ status: string; tickets: { id: string }[] | null }>('the night orders', (f, t) =>
      admin.from('orders').select('status, tickets(id)').eq('event_id', night.id).order('id', { ascending: true }).range(f, t),
    )
    orders = rows.map((o) => ({ status: o.status, tickets: Array.isArray(o.tickets) ? o.tickets.length : 0 }))
  }

  return {
    numbers,
    reach: { totals: { views: reach.totals.views, clicks: reach.totals.clicks }, byChannel: reach.byChannel.map((c) => ({ channel: c.channel, views: c.views, clicks: c.clicks })) },
    presses: pressRows.map((p) => ({ visitor: p.visitor_hash, rowId: p.id, provider: p.provider })),
    orders,
    posts: await postsNaming(admin, night),
  }
}

/** The posts whose approved revision named the night and that went to a platform before it ended, with their /go presses. */
async function postsNaming(admin: Admin, night: { id: string; endDate: string }): Promise<NightPost[]> {
  const revisions = await readOrThrow('the revisions naming the night', () =>
    admin.from('social_piece_revisions').select('piece_id, version, event_ids').contains('event_ids', [night.id]).limit(200),
  )
  const pieceIds = [...new Set((revisions ?? []).map((r) => r.piece_id))]
  if (pieceIds.length === 0) return []
  const postings = await readOrThrow('the postings of those pieces', () =>
    admin.from('social_piece_postings').select('piece_id, post_url, posted_at, social_piece_approvals(revision)').in('piece_id', pieceIds).neq('post_url', 'sent').lte('posted_at', night.endDate),
  )
  const posts: NightPost[] = []
  for (const p of postings ?? []) {
    const approval = Array.isArray(p.social_piece_approvals) ? p.social_piece_approvals[0] : p.social_piece_approvals
    const rev = (revisions ?? []).find((r) => r.piece_id === p.piece_id && r.version === approval?.revision)
    if (!rev) continue
    const { count, error } = await admin.from('go_presses').select('id', { count: 'exact', head: true }).eq('piece_id', p.piece_id).lte('pressed_at', night.endDate)
    if (error) throw new Error(`the posts /go presses: ${error.message}`)
    posts.push({
      pieceId: p.piece_id,
      platform: /facebook\.com|fb\.com/i.test(p.post_url) ? 'facebook' : 'instagram',
      postUrl: p.post_url,
      postedAt: p.posted_at,
      nightsNamed: (rev.event_ids ?? []).length,
      goPresses: count ?? 0,
    })
  }
  return posts
}

export interface SweepSummary {
  readonly due: number
  readonly written: number
  readonly failed: number
}

/** The hourly sweep: each night owed a report gets one, written once; a night that fails is tried again next hour. */
export async function runOrganiserReports(now: Date = new Date()): Promise<SweepSummary> {
  const admin = createAdminClient()
  const nights = await endedNights(admin, now)
  const ids = nights.map((n) => n.id)
  const reported = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const rows = await readOrThrow('the nights already reported', () => admin.from('organiser_night_reports').select('event_id').in('event_id', ids.slice(i, i + 200)))
    for (const r of rows ?? []) reported.add(r.event_id)
  }
  const due = nightsDue(nights, reported, now)
  let written = 0
  let failed = 0
  for (const night of due.slice(0, NIGHTS_PER_RUN)) {
    try {
      const figures = nightFigures(await readNightRows(night, admin))
      const { error } = await admin
        .from('organiser_night_reports')
        .upsert(
          { event_id: night.id, organisation_id: night.organisationId, figures: figures as unknown as NightFiguresJson, night_ended_at: night.endDate, read_at: now.toISOString() },
          { onConflict: 'event_id', ignoreDuplicates: true },
        )
      if (error) throw new Error(error.message)
      written += 1
    } catch (err) {
      failed += 1
      console.warn(`[organiser-reports] night ${night.id} not reported this hour`, err instanceof Error ? err.message : String(err))
    }
  }
  return { due: due.length, written, failed }
}

type NightFiguresJson = Record<string, unknown>

/** A night's kept report, for its organiser's dashboard and for /admin/today. */
export async function readNightReport(eventId: string): Promise<{ figures: NightFigures; readAt: string; sentAt: string | null } | null> {
  const row = await readOrThrow('the night report', () =>
    createAdminClient().from('organiser_night_reports').select('figures, read_at, sent_at').eq('event_id', eventId).maybeSingle(),
  )
  return row ? { figures: row.figures as unknown as NightFigures, readAt: row.read_at, sentAt: row.sent_at } : null
}
