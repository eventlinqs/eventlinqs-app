import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import type { CreditedOrder, LinkEvent } from '@/lib/social/results'
import { readGrowthRows } from './weekly'
import { figuresFor, weekOf, type Rows, type Week } from './weekly-math'
import {
  buildSocialReport,
  PLATFORM_METRICS,
  PLATFORMS,
  type CampaignRow,
  type FigureRow,
  type PieceRow,
  type Platform,
  type PlatformMetric,
  type SocialReport,
  type WeekCounted,
} from './social-report-math'

/**
 * READING AND KEEPING THE WEEKLY CAMPAIGN'S REPORT (J16, J17, G1 to G5, K14; ./social-report-math.ts is the
 * arithmetic, pure and tested).
 *
 * READ: the campaigns and their pieces (window 3's tables, 20261028141001, read only here; a piece counts through its
 * own share_link_id, never by reading a link out of text), each piece's posting, the figures a person entered
 * (social_piece_figures), the rows behind a piece's own link (share_link_events, as ../social/store.ts readPosts
 * reads them), and for each campaign week the platform's own rows through
 * ./weekly.ts readGrowthRows, the reader the growth page uses, plus the presses out (/out) and the partner enquiries.
 *
 * WRITTEN: this file is the one writer of social_piece_figures and social_report_decisions (20261028151001). A
 * refusal comes back in the database's own words. A decision is written with the words and the evidence the server
 * computes now, never with words a browser sent.
 */

type Db = SupabaseClient

/** Campaigns shown: this many, newest first. */
const CAMPAIGNS_READ = 12
const SOCIAL_CHANNELS = new Set(['organic-social', 'paid-social'])

const iso = (at: string): string => new Date(at).toISOString()
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

export interface Decision {
  readonly rule: string
  readonly decision: 'approved' | 'declined'
  readonly recommendation: string
  readonly decidedAt: string
}

export interface SocialReportPage {
  readonly campaigns: readonly CampaignRow[]
  readonly report: SocialReport | null
  readonly decisions: readonly Decision[]
}

/** The counted figures of one campaign week, from the platform's own rows. */
export function countedFor(rows: Rows, w: Week, outbound: readonly string[], enquiries: readonly string[] | null): WeekCounted {
  const f = figuresFor(rows, w)
  const inWeek = (at: string) => at >= w.from && at < w.to
  const cityOf = new Map(rows.listings.map((l) => [l.id, l.city]))
  const social = rows.visits.filter((v) => inWeek(v.at) && SOCIAL_CHANNELS.has(v.channel))
  const socialByCity = new Map<string, Set<string>>()
  for (const v of social) {
    const city = cityOf.get(v.eventId)
    if (city === null || city === undefined) continue
    socialByCity.set(city, (socialByCity.get(city) ?? new Set()).add(v.visitor))
  }
  const liveByCity: Record<string, number> = {}
  for (const l of rows.listings) {
    if (l.isSeed || l.city === null || l.status !== 'published' || l.publishedAt === null || l.publishedAt >= w.to || l.startDate < w.to) continue
    liveByCity[l.city] = (liveByCity[l.city] ?? 0) + 1
  }
  return {
    visitors: f.attention.visitors,
    eventViews: f.attention.views,
    visitorsFromSocial: new Set(social.map((v) => v.visitor)).size,
    externalBookingClicks: outbound.filter(inWeek).length,
    nativeOrders: f.conversion.orders,
    nativeOrderCents: f.conversion.orderValueCents,
    subscriptions: f.engagement.subscribers,
    organiserEnquiries: enquiries === null ? null : enquiries.filter(inWeek).length,
    liveByCity,
    socialVisitorsByCity: Object.fromEntries([...socialByCity.entries()].map(([c, s]) => [c, s.size])),
  }
}

/**
 * The partner form's enquiries in the span, or null where the database has no partner_enquiries table (TEST before
 * 20261027140501): a count the database cannot give is shown as not counted, never as zero. Any other failure throws.
 */
async function readEnquiries(db: Db, spanFrom: string, spanTo: string): Promise<{ created_at: string }[] | null> {
  try {
    return await readEveryRow<{ created_at: string }>('the organiser enquiries for the social report', (from, to) =>
      db.from('partner_enquiries').select('created_at').gte('created_at', spanFrom).lt('created_at', spanTo).order('id', { ascending: true }).range(from, to),
    )
  } catch (e) {
    if (e instanceof Error && /Could not find the table 'public\.partner_enquiries'/.test(e.message)) return null
    throw e
  }
}

