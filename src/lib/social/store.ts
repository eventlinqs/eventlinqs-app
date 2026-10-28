import type { SupabaseClient } from '@supabase/supabase-js'
import { loadArtefactContext, toCaptionInput, type ArtefactContext } from '@/lib/broadcast/kit-artefacts'
import { generateShareCode, getOrCreateShareLink } from '@/lib/broadcast/share-links'
import { buildShortUrl } from '@/lib/broadcast/share-codes'
import { readBookingLinks } from '@/lib/events/booking-links-read'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { isLibraryPhoto } from '@/lib/listings/listing-photo'
import { CANONICAL_HOST } from '@/lib/site-url'
import { learn, type CadenceRule, type PostOutcome, type SocialFormat, type SocialPlatform } from './cadence'
import { factsOf, kitCaption, listingCta, listingPriceLabel, plan, postKey, PLAN_AHEAD_DAYS, type PlanCandidate } from './plan'
import { resultOf, type CreditedOrder, type LinkEvent, type PostResult } from './results'
import { wordsRefusal } from './words'
import { broadcastCta, broadcastPriceLabel, type BroadcastEvent } from '@/lib/broadcast/price-line'
import type { Cta } from '@/lib/events/cta'
import { creativeRefusals, hostOf, planCampaign, pieceRefusal, weekStartOf, whenOf, type Audience, type CampaignCity, type CampaignNight, type NightPick, type Objective, type PiecePlan, type Slide } from './campaign'

/**
 * THE SOCIAL ENGINE'S READS AND WRITES (item 11; docs/SOCIAL-ENGINE.md), through the service role. The one writer of
 * social_posts, social_drafts, social_approvals, social_postings and the learned rows of social_cadence_rules. The
 * database holds every rule again (20261027233001), so a refusal here is its answer, said in its own words.
 *
 * Posts link to production always (https://www.eventlinqs.com.au/e/<code>): a post is read on the real network.
 */

const ORIGIN = `https://${CANONICAL_HOST}`
const DAY_MS = 86_400_000
/** The kit's caption for a curated listing that names no price and no place it sells. */

type Db = SupabaseClient

function refusalOf(message: string): string | null {
  const at = message.indexOf('refused: ')
  if (at === -1) return null
  const said = message.slice(at + 'refused: '.length)
  return said.charAt(0).toUpperCase() + said.slice(1)
}

type TierRow = { total_capacity: number; sold_count: number; reserved_count: number; is_active: boolean }

/** Sold out as social_event_sold_out counts it: ticketed by its active tiers' places, a listing by its live links. */
export function soldOut(tiers: readonly TierRow[], links: readonly { availability: string }[]): boolean {
  const active = tiers.filter((t) => t.is_active)
  if (active.length > 0) return active.reduce((n, t) => n + Math.max(0, t.total_capacity - t.sold_count - t.reserved_count), 0) <= 0
  const live = links.filter((l) => l.availability !== 'dead')
  if (live.length > 0) return !live.some((l) => l.availability === 'on_sale' || l.availability === 'not_yet')
  return false
}

/** The events the planner may post now. */
export async function readCandidates(db: Db, now: Date): Promise<PlanCandidate[]> {
  /* What the public may see now (the one rule, src/lib/events/public-visibility.ts), listings sold elsewhere included. */
  const { data, error } = await applyPublicEventVisibility(
    db
      .from('events')
      .select('id, title, start_date, end_date, status, visibility, venue_city, cover_image_url, ticket_tiers(total_capacity, sold_count, reserved_count, is_active), event_booking_links(availability)'),
    { now, includeExternal: true },
  )
    .gt('end_date', now.toISOString())
    .lte('start_date', new Date(now.getTime() + PLAN_AHEAD_DAYS * DAY_MS).toISOString())
    .order('start_date', { ascending: true })
    .limit(400)
  if (error) throw new Error(`the week's events could not be read: ${error.message}`)
  return (data ?? []).map((e) => ({
    eventId: e.id as string,
    title: e.title as string,
    startDate: e.start_date as string,
    endDate: e.end_date as string,
    status: e.status as string,
    visibility: e.visibility as string,
    city: (e.venue_city as string | null) ?? null,
    hasPhoto: Boolean(e.cover_image_url),
    soldOut: soldOut((e.ticket_tiers as TierRow[] | null) ?? [], (e.event_booking_links as { availability: string }[] | null) ?? []),
  }))
}

/**
 * The Launch Kit's view of an event for a post: its own context, read with no links minted, and for a listing
 * EventLinqs does not ticket the price line its booking links say (the kit's own reads tiers alone).
 */
export async function contextFor(db: Db, eventId: string, now: Date): Promise<ArtefactContext | null> {
  const context = await loadArtefactContext(eventId, ORIGIN, null, 'EventLinqs', false)
  if (context === null) return null
  const { data: tiers } = await db.from('ticket_tiers').select('id').eq('event_id', eventId).eq('is_active', true).limit(1)
  if ((tiers ?? []).length > 0) return context
  const { data: free } = await db.from('events').select('is_free').eq('id', eventId).maybeSingle()
  const links = await readBookingLinks(eventId)
  const isFree = (free?.is_free as boolean | null) ?? null
  const cta = listingCta(links, isFree)
  /* An unknown price says none (the checklist's E5): the caption then points at the details, the card prints no price. */
  return { ...context, priceLabel: listingPriceLabel(links, isFree, now) ?? '', cta, listing: !cta.ticketingByEventLinqs }
}

export interface PostCard {
  readonly context: ArtefactContext
  readonly link: string
  readonly format: SocialFormat
  readonly platform: SocialPlatform
  /** Not ticketed here: the card says "Listed on EVENTLINQS" and "Scan for details", never "Scan to buy". */
  readonly listing: boolean
  /** The photograph is EventLinqs' licensed library shot, and the card says so at its foot. */
  readonly libraryPhoto: boolean
}

/**
 * One post's card (src/app/admin/(authed)/social/card/[postId]): the event's context and the post's own link. A
 * listing with no photo of its own carries the library shot for its category, as every listing night does (Lawal's
 * ruling of 27 October 2026, 08:33, src/lib/listings/listing-photo.ts), never text where a picture should be.
 */
export async function cardOf(db: Db, postId: string, now: Date): Promise<PostCard | null> {
  const { data: post } = await db.from('social_posts').select('event_id, link, format, platform').eq('id', postId).maybeSingle()
  if (!post) return null
  const context = await contextFor(db, post.event_id as string, now)
  if (context === null) return null
  const { data: tiers } = await db.from('ticket_tiers').select('id').eq('event_id', post.event_id as string).eq('is_active', true).limit(1)
  const listing = (tiers ?? []).length === 0
  /*
   * J1 to J4 (the release checklist, 28 October 2026): a photograph only through an approved rights row for this night,
   * scope social; a library or category photo never stands for a named night, and an event's own cover is not
   * permission by being there. With none the card is typographic.
   */
  const approved = (await usableImages(db, [post.event_id as string], now)).get(post.event_id as string)?.url ?? null
  const cover = approved && !isLibraryPhoto(approved) ? approved : null
  return {
    context: { ...context, coverImageUrl: cover },
    link: post.link as string,
    format: post.format as SocialFormat,
    platform: post.platform as SocialPlatform,
    listing,
    libraryPhoto: isLibraryPhoto(cover),
  }
}

