import type { SupabaseClient } from '@supabase/supabase-js'
import { loadArtefactContext, toCaptionInput, type ArtefactContext } from '@/lib/broadcast/kit-artefacts'
import { generateShareCode, getOrCreateShareLink } from '@/lib/broadcast/share-links'
import { buildShortUrl } from '@/lib/broadcast/share-codes'
import { readBookingLinks } from '@/lib/events/booking-links-read'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { isLibraryPhoto, listingPhotoFor } from '@/lib/listings/listing-photo'
import { isComposedCover } from '@/lib/images/event-media'
import { CANONICAL_HOST } from '@/lib/site-url'
import { learn, type CadenceRule, type PostOutcome, type SocialFormat, type SocialPlatform } from './cadence'
import { factsOf, kitCaption, listingPriceLabel, plan, postKey, PLAN_AHEAD_DAYS, type PlanCandidate } from './plan'
import { resultOf, type CreditedOrder, type LinkEvent, type PostResult } from './results'
import { wordsRefusal } from './words'

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
const PRICE_UNKNOWN = 'Details at the link'

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
  return { ...context, priceLabel: listingPriceLabel(await readBookingLinks(eventId), (free?.is_free as boolean | null) ?? null, now) ?? PRICE_UNKNOWN }
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
  /* A listing's composed text cover is no photograph: the library shot stands in until its host's own photo shows. */
  const own = context.coverImageUrl !== null && !(listing && isComposedCover(context.coverImageUrl)) ? context.coverImageUrl : null
  const cover = own ?? (listing ? listingPhotoFor(context.categorySlug) : null)
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