type PieceSelect = {
  id: string
  campaign_id: string
  kind: string
  city: string
  audience: string
  objective: string
  outcome: string
  link: string
  partner_name: string | null
  /** The partner kit's own share link (window 3, agreed 15:06): set only where the piece has a link that counts. */
  share_link_id: string | null
  social_piece_postings: { post_url: string; posted_at: string } | { post_url: string; posted_at: string }[] | null
}

/** The report for one campaign (the newest when none is named), the campaigns to choose from, and its decisions. */
export async function readSocialReport(db: Db, input: { readonly campaignId: string | null; readonly now: Date }): Promise<SocialReportPage> {
  const { data: cs, error: cerr } = await db.from('social_campaigns').select('id, week_start').order('week_start', { ascending: false }).limit(CAMPAIGNS_READ)
  if (cerr) throw new Error(`the campaigns could not be read: ${cerr.message}`)
  const campaigns: CampaignRow[] = (cs ?? []).map((c) => ({ id: c.id as string, weekStart: c.week_start as string }))
  const chosen = input.campaignId === null ? campaigns[0] : campaigns.find((c) => c.id === input.campaignId)
  if (chosen === undefined) return { campaigns, report: null, decisions: [] }

  const ids = campaigns.map((c) => c.id)
  const { data: ps, error: perr } = await db
    .from('social_pieces')
    .select('id, campaign_id, kind, city, audience, objective, outcome, link, partner_name, share_link_id, social_piece_postings(post_url, posted_at)')
    .in('campaign_id', ids)
    .order('id', { ascending: true })
    .limit(2000)
  if (perr) throw new Error(`the pieces could not be read: ${perr.message}`)
  const raw = (ps ?? []) as unknown as PieceSelect[]

  const pieces: PieceRow[] = raw.map((p) => {
    const went = one(p.social_piece_postings)
    return {
      id: p.id,
      campaignId: p.campaign_id,
      kind: p.kind,
      city: p.city,
      audience: p.audience,
      objective: p.objective,
      outcome: p.outcome,
      link: p.link,
      partnerName: p.partner_name,
      postedAt: went === null ? null : iso(went.posted_at),
      postUrl: went?.post_url ?? null,
      countedLinkId: p.share_link_id,
    }
  })

  const pieceIds = pieces.map((p) => p.id)
  const figures: FigureRow[] = []
  if (pieceIds.length > 0) {
    const rows = await readEveryRow<{ piece_id: string; platform: Platform; metric: PlatformMetric; value: number; read_at: string; entered_at: string }>(
      'the entered platform figures for the social report',
      (from, to) =>
        db.from('social_piece_figures').select('piece_id, platform, metric, value, read_at, entered_at').in('piece_id', pieceIds).order('id', { ascending: true }).range(from, to),
    )
    for (const f of rows) figures.push({ pieceId: f.piece_id, platform: f.platform, metric: f.metric, value: Number(f.value), readAt: iso(f.read_at), enteredAt: iso(f.entered_at) })
  }

  const linkIds = [...new Set(pieces.map((p) => p.countedLinkId).filter((v): v is string => v !== null))]
  const linkEvents: LinkEvent[] = []
  const orders = new Map<string, CreditedOrder>()
  if (linkIds.length > 0) {
    const ev = await readEveryRow<{ link_id: string; kind: LinkEvent['kind']; order_id: string | null; occurred_at: string }>('the pieces\' own counted rows', (from, to) =>
      db.from('share_link_events').select('link_id, kind, order_id, occurred_at').eq('is_test', false).in('link_id', linkIds).in('kind', ['click', 'outbound', 'conversion']).order('id', { ascending: true }).range(from, to),
    )
    for (const e of ev) linkEvents.push({ linkId: e.link_id, kind: e.kind, orderId: e.order_id, occurredAt: iso(e.occurred_at) })
    const orderIds = [...new Set(linkEvents.filter((e) => e.kind === 'conversion' && e.orderId !== null).map((e) => e.orderId as string))]
    if (orderIds.length > 0) {
      const { data: os, error: oerr } = await db.from('orders').select('id, status, total_cents, tickets(id)').in('id', orderIds).limit(5000)
      if (oerr) throw new Error(`the orders could not be read: ${oerr.message}`)
      for (const o of os ?? []) orders.set(o.id as string, { id: o.id as string, status: o.status as string, totalCents: Number(o.total_cents ?? 0), tickets: ((o.tickets as unknown[] | null) ?? []).length })
    }
  }

  /* The counted weeks: only those that have begun, so a week still to come is not counted, and shows as not counted. */
  const begun = campaigns.map((c) => ({ c, w: weekOf(c.weekStart) })).filter(({ w }) => w.from <= input.now.toISOString())
  const counted = new Map<string, WeekCounted>()
  if (begun.length > 0) {
    const spanFrom = begun.map(({ w }) => w.from).sort()[0]
    const spanTo = begun.map(({ w }) => w.to).sort().reverse()[0]
    const [{ rows }, outbound, enquiries] = await Promise.all([
      readGrowthRows(spanFrom, spanTo),
      readEveryRow<{ occurred_at: string }>('the presses out for the social report', (from, to) =>
        db.from('share_link_events').select('occurred_at').eq('is_test', false).eq('kind', 'outbound').gte('occurred_at', spanFrom).lt('occurred_at', spanTo).order('id', { ascending: true }).range(from, to),
      ),
      readEnquiries(db, spanFrom, spanTo),
    ])
    const out = outbound.map((o) => iso(o.occurred_at))
    const enq = enquiries === null ? null : enquiries.map((e) => iso(e.created_at))
    for (const { c, w } of begun) counted.set(c.id, countedFor(rows, w, out, enq))
  }

  const report = buildSocialReport({ campaignId: chosen.id, campaigns, pieces, figures, linkEvents, orders, counted, now: input.now })

  const { data: ds, error: derr } = await db.from('social_report_decisions').select('rule, decision, recommendation, decided_at').eq('campaign_id', chosen.id).order('decided_at', { ascending: true }).limit(50)
  if (derr) throw new Error(`the decisions could not be read: ${derr.message}`)
  const decisions: Decision[] = (ds ?? []).map((d) => ({ rule: d.rule as string, decision: d.decision as Decision['decision'], recommendation: d.recommendation as string, decidedAt: iso(d.decided_at as string) }))

  return { campaigns, report, decisions }
}