async function plannedKeys(db: Db, eventIds: readonly string[]): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set()
  const { data, error } = await db.from('social_posts').select('event_id, platform, format').in('event_id', [...eventIds]).limit(2000)
  if (error) throw new Error(`the planned posts could not be read: ${error.message}`)
  return new Set((data ?? []).map((p) => postKey(p.event_id as string, p.platform as SocialPlatform, p.format as SocialFormat)))
}

export type Planned = { readonly planned: number; readonly held: readonly { readonly eventId: string; readonly reason: string }[] }

/**
 * Plans every post due this week: a share link of its own (after the Launch Kit's link for the same network exists, so
 * the kit keeps its own), the facts, and the kit's own caption as version 1. Where the words are refused the post is
 * kept with no words and the reason is said.
 */
export async function planWeek(db: Db, input: { readonly plannedBy: string; readonly now: Date }): Promise<Planned> {
  const candidates = await readCandidates(db, input.now)
  const items = plan(candidates, await plannedKeys(db, candidates.map((c) => c.eventId)), input.now)
  const held: { eventId: string; reason: string }[] = []
  let planned = 0
  for (const item of items) {
    const context = await contextFor(db, item.eventId, input.now)
    if (context === null) {
      held.push({ eventId: item.eventId, reason: 'The event could not be read.' })
      continue
    }
    const caption = toCaptionInput(context)

    const kit = await getOrCreateShareLink({ eventId: item.eventId, channel: item.platform, createdBy: input.plannedBy, eventSlug: context.slug })
    if (kit === null) {
      held.push({ eventId: item.eventId, reason: 'The Launch Kit link could not be read, so no second link was made.' })
      continue
    }
    const { data: link, error: lerr } = await db
      .from('share_links')
      .insert({ event_id: item.eventId, channel: item.platform, code: generateShareCode(), created_by: input.plannedBy })
      .select('id, code')
      .single()
    if (lerr || !link) {
      held.push({ eventId: item.eventId, reason: `No link of its own could be made: ${lerr?.message ?? 'no row'}.` })
      continue
    }
    const url = buildShortUrl(ORIGIN, link.code as string)
    const facts = factsOf(caption)
    const { data: post, error: perr } = await db
      .from('social_posts')
      .insert({ event_id: item.eventId, platform: item.platform, format: item.format, share_link_id: link.id, link: url, facts, planned_by: input.plannedBy, planned_at: input.now.toISOString() })
      .select('id')
      .single()
    if (perr || !post) {
      held.push({ eventId: item.eventId, reason: `The post could not be kept: ${perr?.message ?? 'no row'}.` })
      continue
    }
    planned += 1
    const words = kitCaption(caption, item.platform, url)
    const why = wordsRefusal(words, url, facts)
    if (why !== null) {
      held.push({ eventId: item.eventId, reason: `The Launch Kit's words were not kept: ${why}` })
      continue
    }
    const { error: derr } = await db.from('social_drafts').insert({ post_id: post.id, version: 1, caption: words, written_by: 'kit', drafted_at: input.now.toISOString() })
    if (derr) held.push({ eventId: item.eventId, reason: refusalOf(derr.message) ?? derr.message })
  }
  return { planned, held }
}

export type Done = { readonly state: 'done' } | { readonly state: 'refused'; readonly reason: string }

/** A person's own words for a post, as its next version. */
export async function writeDraft(db: Db, input: { readonly postId: string; readonly caption: string; readonly by: string; readonly now: Date }): Promise<Done> {
  const { data: post, error } = await db.from('social_posts').select('link, facts').eq('id', input.postId).maybeSingle()
  if (error || !post) return { state: 'refused', reason: 'That post could not be found.' }
  const why = wordsRefusal(input.caption, post.link as string, post.facts as string[])
  if (why !== null) return { state: 'refused', reason: why }
  const { data: last } = await db.from('social_drafts').select('version').eq('post_id', input.postId).order('version', { ascending: false }).limit(1).maybeSingle()
  const { error: derr } = await db.from('social_drafts').insert({
    post_id: input.postId,
    version: ((last?.version as number | undefined) ?? 0) + 1,
    caption: input.caption.trim(),
    written_by: 'person',
    written_by_user: input.by,
    drafted_at: input.now.toISOString(),
  })
  if (derr) return { state: 'refused', reason: refusalOf(derr.message) ?? 'The words could not be kept.' }
  return { state: 'done' }
}

/** A person's approval of a version; the database refuses it where it is not the newest, or not due. */
export async function approveDraft(db: Db, input: { readonly draftId: string; readonly by: string; readonly now: Date }): Promise<Done> {
  const { error } = await db.from('social_approvals').insert({ draft_id: input.draftId, approved_by: input.by, approved_at: input.now.toISOString() })
  if (error) return { state: 'refused', reason: refusalOf(error.message) ?? 'The approval could not be kept.' }
  return { state: 'done' }
}

/** The post as it went: its address and when, naming the newest approval of its words. Then the rule learns again. */
export async function recordPosting(db: Db, input: { readonly postId: string; readonly postUrl: string; readonly postedAt: Date; readonly by: string; readonly now: Date }): Promise<Done> {
  const { data: drafts, error } = await db
    .from('social_drafts')
    .select('id, version, social_approvals(id, approved_at)')
    .eq('post_id', input.postId)
    .order('version', { ascending: false })
    .limit(1)
  if (error) return { state: 'refused', reason: 'The post could not be read.' }
  const approvals = ((drafts?.[0]?.social_approvals as { id: string; approved_at: string }[] | undefined) ?? []).sort((a, b) => b.approved_at.localeCompare(a.approved_at))
  if (approvals.length === 0) return { state: 'refused', reason: 'Approve the newest words first.' }
  const { error: perr } = await db.from('social_postings').insert({
    post_id: input.postId,
    approval_id: approvals[0].id,
    post_url: input.postUrl.trim(),
    posted_at: input.postedAt.toISOString(),
    recorded_by: input.by,
    recorded_at: input.now.toISOString(),
  })
  if (perr) return { state: 'refused', reason: refusalOf(perr.message) ?? (/post_url/.test(perr.message) ? 'That is not an Instagram or Facebook address.' : 'The post could not be recorded.') }
  const { data: post } = await db.from('social_posts').select('platform, format').eq('id', input.postId).maybeSingle()
  if (post) await learnCadence(db, { platform: post.platform as SocialPlatform, format: post.format as SocialFormat, now: input.now })
  return { state: 'done' }
}

type RuleRow = { version: number; gap_hours: number; slots: number[]; basis: 'starting' | 'learned'; learned_from: number; floor_posts: number; settle_hours: number; set_at: string }

/** The rule in force for a network and format at a moment. */
export async function cadenceFor(db: Db, platform: SocialPlatform, format: SocialFormat, at: Date): Promise<CadenceRule> {
  const { data, error } = await db.rpc('social_cadence_at', { p_platform: platform, p_format: format, p_at: at.toISOString() }).single()
  if (error || !data) throw new Error(`no rule of how far apart posts go could be read: ${error?.message ?? 'none'}`)
  const r = data as RuleRow
  return { version: r.version, gapHours: r.gap_hours, slots: [...r.slots], basis: r.basis, learnedFrom: r.learned_from, floorPosts: r.floor_posts, settleHours: r.settle_hours, setAt: new Date(r.set_at) }
}

export interface PostRow {
  readonly id: string
  readonly eventId: string
  readonly eventTitle: string
  readonly eventStart: string
  readonly city: string | null
  readonly platform: SocialPlatform
  readonly format: SocialFormat
  readonly link: string
  readonly shareLinkId: string
  readonly draft: { readonly id: string; readonly version: number; readonly caption: string; readonly writtenBy: 'kit' | 'person' } | null
  readonly approvedAt: string | null
  readonly postedAt: string | null
  readonly postUrl: string | null
  readonly result: PostResult
}

/** Every post planned for an event that has not ended, and every post that went in the last 30 days, with results. */
export async function readPosts(db: Db, now: Date): Promise<PostRow[]> {
  const { data, error } = await db
    .from('social_posts')
    .select('id, event_id, platform, format, link, share_link_id, planned_at, events(title, start_date, end_date, venue_city), social_drafts(id, version, caption, written_by, social_approvals(approved_at)), social_postings(post_url, posted_at)')
    .gte('planned_at', new Date(now.getTime() - 45 * DAY_MS).toISOString())
    .order('planned_at', { ascending: false })
    .limit(600)
  if (error) throw new Error(`the posts could not be read: ${error.message}`)
  const rows = data ?? []
  const linkIds = rows.map((p) => p.share_link_id as string)
  const events: LinkEvent[] = []
  if (linkIds.length > 0) {
    const { data: ev, error: eerr } = await db
      .from('share_link_events')
      .select('link_id, kind, order_id, occurred_at')
      .in('link_id', linkIds)
      .in('kind', ['click', 'outbound', 'conversion'])
      .limit(20000)
    if (eerr) throw new Error(`the counted presses could not be read: ${eerr.message}`)
    for (const e of ev ?? []) events.push({ linkId: e.link_id as string, kind: e.kind as LinkEvent['kind'], orderId: (e.order_id as string | null) ?? null, occurredAt: e.occurred_at as string })
  }
  const orderIds = [...new Set(events.filter((e) => e.kind === 'conversion' && e.orderId !== null).map((e) => e.orderId as string))]
  const orders = new Map<string, CreditedOrder>()
  if (orderIds.length > 0) {
    const { data: os, error: oerr } = await db.from('orders').select('id, status, total_cents, tickets(id)').in('id', orderIds).limit(5000)
    if (oerr) throw new Error(`the orders could not be read: ${oerr.message}`)
    for (const o of os ?? []) orders.set(o.id as string, { id: o.id as string, status: o.status as string, totalCents: Number(o.total_cents ?? 0), tickets: ((o.tickets as unknown[] | null) ?? []).length })
  }
  return rows
    .map((p) => {
      const ev = p.events as unknown as { title: string; start_date: string; end_date: string; venue_city: string | null } | null
      const drafts = ((p.social_drafts as unknown as { id: string; version: number; caption: string; written_by: 'kit' | 'person'; social_approvals: { approved_at: string }[] }[] | null) ?? []).sort((a, b) => b.version - a.version)
      const newest = drafts[0] ?? null
      const approvals = (newest?.social_approvals ?? []).map((a) => a.approved_at).sort().reverse()
      const posting = ((p.social_postings as unknown as { post_url: string; posted_at: string }[] | { post_url: string; posted_at: string } | null) ?? null)
      const went = Array.isArray(posting) ? (posting[0] ?? null) : posting
      return {
        id: p.id as string,
        eventId: p.event_id as string,
        eventTitle: ev?.title ?? 'An event',
        eventStart: ev?.start_date ?? '',
        eventEnd: ev?.end_date ?? '',
        city: ev?.venue_city ?? null,
        platform: p.platform as SocialPlatform,
        format: p.format as SocialFormat,
        link: p.link as string,
        shareLinkId: p.share_link_id as string,
        draft: newest === null ? null : { id: newest.id, version: newest.version, caption: newest.caption, writtenBy: newest.written_by },
        approvedAt: approvals[0] ?? null,
        postedAt: went?.posted_at ?? null,
        postUrl: went?.post_url ?? null,
        result: resultOf(p.share_link_id as string, went ? new Date(went.posted_at) : null, events, orders),
      }
    })
    .filter((p) => p.postedAt !== null || new Date(p.eventEnd).getTime() > now.getTime())
    .map(({ eventEnd: _end, ...p }) => p)
}

/** Learns the rule for one network and format from EventLinqs' own posts there; writes a version only where it changed. */
export async function learnCadence(db: Db, input: { readonly platform: SocialPlatform; readonly format: SocialFormat; readonly now: Date }): Promise<CadenceRule> {
  const current = await cadenceFor(db, input.platform, input.format, input.now)
  const posts = (await readPosts(db, input.now)).filter((p) => p.platform === input.platform && p.format === input.format && p.postedAt !== null)
  const outcomes: PostOutcome[] = posts.map((p) => ({ postedAt: new Date(p.postedAt as string), tickets: p.result.tickets, visits: p.result.arrived + p.result.pressedOut }))
  const learned = learn({ current, format: input.format, posts: outcomes, now: input.now })
  if (learned.state !== 'learned') return current
  const { data: top } = await db
    .from('social_cadence_rules')
    .select('version')
    .eq('platform', input.platform)
    .eq('format', input.format)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { error } = await db.from('social_cadence_rules').insert({
    platform: input.platform,
    format: input.format,
    version: ((top?.version as number | undefined) ?? 0) + 1,
    gap_hours: learned.gapHours,
    slots: [...learned.slots],
    basis: 'learned',
    learned_from: learned.learnedFrom,
    floor_posts: current.floorPosts,
    settle_hours: current.settleHours,
    reason: learned.reason,
    set_at: input.now.toISOString(),
    set_by: 'item 11, the learner',
  })
  if (error) throw new Error(`the learned rule could not be kept: ${error.message}`)
  return cadenceFor(db, input.platform, input.format, input.now)
}