export type WriteResult = { readonly state: 'kept' } | { readonly state: 'refused'; readonly reason: string }

/** The database's refusal in its own words, without its prefix. */
function refusal(message: string): string {
  const m = /refused: (.+)$/.exec(message)
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : `That could not be kept: ${message}`
}

/** J16: one platform figure for a piece that went, as a person read it in the app. */
/**
 * The newest Instagram reach a person entered for any of these pieces, or null: for the organiser's report after a
 * night (src/lib/growth/organiser-report.ts), which says it as Instagram's own figure, apart from every count (K14).
 * Read here so this file stays the one reader of social_piece_figures.
 */
export async function newestEnteredReach(db: Db, pieceIds: readonly string[]): Promise<{ value: number; readAt: string } | null> {
  if (pieceIds.length === 0) return null
  const { data, error } = await db
    .from('social_piece_figures')
    .select('value, read_at')
    .in('piece_id', [...pieceIds])
    .eq('platform', 'instagram')
    .eq('metric', 'reach')
    .order('read_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`the entered Instagram reach: ${error.message}`)
  const row = (data ?? [])[0] as { value: number | string; read_at: string } | undefined
  return row ? { value: Number(row.value), readAt: row.read_at } : null
}

export async function enterPieceFigure(
  db: Db,
  input: { readonly pieceId: string; readonly platform: Platform; readonly metric: PlatformMetric; readonly value: number; readonly readAt: Date; readonly by: string },
): Promise<WriteResult> {
  if (!PLATFORMS.includes(input.platform) || !PLATFORM_METRICS.includes(input.metric)) return { state: 'refused', reason: 'That figure is not one the platforms report.' }
  if (!Number.isInteger(input.value) || input.value < 0) return { state: 'refused', reason: 'A figure is a whole number, zero or more.' }
  const { error } = await db.from('social_piece_figures').insert({
    piece_id: input.pieceId,
    platform: input.platform,
    metric: input.metric,
    value: input.value,
    read_at: input.readAt.toISOString(),
    entered_by: input.by,
  })
  return error ? { state: 'refused', reason: refusal(error.message) } : { state: 'kept' }
}

/** G4: a person's answer to one recommendation of a campaign's report, with the words and evidence shown now. */
export async function decideRecommendation(
  db: Db,
  input: { readonly campaignId: string; readonly rule: string; readonly decision: 'approved' | 'declined'; readonly by: string; readonly now: Date },
): Promise<WriteResult> {
  const { report } = await readSocialReport(db, { campaignId: input.campaignId, now: input.now })
  const rec = report?.recommendations.find((r) => r.rule === input.rule)
  if (rec === undefined) return { state: 'refused', reason: 'That recommendation is not in this week\'s report any more. Read the report again.' }
  const { error } = await db.from('social_report_decisions').insert({
    campaign_id: input.campaignId,
    rule: rec.rule,
    recommendation: rec.words,
    evidence: rec.evidence,
    decision: input.decision,
    decided_by: input.by,
  })
  if (error?.code === '23505') return { state: 'refused', reason: 'This recommendation has been answered already.' }
  return error ? { state: 'refused', reason: refusal(error.message) } : { state: 'kept' }
}