/** The last post that went on a network and format, for the next one's moment. */
export async function lastPosted(db: Db, platform: SocialPlatform, format: SocialFormat): Promise<Date | null> {
  const { data } = await db
    .from('social_postings')
    .select('posted_at, social_posts!inner(platform, format)')
    .eq('social_posts.platform', platform)
    .eq('social_posts.format', format)
    .order('posted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? new Date(data.posted_at as string) : null
}

/* ------------------------------------------------------------------ K2: which image a night may carry */

/**
 * The image a post may carry for each night now (K2, K3): an approved, unexpired asset that is organiser authorised or
 * separately licensed and in scope for social; never a library photograph. With none, the night is shown in original
 * EventLinqs design (path B), which needs no image licence (K1).
 */
export async function usableImages(db: Db, eventIds: readonly string[], now: Date): Promise<Map<string, { url: string; credit: string }>> {
  const usable = new Map<string, { url: string; credit: string }>()
  if (eventIds.length === 0) return usable
  const { data, error } = await db
    .from('social_assets')
    .select('event_id, asset_url, attribution_text, expires_at, approved_at')
    .in('event_id', [...eventIds])
    .in('asset_state', ['organiser_authorised', 'separately_licensed'])
    .in('asset_type', ['photo', 'artwork'])
    .eq('approval_status', 'approved')
    .in('scope', ['social', 'both'])
    .order('approved_at', { ascending: false })
    .limit(2000)
  if (error) throw new Error(`the asset register could not be read: ${error.message}`)
  for (const a of data ?? []) {
    const expires = a.expires_at as string | null
    if (expires !== null && Date.parse(expires) <= now.getTime()) continue
    const url = a.asset_url as string
    if (isLibraryPhoto(url) || usable.has(a.event_id as string)) continue
    usable.set(a.event_id as string, { url, credit: a.attribution_text as string })
  }
  return usable
}

/* ------------------------------------------------------------------ J15: event validation is a publishing dependency */

const NIGHT_COLUMNS =
  'id, slug, title, start_date, end_date, timezone, status, visibility, venue_name, venue_city, cover_image_url, summary, is_free, entry_mode, external_ticket_url, listing_source, category:event_categories(slug), organisation:organisations(name, slug), ticket_tiers(price, currency, is_active, total_capacity, sold_count, reserved_count), event_booking_links(availability)'

/** A night's call to action and its one price line, read the same way for planning and for the check before approval. */
async function admissionOf(e: Record<string, unknown>, now: Date): Promise<{ cta: Cta; priceLine: string | null }> {
  const tiers = ((e.ticket_tiers as { price: number; currency: string | null; is_active: boolean }[] | null) ?? []).filter((t) => t.is_active)
  if (tiers.length > 0 || (e.entry_mode as string | null) === 'walk_in') {
    return { cta: broadcastCta(e as BroadcastEvent), priceLine: broadcastPriceLabel(e as BroadcastEvent) || null }
  }
  const links = await readBookingLinks(e.id as string)
  const isFree = (e.is_free as boolean | null) ?? null
  return { cta: listingCta(links, isFree), priceLine: listingPriceLabel(links, isFree, now) }
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

async function answers(fetcher: Fetcher, url: string): Promise<{ ok: boolean; status: number | null; body: string }> {
  try {
    const res = await fetcher(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'EventLinqs/1.0 (+https://www.eventlinqs.com.au)' } })
    const body = res.status < 400 ? await res.text() : ''
    return { ok: res.status < 400, status: res.status, body }
  } catch {
    return { ok: false, status: null, body: '' }
  }
}

type Revision = {
  version: number
  eventIds: string[]
  picks: NightPick[]
  mode: PiecePlan['mode']
  slides: Slide[]
  caption: string
  versions: PiecePlan['versions']
  message: string | null
  madeBy: 'planner' | 'edit' | 'regenerate'
  madeAt: string
}

function revisionOf(r: Record<string, unknown>): Revision {
  return {
    version: Number(r.version),
    eventIds: (r.event_ids as string[] | null) ?? [],
    picks: (r.picks as NightPick[] | null) ?? [],
    mode: r.mode as PiecePlan['mode'],
    slides: (r.slides as Slide[] | null) ?? [],
    caption: r.caption as string,
    versions: r.versions as PiecePlan['versions'],
    message: (r.message as string | null) ?? null,
    madeBy: r.made_by as Revision['madeBy'],
    madeAt: r.made_at as string,
  }
}

const REVISION_COLUMNS = 'version, event_ids, picks, mode, slides, caption, versions, message, made_by, made_at'

/** The newest revision of a piece: what it says now (K7). */
async function newestRevision(db: Db, pieceId: string): Promise<Revision | null> {
  const { data } = await db.from('social_piece_revisions').select(REVISION_COLUMNS).eq('piece_id', pieceId).order('version', { ascending: false }).limit(1).maybeSingle()
  return data ? revisionOf(data as Record<string, unknown>) : null
}

/**
 * Every reason a piece may not be approved yet, re-read now (J15): each advertised night is still published, public and
 * not ended; its date, time and title are what the slide says; its admission is what the slide's chip says (cta.ts);
 * its outside ticket page answers; every image on a slide is usable now (K2); the piece's own page answers and lists
 * every night it advertises. siteOrigin is the deployment being checked, so a TEST plan is checked against TEST's pages.
 */
export async function pieceDependencies(
  db: Db,
  pieceId: string,
  now: Date,
  opts: { readonly siteOrigin: string; readonly fetcher?: Fetcher },
): Promise<string[]> {
  const fetcher = opts.fetcher ?? fetch
  const issues: string[] = []
  const { data: piece, error } = await db.from('social_pieces').select('kind, link').eq('id', pieceId).maybeSingle()
  if (error || !piece) return [`The piece could not be read${error ? `: ${error.message}` : ''}.`]
  const rev = await newestRevision(db, pieceId)
  if (rev === null) return ['The piece has no version to approve.']
  const ids = rev.eventIds

  const { data: events, error: eerr } = ids.length > 0 ? await db.from('events').select(NIGHT_COLUMNS).in('id', ids) : { data: [], error: null }
  if (eerr) return [`The nights could not be read again: ${eerr.message}.`]
  const byId = new Map((events ?? []).map((e) => [e.id as string, e as Record<string, unknown>]))

  for (const id of ids) {
    const e = byId.get(id)
    const slide = rev.slides.find((s) => 'eventId' in s && s.eventId === id) as Extract<Slide, { t: 'night' | 'story' }> | undefined
    const name = slide?.title ?? id
    if (!e) {
      issues.push(`${name}: the night no longer exists.`)
      continue
    }
    if (String(e.status) !== 'published' || String(e.visibility) !== 'public') issues.push(`${name}: it is no longer published and public.`)
    if (Date.parse(String(e.end_date)) <= now.getTime()) issues.push(`${name}: it has ended.`)
    if (!slide) continue
    if (String(e.title) !== slide.title) issues.push(`${name}: its title is now "${String(e.title)}".`)
    const when = whenOf({ startDate: String(e.start_date), timezone: (e.timezone as string | null) ?? null } as CampaignNight)
    if (!slide.when.startsWith(when)) issues.push(`${name}: its date or time is now ${when}.`)
    const { cta } = await admissionOf(e, now)
    if (slide.t === 'night' && (cta.chip ?? null) !== (slide.chip ?? null)) issues.push(`${name}: its admission now reads "${cta.chip ?? 'no price'}", not "${slide.chip ?? 'no price'}".`)
    if (cta.state === 'paid_external') {
      const outside = await answers(fetcher, String(e.external_ticket_url))
      if (!outside.ok) issues.push(`${name}: its ticket page answers ${outside.status ?? 'nothing'}.`)
    }
    if (slide.photo) {
      const { data: ok } = await db.rpc('social_asset_usable', { p_url: slide.photo, p_event: id, p_at: now.toISOString() })
      if (ok !== true) issues.push(`${name}: its image has no approved, unexpired licence for this night.`)
    }
  }

  /* K10: the creative checks, each platform's words and each slide's place as its night holds it. */
  issues.push(...creativeRefusals(rev, new Map([...byId.values()].map((e) => [e.id as string, { venueName: (e.venue_name as string | null) ?? null, title: String(e.title) }]))))

  /* The piece's own page answers on this deployment and lists every night it advertises. */
  const path = new URL(String(piece.link)).pathname
  const page = await answers(fetcher, `${opts.siteOrigin.replace(/\/$/, '')}${path}`)
  if (!page.ok) issues.push(`Its page ${path} answers ${page.status ?? 'nothing'}.`)
  else if (String(piece.kind) !== 'partner_kit') {
    for (const id of ids) {
      const e = byId.get(id)
      if (e && !page.body.includes(`/events/${String(e.slug)}`)) issues.push(`${String(e.title)}: ${path} does not list it, so the post would send people to a page without it.`)
    }
  }
  return issues
}

/* ------------------------------------------------------------------ the weekly campaign (the release checklist, B, C, J, K) */

/** The guide cities a campaign is planned for: the cities table's own rows, as /free/<city>/this-week reads them. */
async function readCampaignCities(db: Db): Promise<CampaignCity[]> {
  const { data, error } = await db.from('cities').select('slug, name').eq('free_guide', true).eq('is_active', true).order('display_order', { ascending: true })
  if (error) throw new Error(`the guide cities could not be read: ${error.message}`)
  return (data ?? []).map((c) => ({ slug: c.slug as string, name: c.name as string }))
}

/** The week's public nights in the guide cities, each with its call to action, its price line and any usable image. */
export async function readCampaignNights(db: Db, cities: readonly CampaignCity[], weekStart: string, now: Date): Promise<CampaignNight[]> {
  const weekEnd = new Date(Date.parse(`${weekStart}T00:00:00Z`) + 8 * DAY_MS)
  const { data, error } = await applyPublicEventVisibility(db.from('events').select(NIGHT_COLUMNS), { now, includeExternal: true })
    .gt('end_date', now.toISOString())
    .lte('start_date', weekEnd.toISOString())
    .order('start_date', { ascending: true })
    .limit(400)
  if (error) throw new Error(`the week's nights could not be read: ${error.message}`)
  const byName = new Map(cities.map((c) => [c.name.toLowerCase(), c]))
  const rows = (data ?? []) as Record<string, unknown>[]
  const images = await usableImages(db, rows.map((e) => e.id as string), now)
  const nights: CampaignNight[] = []
  for (const e of rows) {
    const city = byName.get(String(e.venue_city ?? '').trim().toLowerCase())
    if (!city) continue
    if (soldOut((e.ticket_tiers as TierRow[] | null) ?? [], (e.event_booking_links as { availability: string }[] | null) ?? [])) continue
    const { cta, priceLine } = await admissionOf(e, now)
    const organisation = (e.organisation as { name: string | null; slug: string | null } | null) ?? null
    const image = images.get(e.id as string) ?? null
    nights.push({
      eventId: e.id as string,
      slug: e.slug as string,
      title: e.title as string,
      startDate: e.start_date as string,
      timezone: (e.timezone as string | null) ?? null,
      citySlug: city.slug,
      cityName: city.name,
      venueName: (e.venue_name as string | null) ?? null,
      host: hostOf({ listingSource: (e.listing_source as string | null) ?? null, organisationName: organisation?.name ?? null, organisationSlug: organisation?.slug ?? null, venueName: (e.venue_name as string | null) ?? null }),
      categorySlug: (e.category as { slug: string | null } | null)?.slug ?? null,
      summary: (e.summary as string | null) ?? null,
      approvedPhotoUrl: image?.url ?? null,
      photoCredit: image?.credit ?? null,
      cta,
      priceLine,
    })
  }
  return nights
}

async function campaignIdFor(db: Db, weekStart: string): Promise<string | null> {
  const { data } = await db.from('social_campaigns').select('id').eq('week_start', weekStart).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

async function excludedFor(db: Db, campaignId: string): Promise<Set<string>> {
  const { data } = await db.from('social_campaign_exclusions').select('event_id').eq('campaign_id', campaignId).limit(1000)
  return new Set((data ?? []).map((r) => r.event_id as string))
}

/** The week's plan from its nights now, without the founder's leave-outs. */
async function planNow(db: Db, campaignId: string, weekStart: string, now: Date): Promise<ReturnType<typeof planCampaign>> {
  const cities = await readCampaignCities(db)
  const nights = await readCampaignNights(db, cities, weekStart, now)
  return planCampaign({ nights, cities, weekStart, origin: ORIGIN, excluded: await excludedFor(db, campaignId) })
}

/** The partner's own link, minted for their kit alone, so what their share brings is counted as theirs. */
async function partnerLink(db: Db, eventId: string, by: string): Promise<{ id: string; url: string } | null> {
  const { data: own, error } = await db.from('share_links').insert({ event_id: eventId, channel: 'other', code: generateShareCode(), created_by: by }).select('id, code').single()
  return error || !own ? null : { id: own.id as string, url: buildShortUrl(ORIGIN, own.code as string) }
}

function revisionRow(pieceId: string, version: number, p: PiecePlan, message: string | null, madeBy: Revision['madeBy'], by: string | null, now: Date) {
  return {
    piece_id: pieceId,
    version,
    event_ids: p.eventIds,
    picks: p.picks,
    mode: p.mode,
    slides: p.slides,
    caption: p.caption,
    versions: p.versions,
    message,
    made_by: madeBy,
    made_by_user: by,
    made_at: now.toISOString(),
  }
}

export type CampaignPlanned = { readonly campaignId: string; readonly weekStart: string; readonly created: number; readonly existing: number; readonly held: readonly string[]; readonly requests: number }

/**
 * "Plan this week": ONE campaign for the week, found again on a second press (F7), each piece kept once (the
 * database's social_pieces_once) with its first revision. Planning writes the campaign, its pieces, their first
 * revisions, each partner's own link and the drafted image requests; nothing is approved and nothing is published
 * here (F9).
 */
export async function planCampaignWeek(db: Db, input: { readonly plannedBy: string; readonly now: Date }): Promise<CampaignPlanned> {
  const weekStart = weekStartOf(input.now)
  const { error: cerr } = await db
    .from('social_campaigns')
    .upsert({ week_start: weekStart, planned_by: input.plannedBy, planned_at: input.now.toISOString() }, { onConflict: 'week_start', ignoreDuplicates: true })
  if (cerr) throw new Error(`the week's campaign could not be kept: ${cerr.message}`)
  const campaignId = await campaignIdFor(db, weekStart)
  if (campaignId === null) throw new Error("the week's campaign could not be read")

  const { pieces: plans, imageRequests } = await planNow(db, campaignId, weekStart, input.now)
  const { data: have, error: herr } = await db.from('social_pieces').select('kind, city, partner_name').eq('campaign_id', campaignId).limit(500)
  if (herr) throw new Error(`the week's pieces could not be read: ${herr.message}`)
  const kept = new Set((have ?? []).map((p) => `${p.kind}|${p.city}|${p.partner_name ?? ''}`))

  let created = 0
  let existing = 0
  const held: string[] = []
  for (const p of plans) {
    if (kept.has(`${p.kind}|${p.city}|${p.partnerName ?? ''}`)) {
      existing += 1
      continue
    }
    const refused = pieceRefusal(p)
    if (refused !== null) {
      held.push(`${p.kind} ${p.city}: ${refused}`)
      continue
    }
    const message = p.message
    let link = p.link
    let shareLinkId: string | null = null
    if (p.kind === 'partner_kit' && p.partnerEventId) {
      const own = await partnerLink(db, p.partnerEventId, input.plannedBy)
      if (own === null) {
        held.push(`${p.kind} ${p.partnerName}: no link of their own could be made`)
        continue
      }
      link = own.url
      shareLinkId = own.id
    }
    const { data: piece, error: perr } = await db
      .from('social_pieces')
      .insert({ campaign_id: campaignId, kind: p.kind, city: p.city, audience: p.audience, objective: p.objective, purpose: p.purpose, next_step: p.nextStep, outcome: p.outcome, link, format: p.format, partner_name: p.partnerName, share_link_id: shareLinkId, planned_at: input.now.toISOString() })
      .select('id')
      .single()
    if (perr || !piece) {
      /* A second press racing the first: the database kept one, which is the rule, not a fault. */
      if (perr?.code === '23505') existing += 1
      else held.push(`${p.kind} ${p.city}: ${refusalOf(perr?.message ?? '') ?? perr?.message ?? 'no row'}`)
      continue
    }
    const { error: rerr } = await db.from('social_piece_revisions').insert(revisionRow(piece.id as string, 1, p, message, 'planner', input.plannedBy, input.now))
    if (rerr) {
      held.push(`${p.kind} ${p.city}: its words were not kept: ${refusalOf(rerr.message) ?? rerr.message}`)
      continue
    }
    created += 1
  }

  /* J5: the drafted image requests, one per night with no usable image, kept once each and never sent here. */
  let requests = 0
  if (imageRequests.length > 0) {
    const { data: req, error: qerr } = await db
      .from('social_image_requests')
      .upsert(imageRequests.map((r) => ({ campaign_id: campaignId, event_id: r.eventId, host_name: r.hostName, drafted_at: input.now.toISOString() })), { onConflict: 'campaign_id,event_id', ignoreDuplicates: true })
      .select('id')
    if (qerr) held.push(`image requests: ${refusalOf(qerr.message) ?? qerr.message}`)
    else requests = (req ?? []).length
  }
  return { campaignId, weekStart, created, existing, held, requests }
}

export type PieceState = 'drafted' | 'rejected' | 'approved' | 'gone'

export type PieceRow = {
  id: string
  kind: PiecePlan['kind']
  city: string
  audience: Audience
  objective: Objective
  purpose: string
  nextStep: string
  outcome: string
  link: string
  format: 'feed' | 'story'
  partnerName: string | null
  revision: Revision
  history: { version: number; madeBy: Revision['madeBy']; madeAt: string }[]
  decisions: { revision: number; decision: string; reason: string; at: string }[]
  state: PieceState
  postUrl: string | null
}

/** The week's campaign as /admin/social shows it: each piece's newest revision, its history and its state (K7). */
export async function readCampaign(db: Db, now: Date): Promise<{ weekStart: string; campaignId: string; pieces: PieceRow[]; excluded: string[] } | null> {
  const weekStart = weekStartOf(now)
  const campaignId = await campaignIdFor(db, weekStart)
  if (campaignId === null) return null
  const { data, error } = await db
    .from('social_pieces')
    .select(`id, kind, city, audience, objective, purpose, next_step, outcome, link, format, partner_name, social_piece_revisions(${REVISION_COLUMNS}), social_piece_decisions(revision, decision, reason, decided_at), social_piece_approvals(revision), social_piece_postings(post_url)`)
    .eq('campaign_id', campaignId)
    .order('planned_at', { ascending: true })
    .limit(500)
  if (error) throw new Error(`the week's pieces could not be read: ${error.message}`)
  const ORDER: PiecePlan['kind'][] = ['week_ahead', 'discovery_reel', 'weekend_carousel', 'venue_spotlight', 'organiser_campaign', 'partner_kit']
  const pieces: PieceRow[] = []
  for (const p of data ?? []) {
    const revisions = ((p.social_piece_revisions as Record<string, unknown>[] | null) ?? []).map(revisionOf).sort((a, b) => b.version - a.version)
    if (revisions.length === 0) continue
    const newest = revisions[0]
    const decisions = ((p.social_piece_decisions as Record<string, unknown>[] | null) ?? [])
      .map((d) => ({ revision: Number(d.revision), decision: d.decision as string, reason: d.reason as string, at: d.decided_at as string }))
      .sort((a, b) => b.at.localeCompare(a.at))
    const approvals = ((p.social_piece_approvals as { revision: number }[] | null) ?? []).map((a) => Number(a.revision))
    const posting = ((p.social_piece_postings as { post_url: string }[] | { post_url: string } | null) ?? null)
    const postUrl = Array.isArray(posting) ? (posting[0]?.post_url ?? null) : (posting?.post_url ?? null)
    const rejected = decisions.some((d) => d.decision === 'rejected' && d.revision === newest.version)
    const state: PieceState = postUrl ? 'gone' : approvals.includes(newest.version) ? 'approved' : rejected ? 'rejected' : 'drafted'
    pieces.push({
      id: p.id as string,
      kind: p.kind as PiecePlan['kind'],
      city: p.city as string,
      audience: p.audience as Audience,
      objective: p.objective as Objective,
      purpose: p.purpose as string,
      nextStep: p.next_step as string,
      outcome: p.outcome as string,
      link: p.link as string,
      format: p.format as 'feed' | 'story',
      partnerName: (p.partner_name as string | null) ?? null,
      revision: newest,
      history: revisions.map((r) => ({ version: r.version, madeBy: r.madeBy, madeAt: r.madeAt })),
      decisions,
      state,
      postUrl,
    })
  }
  pieces.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.city.localeCompare(b.city))
  return { weekStart, campaignId, pieces, excluded: [...(await excludedFor(db, campaignId))] }
}

/** One piece's newest slides, for its slides' route. */
export async function readPiece(db: Db, pieceId: string): Promise<{ slides: Slide[]; format: 'feed' | 'story'; kind: PiecePlan['kind']; city: string } | null> {
  const { data } = await db.from('social_pieces').select('format, kind, city').eq('id', pieceId).maybeSingle()
  if (!data) return null
  const rev = await newestRevision(db, pieceId)
  if (!rev) return null
  return { slides: rev.slides, format: data.format as 'feed' | 'story', kind: data.kind as PiecePlan['kind'], city: data.city as string }
}

/** A person approves a piece's newest revision (B3, F8): its own state, before anything goes. */
export async function approvePiece(db: Db, input: { readonly pieceId: string; readonly by: string; readonly now: Date }): Promise<Done> {
  const rev = await newestRevision(db, input.pieceId)
  if (!rev) return { state: 'refused', reason: 'The piece has no version to approve.' }
  const { error } = await db.from('social_piece_approvals').insert({ piece_id: input.pieceId, revision: rev.version, approved_by: input.by, approved_at: input.now.toISOString() })
  if (error) return { state: 'refused', reason: error.code === '23505' ? 'This version is approved already.' : (refusalOf(error.message) ?? error.message) }
  return { state: 'done' }
}

/** Approval with its dependencies (J15, B3): nothing is approved while any reason stands, and each is said. */
export async function approvePieceChecked(
  db: Db,
  input: { readonly pieceId: string; readonly by: string; readonly now: Date; readonly siteOrigin: string; readonly fetcher?: Fetcher },
): Promise<Done> {
  const issues = await pieceDependencies(db, input.pieceId, input.now, { siteOrigin: input.siteOrigin, fetcher: input.fetcher })
  if (issues.length > 0) return { state: 'refused', reason: `Not approved yet: ${issues.join(' ')}` }
  return approvePiece(db, input)
}

/** A piece as it went (F8): its address, or "sent" for a partner kit; the database refuses one without its approval. */
export async function recordPiecePosting(db: Db, input: { readonly pieceId: string; readonly postUrl: string; readonly by: string; readonly now: Date }): Promise<Done> {
  const rev = await newestRevision(db, input.pieceId)
  const { data: approval } = rev
    ? await db.from('social_piece_approvals').select('id').eq('piece_id', input.pieceId).eq('revision', rev.version).maybeSingle()
    : { data: null }
  if (!approval) return { state: 'refused', reason: 'Approve this version first: nothing goes without your approval.' }
  const { error } = await db.from('social_piece_postings').insert({ piece_id: input.pieceId, approval_id: approval.id as string, post_url: input.postUrl, posted_at: input.now.toISOString(), recorded_by: input.by })
  if (error) return { state: 'refused', reason: error.code === '23505' ? 'This piece is recorded already.' : (refusalOf(error.message) ?? error.message) }
  return { state: 'done' }
}

/** K7: the founder rejects a piece's newest version, saying why; it stays rejected until it is edited or regenerated. */
export async function rejectPiece(db: Db, input: { readonly pieceId: string; readonly reason: string; readonly by: string; readonly now: Date }): Promise<Done> {
  const rev = await newestRevision(db, input.pieceId)
  if (!rev) return { state: 'refused', reason: 'The piece has no version to reject.' }
  const { error } = await db.from('social_piece_decisions').insert({ piece_id: input.pieceId, revision: rev.version, decision: 'rejected', reason: input.reason, decided_by: input.by, decided_at: input.now.toISOString() })
  if (error) return { state: 'refused', reason: refusalOf(error.message) ?? error.message }
  return { state: 'done' }
}

/** K7: the founder edits one platform's words; the edit is a new revision, kept beside every earlier one. */
export async function editPiece(db: Db, input: { readonly pieceId: string; readonly platform: 'instagram' | 'facebook'; readonly caption: string; readonly by: string; readonly now: Date }): Promise<Done> {
  const rev = await newestRevision(db, input.pieceId)
  if (!rev) return { state: 'refused', reason: 'The piece has no version to edit.' }
  const caption = input.caption.trim()
  if (/[!–—]/.test(caption)) return { state: 'refused', reason: 'The words carry an exclamation mark or a long dash.' }
  const versions = { ...rev.versions, [input.platform]: { ...rev.versions[input.platform], caption } }
  const plan = { eventIds: rev.eventIds, picks: rev.picks, mode: rev.mode, slides: rev.slides, caption: input.platform === 'instagram' ? caption : rev.caption, versions } as PiecePlan
  const { error } = await db.from('social_piece_revisions').insert(revisionRow(input.pieceId, rev.version + 1, plan, rev.message, 'edit', input.by, input.now))
  if (error) return { state: 'refused', reason: refusalOf(error.message) ?? error.message }
  await db.from('social_piece_decisions').insert({ piece_id: input.pieceId, revision: rev.version + 1, decision: 'edited', reason: `The ${input.platform === 'instagram' ? 'Instagram' : 'Facebook'} words were edited.`, decided_by: input.by, decided_at: input.now.toISOString() })
  return { state: 'done' }
}

/**
 * K7: regenerate a piece from the week's nights now, without the nights the founder left out (K6); a new revision,
 * kept beside every earlier one. A piece whose set no longer stands (too few nights) is said so, and nothing changes.
 */
export async function regeneratePiece(db: Db, input: { readonly pieceId: string; readonly reason: string; readonly by: string; readonly now: Date }): Promise<Done> {
  const { data: piece } = await db.from('social_pieces').select('campaign_id, kind, city, partner_name').eq('id', input.pieceId).maybeSingle()
  const rev = await newestRevision(db, input.pieceId)
  if (!piece || !rev) return { state: 'refused', reason: 'The piece could not be read.' }
  const { data: campaign } = await db.from('social_campaigns').select('week_start').eq('id', piece.campaign_id as string).maybeSingle()
  if (!campaign) return { state: 'refused', reason: 'Its campaign could not be read.' }
  const { pieces } = await planNow(db, piece.campaign_id as string, campaign.week_start as string, input.now)
  const fresh = pieces.find((p) => p.kind === piece.kind && p.city === piece.city && (p.partnerName ?? null) === ((piece.partner_name as string | null) ?? null))
  if (!fresh) return { state: 'refused', reason: 'This week no longer has the nights for this piece, so it was not regenerated.' }
  const refused = pieceRefusal(fresh)
  if (refused) return { state: 'refused', reason: refused }
  const message = fresh.kind === 'partner_kit' ? (rev.message ?? fresh.message) : fresh.message
  const { error } = await db.from('social_piece_revisions').insert(revisionRow(input.pieceId, rev.version + 1, fresh, message, 'regenerate', input.by, input.now))
  if (error) return { state: 'refused', reason: refusalOf(error.message) ?? error.message }
  await db.from('social_piece_decisions').insert({ piece_id: input.pieceId, revision: rev.version + 1, decision: 'regenerated', reason: input.reason, decided_by: input.by, decided_at: input.now.toISOString() })
  return { state: 'done' }
}

/** K6: the founder's override, a night left out of this week's campaign; regenerate a piece to take it out of its set. */
export async function excludeNight(db: Db, input: { readonly eventId: string; readonly reason: string; readonly by: string; readonly now: Date }): Promise<Done> {
  const campaignId = await campaignIdFor(db, weekStartOf(input.now))
  if (campaignId === null) return { state: 'refused', reason: 'Plan this week first.' }
  const { error } = await db.from('social_campaign_exclusions').insert({ campaign_id: campaignId, event_id: input.eventId, reason: input.reason, excluded_by: input.by, excluded_at: input.now.toISOString() })
  if (error) return { state: 'refused', reason: error.code === '23505' ? 'That night is left out already.' : (refusalOf(error.message) ?? error.message) }
  return { state: 'done' }
}

/* ------------------------------------------------------------------ K2: the asset register */

export type AssetInput = {
  readonly assetState: 'organiser_authorised' | 'separately_licensed' | 'native_share'
  readonly assetType: 'photo' | 'artwork' | 'video' | 'post'
  readonly assetUrl: string
  readonly sourceUrl: string
  readonly rightsHolder: string
  readonly permissionEvidence: string | null
  readonly evidenceFile: string | null
  readonly eventSlug: string | null
  readonly attributionText: string
  readonly scope: 'social' | 'site' | 'both'
  readonly archival: boolean
  readonly expiresAt: string | null
  readonly restrictions: string | null
}

export type AssetRow = {
  id: string
  assetState: string
  assetType: string
  assetUrl: string
  sourceUrl: string
  rightsHolder: string
  permissionEvidence: string | null
  eventTitle: string | null
  attributionText: string
  scope: string
  archival: boolean
  expiresAt: string | null
  restrictions: string | null
  approvalStatus: 'pending' | 'approved' | 'refused'
}

/** The event an asset belongs to, by its address. */
async function eventIdBySlug(db: Db, slug: string): Promise<string | null> {
  const { data } = await db.from('events').select('id').eq('slug', slug).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/** An asset is entered pending; it is carried by a post only once a person approves it (K2). */
export async function addAsset(db: Db, input: AssetInput & { readonly by: string }): Promise<Done> {
  if (isLibraryPhoto(input.assetUrl)) return { state: 'refused', reason: 'A library photograph never stands for a named night (K3).' }
  let eventId: string | null = null
  if (input.eventSlug) {
    eventId = await eventIdBySlug(db, input.eventSlug)
    if (eventId === null) return { state: 'refused', reason: `No event has the address ${input.eventSlug}.` }
  }
  const { error } = await db.from('social_assets').insert({
    asset_state: input.assetState,
    asset_type: input.assetType,
    asset_url: input.assetUrl,
    source_url: input.sourceUrl,
    rights_holder: input.rightsHolder,
    permission_evidence: input.permissionEvidence,
    evidence_file: input.evidenceFile,
    event_id: eventId,
    attribution_text: input.attributionText,
    scope: input.scope,
    archival: input.archival,
    expires_at: input.expiresAt,
    restrictions: input.restrictions,
    created_by: input.by,
  })
  if (error) {
    if (error.code === '23505') return { state: 'refused', reason: 'This asset is in the register for that night already.' }
    if (error.code === '23514') return { state: 'refused', reason: 'Every field is needed, the addresses must be https, someone else\'s work needs their permission in their words, and an archival photograph says so in its credit.' }
    return { state: 'refused', reason: refusalOf(error.message) ?? error.message }
  }
  return { state: 'done' }
}

/** A person approves or refuses a pending asset; the register takes no other change. */
export async function decideAsset(db: Db, input: { readonly id: string; readonly decision: 'approved' | 'refused'; readonly by: string; readonly now: Date }): Promise<Done> {
  const { data, error } = await db
    .from('social_assets')
    .update({ approval_status: input.decision, approved_by: input.by, approved_at: input.now.toISOString() })
    .eq('id', input.id)
    .eq('approval_status', 'pending')
    .select('id')
  if (error) return { state: 'refused', reason: refusalOf(error.message) ?? error.message }
  if ((data ?? []).length === 0) return { state: 'refused', reason: 'That asset is decided already, or does not exist.' }
  return { state: 'done' }
}

export async function readAssets(db: Db): Promise<AssetRow[]> {
  const { data, error } = await db
    .from('social_assets')
    .select('id, asset_state, asset_type, asset_url, source_url, rights_holder, permission_evidence, attribution_text, scope, archival, expires_at, restrictions, approval_status, events(title)')
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) throw new Error(`the asset register could not be read: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    assetState: r.asset_state as string,
    assetType: r.asset_type as string,
    assetUrl: r.asset_url as string,
    sourceUrl: r.source_url as string,
    rightsHolder: r.rights_holder as string,
    permissionEvidence: (r.permission_evidence as string | null) ?? null,
    eventTitle: (r.events as unknown as { title: string } | null)?.title ?? null,
    attributionText: r.attribution_text as string,
    scope: r.scope as string,
    archival: Boolean(r.archival),
    expiresAt: (r.expires_at as string | null) ?? null,
    restrictions: (r.restrictions as string | null) ?? null,
    approvalStatus: r.approval_status as AssetRow['approvalStatus'],
  }))
}

/** This week's drafted image requests (J5), for the founder to send. */
export async function readImageRequests(db: Db, now: Date): Promise<{ eventTitle: string; hostName: string; message: string | null }[]> {
  const campaignId = await campaignIdFor(db, weekStartOf(now))
  if (campaignId === null) return []
  const { data, error } = await db.from('social_image_requests').select('host_name, message, events(title)').eq('campaign_id', campaignId).order('drafted_at').limit(200)
  if (error) throw new Error(`the image requests could not be read: ${error.message}`)
  return (data ?? []).map((r) => ({ eventTitle: (r.events as unknown as { title: string } | null)?.title ?? '', hostName: r.host_name as string, message: (r.message as string | null) ?? null }))
}
