import { SOCIAL_SLOT_ZONE, slotDay, slotFromEarlierDay } from '@/lib/ops/stale-slot'
import { LOST_ID } from './post-state'
import { withPieceId } from './go-hop'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadArtefactContext, toCaptionInput, type ArtefactContext } from '@/lib/broadcast/kit-artefacts'
import { generateShareCode, getOrCreateShareLink } from '@/lib/broadcast/share-links'
import { buildShortUrl } from '@/lib/broadcast/share-codes'
import { readBookingLinks } from '@/lib/events/booking-links-read'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { isLibraryPhoto } from '@/lib/listings/listing-photo'
import { eventCoversFor } from '@/lib/venues/venue-photos-read'
import { CANONICAL_HOST } from '@/lib/site-url'
import { learn, planMoments, scheduleWindowOf, weekendDaysOf, withStartingCalendar, type CadenceRule, type PostOutcome, type SocialFormat, type SocialPlatform } from './cadence'
import { applyDailyFloor, rhythmDays, type FloorPiece } from './daily-rhythm'
import { languageFaults, ON_NOW, PIECE_RULES_SINCE, pieceCorrections, pieceQuality, type QualityNight } from './piece-quality'
import { correctPlaceLines, knownVenueIndex, type KnownVenues } from './venue-identity'
import { pastLatest, timingOf, type Timing, type TimingNight } from './timing'
import { law37Refusal } from './law37'
import { LIFECYCLE_AHEAD_DAYS, LIFECYCLE_ON, parseMomentKey, planLifecyclePieces } from './lifecycle-plan'
import { LIFECYCLE_ZONE, lifecycleWindow, nightOnDay } from './lifecycle'
import { scopeToRecord } from './grant-scope'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import { captionMarkFaults } from './caption-marks'
import { dayTime } from '@/lib/dates/admin-dates'
import { factsOf, kitCaption, listingCta, listingPriceLabel, plan, postKey, PLAN_AHEAD_DAYS, type PlanCandidate } from './plan'
import { resultOf, type CreditedOrder, type LinkEvent, type PostResult } from './results'
import { readKitTouchesSent } from './kit-sent'
import { quotableSummary, wordsRefusal } from './words'
import { dailyPosterPieces, onItsDay, posterDrift, withKitCaptions, DAILY_POSTERS_IN_PLAN, type NightNow } from './daily-posters'
import { broadcastCta, broadcastPriceLabel, type BroadcastEvent } from '@/lib/broadcast/price-line'
import type { Cta } from '@/lib/events/cta'
import { visualFaults } from '@/lib/broadcast/campaign-slides'
import { distributionDeps, nightsLeftOut, venuesOff } from '@/lib/venues/venue-distribution'
import { STAND_INS_IN_PLAN, standInOf } from './stand-ins'
import { slidesMisfit } from './destination-check'
import type { BlotatoPostReader } from './blotato-publisher'
import { creativeRefusals, hostOf, lockRefusal, nightWords, planCampaign, venueOf, pieceRefusal, spotlightsFromDay, weekStartOf, whenOf, OLDER_LOOK_IN_PLAN, type Audience, type CampaignCity, type CampaignNight, type NightPick, type Objective, type PiecePlan, type Slide } from './campaign'

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
      .select('id, title, start_date, end_date, status, visibility, venue_city, venue_id, cover_image_url, ticket_tiers(total_capacity, sold_count, reserved_count, is_active), event_booking_links(availability)'),
    { now, includeExternal: true },
  )
    .gt('end_date', now.toISOString())
    .lte('start_date', new Date(now.getTime() + PLAN_AHEAD_DAYS * DAY_MS).toISOString())
    .order('start_date', { ascending: true })
    .limit(400)
  if (error) throw new Error(`the week's events could not be read: ${error.message}`)
  /* D3 (6): the nights of a venue that said no to our posts are never candidates (a failed read throws). */
  const leftOut = nightsLeftOut(
    (data ?? []).map((e) => ({ eventId: e.id as string, venueId: (e.venue_id as string | null) ?? null })),
    await venuesOff('our_posts', distributionDeps(db)),
  )
  return (data ?? []).filter((e) => !leftOut.has(e.id as string)).map((e) => ({
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
  /** The approved register row's credit for the cover, printed on the card; null with no register photograph. */
  readonly photoCredit: string | null
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
  const usable = (await usableImages(db, [post.event_id as string], now)).get(post.event_id as string) ?? null
  const approved = usable?.url ?? null
  const cover = approved && !isLibraryPhoto(approved) ? approved : null
  return {
    context: { ...context, coverImageUrl: cover },
    link: post.link as string,
    format: post.format as SocialFormat,
    platform: post.platform as SocialPlatform,
    listing,
    libraryPhoto: isLibraryPhoto(cover),
    /* The row's own credit, printed on the card (an archival photograph says 'past festival'; the PM's 15:56). */
    photoCredit: cover ? (usable?.credit ?? null) : null,
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
    const one = await planPost(db, item, input)
    if (one.kept) planned += 1
    if (one.held !== null) held.push({ eventId: item.eventId, reason: one.held })
  }
  return { planned, held }
}

/**
 * One post planned the way the week's posts are: its own share link (after the Launch Kit's for the same network), the
 * facts, and the kit's own caption as version 1. kept says the post row was made; held says why anything was not.
 * The organiser spotlight (./three-posts.ts) plans its one post through here, so it is never a second way of posting.
 */
export async function planPost(
  db: Db,
  item: { readonly eventId: string; readonly platform: SocialPlatform; readonly format: SocialFormat },
  input: { readonly plannedBy: string; readonly now: Date },
): Promise<{ readonly kept: boolean; readonly postId: string | null; readonly held: string | null }> {
  if ((await plannedKeys(db, [item.eventId])).has(postKey(item.eventId, item.platform, item.format))) {
    return { kept: false, postId: null, held: 'That post is already planned.' }
  }
  const context = await contextFor(db, item.eventId, input.now)
  if (context === null) return { kept: false, postId: null, held: 'The event could not be read.' }
  const told = toCaptionInput(context)
  /* The organiser's description is quoted only where it does not carry the banned word (words.ts quotableSummary). */
  const caption = { ...told, summary: quotableSummary(told.summary, [told.title, told.organiserName]) }

  const kit = await getOrCreateShareLink({ eventId: item.eventId, channel: item.platform, createdBy: input.plannedBy, eventSlug: context.slug })
  if (kit === null) return { kept: false, postId: null, held: 'The Launch Kit link could not be read, so no second link was made.' }
  const { data: link, error: lerr } = await db
    .from('share_links')
    .insert({ event_id: item.eventId, channel: item.platform, code: generateShareCode(), created_by: input.plannedBy })
    .select('id, code')
    .single()
  if (lerr || !link) return { kept: false, postId: null, held: `No link of its own could be made: ${lerr?.message ?? 'no row'}.` }
  const url = buildShortUrl(ORIGIN, link.code as string)
  const facts = factsOf(caption)
  const { data: post, error: perr } = await db
    .from('social_posts')
    .insert({ event_id: item.eventId, platform: item.platform, format: item.format, share_link_id: link.id, link: url, facts, planned_by: input.plannedBy, planned_at: input.now.toISOString() })
    .select('id')
    .single()
  if (perr || !post) return { kept: false, postId: null, held: `The post could not be kept: ${perr?.message ?? 'no row'}.` }
  const words = kitCaption(caption, item.platform, url)
  const why = wordsRefusal(words, url, facts, [caption.title, caption.organiserName])
  if (why !== null) return { kept: true, postId: post.id as string, held: `The Launch Kit's words were not kept: ${why}` }
  const { error: derr } = await db.from('social_drafts').insert({ post_id: post.id, version: 1, caption: words, written_by: 'kit', drafted_at: input.now.toISOString() })
  return { kept: true, postId: post.id as string, held: derr ? (refusalOf(derr.message) ?? derr.message) : null }
}

export type Done = { readonly state: 'done' } | { readonly state: 'refused'; readonly reason: string }

/** A person's own words for a post, as its next version. */
export async function writeDraft(db: Db, input: { readonly postId: string; readonly caption: string; readonly by: string; readonly now: Date }): Promise<Done> {
  const { data: post, error } = await db.from('social_posts').select('link, facts, event_id').eq('id', input.postId).maybeSingle()
  if (error || !post) return { state: 'refused', reason: 'That post could not be found.' }
  /* The names the words may quote exactly, read as the Launch Kit reads them (words.ts carriesBannedWord). */
  const context = await contextFor(db, post.event_id as string, input.now)
  const why = wordsRefusal(input.caption, post.link as string, post.facts as string[], context === null ? [] : [context.title, context.organiserName])
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
      .select('link_id, kind, order_id, occurred_at').eq('is_test', false)
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

/** A usable image as the register holds it: its address, its credit, the focal point a person set, its pixel size. */
export type UsableImage = { kind?: 'photo' | 'artwork'; url: string; credit: string; assetId: string; focal: { x: number; y: number } | null; width: number | null; height: number | null }

function usableOf(r: Record<string, unknown>): UsableImage {
  const fx = r.focal_x as number | string | null
  const fy = r.focal_y as number | string | null
  return {
    url: r.asset_url as string,
    credit: r.attribution_text as string,
    assetId: r.asset_id as string,
    focal: fx === null || fy === null ? null : { x: Number(fx), y: Number(fy) },
    width: (r.source_width as number | null) ?? null,
    height: (r.source_height as number | null) ?? null,
  }
}

/**
 * The newest image each night may carry on social now (J1 to J4, K2, K3, and the photography-led rule of 28 October):
 * its organiser's own, authorised for that night or under their logged yes for current and future events, approved,
 * in scope, unexpired and never withdrawn or replaced. The rule is the database's (social_usable_images, migration
 * 20261028205501), asked here and never restated, so the planner, the slide route and the sweep cannot disagree with
 * the approval and posting triggers. No row means the night is drawn in type (treatment B), which needs no licence (K1).
 */
/**
 * EVERY photograph the register permits for social now, per night (social_usable_images_all, the planner's own read in
 * ./lifecycle-plan.ts): the night's lead and the rest. A slide's photograph is permitted when it is any of these, so the
 * second photograph the planner gives a story (its feed holds the first) is judged as permitted as the lead (the story
 * of AMCF's final day, refused at 00:11 on 22 November 2026 though both records were identical).
 */
export async function usableImagesAll(db: Db, eventIds: readonly string[], now: Date): Promise<Map<string, UsableImage[]>> {
  const out = new Map<string, UsableImage[]>()
  if (eventIds.length === 0) return out
  const { data, error } = await db.rpc('social_usable_images_all', { p_events: [...new Set(eventIds)], p_at: now.toISOString() })
  if (error) throw new Error(`the photographs permitted for social could not be read: ${error.message}`)
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    if (isLibraryPhoto(r.asset_url as string)) continue
    const list = out.get(r.event_id as string) ?? []
    list.push({ ...usableOf(r), credit: (r.attribution_text as string | undefined) ?? '' })
    out.set(r.event_id as string, list)
  }
  return out
}

export async function usableImages(db: Db, eventIds: readonly string[], now: Date): Promise<Map<string, UsableImage>> {
  const usable = new Map<string, UsableImage>()
  if (eventIds.length === 0) return usable
  const { data, error } = await db.rpc('social_usable_images', { p_events: [...new Set(eventIds)], p_at: now.toISOString() })
  if (error) throw new Error(`the asset register could not be read: ${error.message}`)
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    if (isLibraryPhoto(r.asset_url as string)) continue
    usable.set(r.event_id as string, usableOf(r))
  }
  // Family C (the PM's 23:38 of 18 November 2026): an organiser's flyer is kept as artwork; its type, read once for the
  // register's own images. A failed read leaves each a photograph, so a night is drawn as family D, never wrongly as C.
  const ids = [...usable.values()].map((u) => u.assetId)
  if (ids.length > 0) {
    let artwork = new Set<string>()
    try {
      const { data: types, error: terr } = await db.from('social_assets').select('id, asset_type').in('id', ids)
      if (!terr) artwork = new Set(((types ?? []) as { id: string; asset_type: string }[]).filter((t) => t.asset_type === 'artwork').map((t) => t.id))
    } catch (error) {
      console.error('[social] the images\' types could not be read, each is drawn as a photograph:', error instanceof Error ? error.message : error)
    }
    for (const u of usable.values()) u.kind = artwork.has(u.assetId) ? 'artwork' : 'photo'
  }
  // D4 (the DemandOS directive, section 4): a night with no register photo takes the venue photo dealt to it, read
  // through the one reader for the use 'social', so only a photo whose rights row permits social reaches a post. A
  // failed read leaves those nights in type, never a post broken.
  const rest = [...new Set(eventIds)].filter((id) => !usable.has(id))
  if (rest.length > 0) {
    try {
      const covers = await eventCoversFor(rest, 'social', { rpc: (name, args) => db.rpc(name, args) as unknown as ReturnType<Parameters<typeof eventCoversFor>[2]['rpc']> })
      for (const [eventId, photo] of covers) {
        usable.set(eventId, {
          url: photo.imageUrl,
          // The card prints 'Photo: <credit>' itself.
          credit: photo.credit.replace(/^Photo:\s*/i, ''),
          assetId: `venue:${photo.imageUrl}`,
          focal: null,
          width: null,
          height: null,
        })
      }
    } catch (error) {
      console.error('[social] the venue photos could not be read, those nights stay in type:', error instanceof Error ? error.message : error)
    }
  }
  return usable
}

/** The newest photograph licensed for EventLinqs' own promotion and tied to no night, for a brand piece; else none. */
export async function brandImage(db: Db, now: Date): Promise<UsableImage | null> {
  const { data, error } = await db.rpc('social_brand_images', { p_at: now.toISOString() })
  if (error) throw new Error(`the brand photographs could not be read: ${error.message}`)
  // A stand-in of a kind of night (stand-ins.ts) is never the brand piece's photograph: it shows one kind, the piece every kind.
  const first = ((data ?? []) as Record<string, unknown>[]).find((r) => !standInOf(r.asset_url as string))
  return first ? usableOf(first) : null
}

/** Every photograph licensed for EventLinqs' own promotion and tied to no night, usable now (the stand-ins among them). */
export async function brandImages(db: Db, now: Date): Promise<UsableImage[]> {
  const { data, error } = await db.rpc('social_brand_images', { p_at: now.toISOString() })
  if (error) throw new Error(`the brand photographs could not be read: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map(usableOf)
}

/** The night whose OWN photograph a slide draws: a night, a story, a poster, a feature, or a cover showing one whole. */
function ownPhotoNightOf(sl: Slide): string | null {
  if ((sl.t === 'night' || sl.t === 'story' || sl.t === 'poster' || sl.t === 'feature' || sl.t === 'photo') && sl.photo) return sl.eventId
  if (sl.t === 'week_cover' && sl.photo && sl.photoEventId) return sl.photoEventId
  return null
}

/**
 * Each slide's photograph as it may be drawn NOW: the register's own row (with its focal point and size) where the
 * image is still usable for that slide's night, or for a brand slide, a day slide's or a cover's stand-in (stand-ins.ts)
 * for no night; null where it has gone, so the slide is drawn in type rather than with an image whose permission was
 * withdrawn after it was planned.
 */
export async function slideImagesNow(db: Db, slides: readonly Slide[], now: Date): Promise<Map<number, UsableImage | null>> {
  const out = new Map<number, UsableImage | null>()
  /* A night's own photograph on its slide: the register's row for that night now. */
  const nights = slides.flatMap((sl) => {
    const id = ownPhotoNightOf(sl)
    return id ? [id] : []
  })
  const byNight = await usableImages(db, nights, now)
  // Every permitted photograph of each night, not only its lead (usableImagesAll): the planner may give a story the second.
  const allByNight = await usableImagesAll(db, nights, now)
  const noNight = (sl: Slide) => 'photo' in sl && sl.photo !== null && (sl.t === 'brand' || sl.t === 'days' || sl.t === 'venue' || (sl.t === 'week_cover' && !sl.photoEventId))
  const brands = slides.some((sl) => 'photo' in sl && noNight(sl)) ? await brandImages(db, now) : []
  slides.forEach((sl, i) => {
    const id = ownPhotoNightOf(sl)
    if (id && 'photo' in sl) {
      const u = byNight.get(id)
      out.set(i, u && u.url === sl.photo ? u : ((allByNight.get(id) ?? []).find((x) => x.url === sl.photo) ?? null))
    } else if (sl.t === 'brand' && sl.photo) {
      // A brand piece takes the newest that is not a stand-in, as brandImage planned it.
      const newest = brands.find((x) => !standInOf(x.url))
      out.set(i, newest && newest.url === sl.photo ? newest : null)
    } else if ((sl.t === 'days' || sl.t === 'venue' || sl.t === 'week_cover') && sl.photo) {
      out.set(i, brands.find((b) => b.url === sl.photo) ?? null)
    }
  })
  return out
}

/* ------------------------------------------------------------------ J15: event validation is a publishing dependency */

const NIGHT_COLUMNS =
  'id, slug, title, start_date, end_date, timezone, created_at, listing_series_id, status, visibility, venue_name, venue_address, venue_city, venue_id, is_age_restricted, age_restriction_min, cover_image_url, summary, is_free, entry_mode, external_ticket_url, listing_source, category:event_categories!events_category_id_fkey(slug), organisation:organisations(name, slug), ticket_tiers(price, currency, is_active, total_capacity, sold_count, reserved_count), event_booking_links(availability), venue_row:venues(name)'

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

/**
 * AN OUTSIDE TICKET PAGE, READ AS THE DAILY LINK CHECK READS IT (the PM's 12:35 item 2 of 16 November 2026: "a seller
 * refusing a robot is never read as dead"; src/lib/events/link-check-run.ts). A 403 or 429 is the seller's wall against
 * robots, not a dead page: on 18 November 2026 AXS answered every server read with its 'AXS Access Info' page, and the gate
 * held LANY's approved posts for it. Then the night's own booking link for that page stands as its record holds it, and
 * only a link that reads dead, or no link of the night for that page, holds the piece. Any other failure (404, 410, a
 * server error, no answer) holds it as before. Null when the page may be posted to.
 */
async function ticketPageIssue(fetcher: Fetcher, name: string, e: Record<string, unknown>): Promise<string | null> {
  const url = String(e.external_ticket_url)
  const outside = await answers(fetcher, url)
  if (outside.ok) return null
  if (outside.status === 403 || outside.status === 429) {
    const link = (await readBookingLinks(e.id as string)).find((l) => l.url === url)
    if (link && link.availability !== 'dead') return null
    return link
      ? `${name}: its ticket page refuses our reader (${outside.status}) and its booking link reads dead.`
      : `${name}: its ticket page refuses our reader (${outside.status}) and no booking link of the night stands for it.`
  }
  return `${name}: its ticket page answers ${outside.status ?? 'nothing'}.`
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
  madeBy: 'planner' | 'edit' | 'regenerate' | 'sweep'
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

/** A revision's number and maker, for a piece's history: never its slides or words (the P0 of 18 November 2026). */
export const HISTORY_COLUMNS = 'version, made_by, made_at'

/**
 * Each piece's newest revision in full, read by (piece, version), twenty pieces a request: the week's read carries one
 * drawing a piece, never every drawing it ever had. A piece whose newest revision cannot be read is left out of the
 * map, said by the caller as missing; a read error throws.
 */
export async function newestRevisions(db: Db, newest: readonly (readonly [string, number])[]): Promise<Map<string, Revision>> {
  const out = new Map<string, Revision>()
  for (let i = 0; i < newest.length; i += 20) {
    const batch = newest.slice(i, i + 20)
    const { data, error } = await db
      .from('social_piece_revisions')
      .select(`piece_id, ${REVISION_COLUMNS}`)
      .or(batch.map(([id, v]) => `and(piece_id.eq.${id},version.eq.${v})`).join(','))
    if (error) throw new Error(`the newest drawings could not be read: ${error.message}`)
    for (const r of (data ?? []) as Record<string, unknown>[]) out.set(r.piece_id as string, revisionOf(r))
  }
  return out
}

/** The newest revision of a piece: what it says now (K7). */
async function newestRevision(db: Db, pieceId: string): Promise<Revision | null> {
  const { data } = await db.from('social_piece_revisions').select(REVISION_COLUMNS).eq('piece_id', pieceId).order('version', { ascending: false }).limit(1).maybeSingle()
  return data ? revisionOf(data as Record<string, unknown>) : null
}

/** D2: a night that sold out after planning stops its pieces, whatever the week's plan said ('Stop ... when an event sells out'). */
export function soldOutIssue(name: string, e: Record<string, unknown>): string | null {
  const gone = soldOut((e.ticket_tiers as TierRow[] | null) ?? [], (e.event_booking_links as { availability: string }[] | null) ?? [])
  return gone ? `${name}: it has sold out.` : null
}

/**
 * Every reason a piece may not be approved yet, re-read now (J15): each advertised night is still published, public and
 * not ended and has not sold out; its date, time and title are what the slide says; its admission is what the slide's chip says (cta.ts);
 * its outside ticket page answers; every image on a slide is usable now (K2); the piece's own page answers and lists
 * every night it advertises. siteOrigin is the deployment being checked, so a TEST plan is checked against TEST's pages.
 */
/**
 * When a revision's slides were last DRAWN (P0 section 7): an edit copies the slides it was made from and changes only
 * words, so its own time says nothing of the drawing; the newest revision not made by an edit does.
 */
async function drawnAtOf(db: Db, pieceId: string, rev: Revision): Promise<string> {
  if (rev.madeBy !== 'edit') return rev.madeAt
  const { data } = await db.from('social_piece_revisions').select('made_at').eq('piece_id', pieceId).neq('made_by', 'edit').order('version', { ascending: false }).limit(1).maybeSingle()
  return (data?.made_at as string | undefined) ?? rev.madeAt
}

/** A night as the publish gate reads it, from the row pieceDependencies reads (NIGHT_COLUMNS). */
/** How far before a night its season's earlier nights are read (lifecycle-plan.ts SEASON_LOOKBACK_DAYS, the same memory). */
const SEASON_BEGAN_LOOKBACK_MS = 14 * DAY_MS

/**
 * WHEN EACH NIGHT'S SEASON BEGAN (the PM's 04:40 of 22 November 2026): the earliest start of a public night of the same
 * title at the same venue in the 14 days before it, read through the one public rule as of that lookback's start (a night
 * ended since still counts). Absent for a season's first night. Throws when it cannot be read, and the gate holds.
 */
async function seasonBeganOf(db: Db, rows: readonly Record<string, unknown>[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const starts = rows.map((r) => Date.parse(String(r.start_date))).filter((t) => Number.isFinite(t))
  if (starts.length === 0) return out
  const since = new Date(Math.min(...starts) - SEASON_BEGAN_LOOKBACK_MS)
  const titles = [...new Set(rows.map((r) => String(r.title)))]
  const { data, error } = await applyPublicEventVisibility(db.from('events').select('id, title, venue_id, venue_name, start_date'), { now: since, includeExternal: true })
    .in('title', titles)
    .lt('start_date', new Date(Math.max(...starts)).toISOString())
    .order('start_date', { ascending: true })
    .limit(1000)
  if (error) throw new Error(`when the seasons began could not be read: ${error.message}`)
  const venueOf = (r: Record<string, unknown>) => (r.venue_id as string | null) ?? (String(r.venue_name ?? '').trim().toLowerCase() || null)
  for (const r of rows) {
    const start = Date.parse(String(r.start_date))
    const earlier = ((data ?? []) as Record<string, unknown>[]).filter(
      (e) => e.title === r.title && venueOf(e) === venueOf(r) && Date.parse(String(e.start_date)) < start && Date.parse(String(e.start_date)) >= start - SEASON_BEGAN_LOOKBACK_MS,
    )
    if (earlier.length > 0) out.set(r.id as string, String(earlier[0].start_date))
  }
  return out
}

/** A venue row's own name and the aliases recorded for it, the names a place line may give it; none without a row. */
export function venueNamesOf(row: { name?: string | null } | null, aliases: readonly string[] = []): string[] {
  if (!row) return []
  return [row.name ?? '', ...aliases].filter((a): a is string => typeof a === 'string' && a.trim() !== '')
}

/**
 * The aliases recorded for these venues (venue_aliases, each with its source), by venue id. These only ever add names a
 * place line may use, so a failed read is said and read as none: the place is then corrected from the rows at publishing,
 * never passed on a guess (venue-identity.ts).
 */
async function venueAliasesOf(db: Db, venueIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (venueIds.length === 0) return out
  try {
    const { data, error } = await db.from('venue_aliases').select('venue_id, alias').in('venue_id', [...venueIds])
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as { venue_id: string; alias: string }[]) out.set(r.venue_id, [...(out.get(r.venue_id) ?? []), r.alias])
  } catch (e) {
    console.error('[social] the venue aliases could not be read; none used', e instanceof Error ? e.message : e)
  }
  return out
}

/**
 * Every venue name and alias we hold, normalised, to its venue id (knownVenueIndex), so a place line that names exactly
 * another venue is held and never corrected over. Paged past the row ceiling. A failed read is said and read as none:
 * the place is then corrected from the night's own rows, which can only make the post name its true venue.
 */
async function knownVenuesOf(db: Db): Promise<KnownVenues> {
  try {
    const rows: { venueId: string; name: string }[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('venues').select('id, name').order('id').range(from, from + 999)
      if (error) throw new Error(error.message)
      const page = (data ?? []) as { id: string; name: string | null }[]
      for (const v of page) if (v.name) rows.push({ venueId: v.id, name: v.name })
      if (page.length < 1000) break
    }
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('venue_aliases').select('venue_id, alias').order('id').range(from, from + 999)
      if (error) throw new Error(error.message)
      const page = (data ?? []) as { venue_id: string; alias: string }[]
      for (const a of page) rows.push({ venueId: a.venue_id, name: a.alias })
      if (page.length < 1000) break
    }
    return knownVenueIndex(rows)
  } catch (e) {
    console.error('[social] the venues we hold could not be read; the place check reads none', e instanceof Error ? e.message : e)
    return new Map()
  }
}

/** A night as the timing engine reads it, from a NIGHT_COLUMNS row (timing.ts). */
export function timingNightOf(e: Record<string, unknown>): TimingNight {
  const free = e.is_free === true || ((e.ticket_tiers as TierRow[] | null) ?? []).filter((t) => t.is_active).every((t) => Number((t as { price?: number }).price ?? 0) === 0) && e.is_free !== false
  return {
    title: String(e.title ?? 'This night'),
    startDate: (e.start_date as string | null) ?? null,
    endDate: (e.end_date as string | null) ?? null,
    timezone: (e.timezone as string | null) ?? null,
    status: (e.status as string | null) ?? null,
    isFree: e.is_free === true ? true : e.is_free === false ? false : free,
    soldOut: soldOut((e.ticket_tiers as TierRow[] | null) ?? [], (e.event_booking_links as { availability: string }[] | null) ?? []),
  }
}

/** A piece's timing from its own facts (timing.ts): its moment from its key, its nights as they stand now. */
export function timingOfRows(momentKey: string | null, nights: readonly Record<string, unknown>[], preferredAt: Date | null, now: Date): Timing {
  const m = parseMomentKey(momentKey)
  const rows = nights.map(timingNightOf)
  const multiDay = nights.some((e) => e.end_date && Date.parse(String(e.end_date)) - Date.parse(String(e.start_date)) >= 24 * 3_600_000)
  return timingOf({ moment: m?.kind ?? null, day: m?.day ?? null, nights: rows, preferredAt, multiDay }, now)
}

/** A piece's timing read now: its moment key and its newest version's nights. A failed read is said, never a pass. */
async function timingOfPiece(db: Db, pieceId: string, preferredAt: Date | null, now: Date): Promise<Timing> {
  const { data: piece, error } = await db.from('social_pieces').select('moment_key').eq('id', pieceId).maybeSingle()
  if (error) return { kind: 'held', reason: `its moment could not be read (${error.message}); it waits for the next run` }
  const rev = await newestRevision(db, pieceId)
  const ids = rev?.eventIds ?? []
  const { data: nights, error: nerr } = ids.length > 0 ? await db.from('events').select(NIGHT_COLUMNS).in('id', ids) : { data: [], error: null }
  if (nerr) return { kind: 'held', reason: `its nights could not be read (${nerr.message}); it waits for the next run` }
  return timingOfRows((piece as { moment_key?: string | null } | null)?.moment_key ?? null, (nights ?? []) as Record<string, unknown>[], preferredAt, now)
}

/**
 * EXPIRY AT ONCE (Lawal's 19:13, sections 4 and 5; the PM's 19:13, item 4): every run (every ten minutes) reads each
 * scheduled piece's timing now, due or not, and expires those whose event was cancelled, postponed or finished, sold out
 * or closed its registration, or whose latest acceptable time has passed, each with its reason. A failed read leaves the
 * schedule as it was and says why; it is never published on a guess either, since the claim reads the same again.
 */
export async function expireLapsedSchedules(db: Db, now: Date): Promise<{ readonly expired: readonly string[]; readonly unread: readonly string[] }> {
  const expired: string[] = []
  const unread: string[] = []
  const { data, error } = await db.from('social_piece_schedules').select('id, piece_id, go_at, latest_at').eq('state', 'scheduled').order('go_at').limit(200)
  if (error) return { expired, unread: [`the schedules could not be read: ${error.message}`] }
  const byPiece = new Map<string, { id: string; goAt: string; latestAt: string | null }[]>()
  for (const r of (data ?? []) as { id: string; piece_id: string; go_at: string; latest_at: string | null }[]) {
    byPiece.set(r.piece_id, [...(byPiece.get(r.piece_id) ?? []), { id: r.id, goAt: r.go_at, latestAt: r.latest_at }])
  }
  for (const [pieceId, rows] of byPiece) {
    let t: Timing
    try {
      t = await timingOfPiece(db, pieceId, new Date(rows[0].goAt), now)
    } catch (e) {
      unread.push(`${pieceId}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    if (t.kind === 'held') {
      unread.push(`${pieceId}: ${t.reason}`)
      continue
    }
    for (const r of rows) {
      const reason = t.kind === 'expired' ? `EXPIRED: ${t.reason}` : pastLatest(r.latestAt ?? t.latestAt, now)
      if (!reason) continue
      const { error: uerr } = await db.from('social_piece_schedules').update({ state: 'expired', held_reason: reason.slice(0, 500) }).eq('id', r.id).eq('state', 'scheduled')
      if (uerr) unread.push(`${r.id}: ${uerr.message}`)
      else expired.push(`${pieceId} (${r.id}): ${reason}`)
    }
  }
  return { expired, unread }
}

/** The venue ids of these event rows. */
const venueIdsOf = (rows: readonly Record<string, unknown>[]) => [...new Set(rows.map((e) => e.venue_id as string | null).filter((v): v is string => typeof v === 'string'))]

function qualityNightOf(e: Record<string, unknown>, seasonBegan: string | null = null, aliasesByVenue: ReadonlyMap<string, readonly string[]> = new Map()): QualityNight {
  const venueId = (e.venue_id as string | null) ?? null
  return {
    seasonBegan,
    isFree: typeof e.is_free === 'boolean' ? (e.is_free as boolean) : null,
    venueAddress: (e.venue_address as string | null) ?? null,
    eventId: e.id as string,
    title: String(e.title),
    summary: (e.summary as string | null) ?? null,
    venueName: (e.venue_name as string | null) ?? null,
    // The venue row's own name and its recorded aliases (migration 20261122181501): the place check accepts any of the
    // venue's names. The row's own name is the one the engine's caption writers print (campaign.ts placeOf), so the
    // engine's place line and the check agree by construction: AMCF's listing reads 'Fed Square', its venue row
    // 'Federation Square'.
    venueId,
    venueAliases: venueNamesOf(e.venue_row as { name?: string | null } | null, venueId ? (aliasesByVenue.get(venueId) ?? []) : []),
    host: (e.venue_name as string | null) ?? null,
    categorySlug: (e.category as { slug: string | null } | null)?.slug ?? null,
    startDate: String(e.start_date),
    timezone: (e.timezone as string | null) ?? null,
    endDate: (e.end_date as string | null) ?? null,
  }
}

export async function pieceDependencies(
  db: Db,
  pieceId: string,
  now: Date,
  opts: { readonly siteOrigin: string; readonly fetcher?: Fetcher; readonly goesAt?: Date },
): Promise<string[]> {
  const fetcher = opts.fetcher ?? fetch
  const issues: string[] = []
  const { data: piece, error } = await db.from('social_pieces').select('kind, link, format, moment_key').eq('id', pieceId).maybeSingle()
  if (error || !piece) return [`The piece could not be read${error ? `: ${error.message}` : ''}.`]
  const rev = await newestRevision(db, pieceId)
  if (rev === null) return ['The piece has no version to approve.']
  const ids = rev.eventIds

  const { data: events, error: eerr } = ids.length > 0 ? await db.from('events').select(NIGHT_COLUMNS).in('id', ids) : { data: [], error: null }
  if (eerr) return [`The nights could not be read again: ${eerr.message}.`]
  const byId = new Map((events ?? []).map((e) => [e.id as string, e as Record<string, unknown>]))
  // When each night's season began (seasonBeganOf); a failed read holds the piece, never passes it.
  let began = new Map<string, string>()
  try {
    began = await seasonBeganOf(db, [...byId.values()])
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)]
  }

  const aliases = await venueAliasesOf(db, venueIdsOf([...byId.values()]))
  /* LAW 22, THE PUBLISH GATE (the PM's 21:58 and 22:02 of 17 November 2026): the piece's own content by one rule set
     (piece-quality.ts), here at approval and again at publishing, every platform's caption read; it carries Lawal's lock. */
  issues.push(
    ...pieceQuality({
      slides: rev.slides,
      caption: [rev.caption, ...Object.values(rev.versions ?? {}).map((v) => (v as { caption?: string } | null)?.caption ?? '')].join('\n'),
      captions: [rev.caption, ...Object.values(rev.versions ?? {}).map((v) => (v as { caption?: string } | null)?.caption ?? '')].filter((c) => c !== ''),
      momentKind: parseMomentKey((piece as { moment_key?: string | null }).moment_key ?? null)?.kind ?? null,
      madeAt: await drawnAtOf(db, pieceId, rev),
      nights: new Map([...byId.values()].map((e) => [e.id as string, qualityNightOf(e, began.get(e.id as string) ?? null, aliases)])),
      now,
      goesAt: opts.goesAt,
      knownVenues: await knownVenuesOf(db),
    }),
  )

  /* D3 (6): a night whose venue has since said no to our posts is refused; an unread answer refuses too. */
  try {
    const off = await venuesOff('our_posts', distributionDeps(db))
    for (const id of nightsLeftOut([...byId.values()].map((e) => ({ eventId: e.id as string, venueId: (e.venue_id as string | null) ?? null })), off)) {
      issues.push(`${String(byId.get(id)?.title)}: its venue has asked us not to carry its nights in our posts.`)
    }
  } catch (fault) {
    issues.push(`The venues' answers on our posts could not be read: ${(fault as Error).message}.`)
  }

  for (const id of ids) {
    const e = byId.get(id)
    const found = rev.slides.find((s) => 'eventId' in s && s.eventId === id)
    /* The 9.5 locked look: a night on a day slide's card, or on its own feature slide, read again from the night. */
    const row = rev.slides.flatMap((s) => (s.t === 'days' || s.t === 'venue' ? s.rows : [])).find((r) => r.eventId === id)
    if (found?.t === 'feature' || (!found && row)) {
      const name = e ? String(e.title) : (row?.title ?? id)
      if (!e) {
        issues.push(`${name}: the night no longer exists.`)
        continue
      }
      if (String(e.status) !== 'published' || String(e.visibility) !== 'public') issues.push(`${name}: it is no longer published and public.`)
      if (Date.parse(String(e.end_date)) <= now.getTime()) issues.push(`${name}: it has ended.`)
      const lockedGone = soldOutIssue(name, e)
      if (lockedGone) issues.push(lockedGone)
      const planned = found?.t === 'feature' ? found.startDate : String(row?.startDate)
      if (Date.parse(String(e.start_date)) !== Date.parse(planned)) {
        issues.push(`${name}: its date or time is now ${whenOf({ startDate: String(e.start_date), timezone: (e.timezone as string | null) ?? null } as CampaignNight)}.`)
      }
      const { cta } = await admissionOf(e, now)
      if (row && row.free !== (cta.state === 'free_open' || cta.state === 'free_registration')) issues.push(`${name}: its card says ${row.free ? 'free' : 'not free'}, and the night no longer does.`)
      if (cta.state === 'paid_external') {
        const ticket = await ticketPageIssue(fetcher, name, e)
        if (ticket) issues.push(ticket)
      }
      if (found?.t === 'feature' && found.photo) {
        const { data: ok } = await db.rpc('social_asset_usable', { p_url: found.photo, p_event: id, p_at: now.toISOString() })
        if (ok !== true) issues.push(`${name}: its image has no approved, unexpired licence for this night.`)
      }
      continue
    }
    /* An approved file prints its night's date and time in its own pixels, so the night is read again, never the file
       changed: a night gone, no longer public, ended, moved, or whose ticket page no longer answers holds the post. */
    if (found?.t === 'file') {
      const name = e ? String(e.title) : id
      if (!e) {
        issues.push(`${name}: the night no longer exists.`)
        continue
      }
      if (String(e.status) !== 'published' || String(e.visibility) !== 'public') issues.push(`${name}: it is no longer published and public.`)
      if (Date.parse(String(e.end_date)) <= now.getTime()) issues.push(`${name}: it has ended.`)
      if (found.startDate && Date.parse(String(e.start_date)) !== Date.parse(found.startDate)) {
        issues.push(`${name}: its date or time is now ${whenOf({ startDate: String(e.start_date), timezone: (e.timezone as string | null) ?? null } as CampaignNight)}, not what its approved file shows.`)
      }
      const { cta } = await admissionOf(e, now)
      if (cta.state === 'paid_external') {
        const ticket = await ticketPageIssue(fetcher, name, e)
        if (ticket) issues.push(ticket)
      }
      continue
    }
    /* Family F: a daily poster prints the night's facts from its own record, so each is read again from the night. */
    if (found?.t === 'poster') {
      const facts = found.night
      const name = facts.title
      if (!e) {
        issues.push(`${name}: the night no longer exists.`)
        continue
      }
      const { cta, priceLine } = await admissionOf(e, now)
      issues.push(...posterDrift(facts, e as unknown as NightNow, { state: cta.state, priceLine }, now))
      const posterGone = soldOutIssue(name, e)
      if (posterGone) issues.push(posterGone)
      if (found.photo) {
        const { data: ok } = await db.rpc('social_asset_usable', { p_url: found.photo, p_event: id, p_at: now.toISOString() })
        if (ok !== true) issues.push(`${name}: its image has no approved, unexpired licence for this night.`)
      }
      continue
    }
    /* LAW 37, THE LIFECYCLE PIECE (the standing policy's first run over one, 06:40 on 21 November 2026: 'The check could
       not run (2)', its photo slide read as a night slide): the slide is the night's own photograph, whole, so the night
       is read again (gone, no longer public, ended, sold out), a paid night's seller page asked, and the photograph's
       licence for social checked again for this night at this minute. */
    if (found?.t === 'photo') {
      const name = e ? String(e.title) : id
      if (!e) {
        issues.push(`${name}: the night no longer exists.`)
        continue
      }
      if (String(e.status) !== 'published' || String(e.visibility) !== 'public') issues.push(`${name}: it is no longer published and public.`)
      if (Date.parse(String(e.end_date)) <= now.getTime()) issues.push(`${name}: it has ended.`)
      const photoGone = soldOutIssue(name, e)
      if (photoGone) issues.push(photoGone)
      const { cta } = await admissionOf(e, now)
      if (cta.state === 'paid_external') {
        const ticket = await ticketPageIssue(fetcher, name, e)
        if (ticket) issues.push(ticket)
      }
      const { data: ok } = await db.rpc('social_asset_usable', { p_url: found.photo, p_event: id, p_at: now.toISOString() })
      if (ok !== true) issues.push(`${name}: its image has no approved, unexpired licence for this night.`)
      continue
    }
    const slide = found as Extract<Slide, { t: 'night' | 'story' }> | undefined
    const name = slide?.title ?? id
    if (!e) {
      issues.push(`${name}: the night no longer exists.`)
      continue
    }
    if (String(e.status) !== 'published' || String(e.visibility) !== 'public') issues.push(`${name}: it is no longer published and public.`)
    if (Date.parse(String(e.end_date)) <= now.getTime()) issues.push(`${name}: it has ended.`)
    const gone = soldOutIssue(name, e)
    if (gone) issues.push(gone)
    if (!slide) continue
    if (String(e.title) !== slide.title) issues.push(`${name}: its title is now "${String(e.title)}".`)
    const when = whenOf({ startDate: String(e.start_date), timezone: (e.timezone as string | null) ?? null } as CampaignNight)
    if (!slide.when.startsWith(when)) issues.push(`${name}: its date or time is now ${when}.`)
    const { cta } = await admissionOf(e, now)
    if (slide.t === 'night' && (cta.chip ?? null) !== (slide.chip ?? null)) issues.push(`${name}: its admission now reads "${cta.chip ?? 'no price'}", not "${slide.chip ?? 'no price'}".`)
    if (cta.state === 'paid_external') {
      const ticket = await ticketPageIssue(fetcher, name, e)
      if (ticket) issues.push(ticket)
    }
    if (slide.photo) {
      const { data: ok } = await db.rpc('social_asset_usable', { p_url: slide.photo, p_event: id, p_at: now.toISOString() })
      if (ok !== true) issues.push(`${name}: its image has no approved, unexpired licence for this night.`)
    }
    /* The treatment's words, as the night holds them now (J15 and the directive's section 12). */
    if (slide.words) {
      const fresh = nightWords({
        eventId: id,
        slug: String(e.slug),
        title: String(e.title),
        startDate: String(e.start_date),
        endDate: (e.end_date as string | null) ?? null,
        timezone: (e.timezone as string | null) ?? null,
        citySlug: '',
        cityName: slide.words.city,
        venueName: (e.venue_name as string | null) ?? null,
        host: null,
        categorySlug: (e.category as { slug: string | null } | null)?.slug ?? null,
        summary: null,
        approvedPhotoUrl: null,
        photoCredit: null,
        cta,
        priceLine: (await admissionOf(e, now)).priceLine,
      })
      for (const k of ['date', 'time', 'entry', 'action', 'eyebrow'] as const) {
        if ((fresh[k] ?? null) !== (slide.words[k] ?? null)) issues.push(`${name}: the slide says "${slide.words[k] ?? 'nothing'}" where the night now says "${fresh[k] ?? 'nothing'}".`)
      }
    }
  }

  /* A brand slide's photograph: licensed for EventLinqs' own promotion and tied to no night, still usable now. */
  for (const sl of rev.slides) {
    if (sl.t !== 'brand' || !sl.photo) continue
    const { data: ok } = await db.rpc('social_asset_usable', { p_url: sl.photo, p_event: null, p_at: now.toISOString() })
    if (ok !== true) issues.push("The brand photograph has no approved, current licence for EventLinqs' own promotion.")
  }
  /* A stand-in on a day slide or a cover (stand-ins.ts): the same licence for no night, still usable now. */
  for (const sl of rev.slides) {
    if (!((sl.t === 'days' || sl.t === 'venue' || (sl.t === 'week_cover' && !sl.photoEventId)) && sl.photo)) continue
    const { data: ok } = await db.rpc('social_asset_usable', { p_url: sl.photo, p_event: null, p_at: now.toISOString() })
    if (ok !== true) issues.push(`A photograph of the kind of night (${sl.photo.split('/').pop()}) has no approved, current licence for EventLinqs' own promotion.`)
  }
  /* A cover showing a night's own photograph whole: that night's licence, still usable now. */
  for (const sl of rev.slides) {
    if (sl.t !== 'week_cover' || !sl.photo || !sl.photoEventId) continue
    const { data: ok } = await db.rpc('social_asset_usable', { p_url: sl.photo, p_event: sl.photoEventId, p_at: now.toISOString() })
    if (ok !== true) issues.push("The cover's photograph has no approved, unexpired licence for its night.")
  }

  /* Lawal's social lock of 15 November 2026 is applied by the publish gate above (pieceQuality's [look]). */

  /* The directive's section 7: every slide, at every format it is made for, fits, reads and holds its contrast. */
  issues.push(...(await visualFaults(rev.slides, piece.format as 'feed' | 'story', await slideImagesNow(db, rev.slides, now))))

  /* K10: the creative checks, each platform's words and each slide's place as its night holds it. */
  issues.push(
    ...creativeRefusals(
      rev,
      new Map(
        [...byId.values()].map((e) => [
          e.id as string,
          { venueName: (e.venue_name as string | null) ?? null, title: String(e.title), venueNames: venueNamesOf(e.venue_row as { name?: string | null } | null, e.venue_id ? (aliases.get(e.venue_id as string) ?? []) : []) },
        ]),
      ),
    ),
  )

  /* The piece's own page answers on this deployment and lists every night it advertises. */
  const path = new URL(String(piece.link)).pathname
  const page = await answers(fetcher, `${opts.siteOrigin.replace(/\/$/, '')}${path}`)
  if (!page.ok) issues.push(`Its page ${path} answers ${page.status ?? 'nothing'}.`)
  // A partner kit's and a daily poster's link is the night's own /e/ link, which opens that night's page itself.
  else if (String(piece.kind) !== 'partner_kit' && String(piece.kind) !== 'daily_poster') {
    for (const id of ids) {
      const e = byId.get(id)
      if (e && !page.body.includes(`/events/${String(e.slug)}`)) issues.push(`${String(e.title)}: ${path} does not list it, so the post would send people to a page without it.`)
    }
  }
  return issues
}

/* ------------------------------------------------------------------ the weekly campaign (the release checklist, B, C, J, K) */

/** The guide cities a campaign is planned for: the cities table's own rows, as /free/<city>/this-week reads them. */
export async function readCampaignCities(db: Db): Promise<CampaignCity[]> {
  const { data, error } = await db.from('cities').select('slug, name').eq('free_guide', true).eq('is_active', true).order('display_order', { ascending: true })
  if (error) throw new Error(`the guide cities could not be read: ${error.message}`)
  return (data ?? []).map((c) => ({ slug: c.slug as string, name: c.name as string }))
}

/** The nights the lifecycle planner reads now, as the week's plan reads them (the pre-flight's own read, AV (c)). */
export async function readLifecycleNights(db: Db, now: Date): Promise<CampaignNight[]> {
  return readCampaignNights(db, await readCampaignCities(db), weekStartOf(now), now, { aheadDays: LIFECYCLE_AHEAD_DAYS })
}

/** The week's public nights in the guide cities, each with its call to action, its price line and any usable image. */
export async function readCampaignNights(
  db: Db,
  cities: readonly CampaignCity[],
  weekStart: string,
  now: Date,
  opts: { readonly aheadDays?: number } = {},
): Promise<CampaignNight[]> {
  // Three weeks on, for Coming Up's consideration stage; every piece of the week keeps to its week by dayInWeek. The
  // rows come soonest first, so if the limit below ever cuts, it cuts only the furthest nights. The lifecycle planner
  // reads further (LIFECYCLE_AHEAD_DAYS) for its announce and build posts.
  const weekEnd = new Date(Date.parse(`${weekStart}T00:00:00Z`) + (opts.aheadDays ?? 21) * DAY_MS)
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
      endDate: (e.end_date as string | null) ?? null,
      timezone: (e.timezone as string | null) ?? null,
      listedAt: (e.created_at as string | null) ?? null,
      seriesId: (e.listing_series_id as string | null) ?? null,
      citySlug: city.slug,
      cityName: city.name,
      venueName: venueOf(e.venue_name as string | null),
      // The venue row's own name, one spelling per place (the PM's 16:40, fix 4); none when only an operator is known.
      placeName: e.venue_id ? (((e.venue_row as { name: string | null } | null)?.name ?? '').trim() || null) : null,
      host: hostOf({ listingSource: (e.listing_source as string | null) ?? null, organisationName: organisation?.name ?? null, organisationSlug: organisation?.slug ?? null, venueName: (e.venue_name as string | null) ?? null }),
      categorySlug: (e.category as { slug: string | null } | null)?.slug ?? null,
      summary: (e.summary as string | null) ?? null,
      approvedPhotoUrl: image?.url ?? null,
      photoCredit: image?.credit ?? null,
      approvedPhotoKind: image?.kind ?? null,
      cta,
      priceLine,
      venueAddress: (e.venue_address as string | null) ?? null,
      venueId: (e.venue_id as string | null) ?? null,
      isAgeRestricted: (e.is_age_restricted as boolean | null) === true,
      ageMin: (e.age_restriction_min as number | null) ?? null,
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
  const brand = await brandImage(db, now)
  /* The founder's leave-outs, and D3 (6): the nights of a venue that said no to our posts (a failed read throws). */
  const excluded = new Set([...(await excludedFor(db, campaignId)), ...nightsLeftOut(
    nights.map((n) => ({ eventId: n.eventId, venueId: n.venueId ?? null })),
    await venuesOff('our_posts', distributionDeps(db)),
  )])
  const week = planCampaign({ nights, cities, weekStart, origin: ORIGIN, excluded, brandPhoto: brand ? { url: brand.url, credit: brand.credit } : null, spotlightsFrom: spotlightsFromDay(now, weekStart), standIns: STAND_INS_IN_PLAN })
  /* Family F: one daily poster per city per day (daily-posters.ts), beside the week's pieces. */
  // The PM's 20:40 fix 6: the daily posters are still the old planner look (a seller's pill, a raw address, a calendar
  // block), so they are held out of the week's plan, and so out of the publishing queue, until they are in the locked
  // look. A switch, never a deletion (law 13): DAILY_POSTERS_IN_PLAN turns them back on.
  // A partner kit's caption is of its kind (the PM's 03:10 of 18 November 2026, class 8), the one poster caption for its night.
  const pieces = withKitCaptions([...week.pieces, ...(DAILY_POSTERS_IN_PLAN ? dailyPosterPieces({ nights, cities, weekStart, origin: ORIGIN, excluded }) : [])], nights, cities, ORIGIN)
  // Lawal's social lock of 15 November 2026 (campaign.ts lockRefusal): only a piece drawn wholly in the locked look and
  // carrying a photograph enters the week's plan; the rest wait behind OLDER_LOOK_IN_PLAN (law 13), never deleted.
  const locked = OLDER_LOOK_IN_PLAN ? pieces : pieces.filter((p) => lockRefusal(p.slides) === null)
  // LAW 37 (Lawal, 20 November 2026, 11:24): every earlier family is never drawn again, so neither the week's plan nor the
  // hourly redraw (which draws from this plan) holds one; they wait behind EARLIER_FAMILIES_ON (law 13), never deleted.
  return { ...week, pieces: locked.filter((p) => law37Refusal(p.slides) === null) }
}

/** The partner's own link, minted for their kit alone, so what their share brings is counted as theirs. */
async function partnerLink(db: Db, eventId: string, by: string | null): Promise<{ id: string; url: string } | null> {
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
    // The counted /go hop takes this piece's own id where the planner marked it (go-hop.ts; AV (e)).
    caption: withPieceId(p.caption, pieceId),
    versions: withPieceId(p.versions, pieceId),
    message,
    made_by: madeBy,
    made_by_user: by,
    made_at: now.toISOString(),
  }
}

/**
 * existing counts today's plan found already kept; kept is every piece the week holds after this press, which is the
 * number the founder is told (a night ended since Monday takes its partner kit out of today's plan, not out of the week).
 */
export type CampaignPlanned = {
  readonly campaignId: string
  readonly weekStart: string
  readonly created: number
  readonly existing: number
  readonly kept: number
  readonly held: readonly string[]
  readonly requests: number
  /** The lifecycle moments this plan drew or found kept already (social_pieces.moment_key), for postNightNow. */
  readonly momentKeys?: readonly string[]
}

/**
 * "Plan this week": ONE campaign for the week, found again on a second press (F7), each piece kept once (the
 * database's social_pieces_once) with its first revision. Planning writes the campaign, its pieces, their first
 * revisions, each partner's own link and the drafted image requests; nothing is approved and nothing is published
 * here (F9). plannedBy is the person who pressed it, or null when the daily social run planned it (car 58: the daily
 * picks wait in /admin/social for Lawal's approval; the run never writes his name on what he did not press).
 */
export async function planCampaignWeek(db: Db, input: { readonly plannedBy: string | null; readonly now: Date; readonly ownerAsked?: { readonly eventId: string } }): Promise<CampaignPlanned> {
  const weekStart = weekStartOf(input.now)
  const { error: cerr } = await db
    .from('social_campaigns')
    .upsert({ week_start: weekStart, planned_by: input.plannedBy, planned_at: input.now.toISOString() }, { onConflict: 'week_start', ignoreDuplicates: true })
  if (cerr) throw new Error(`the week's campaign could not be kept: ${cerr.message}`)
  const campaignId = await campaignIdFor(db, weekStart)
  if (campaignId === null) throw new Error("the week's campaign could not be read")

  // An owner's Post now for one night draws that night's lifecycle piece alone (postNightNow), never the week's others.
  const week = input.ownerAsked ? null : await planNow(db, campaignId, weekStart, input.now)
  const weekPlans = week?.pieces ?? []
  const imageRequests = week?.imageRequests ?? []
  // LAW 37 (l), THE LIFECYCLE (train AI-2): today's few moments, the history read first (lifecycle-plan.ts). A failed read
  // plans no lifecycle piece and is said in held, never a guess.
  const held: string[] = []
  let lifecycle: PiecePlan[] = []
  if (LIFECYCLE_ON) {
    try {
      const nights = await readCampaignNights(db, await readCampaignCities(db), weekStart, input.now, { aheadDays: LIFECYCLE_AHEAD_DAYS })
      const planned = await planLifecyclePieces(db, { now: input.now, nights, origin: ORIGIN, ownerAsked: input.ownerAsked })
      lifecycle = planned.pieces
      held.push(...planned.notes)
    } catch (error) {
      held.push(`lifecycle: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const plans = [...weekPlans, ...lifecycle]
  const { data: have, error: herr } = await db.from('social_pieces').select('kind, city, partner_name, poster_day, moment_key').eq('campaign_id', campaignId).limit(2000)
  if (herr) throw new Error(`the week's pieces could not be read: ${herr.message}`)
  const keyOf = (kind: string, city: string, partner: string | null, day: string | null, moment: string | null) => `${kind}|${city}|${partner ?? ''}|${day ?? ''}|${moment ?? ''}`
  const kept = new Set(
    (have ?? []).map((p) => keyOf(p.kind as string, p.city as string, (p.partner_name as string | null) ?? null, (p.poster_day as string | null) ?? null, (p.moment_key as string | null) ?? null)),
  )

  let created = 0
  let existing = 0
  for (const p of plans) {
    if (kept.has(keyOf(p.kind, p.city, p.partnerName, p.posterDay ?? null, p.momentKey ?? null))) {
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
    /* A daily poster's own /e/ link: its piece's link, and the footer its story and square print (correction 3). */
    if (p.kind === 'daily_poster' && p.eventIds[0]) {
      const own = await partnerLink(db, p.eventIds[0], input.plannedBy)
      if (own === null) {
        held.push(`${p.kind} ${p.city} ${p.posterDay}: no link of its own could be made`)
        continue
      }
      link = own.url
      shareLinkId = own.id
      const printed = own.url.replace(/^https?:\/\//, '').replace(/^www\./, '')
      p.slides = p.slides.map((s) => (s.t === 'poster' ? { ...s, night: { ...s.night, shortLink: printed } } : s))
    }
    const { data: piece, error: perr } = await db
      .from('social_pieces')
      .insert({ campaign_id: campaignId, kind: p.kind, city: p.city, audience: p.audience, objective: p.objective, purpose: p.purpose, next_step: p.nextStep, outcome: p.outcome, link, format: p.format, partner_name: p.partnerName, share_link_id: shareLinkId, poster_day: p.posterDay ?? null, moment_key: p.momentKey ?? null, planned_at: input.now.toISOString() })
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
  const momentKeys = lifecycle.map((p) => p.momentKey).filter((k): k is string => typeof k === 'string' && k !== '')
  return { campaignId, weekStart, created, existing, kept: kept.size + created, held, requests, momentKeys }
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
  /** A daily poster's own day (social_pieces.poster_day), so a redraw takes the poster of the same day. */
  posterDay: string | null
  /** A lifecycle piece's moment (social_pieces.moment_key): the redraw never swaps one moment for another. */
  momentKey?: string | null
  revision: Revision
  history: { version: number; madeBy: Revision['madeBy']; madeAt: string }[]
  decisions: { revision: number; decision: string; reason: string; at: string }[]
  state: PieceState
  postUrl: string | null
  /** B5: its moment on each network once approved, and whether it went or was held. */
  schedule: { platform: SocialPlatform; goAt: string; state: string; heldReason: string | null; publishedRef: string | null }[]
}

/** The week's campaign as /admin/social shows it: each piece's newest revision, its history and its state (K7). */
export async function readCampaign(db: Db, now: Date): Promise<{ weekStart: string; campaignId: string; pieces: PieceRow[]; excluded: string[] } | null> {
  const weekStart = weekStartOf(now)
  const campaignId = await campaignIdFor(db, weekStart)
  if (campaignId === null) return null
  const { data, error } = await db
    .from('social_pieces')
    // Each revision's number and maker only: the slides and words are read for each piece's NEWEST revision alone
    // (newestRevisions below). The P0 of 18 November 2026: every revision's slides came with the week, 904 revisions
    // and 2.4 MB, and Lawal could not open /admin/social.
    .select(`id, kind, city, audience, objective, purpose, next_step, outcome, link, format, partner_name, poster_day, moment_key, social_piece_revisions(${HISTORY_COLUMNS}), social_piece_decisions(revision, decision, reason, decided_at), social_piece_approvals(revision), social_piece_postings(post_url)`)
    .eq('campaign_id', campaignId)
    .order('planned_at', { ascending: true })
    .limit(500)
  if (error) throw new Error(`the week's pieces could not be read: ${error.message}`)
  const ORDER: PiecePlan['kind'][] = ['week_ahead', 'discovery_reel', 'weekend_carousel', 'tonight_tomorrow', 'venue_spotlight', 'category_spotlight', 'coming_up', 'organiser_campaign', 'brand_campaign', 'partner_kit']
  // A partner kit went when Lawal marked it sent or sent the message carrying its own link (src/lib/social/kit-sent.ts).
  const kitsSentByEmail = await readKitTouchesSent(db, (data ?? []).filter((p) => p.kind === 'partner_kit').map((p) => (p.link as string | null) ?? null))
  const historyOf = (p: Record<string, unknown>) =>
    ((p.social_piece_revisions as Record<string, unknown>[] | null) ?? [])
      .map((r) => ({ version: Number(r.version), madeBy: r.made_by as Revision['madeBy'], madeAt: r.made_at as string }))
      .sort((a, b) => b.version - a.version)
  const full = await newestRevisions(db, (data ?? []).flatMap((p) => {
    const h = historyOf(p as Record<string, unknown>)
    return h.length ? [[p.id as string, h[0].version] as const] : []
  }))
  const pieces: PieceRow[] = []
  for (const p of data ?? []) {
    const revisions = historyOf(p as Record<string, unknown>)
    const newest = full.get(p.id as string)
    if (revisions.length === 0 || !newest) continue
    const decisions = ((p.social_piece_decisions as Record<string, unknown>[] | null) ?? [])
      .map((d) => ({ revision: Number(d.revision), decision: d.decision as string, reason: d.reason as string, at: d.decided_at as string }))
      .sort((a, b) => b.at.localeCompare(a.at))
    const approvals = ((p.social_piece_approvals as { revision: number }[] | null) ?? []).map((a) => Number(a.revision))
    const posting = ((p.social_piece_postings as { post_url: string }[] | { post_url: string } | null) ?? null)
    const marked = Array.isArray(posting) ? (posting[0]?.post_url ?? null) : (posting?.post_url ?? null)
    const postUrl = marked ?? (p.kind === 'partner_kit' && kitsSentByEmail.has(p.link as string) ? 'sent' : null)
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
      posterDay: (p.poster_day as string | null) ?? null,
      momentKey: (p.moment_key as string | null) ?? null,
      revision: newest,
      history: revisions.map((r) => ({ version: r.version, madeBy: r.madeBy, madeAt: r.madeAt })),
      decisions,
      state,
      postUrl,
      schedule: [],
    })
  }
  pieces.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.city.localeCompare(b.city))
  const schedules = await readSchedules(db, pieces.map((x) => x.id))
  for (const x of pieces) x.schedule = schedules.get(x.id) ?? []
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

/**
 * Whether a piece is drawn at its public address, /kit/<piece>/<n> (window 6's message 7 names the kit's images): only a
 * partner kit whose newest version is approved and not rejected; a kit already sent stays drawn.
 */
export function publicKitServes(p: { kind: PiecePlan['kind']; newestVersion: number; approvedVersions: readonly number[]; rejectedVersions: readonly number[] }): boolean {
  // A daily poster too (family F): its approved square is the preview in an organiser's first invitation (the
  // directive's correction 4), read by the outreach engine from /kit/<piece>/1?format=square.
  return (p.kind === 'partner_kit' || p.kind === 'daily_poster') && p.approvedVersions.includes(p.newestVersion) && !p.rejectedVersions.includes(p.newestVersion)
}

/** An approved partner kit's slides for its public address, or null for anything publicKitServes refuses. */
export async function readPublicKit(db: Db, pieceId: string): Promise<{ slides: Slide[]; format: 'feed' | 'story'; city: string; partnerName: string | null } | null> {
  const { data } = await db.from('social_pieces').select('format, kind, city, partner_name').eq('id', pieceId).maybeSingle()
  if (!data) return null
  const rev = await newestRevision(db, pieceId)
  if (!rev) return null
  const [{ data: approvals }, { data: decisions }] = await Promise.all([
    db.from('social_piece_approvals').select('revision').eq('piece_id', pieceId),
    db.from('social_piece_decisions').select('revision, decision').eq('piece_id', pieceId).eq('decision', 'rejected'),
  ])
  const serves = publicKitServes({
    kind: data.kind as PiecePlan['kind'],
    newestVersion: rev.version,
    approvedVersions: (approvals ?? []).map((a) => a.revision as number),
    rejectedVersions: (decisions ?? []).map((d) => d.revision as number),
  })
  if (!serves) return null
  return { slides: rev.slides, format: data.format as 'feed' | 'story', city: data.city as string, partnerName: (data.partner_name as string | null) ?? null }
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

export type WeekApproved = { readonly approved: string[]; readonly held: { id: string; label: string; reason: string }[] }

/**
 * The week in one press (the release checklist's B3, "per post and per week"): the same checked approval as one piece,
 * one piece after another, on every piece still waiting; drafted only, so an approved, rejected or gone piece is never
 * touched. A piece that fails its checks, or whose check throws, is held with its reason and the rest go on.
 */
export async function approveWeek(
  pieces: readonly { id: string; state: PieceState; label: string }[],
  approveOne: (pieceId: string) => Promise<Done>,
): Promise<WeekApproved> {
  const approved: string[] = []
  const held: { id: string; label: string; reason: string }[] = []
  for (const p of pieces.filter((x) => x.state === 'drafted')) {
    try {
      const done = await approveOne(p.id)
      if (done.state === 'done') approved.push(p.id)
      else held.push({ id: p.id, label: p.label, reason: done.reason })
    } catch (error) {
      held.push({ id: p.id, label: p.label, reason: `Its checks could not run: ${(error as Error).message}` })
    }
  }
  return { approved, held }
}

/** This week's campaign approved in one press, each piece through approvePieceChecked. */
export async function approveWeekChecked(db: Db, input: { readonly by: string; readonly now: Date; readonly siteOrigin: string }): Promise<WeekApproved | null> {
  const campaign = await readCampaign(db, input.now)
  if (campaign === null) return null
  const pieces = campaign.pieces.map((p) => ({ id: p.id, state: p.state, label: `${p.kind.replace(/_/g, ' ')}${p.partnerName ? `, ${p.partnerName}` : ''}, ${p.city}` }))
  return approveWeek(pieces, (pieceId) => approvePieceChecked(db, { pieceId, by: input.by, now: input.now, siteOrigin: input.siteOrigin }))
}

/**
 * THE STANDING PUBLISHING POLICY APPROVES (Lawal's operations mandate of 19 November 2026, 12:03, law 31: "If standing
 * authorisation covers the content, publish automatically ... Do not ask the founder to repeat approvals already
 * recorded"; the operating model's section 4). While the switch social_auto_publish is on, the social run gives every
 * drafted piece of this week the same checked approval a person's press gives (approvePieceChecked: the night eligible
 * and not ended, the permitted photograph or an approved photo free family, the working link, the locked look), in the
 * founder's name, because the policy is his approval. A piece that fails a check is held with its reason and the rest go
 * on. The older planner looks never post (law 26): a daily poster or a partner kit is never approved here.
 */
export const NEVER_POSTED_KINDS: readonly string[] = ['daily_poster', 'partner_kit']

/** The week's pieces the standing policy may approve: every kind but the two that never post, labelled for the log. */
export function policyPieces(
  pieces: readonly { readonly id: string; readonly kind: string; readonly state: PieceState; readonly partnerName: string | null; readonly city: string }[],
): { id: string; state: PieceState; label: string }[] {
  return pieces
    .filter((p) => !NEVER_POSTED_KINDS.includes(p.kind))
    .map((p) => ({ id: p.id, state: p.state, label: `${p.kind.replace(/_/g, ' ')}${p.partnerName ? `, ${p.partnerName}` : ''}, ${p.city}` }))
}

export type PolicyDryRow = { readonly id: string; readonly label: string; readonly eligible: boolean; readonly reasons: readonly string[] }

/**
 * THE STANDING POLICY, AS A DRY RUN (the PM's 13:50 of 19 November 2026, item 3, on Lawal's 13:47: "do not make the post.
 * Wait till 6 pm"): every drafted piece of the week the policy may approve, each with the same checks the approval runs
 * (pieceDependencies), eligible or not and why. Writes nothing; the two kinds that never post are left out as the policy
 * leaves them out.
 */
export async function standingPolicyDryRun(db: Db, input: { readonly now: Date; readonly siteOrigin: string }): Promise<PolicyDryRow[] | null> {
  const campaign = await readCampaign(db, input.now)
  if (campaign === null) return null
  const rows: PolicyDryRow[] = []
  for (const p of policyPieces(campaign.pieces).filter((x) => x.state === 'drafted')) {
    try {
      // The policy's own bar (the PM's 03:42 of 20 November 2026, item 4) before the checks a person's press runs.
      const rev = await newestRevision(db, p.id)
      const own = rev ? policyRefusals(rev, await drawnAtOf(db, p.id, rev)) : ['The piece has no version to approve.']
      const reasons = [...own, ...(await pieceDependencies(db, p.id, input.now, { siteOrigin: input.siteOrigin }))]
      rows.push({ id: p.id, label: p.label, eligible: reasons.length === 0, reasons })
    } catch (fault) {
      rows.push({ id: p.id, label: p.label, eligible: false, reasons: [`The check could not run: ${fault instanceof Error ? fault.message : String(fault)}`] })
    }
  }
  return rows
}

/**
 * The approved files looked at full size and passed as printing no photo credit and nothing false (law 5): the PM's 03:42
 * of 20 November 2026, items 1 and 3 (AMCF's feed and story without the printed credit, the story without its false 'Tap
 * the link', since no link sticker reaches a story through our publisher). Every other approved file waits for a person.
 */
export const POLICY_READ_FILES: ReadonlySet<string> = new Set(['amcf-feed-ig45-clean.jpg', '22-amcf-story-nolink.jpg'])

/**
 * THE STANDING POLICY'S OWN BAR (the PM's 03:42 of 20 November 2026, item 4): the policy approves in the founder's name,
 * with no person reading the piece, so it approves only a piece the code in force would not draw again (pieceCorrections:
 * drawn before PIECE_RULES_SINCE, the older look, the language, the caption marks, a stand-in, a street address, a
 * caption credit) and whose drawn image prints no photo credit: a photographed slide carrying a credit is drawn with it
 * under the photograph (src/lib/broadcast/campaign-slides.tsx), and an approved file prints whatever its pixels hold, so
 * only a file in POLICY_READ_FILES passes. Anything else waits for a person's press, its reasons said. Pure.
 */
export function policyRefusals(rev: Pick<Revision, 'slides' | 'caption' | 'versions'>, drawnAt: string): string[] {
  const captions = [rev.caption, ...Object.values(rev.versions ?? {}).map((v) => (v as { caption?: string } | null)?.caption ?? '')].filter((c) => c.trim())
  const out = pieceCorrections({ slides: rev.slides, caption: rev.caption, captions, madeAt: drawnAt }).map((c) => `The code in force would draw it again: ${c}`)
  rev.slides.forEach((s, i) => {
    if (s.t === 'file') {
      const name = s.url.slice(s.url.lastIndexOf('/') + 1)
      if (!POLICY_READ_FILES.has(name)) out.push(`Slide ${i + 1} is the approved file ${name}, not yet looked at and passed as printing no photo credit.`)
      return
    }
    const photo = 'photo' in s ? (s as { photo?: string | null }).photo : null
    const credit = 'credit' in s ? (s as { credit?: string | null }).credit : null
    if (photo && typeof credit === 'string' && credit.trim()) out.push(`Slide ${i + 1} prints the photo credit '${credit.trim()}' under its photograph.`)
  })
  return out
}

export async function approveUnderStandingPolicy(
  db: Db,
  // ONLY what this hour's logged dry run read ELIGIBLE (the PM's 10:47 of 20 November 2026, item 1; policy-guard.ts):
  // a piece outside it is never approved here, so a refusal of one inside it is a check that failed between the two.
  input: { readonly by: string; readonly now: Date; readonly siteOrigin: string; readonly only: ReadonlySet<string> },
): Promise<WeekApproved | null> {
  const campaign = await readCampaign(db, input.now)
  if (campaign === null) return null
  return approveWeek(policyPieces(campaign.pieces).filter((p) => input.only.has(p.id)), async (pieceId) => {
    // The policy's own bar first (the PM's 03:42 item 4), then the same checked approval a person's press gives.
    const rev = await newestRevision(db, pieceId)
    if (!rev) return { state: 'refused', reason: 'The piece has no version to approve.' }
    const own = policyRefusals(rev, await drawnAtOf(db, pieceId, rev))
    if (own.length > 0) return { state: 'refused', reason: `Outside the standing policy until a person reads it: ${own.join(' ')}` }
    return approvePieceChecked(db, { pieceId, by: input.by, now: input.now, siteOrigin: input.siteOrigin })
  })
}

export type Redrawn = { readonly redrawn: readonly string[]; readonly kept: readonly string[] }

/**
 * THE WEEK DRAWN AGAIN IN THE LOCKED LOOK (the PM's 09:35 of 16 November 2026, read by WINDOW 5A): a piece planned before
 * Lawal's social lock of 15 November, or before a fix to the drawing, waits in the older look, and the checked approval
 * refuses the older look, so the week's switch-on would approve none of it (production's 29 pieces of 16 November were
 * planned at 06:40 by the code before #288). Every DRAFTED piece of this week whose newest revision the lock refuses is
 * drawn again by the planner as it would plan it now: a new revision made by the sweep, never an approved, rejected or
 * gone piece, never a daily poster (DAILY_POSTERS_IN_PLAN keeps them out). A piece the week's plan no longer draws in
 * the locked look stays as it is, said. No decision row: the database keeps a person's name on a regeneration, and the
 * revision's own made_by says the sweep drew it.
 */
export async function redrawOlderLook(db: Db, now: Date): Promise<Redrawn> {
  if (OLDER_LOOK_IN_PLAN) return { redrawn: [], kept: [] }
  const campaign = await readCampaign(db, now)
  if (campaign === null) return { redrawn: [], kept: [] }
  if (!campaign.pieces.some(isOlderLookDraft)) return { redrawn: [], kept: [] }
  const { pieces: weekFresh } = await planNow(db, campaign.campaignId, campaign.weekStart, now)
  // LAW 37 LIFECYCLE DRAFTS (the 06:40 run of 21 November 2026: AMCF's two pieces of 05:10, stale and printing 'Fri 20' on
  // a Saturday, were matched against the week's plan, which holds no lifecycle moment, so they were kept and refused):
  // each stale lifecycle draft is planned again for its own moment, the planner reading the history as if it were not
  // yet drawn, so the moment is due and its photograph its own. A failed read draws none and is said.
  const lifecycleDue = campaign.pieces.filter((p) => isOlderLookDraft(p) && (p.momentKey ?? null) !== null)
  let lifecycleFresh: PiecePlan[] = []
  const lifecycleNotes: string[] = []
  if (LIFECYCLE_ON && lifecycleDue.length > 0) {
    try {
      const nights = await readCampaignNights(db, await readCampaignCities(db), campaign.weekStart, now, { aheadDays: LIFECYCLE_AHEAD_DAYS })
      lifecycleFresh = (await planLifecyclePieces(db, { now, nights, origin: ORIGIN, redrawing: new Set(lifecycleDue.map((p) => p.id)) })).pieces
    } catch (error) {
      lifecycleNotes.push(`lifecycle: drawn again it could not be planned: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const fresh = [...weekFresh, ...lifecycleFresh]
  const { redraw, kept: keptPlans } = olderLookRedraws(campaign.pieces, fresh)
  const kept = [...keptPlans, ...lifecycleNotes]
  const redrawn: string[] = []
  const notKept = [...kept]
  for (const r of redraw) {
    // Judged as the photo rights sweep will leave it: a drawing the lock would then refuse is never written.
    const refused = refusedOnceSwept(r.plan.slides, await slideImagesNow(db, r.plan.slides, now))
    if (refused) {
      notKept.push(`${r.label}: its photographs are not yet allowed by the register, so drawn again it would still be refused: ${refused}`)
      continue
    }
    const { error } = await db.from('social_piece_revisions').insert(revisionRow(r.id, r.version, r.plan, r.message, 'sweep', null, now))
    if (error) {
      /* Another run wrote this version first: the database kept one, which is the rule. */
      if (error.code !== '23505') notKept.push(`${r.label}: ${refusalOf(error.message) ?? error.message}`)
      continue
    }
    redrawn.push(r.label)
  }
  return { redrawn, kept: notKept }
}

/**
 * A DRAWING AS THE PHOTO RIGHTS SWEEP WILL LEAVE IT (16 November 2026, read on production at 15:31: eleven pieces at
 * version 7 after three hours). The older look sweep drew pieces again with stand-in photographs; the photo rights sweep
 * then blanked those photographs, none being registered yet (Lawal's item 26), so the cover led with none, the lock refused
 * it, and the next hour drew it again. The lock's reason for the slides once every photograph the register would not
 * allow now (images, from slideImagesNow) is taken out, or null when the lock passes them. Pure.
 */
export function refusedOnceSwept(slides: readonly Slide[], images: ReadonlyMap<number, UsableImage | null>): string | null {
  const left = slides.map((sl, i) => (images.has(i) && images.get(i) === null ? ({ ...sl, photo: null, credit: null } as Slide) : sl))
  return lockRefusal(left)
}

type RedrawCandidate = Pick<PieceRow, 'id' | 'kind' | 'city' | 'partnerName' | 'state'> &
  Partial<Pick<PieceRow, 'posterDay' | 'momentKey' | 'history'>> & { readonly revision: Pick<Revision, 'slides' | 'version' | 'message'> & Partial<Pick<Revision, 'caption' | 'madeAt' | 'madeBy' | 'versions'>> }

/** When a candidate's slides were last DRAWN: its newest revision not made by an edit; unknown reads as current. */
function drawnAtOfCandidate(p: RedrawCandidate): string {
  const drawn = [...(p.history ?? [])].sort((a, b) => b.version - a.version).find((h) => h.madeBy !== 'edit')
  return drawn?.madeAt ?? (p.revision.madeBy !== 'edit' ? p.revision.madeAt : undefined) ?? PIECE_RULES_SINCE
}

/**
 * A piece the hourly run draws again (Lawal's 00:12 of 18 November 2026: corrected automatically, never a hold): drafted,
 * of any kind, daily posters included, with a correction due: drawn before the rules in force, in the older list look,
 * or with wrong or robotic words (piece-quality.ts pieceCorrections).
 */
export function isOlderLookDraft(p: RedrawCandidate): boolean {
  // Every caption that posts is read, as the publish gate reads them (the pack of 05:43: two posters whose faults were only
  // in their platform versions were never drawn again).
  const captions = [p.revision.caption ?? '', ...Object.values(p.revision.versions ?? {}).map((v) => v?.caption ?? '')]
  const posted = captions.join('\n')
  return p.state === 'drafted' && pieceCorrections({ slides: p.revision.slides, caption: posted, captions, madeAt: drawnAtOfCandidate(p) }).length > 0
}

/**
 * Which of the week's pieces the sweep draws again, and with what (pure): each older look draft takes the piece the
 * week's plan draws now of its kind, city and partner, at the next version; one the plan no longer draws, or draws
 * refused, is kept as it is with the reason. A partner kit keeps the message the founder wrote.
 */
export function olderLookRedraws(
  pieces: readonly RedrawCandidate[],
  fresh: readonly PiecePlan[],
): { readonly redraw: readonly { id: string; label: string; version: number; message: string | null; plan: PiecePlan }[]; readonly kept: readonly string[] } {
  const redraw: { id: string; label: string; version: number; message: string | null; plan: PiecePlan }[] = []
  const kept: string[] = []
  for (const p of pieces.filter(isOlderLookDraft)) {
    const label = `${p.kind} ${p.city}${p.partnerName ? ` ${p.partnerName}` : ''}`
    const f = fresh.find((x) => x.kind === p.kind && x.city === p.city && (x.partnerName ?? null) === (p.partnerName ?? null) && (x.posterDay ?? null) === (p.posterDay ?? null) && (x.momentKey ?? null) === (p.momentKey ?? null))
    if (!f) {
      kept.push(`${label}: this week's plan no longer draws it in the locked look, so it stays as it is`)
      continue
    }
    const refused = pieceRefusal(f)
    if (refused) {
      kept.push(`${label}: ${refused}`)
      continue
    }
    // NEVER A LOOP (the sweep loop of 17 November, #291): a drawing that would be the same as the one kept (a fault the
    // source carries, a title a redraw cannot change) is never written again; it stays, said once an hour in the log.
    if (JSON.stringify(f.slides) === JSON.stringify(p.revision.slides) && f.caption === (p.revision.caption ?? null)) {
      kept.push(`${label}: drawn again it would be the same, so it stays as it is`)
      continue
    }
    redraw.push({ id: p.id, label, version: p.revision.version + 1, message: f.kind === 'partner_kit' ? (p.revision.message ?? f.message) : f.message, plan: f })
  }
  return { redraw, kept }
}

/** The network a post address belongs to ('sent' is a partner kit), as migration 20261122124501 fills it. Pure. */
export function networkOfPost(postUrl: string): 'instagram' | 'facebook' | 'partner' {
  if (postUrl === 'sent') return 'partner'
  return /^https:\/\/(www\.)?instagram\.com\//i.test(postUrl) ? 'instagram' : 'facebook'
}

/** A piece as it went (F8): its address, or "sent" for a partner kit; the database refuses one without its approval. */
export async function recordPiecePosting(db: Db, input: { readonly pieceId: string; readonly postUrl: string; readonly by: string; readonly now: Date }): Promise<Done> {
  const rev = await newestRevision(db, input.pieceId)
  const { data: approval } = rev
    ? await db.from('social_piece_approvals').select('id').eq('piece_id', input.pieceId).eq('revision', rev.version).maybeSingle()
    : { data: null }
  if (!approval) return { state: 'refused', reason: 'Approve this version first: nothing goes without your approval.' }
  const { error } = await db.from('social_piece_postings').insert({ piece_id: input.pieceId, approval_id: approval.id as string, post_url: input.postUrl, posted_at: input.now.toISOString(), recorded_by: input.by, platform: networkOfPost(input.postUrl) })
  if (error) return { state: 'refused', reason: error.code === '23505' ? 'This piece is recorded already on that network.' : (refusalOf(error.message) ?? error.message) }
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
  // Caption standard version 2's marks (caption-marks.ts): an emoji (the PM's 21:00: a caption with none is refused), at
  // most five, one exclamation mark in the hook only, never a long dash.
  const marks = captionMarkFaults(caption)
  if (marks.length > 0) return { state: 'refused', reason: marks.map((m) => m.replace(/^\[caption\] /, '')).join(' ') }
  // LAW 22's publish gate at draft save: the same language rules as approval and publishing (piece-quality.ts).
  const wrong = languageFaults(caption.split('\n'))
  if (wrong.length > 0) return { state: 'refused', reason: wrong.join(' ') }
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
  /** The media-rights record (the directive's section 8): the file as supplied, the day it came, what it may be used for. */
  readonly originalFile: string | null
  readonly receivedOn: string | null
  readonly permittedUses: string | null
  /** Where the subject is, 0 to 1 across and down, so every format's crop keeps it; none means the busiest region. */
  readonly focal: { readonly x: number; readonly y: number } | null
  readonly sourceWidth: number | null
  readonly sourceHeight: number | null
  /** Which of the night's photographs leads, 1 first (the directive: the strongest photograph is the hero). */
  readonly leadRank: number | null
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
  eventId: string | null
  originalFile: string | null
  receivedOn: string | null
  permittedUses: string | null
  withdrawalStatus: 'current' | 'withdrawn' | 'replaced'
  withdrawalReason: string | null
  focal: { x: number; y: number } | null
  size: { width: number; height: number } | null
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
    // A grant whose own words permit promotion is recorded for social as well as site (grant-scope.ts; the PM's 11:05).
    scope: scopeToRecord(input.scope, input.permissionEvidence),
    archival: input.archival,
    expires_at: input.expiresAt,
    restrictions: input.restrictions,
    original_file: input.originalFile,
    received_on: input.receivedOn,
    permitted_uses: input.permittedUses,
    focal_x: input.focal?.x ?? null,
    focal_y: input.focal?.y ?? null,
    source_width: input.sourceWidth,
    source_height: input.sourceHeight,
    lead_rank: input.leadRank,
    created_by: input.by,
  })
  if (error) {
    if (error.code === '23505') return { state: 'refused', reason: 'This asset is in the register for that night already.' }
    if (error.code === '23514') return { state: 'refused', reason: 'Every field is needed, the addresses must be https, someone else\'s work needs their permission in their words, the original file, the day it came and what it may be used for, and an archival photograph says so in its credit.' }
    return { state: 'refused', reason: refusalOf(error.message) ?? error.message }
  }
  return { state: 'done' }
}

/**
 * AN ORGANISER'S SELF-LISTED PHOTO (organiser self-listing, Lawal's ruling of 8 November 2026, 07:01 (3): a submission
 * "publishes with the organiser's own photo through the photo lock and its credit"). Entered approved, for this night's
 * own page and cards, and for social posts where the organiser's words grant them (scope from scopeFromPermission, the
 * PM's 01:21 of 22 November 2026): the organiser ticked that they own it and gave permission in the form's own
 * words, the self-listing checks verified the event against their booking page, and Lawal's ruling is the standing
 * approval, named in approved_by as the founder. Never a social post: a post still needs a person's approval of a piece.
 * Here, so the register keeps its one writer (scripts/guards/social-one-writer.mjs).
 */
export async function addSelfListedPhoto(
  db: Db,
  input: {
    readonly eventId: string
    readonly assetUrl: string
    readonly sourceUrl: string
    readonly rightsHolder: string
    readonly permissionEvidence: string
    readonly originalFile: string
    readonly receivedOn: string
    readonly permittedUses: string
    readonly restrictions: string
    /** What the organiser's own words grant (submission.ts scopeFromPermission): the listing, or the listing and posts. */
    readonly scope: 'site' | 'both'
    readonly approvedBy: string
    readonly now: Date
  },
): Promise<Done> {
  if (isLibraryPhoto(input.assetUrl)) return { state: 'refused', reason: 'A library photograph never stands for a named night (K3).' }
  const { error } = await db.from('social_assets').insert({
    asset_state: 'organiser_authorised',
    asset_type: 'photo',
    event_id: input.eventId,
    asset_url: input.assetUrl,
    source_url: input.sourceUrl,
    rights_holder: input.rightsHolder,
    attribution_text: input.rightsHolder,
    permission_evidence: input.permissionEvidence,
    scope: input.scope,
    archival: false,
    original_file: input.originalFile,
    received_on: input.receivedOn,
    permitted_uses: input.permittedUses,
    restrictions: input.restrictions,
    approval_status: 'approved',
    approved_by: input.approvedBy,
    approved_at: input.now.toISOString(),
    created_by: null,
  })
  if (error) return { state: 'refused', reason: refusalOf(error.message) ?? error.message }
  return { state: 'done' }
}

/** The register's id of a pending image for a night, by its stored address; null when there is none. */
export async function pendingAssetId(db: Db, eventId: string, assetUrl: string): Promise<string | null> {
  const { data } = await db.from('social_assets').select('id').eq('event_id', eventId).eq('asset_url', assetUrl).eq('approval_status', 'pending').maybeSingle()
  return (data?.id as string | undefined) ?? null
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

/**
 * The rights holder withdraws an asset (part D): it is never usable again, and the hourly sweep regenerates every piece
 * that has not gone and carries it, in type. Final: a withdrawn asset is never put back (the database refuses).
 */
export async function withdrawAsset(db: Db, input: { readonly id: string; readonly reason: string; readonly now: Date }): Promise<Done> {
  const { data, error } = await db
    .from('social_assets')
    .update({ withdrawal_status: 'withdrawn', withdrawal_reason: input.reason, withdrawn_at: input.now.toISOString() })
    .eq('id', input.id)
    .eq('withdrawal_status', 'current')
    .select('id')
  if (error) return { state: 'refused', reason: refusalOf(error.message) ?? error.message }
  if ((data ?? []).length === 0) return { state: 'refused', reason: 'That asset is withdrawn or replaced already, or does not exist.' }
  return { state: 'done' }
}

/** The rights holder replaces an asset with another current one of the same night: the old is never usable again. */
export async function replaceAsset(db: Db, input: { readonly id: string; readonly replacementId: string; readonly reason: string; readonly now: Date }): Promise<Done> {
  const { data, error } = await db
    .from('social_assets')
    .update({ withdrawal_status: 'replaced', withdrawal_reason: input.reason, replaced_by: input.replacementId, withdrawn_at: input.now.toISOString() })
    .eq('id', input.id)
    .eq('withdrawal_status', 'current')
    .select('id')
  if (error) return { state: 'refused', reason: refusalOf(error.message) ?? error.message }
  if ((data ?? []).length === 0) return { state: 'refused', reason: 'That asset is withdrawn or replaced already, or does not exist.' }
  return { state: 'done' }
}

export type Swept = { readonly checked: number; readonly regenerated: readonly { readonly pieceId: string; readonly version: number; readonly removed: number }[]; readonly failed: readonly string[] }

/** A caption with the credit lines of removed photographs taken out (a credit another slide still carries stays). */
export function withoutCredits(text: string, removed: ReadonlySet<string>, kept: ReadonlySet<string>): string {
  return text
    .split('\n')
    .filter((line) => !(line.startsWith('Photo: ') && removed.has(line.slice(7)) && !kept.has(line.slice(7))))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * THE SLIDES WHOSE PHOTOGRAPH IS NO LONGER USABLE: only a slide that holds a photograph now can lose one. The P0 of
 * 18 November 2026 (Lawal could not open /admin/social): slideImagesNow maps every slide that may hold a night's photo,
 * and a slide whose photo was already empty maps to null, so the hourly sweep read it as withdrawn and wrote the same
 * drawing again every hour (of 141 revisions since 08:00 that morning, 119 were identical to the one before; one piece
 * held 56). Pure.
 */
export function withdrawnSlides(slides: readonly Slide[], images: ReadonlyMap<number, unknown>): number[] {
  return [...images.entries()]
    .filter(([i, u]) => {
      const sl = slides[i] as { photo?: string | null } | undefined
      return u === null && Boolean(sl && 'photo' in sl && sl.photo)
    })
    .map(([i]) => i)
}

/** JSON with every object's keys in one order, so a drawing read back from the database (jsonb orders its keys) compares
 * equal to the same drawing made in code. Pure. */
function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`
  if (x && typeof x === 'object') {
    return `{${Object.keys(x as Record<string, unknown>).filter((k) => (x as Record<string, unknown>)[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(x ?? null)
}

/** Two drawings are the same when their nights, slides, both platforms' words and caption are. Pure. */
export function sameDrawing(
  a: { eventIds: readonly string[]; slides: readonly unknown[]; versions: unknown; caption: string },
  b: { eventIds: readonly string[]; slides: readonly unknown[]; versions: unknown; caption: string },
): boolean {
  return canonical([a.eventIds, a.slides, a.versions, a.caption]) === canonical([b.eventIds, b.slides, b.versions, b.caption])
}

/**
 * THE HOURLY SWEEP (part D: "withdrawal pulls images from every unposted post within the hour"). Every piece that has
 * not gone, whose newest version carries an image no longer usable for its slide (withdrawn, replaced, expired or
 * refused since it was planned), gets a new version with those images taken out and the slides drawn in type, and a
 * decision saying so written by no person. Its earlier approval is then of an older version, so it can never post
 * (the posting trigger refuses that, and re-checks the images itself). A piece that has gone is never touched.
 * Idempotent: a second run finds nothing to take out.
 */
export async function sweepWithdrawnImages(db: Db, now: Date): Promise<Swept> {
  const { data: gone, error: gerr } = await db.from('social_piece_postings').select('piece_id').limit(5000)
  if (gerr) throw new Error(`the postings could not be read: ${gerr.message}`)
  const posted = new Set((gone ?? []).map((g) => g.piece_id as string))
  const { data: revs, error: rerr } = await db
    .from('social_piece_revisions')
    .select(`piece_id, ${REVISION_COLUMNS}`)
    .order('version', { ascending: false })
    .limit(5000)
  if (rerr) throw new Error(`the pieces could not be read: ${rerr.message}`)
  const newest = new Map<string, Revision>()
  for (const r of (revs ?? []) as Record<string, unknown>[]) {
    const id = r.piece_id as string
    if (!posted.has(id) && !newest.has(id)) newest.set(id, revisionOf(r))
  }
  const regenerated: { pieceId: string; version: number; removed: number }[] = []
  const failed: string[] = []
  let checked = 0
  for (const [pieceId, rev] of newest) {
    if (!rev.slides.some((sl) => 'photo' in sl && sl.photo)) continue
    checked += 1
    const images = await slideImagesNow(db, rev.slides, now)
    const goneAt = withdrawnSlides(rev.slides, images)
    if (goneAt.length === 0) continue
    const removed = new Set(goneAt.map((i) => (rev.slides[i] as { credit: string | null }).credit).filter((c): c is string => Boolean(c)))
    const slides = rev.slides.map((sl, i) => (goneAt.includes(i) ? ({ ...sl, photo: null, credit: null } as Slide) : sl))
    const kept = new Set(slides.map((sl) => ('credit' in sl ? sl.credit : null)).filter((c): c is string => Boolean(c)))
    const versions = {
      instagram: { ...rev.versions.instagram, caption: withoutCredits(rev.versions.instagram.caption, removed, kept) },
      facebook: { ...rev.versions.facebook, caption: withoutCredits(rev.versions.facebook.caption, removed, kept) },
    }
    const stillPhoto = slides.some((sl) => 'photo' in sl && sl.photo)
    const mode: PiecePlan['mode'] = stillPhoto ? 'photo_led' : rev.slides.some((sl) => sl.t === 'brand' || sl.t === 'offer') ? 'graphic_led' : 'type_led'
    const plan = { eventIds: rev.eventIds, picks: rev.picks, mode, slides, caption: withoutCredits(rev.caption, removed, kept), versions } as PiecePlan
    // Never the same drawing twice: a version equal to the newest would only void its approval and weigh down the page.
    if (sameDrawing(plan, rev)) continue
    const version = rev.version + 1
    const { error } = await db.from('social_piece_revisions').insert(revisionRow(pieceId, version, plan, rev.message, 'sweep', null, now))
    if (error) {
      /* Another sweep wrote this version first: the database kept one, which is the rule. */
      if (error.code !== '23505') failed.push(`${pieceId}: ${refusalOf(error.message) ?? error.message}`)
      continue
    }
    const one = goneAt.length === 1
    const { error: derr } = await db.from('social_piece_decisions').insert({
      piece_id: pieceId,
      revision: version,
      decision: 'image_withdrawn',
      reason: `The sweep: ${goneAt.length} image${one ? ' was' : 's were'} withdrawn, replaced or expired since this piece was planned, so ${one ? 'that slide is' : 'those slides are'} drawn in type. Approve this version again.`,
      decided_by: null,
      decided_at: now.toISOString(),
    })
    if (derr) failed.push(`${pieceId}: its decision was not kept: ${refusalOf(derr.message) ?? derr.message}`)
    regenerated.push({ pieceId, version, removed: goneAt.length })
  }
  return { checked, regenerated, failed }
}

export async function readAssets(db: Db): Promise<AssetRow[]> {
  const { data, error } = await db
    .from('social_assets')
    .select('id, asset_state, asset_type, asset_url, source_url, rights_holder, permission_evidence, attribution_text, scope, archival, expires_at, restrictions, approval_status, event_id, original_file, received_on, permitted_uses, withdrawal_status, withdrawal_reason, focal_x, focal_y, source_width, source_height, events(title)')
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
    eventId: (r.event_id as string | null) ?? null,
    originalFile: (r.original_file as string | null) ?? null,
    receivedOn: (r.received_on as string | null) ?? null,
    permittedUses: (r.permitted_uses as string | null) ?? null,
    withdrawalStatus: r.withdrawal_status as AssetRow['withdrawalStatus'],
    withdrawalReason: (r.withdrawal_reason as string | null) ?? null,
    focal: r.focal_x === null || r.focal_y === null ? null : { x: Number(r.focal_x), y: Number(r.focal_y) },
    size: r.source_width && r.source_height ? { width: Number(r.source_width), height: Number(r.source_height) } : null,
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

/* ------------------------------------------------------------------ B5: approved pieces schedule themselves */

/** The last moment anything of this format went on the account: an item 11 post or a campaign piece. */
async function lastGone(db: Db, format: SocialFormat): Promise<Date | null> {
  const post = await lastPosted(db, 'instagram', format)
  const { data } = await db.from('social_piece_postings').select('posted_at, social_pieces!inner(format)').eq('social_pieces.format', format).order('posted_at', { ascending: false }).limit(1)
  const piece = (data ?? [])[0]?.posted_at as string | undefined
  const times = [post?.getTime() ?? null, piece ? Date.parse(piece) : null].filter((t): t is number => t !== null)
  return times.length === 0 ? null : new Date(Math.max(...times))
}

export type Scheduled = {
  readonly scheduled: readonly { readonly pieceId: string; readonly goAt: string }[]
  readonly held: readonly string[]
  /** The operating model's A1: each of the next seven days with no feed post or no story, named (daily-rhythm.ts). */
  readonly floor: readonly string[]
}

/** Every moment still waiting on a format: one per schedule (its Instagram row; Facebook's carries the same moment). */
async function waitingMoments(db: Db, format: SocialFormat): Promise<Date[]> {
  const { data, error } = await db.from('social_piece_schedules').select('go_at, social_pieces!inner(format)').eq('state', 'scheduled').eq('platform', 'instagram').eq('social_pieces.format', format).limit(2000)
  if (error) throw new Error(`the schedules waiting could not be read: ${error.message}`)
  return (data ?? []).map((r) => new Date(r.go_at as string))
}

/**
 * B5, THE WEEK'S PLAN (the PM's 09:10 of 16 November 2026): every piece whose NEWEST revision a person approved, not gone
 * and not yet given its moment for that approval, gets one on Instagram and Facebook from planMoments (cadence.ts): the
 * next free band that keeps the gap from the last post and from every schedule still waiting, earliest deadline first.
 * A piece's deadline is the end of its earliest night, since publishing holds a piece whole once a night has ended; a
 * story waits for the day of its first night. A piece that cannot go before its deadline is never scheduled late: its
 * schedule is written and held at once with the reason, so it shows on /admin/social and is not tried again for that
 * approval. Writes schedules only; publishes nothing (F9). A second run finds them scheduled already (the database keeps
 * one per piece, network and approval).
 */
/** Why an Instagram row waits while the bio's booking journey is unproven (instagramBioJourneyProven). */
export const INSTAGRAM_BIO_UNPROVEN =
  "the bio's booking journey to this event is not proven on a phone yet (flag instagram_bio_journey_proven), and an Instagram caption sends readers to the link in our bio; Facebook carries the event's own link and goes alone"

/** The flag instagram_bio_journey_proven, read now; absent or unreadable is unproven (fails closed). */
export async function instagramBioJourneyProven(db: Db): Promise<boolean> {
  const { data, error } = await db.from('feature_flags').select('enabled').eq('flag', 'instagram_bio_journey_proven').maybeSingle()
  return !error && data?.enabled === true
}

export async function scheduleApprovedPieces(
  db: Db,
  now: Date,
  /** goNow: pieces an owner asked to post at this minute (postNightNow): given now, never a band; every other check stands. */
  opts: { readonly fetcher?: Fetcher; readonly goNow?: ReadonlySet<string> } = {},
): Promise<Scheduled> {
  const { data: approvals, error } = await db.from('social_piece_approvals').select('id, piece_id, revision, approved_at').order('approved_at', { ascending: true }).limit(2000)
  if (error) throw new Error(`the approvals could not be read: ${error.message}`)
  const { data: gone } = await db.from('social_piece_postings').select('piece_id').limit(5000)
  const posted = new Set((gone ?? []).map((g) => g.piece_id as string))
  const { data: have } = await db.from('social_piece_schedules').select('approval_id').limit(5000)
  const scheduledFor = new Set((have ?? []).map((h) => h.approval_id as string))
  const due: { id: string; approvalId: string; format: SocialFormat; kind: string; approvedAt: Date; eventIds: string[]; rev: Revision; momentKey: string | null }[] = []
  for (const a of approvals ?? []) {
    const pieceId = a.piece_id as string
    if (posted.has(pieceId) || scheduledFor.has(a.id as string)) continue
    const rev = await newestRevision(db, pieceId)
    if (!rev || rev.version !== (a.revision as number)) continue
    const { data: piece } = await db.from('social_pieces').select('format, kind, moment_key').eq('id', pieceId).maybeSingle()
    if (!piece) continue
    // A PARTNER KIT IS NEVER POSTED ON OUR ACCOUNT (the PM's 23:09 of 18 November 2026; law 26 names the plain kit): it is
    // a story card and a message for the partner to share from their own, recorded as sent, never given a slot here.
    if (String(piece.kind) === 'partner_kit') continue
    due.push({ id: pieceId, approvalId: a.id as string, format: piece.format as SocialFormat, kind: String(piece.kind), approvedAt: new Date(a.approved_at as string), eventIds: rev.eventIds, rev, momentKey: (piece.moment_key as string | null) ?? null })
  }
  if (due.length === 0) return { scheduled: [], held: [], floor: [] }

  /* Each piece's window from its own nights, read now. */
  const ids = [...new Set(due.flatMap((d) => d.eventIds))]
  const { data: nights, error: nerr } = ids.length > 0 ? await db.from('events').select(NIGHT_COLUMNS).in('id', ids) : { data: [], error: null }
  // Read once for the run, when the first piece is judged (venue-identity.ts): every venue we hold, and these nights' aliases.
  let known: KnownVenues | undefined
  let nightAliases: Map<string, string[]> | undefined
  // Read once for the run, when the first Instagram row is judged: whether the bio's booking journey is proven.
  let bioProven: boolean | undefined
  if (nerr) throw new Error(`the nights of the approved pieces could not be read: ${nerr.message}`)
  // When each night's season began (seasonBeganOf), for the gate's first day rule below; a failed read throws, as the
  // nights' own read does, and the run holds.
  const seasonBegun = await seasonBeganOf(db, (nights ?? []) as Record<string, unknown>[])
  const nightOf = new Map((nights ?? []).map((n) => [n.id as string, { title: String(n.title), start: Date.parse(String(n.start_date)), end: Date.parse(String(n.end_date)), startDate: String(n.start_date), endDate: (n.end_date as string | null) ?? null, zone: (n.timezone as string | null)?.trim() || LIFECYCLE_ZONE }]))
  // Each piece goes before its earliest night STARTS (scheduleWindowOf, class 2 of the PM's 22:08 of 17 November 2026).
  const firstStarting = new Map<string, { title: string; start: Date }>()
  // The operating model's A2 (the PM's 01:39 of 19 November 2026): each family leans to its day of the week, only where
  // that day falls inside its own window (rhythmDays), so law 18's tiers always win and the lean never makes it late.
  const pieces: FloorPiece[] = due.map((d) => {
    const moment = parseMomentKey(d.momentKey)
    const onNow = ON_NOW.test(d.rev.caption)
    // A lifecycle piece's window is its moment's own day of the run (lifecycle.ts sessionOfDay), never a season's first
    // day (the PM's 09:10 of 22 November 2026): AMCF's last day reads 11am to 8pm on 22 November, not its 20 November start.
    const own = d.eventIds
      .map((id) => nightOf.get(id))
      .filter((n): n is NonNullable<ReturnType<typeof nightOf.get>> => n !== undefined)
      .map((n) => (moment ? nightOnDay(n, moment.day) : { title: n.title, start: n.start, end: n.end }))
    const window = scheduleWindowOf(d.format, own, undefined, { onNow })
    // A weekend line with no night of its own goes on a Thursday or a Friday (the PM's 03:10, class 6).
    if (window.first === null) return { id: d.id, format: d.format, kind: d.kind, approvedAt: d.approvedAt, days: weekendDaysOf(d.rev.caption, own.length) ?? rhythmDays(d.kind, {}, now) }
    firstStarting.set(d.id, window.first)
    // LAW 37 (l), A MOMENT IS ITS DAY (train AI-2): a lifecycle piece posts on the day its moment names, or not at all
    // (its window the night's own, cut to that day), never on another day of the week.
    if (moment) {
      // The moment's day governs, a tomorrow story the day before its night (momentWindowOf, 21 November 2026); words
      // that say on now never go before that day's doors open ('still on' only after the opening: the PM's 09:00).
      const { notBefore, deadline } = lifecycleWindow(d.format, moment.day, onNow, own)
      return { id: d.id, format: d.format, kind: d.kind, approvedAt: d.approvedAt, deadline, notBefore, days: null }
    }
    return { id: d.id, format: d.format, kind: d.kind, approvedAt: d.approvedAt, deadline: window.deadline, notBefore: window.notBefore, days: rhythmDays(d.kind, window, now) }
  })

  // The starting calendar until our own posts teach the hours (cadence.ts, STARTING_CALENDAR).
  const rules = {
    feed: withStartingCalendar(await cadenceFor(db, 'instagram', 'feed', now), 'feed'),
    story: withStartingCalendar(await cadenceFor(db, 'instagram', 'story', now), 'story'),
  }
  const taken: Record<SocialFormat, Date[]> = { feed: await waitingMoments(db, 'feed'), story: await waitingMoments(db, 'story') }
  for (const format of ['feed', 'story'] as const) {
    const last = await lastGone(db, format)
    if (last) taken[format].push(last)
  }
  // A1, the daily floor: a thin day takes a discovery family piece from a day that has two; a day nothing can fill is named.
  const goNow = opts.goNow ?? new Set<string>()
  const banded = pieces.filter((p) => !goNow.has(p.id))
  const plan = applyDailyFloor({ pieces: banded, plan: planMoments(banded, rules, taken, now), rules, taken, now })
  const lateOf = new Map(plan.late.map((l) => [l.id, l]))
  // An owner's piece goes at this minute only inside its own window: from its day, and before its night starts unless
  // its words say it is on now (scheduleWindowOf); outside it, it is held with the reason, as a late piece is.
  const nowRefusal = (id: string): string | null => {
    const fp = pieces.find((p) => p.id === id)
    if (!fp) return null
    if (fp.notBefore && now.getTime() < fp.notBefore.getTime()) return `Not posted now: its day has not come (${dayTime(fp.notBefore.toISOString(), now)}).`
    if (fp.deadline && now.getTime() > fp.deadline.getTime()) return `Not posted now: ${firstStarting.get(id)?.title ?? 'its night'} has started (${dayTime(fp.deadline.toISOString(), now)}), and a piece never posts once its night has started.`
    return null
  }
  const scheduled: { pieceId: string; goAt: string }[] = []
  const held: string[] = []
  for (const d of due) {
    const asked = goNow.has(d.id)
    if (asked) {
      const refused = nowRefusal(d.id)
      if (refused) {
        held.push(`${d.id}: ${refused}`)
        continue
      }
    }
    const late = asked ? undefined : lateOf.get(d.id)
    const at = asked ? now : (plan.moments.get(d.id) ?? late?.firstFree)
    if (!at) continue
    const goAt = at.toISOString()
    // THE TIMING ENGINE AT SCHEDULING (timing.ts; Lawal's 19:13, section 4, point 2): the piece's window from its own
    // facts, stored on both rows; a slot past its latest acceptable time is recorded EXPIRED at once, never published.
    const pieceNights = ((nights ?? []) as Record<string, unknown>[]).filter((e) => d.rev.eventIds.includes(e.id as string))
    const timing = timingOfRows(d.momentKey, pieceNights, at, now)
    const windowCols = timing.kind === 'window' ? { objective: timing.objective, latest_at: timing.latestAt, expires_at: timing.expiresAt, recovery: timing.recovery, timing_basis: timing.basis.slice(0, 500) } : {}
    const rows = (['instagram', 'facebook'] as const).map((platform) => ({ piece_id: d.id, approval_id: d.approvalId, platform, go_at: goAt, ...windowCols }))
    const { error: ierr } = await db.from('social_piece_schedules').insert(rows)
    if (ierr) {
      held.push(`${d.id}: ${ierr.code === '23505' ? 'scheduled already' : (refusalOf(ierr.message) ?? ierr.message)}`)
      continue
    }
    const outOfWindow = timing.kind === 'window' ? pastLatest(timing.latestAt, at) : timing.kind === 'expired' ? `EXPIRED: ${timing.reason}` : null
    if (outOfWindow || timing.kind === 'held') {
      const state = timing.kind === 'held' ? 'held' : 'expired'
      const reason = timing.kind === 'held' ? `Not scheduled: ${timing.reason}` : `Not scheduled, ${outOfWindow}`
      await db.from('social_piece_schedules').update({ state, held_reason: reason.slice(0, 500) }).eq('piece_id', d.id).eq('approval_id', d.approvalId).eq('state', 'scheduled')
      held.push(`${d.id}: ${reason}`)
      continue
    }
    /* LAW 22, THE PUBLISH GATE at scheduling: the approved version's own content, by the same rule set as approval and
       publishing (piece-quality.ts), read against its nights as they are now. */
    known ??= await knownVenuesOf(db)
    nightAliases ??= await venueAliasesOf(db, venueIdsOf((nights ?? []) as Record<string, unknown>[]))
    const quality = pieceQuality({
      slides: d.rev.slides,
      caption: [d.rev.caption, ...Object.values(d.rev.versions ?? {}).map((v) => (v as { caption?: string } | null)?.caption ?? '')].join('\n'),
      captions: [d.rev.caption, ...Object.values(d.rev.versions ?? {}).map((v) => (v as { caption?: string } | null)?.caption ?? '')].filter((c) => c !== ''),
      momentKind: parseMomentKey(d.momentKey)?.kind ?? null,
      madeAt: await drawnAtOf(db, d.id, d.rev),
      nights: new Map((nights ?? []).map((n) => [n.id as string, qualityNightOf(n as Record<string, unknown>, seasonBegun.get(n.id as string) ?? null, nightAliases)])),
      now,
      goesAt: at,
      knownVenues: known,
    })
    if (quality.length > 0) {
      const reason = `Not scheduled, held by the publish gate: ${quality.join(' ')}`
      await db.from('social_piece_schedules').update({ state: 'held', held_reason: reason.slice(0, 500) }).eq('piece_id', d.id).eq('approval_id', d.approvalId).eq('state', 'scheduled')
      held.push(`${d.id}: ${reason}`)
      continue
    }
    if (late) {
      const night = firstStarting.get(d.id)
      const reason = `Not scheduled: its next free band, ${dayTime(goAt, now)}, is after ${night?.title ?? 'its first night'} starts (${dayTime(late.deadline.toISOString(), now)}), and a piece never posts once its night has started. Regenerate it without that night and approve it again.`
      await db.from('social_piece_schedules').update({ state: 'held', held_reason: reason.slice(0, 500) }).eq('piece_id', d.id).eq('approval_id', d.approvalId).eq('state', 'scheduled')
      held.push(`${d.id}: ${reason}`)
      continue
    }
    /* DESTINATION FIRST, BEFORE A SLOT IS KEPT (law 28 (d); the PM's 20:50 of 18 November 2026, item 2: check-go before
       scheduling). Each platform's row is measured against that platform's own rule, as the run before publishing measures
       it (destination-check.ts), and a row that does not fit is held here with its reason: on 18 November two Facebook
       posts drawn 3:4 were given a slot and only refused at publishing. One platform's misfit never holds the other's. */
    let fits = 0
    for (const platform of ['instagram', 'facebook'] as const) {
      let misfit: string | null
      try {
        misfit = await slidesMisfit(d.rev.slides, platform, d.format, opts.fetcher ?? fetch)
      } catch (e) {
        misfit = `its fit for ${platform} could not be read (${e instanceof Error ? e.message : String(e)})`
      }
      // THE BOOKING JOURNEY ON INSTAGRAM (the PM's 13:06 item 2 and 13:12 item 3 of 23 November 2026): an Instagram post
      // sends its reader to "the link in our bio", so it goes only once the bio's whole journey to the event is proven on
      // a phone, recorded as the flag instagram_bio_journey_proven. Until then Facebook, which carries the event's own
      // link in its caption, goes alone.
      if (!misfit && platform === 'instagram') {
        bioProven ??= await instagramBioJourneyProven(db)
        if (!bioProven) misfit = INSTAGRAM_BIO_UNPROVEN
      }
      if (!misfit) {
        fits += 1
        continue
      }
      const reason = `Not scheduled on ${platform}: ${misfit}`
      await db.from('social_piece_schedules').update({ state: 'held', held_reason: reason.slice(0, 500) }).eq('piece_id', d.id).eq('approval_id', d.approvalId).eq('platform', platform).eq('state', 'scheduled')
      held.push(`${d.id}: ${reason}`)
    }
    if (fits > 0) scheduled.push({ pieceId: d.id, goAt })
  }
  return { scheduled, held, floor: plan.report }
}

/** What publishes a piece on a network once Meta allows it: the network's own address for the post, or a refusal. */
/** A publisher posts a piece in its OWN format (social_pieces.format), never one guessed from its slides. */
export type Publisher = (input: { readonly pieceId: string; readonly platform: SocialPlatform; readonly format: SocialFormat; readonly slides: readonly Slide[]; readonly caption: string; readonly collaborators?: readonly string[] }) => Promise<{ readonly ref: string; readonly submission?: string }>

/**
 * A PIECE'S OWN FORMAT, as it was planned, drawn for approval and scheduled (WINDOW 5A's look of 20 November 2026 at
 * 10:49, on the PM's 10:42 item 1): the publisher and the destination check read it here, so a tonight story, whose slide
 * is of type 'tonight', posts as a story. Guessed from its slides it read as a feed and would have posted as a feed image
 * with a black band. Throws when the row cannot be read or holds neither format, so the caller holds the piece.
 */
export async function ownFormatOf(db: Db, pieceId: string): Promise<SocialFormat> {
  const { data, error } = await db.from('social_pieces').select('format').eq('id', pieceId).maybeSingle()
  const format = (data as { format?: unknown } | null)?.format
  if (error || (format !== 'feed' && format !== 'story')) throw new Error(`the piece's own format could not be read${error ? `: ${error.message}` : ''}`)
  return format
}

export type Published = {
  readonly switchOn: boolean
  readonly due: number
  readonly published: readonly string[]
  readonly held: readonly string[]
  /** Switched off: what would have gone, and when, and nothing written. */
  readonly wouldPublish: readonly string[]
  /** Left scheduled as it was, and why: an earlier submission the provider could not be asked about (AV (a)). */
  readonly waiting: readonly string[]
  /** Each safe correction made to a caption before it posted, as it was made (venue-identity.ts correctPlaceLines). */
  readonly corrected?: readonly string[]
}

/**
 * A POST AS IT WENT, RECORDED IN THE STEP THAT CONFIRMS IT (the PM's 16:40 of 21 November 2026, AV (a); the cause found
 * at 12:12 by 5A and 12:17 by 5C: the auto publisher marked schedules published and wrote no social_piece_postings row,
 * so /go, the link in bio and every reader of postings saw nothing go). One function marks a schedule published and,
 * once its reference is the post's own public address, records the posting with that address, the schedule's own
 * approval, and the person that approval names. Our own Meta app answers the address at once; Blotato's is confirmed by
 * the read back (readBackPendingPosts), which records it through recordAutoPosting. A piece has one posting, its first
 * network's address; the second network finds it recorded already. A failed record never undoes the publish: it is said.
 */
export async function markPublished(
  db: Db,
  input: {
    readonly scheduleId: string
    readonly pieceId: string
    readonly approvalId: string
    readonly ref: string
    readonly now: Date
    readonly platform?: SocialPlatform
    readonly submission?: string | null
    /** Its window and objective, and its first night's start, for the measure (Lawal's 19:13, section 9). */
    readonly measure?: PostingMeasure
  },
): Promise<{ readonly error: string | null; readonly posting: string }> {
  const { error } = await db.from('social_piece_schedules').update({ state: 'published', published_ref: input.ref, published_at: input.now.toISOString() }).eq('id', input.scheduleId).eq('state', 'scheduled')
  if (error) return { error: refusalOf(error.message) ?? error.message, posting: 'not recorded: the schedule was not marked published' }
  const posting = PUBLIC_POST_URL.test(input.ref)
    ? await recordAutoPosting(db, { pieceId: input.pieceId, approvalId: input.approvalId, postUrl: input.ref, postedAt: input.now, platform: input.platform, submission: input.submission ?? null, measure: input.measure })
    : 'waits for its public address (the read back records it)'
  return { error: null, posting }
}

/** The measure beside a publication (Lawal's 19:13, section 9): its objective, its window and its lead to the start. */
export type PostingMeasure = { readonly objective: string | null; readonly latestAt: string | null; readonly firstStart: string | null }

/** The posting row's measure columns; none when the measure is not known (a post recorded by the read back). Pure. */
export function measureCols(m: PostingMeasure | undefined, postedAt: Date): Record<string, unknown> {
  if (!m) return {}
  const lead = m.firstStart ? Math.round((Date.parse(m.firstStart) - postedAt.getTime()) / 60_000) : null
  return { objective: m.objective, latest_at: m.latestAt, minutes_before_start: Number.isFinite(lead) ? lead : null }
}

/** The earliest start among these nights, for the measure; null when none can be read. */
async function firstStartOf(db: Db, eventIds: readonly string[]): Promise<string | null> {
  if (eventIds.length === 0) return null
  const { data, error } = await db.from('events').select('start_date').in('id', [...eventIds]).order('start_date').limit(1)
  if (error) return null
  return ((data ?? [])[0] as { start_date?: string } | undefined)?.start_date ?? null
}

/** The posting of a post the engine published, by its approval's own person; never throws, it says. */
export async function recordAutoPosting(
  db: Db,
  input: { readonly pieceId: string | null; readonly approvalId: string | null; readonly postUrl: string; readonly postedAt: Date; readonly platform?: SocialPlatform; readonly submission?: string | null; readonly measure?: PostingMeasure },
): Promise<string> {
  if (!input.pieceId || !input.approvalId) return 'not recorded: its piece or approval is not known'
  if (!PUBLIC_POST_URL.test(input.postUrl)) return 'not recorded: not a public post address'
  try {
    const { data: approval, error: aerr } = await db.from('social_piece_approvals').select('approved_by').eq('id', input.approvalId).maybeSingle()
    const by = (approval as { approved_by?: string } | null)?.approved_by
    if (aerr || !by) return `not recorded: its approval could not be read (${aerr?.message ?? 'no row'})`
    // ONE ROW PER NETWORK (migration 20261122124501; the PM's 12:17 item 2): AMCF's 11:40 feed went to both networks and
    // kept Facebook's row only, the second insert refused by a key of one row per piece and read as 'recorded already'.
    const platform = input.platform ?? networkOfPost(input.postUrl)
    const provider = input.submission ? (input.submission.startsWith('blotato:') ? input.submission : `blotato:${input.submission}`) : null
    const { error } = await db.from('social_piece_postings').insert({ piece_id: input.pieceId, approval_id: input.approvalId, post_url: input.postUrl, posted_at: input.postedAt.toISOString(), recorded_by: by, platform, provider_ref: provider, ...measureCols(input.measure, input.postedAt) })
    if (!error) return 'recorded'
    if (error.code === '23505') return `recorded already on ${platform}`
    console.error('[social] the posting could not be recorded (the post went out):', { pieceId: input.pieceId, error: error.message })
    return `not recorded: ${refusalOf(error.message) ?? error.message}`
  } catch (e) {
    console.error('[social] the posting could not be recorded (the post went out):', { pieceId: input.pieceId, error: e instanceof Error ? e.message : String(e) })
    return `not recorded: ${e instanceof Error ? e.message : String(e)}`
  }
}

/**
 * EVERY POST THAT WENT PUBLIC WITH NO POSTING, RECORDED (AV (a)): a published schedule whose reference is a public post
 * address, whose piece has no posting yet (the posts before AV, and any whose record failed), is recorded now. A write of
 * what already happened, never a send.
 */
export async function recordMissingPostings(db: Db): Promise<{ readonly recorded: readonly string[]; readonly notRecorded: readonly string[] }> {
  const { data, error } = await db
    .from('social_piece_schedules')
    .select('piece_id, approval_id, platform, published_ref, published_at, submission_ref, social_pieces(social_piece_postings(id, platform))')
    .eq('state', 'published')
    .like('published_ref', 'https://%')
    .order('published_at', { ascending: true })
    .limit(100)
  if (error) throw new Error(`the published posts could not be read: ${error.message}`)
  const recorded: string[] = []
  const notRecorded: string[] = []
  const seen = new Set<string>()
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const pieceId = r.piece_id as string
    // Per network (migration 20261122124501): a piece with Facebook's row still needs Instagram's.
    const platform = String(r.platform) as SocialPlatform
    const piece = (Array.isArray(r.social_pieces) ? r.social_pieces[0] : r.social_pieces) as { social_piece_postings?: { platform?: string }[] | { platform?: string } | null } | null
    const rows = piece?.social_piece_postings ? (Array.isArray(piece.social_piece_postings) ? piece.social_piece_postings : [piece.social_piece_postings]) : []
    const key = `${pieceId} ${platform}`
    if (seen.has(key) || rows.some((g) => g.platform === platform)) continue
    seen.add(key)
    const said = await recordAutoPosting(db, { pieceId, approvalId: r.approval_id as string, postUrl: String(r.published_ref), postedAt: new Date(String(r.published_at)), platform, submission: (r.submission_ref as string | null) ?? null })
    if (said === 'recorded' || said.startsWith('recorded already')) recorded.push(`${pieceId} on ${platform}: ${String(r.published_ref)}`)
    else notRecorded.push(`${pieceId}: ${said}`)
  }
  return { recorded, notRecorded }
}

/** The submission a provider already accepted for this piece on this network, if any schedule kept one (newest). */
/**
 * ONE PUBLICATION PER MOMENT PER NETWORK (Lawal's hardening order of 22 November 2026, section 3; the PM's 09:55 item 2:
 * keyed on event, event day, platform, type and occurrence, never on the approval). A lifecycle piece's moment_key is its
 * kind, format, day and run; a piece redrawn for the same moment has a new id. The piece and every piece drawn for its
 * moment are read: any of them already published on this network, on any schedule but this one, answers its
 * reference; null when none. 5C's reconciliation of 22 November found c126bbf0 sent to Facebook three times and
 * 31d92f7e twice, under successive approvals.
 */
export async function publishedAlready(db: Db, pieceId: string, platform: SocialPlatform, exceptId: string): Promise<string | null> {
  const { data: piece, error: perr } = await db.from('social_pieces').select('moment_key').eq('id', pieceId).maybeSingle()
  if (perr) throw new Error(`its moment could not be read: ${perr.message}`)
  const key = ((piece ?? null) as { moment_key?: string | null } | null)?.moment_key ?? null
  let ids = [pieceId]
  if (key) {
    const { data: same, error: serr } = await db.from('social_pieces').select('id').eq('moment_key', key)
    if (serr) throw new Error(`the pieces of its moment could not be read: ${serr.message}`)
    ids = [...new Set([pieceId, ...((same ?? []) as { id: string }[]).map((r) => r.id)])]
  }
  const { data, error } = await db.from('social_piece_schedules').select('id, published_ref').in('piece_id', ids).eq('platform', platform).eq('state', 'published').neq('id', exceptId).limit(1)
  if (error) throw new Error(`its earlier publications could not be read: ${error.message}`)
  const row = ((data ?? [])[0] as { id?: string; published_ref?: string | null } | undefined) ?? null
  return row ? String(row.published_ref ?? row.id) : null
}

async function earlierSubmission(db: Db, pieceId: string, platform: SocialPlatform): Promise<string | null> {
  const { data, error } = await db
    .from('social_piece_schedules')
    .select('submission_ref')
    .eq('piece_id', pieceId)
    .eq('platform', platform)
    .not('submission_ref', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`its earlier submissions could not be read: ${error.message}`)
  const ref = ((data ?? [])[0] as { submission_ref?: string | null } | undefined)?.submission_ref ?? null
  return ref && ref.startsWith('blotato:') ? ref : null
}

/**
 * B5: every schedule whose moment has come. With the switch off (until Meta approves the app) this is a dry run: it
 * says what would go and writes nothing. With it on, each piece is checked again as approval checks it (its words, its
 * nights, its page, its images: pieceDependencies) and then published through the publisher; the database refuses the
 * published state if the approval is no longer of the newest revision or an image has gone. A refusal holds the
 * schedule with its reason; nothing is retried silently.
 */
export async function publishDuePieces(db: Db, now: Date, opts: { readonly siteOrigin: string; readonly publisher: Publisher | null; readonly fetcher?: Fetcher; readonly reader?: BlotatoPostReader | null }): Promise<Published> {
  const { data: flag } = await db.from('feature_flags').select('enabled').eq('flag', 'social_auto_publish').maybeSingle()
  const switchOn = flag?.enabled === true
  const { data: rows, error } = await db.from('social_piece_schedules').select('id, piece_id, approval_id, platform, go_at, latest_at, objective').eq('state', 'scheduled').lte('go_at', now.toISOString()).order('go_at').limit(50)
  // Time passes while a run checks and sends: the clock read just before a submission is the run's minute plus that.
  const startedAt = Date.now()
  const clock = () => new Date(now.getTime() + (Date.now() - startedAt))
  if (error) throw new Error(`the schedules could not be read: ${error.message}`)
  const published: string[] = []
  const held: string[] = []
  const wouldPublish: string[] = []
  const waiting: string[] = []
  const corrected: string[] = []
  const expire = async (id: string, reason: string) => {
    await db.from('social_piece_schedules').update({ state: 'expired', held_reason: reason.slice(0, 500) }).eq('id', id).eq('state', 'scheduled')
    held.push(`${id}: ${reason}`)
  }
  const hold = async (id: string, reason: string) => {
    await db.from('social_piece_schedules').update({ state: 'held', held_reason: reason.slice(0, 500) }).eq('id', id).eq('state', 'scheduled')
    held.push(`${id}: ${reason}`)
  }
  for (const r of rows ?? []) {
    const id = r.id as string
    const pieceId = r.piece_id as string
    const platform = r.platform as SocialPlatform
    // LAW 42, A MISSED DAY IS NEVER CAUGHT UP (Lawal, 20 November 2026, 23:58): a slot from an earlier Melbourne day is
    // never posted late as that day's post, switch on or off. A moment belongs to its own day (law 37 (l)), so the post is
    // dropped with its reason and the planner plans afresh from today.
    if (slotFromEarlierDay(r.go_at as string, now, SOCIAL_SLOT_ZONE)) {
      await hold(id, `Not published: its slot of ${slotDay(r.go_at as string, SOCIAL_SLOT_ZONE)} passed before it could post; a missed day is never posted late (law 42), and the planner plans afresh from today.`)
      continue
    }
    if (!switchOn) {
      wouldPublish.push(`${pieceId} on ${platform} at ${r.go_at as string}`)
      continue
    }
    // ONE PUBLICATION PER MOMENT PER NETWORK (publishedAlready): published once on this network, it is never sent again.
    let already: string | null = null
    try {
      already = await publishedAlready(db, pieceId, platform, id)
    } catch (e) {
      waiting.push(`${id}: ${e instanceof Error ? e.message : String(e)}; left scheduled`)
      continue
    }
    if (already !== null) {
      await hold(id, `Not published: this piece or its moment is already published on ${platform} (${already}); one publication per moment per network, never sent again.`)
      continue
    }
    // NEVER A BLIND RESEND (AV (a), the PM's 16:40 of 21 November 2026): where the provider already accepted this piece
    // on this network (a submission kept on any of its schedules), the provider's own record of it is read first. Unless
    // the provider says it failed, it went (or is going) and is recorded as published, never sent again; if the provider
    // cannot be asked, the schedule stays as it was and says why.
    let earlier: string | null = null
    try {
      earlier = await earlierSubmission(db, pieceId, platform)
    } catch (e) {
      waiting.push(`${id}: ${e instanceof Error ? e.message : String(e)}; left scheduled`)
      continue
    }
    if (earlier !== null) {
      if (!opts.reader) {
        waiting.push(`${id}: its earlier submission ${earlier} cannot be asked about (no provider reader is connected); left scheduled, never sent again blind`)
        continue
      }
      let said: { readonly status: string; readonly publicUrl: string | null }
      try {
        said = await opts.reader(earlier.slice('blotato:'.length))
      } catch (e) {
        waiting.push(`${id}: its earlier submission ${earlier} could not be read (${e instanceof Error ? e.message : String(e)}); left scheduled`)
        continue
      }
      if (said.status !== 'failed') {
        const ref = said.status === 'published' && said.publicUrl !== null && PUBLIC_POST_URL.test(said.publicUrl) ? said.publicUrl : earlier
        const marked = await markPublished(db, { scheduleId: id, pieceId, approvalId: r.approval_id as string, ref, now, platform, submission: earlier })
        if (marked.error) await hold(id, `Sent as ${ref}; the database refused that reference: ${marked.error}`)
        else published.push(`${pieceId} on ${platform}: ${ref} (its earlier submission, read on the provider: ${said.status}; not sent again)`)
        continue
      }
    }
    // THE TIMING ENGINE AT CLAIMING AND BEFORE ANY RETRY (timing.ts; Lawal's 19:13, section 4, points 3 and 5): after the
    // provider's own record is read above (never a blind withdrawal of a post that may be live), a schedule past its own
    // stored window is EXPIRED with its reason at once, never published. A row from before the window was stored, and an
    // event since cancelled, postponed, finished or sold out, are read from the piece's facts with the checks below.
    const storedLapse = r.latest_at ? pastLatest(r.latest_at as string, now) : null
    if (storedLapse) {
      await expire(id, storedLapse)
      continue
    }
    // A CHECK THAT FAILS HOLDS ITS OWN PIECE, NEVER THE RUN (law 23: one failed post never stops unrelated operations).
    // On 18 November 2026 at 15:13 a check threw on the first of Lawal's twelve approved posts and the whole run stopped
    // with every one of them still due; now that piece is held with the reason and the next is read.
    let issues: string[]
    let rev: Revision | null
    let format: SocialFormat | null
    let misfit: string | null
    let timing: Timing
    try {
      // Published at this minute, so words that say on now are judged against that day's doors now (goesAt).
      issues = await pieceDependencies(db, pieceId, now, { siteOrigin: opts.siteOrigin, fetcher: opts.fetcher, goesAt: now })
      rev = issues.length > 0 || opts.publisher === null ? null : await newestRevision(db, pieceId)
      format = rev === null ? null : await ownFormatOf(db, pieceId)
      // EVERY IMAGE AGAINST ITS DESTINATION, before any publisher is called (the PM's 13:42 of 18 November 2026, P0):
      // a file Instagram or Facebook would refuse is held with its measured size and Meta's own rule, never sent.
      misfit = rev === null || format === null ? null : await slidesMisfit(rev.slides, platform, format, opts.fetcher ?? fetch)
      timing = await timingOfPiece(db, pieceId, new Date(r.go_at as string), now)
    } catch (e) {
      await hold(id, `Not published: the checks before publishing could not finish (${e instanceof Error ? e.message : String(e)}).`)
      continue
    }
    const latestAt = (r.latest_at as string | null) ?? (timing.kind === 'window' ? timing.latestAt : null)
    const lapsed = timing.kind === 'expired' ? `EXPIRED: ${timing.reason}` : latestAt ? pastLatest(latestAt, now) : null
    if (lapsed) {
      await expire(id, lapsed)
      continue
    }
    if (timing.kind === 'held') {
      await hold(id, `Not published: ${timing.reason}`)
      continue
    }
    if (issues.length > 0) {
      await hold(id, `Not published: ${issues.join(' ')}`)
      continue
    }
    if (opts.publisher === null) {
      await hold(id, 'Not published: no publisher is connected (neither our own Meta app nor Blotato).')
      continue
    }
    if (misfit) {
      await hold(id, `Not published: ${misfit}`)
      continue
    }
    if (rev === null || format === null) {
      await hold(id, "Not published: the piece's newest version or its own format could not be read.")
      continue
    }
    try {
      // A poster that posts on its night's own day says Tonight, Today or This afternoon (onItsDay; the PM's 06:39 of
      // 18 November 2026, item 1), set at the moment it posts. It posts in its own format, never one guessed from its slides.
      // Law 40: the Collab invite the approved version carries, Instagram only (the publisher refuses it anywhere else).
      const collaborators = platform === 'instagram' ? (rev.versions[platform].collaborators ?? []) : []
      // THE FACTS FROM THE ROWS (Lawal's correction, section 1; venue-identity.ts): a place line naming no venue we hold
      // is given the night's own venue before it posts, and the correction is recorded.
      // THE TIMING ENGINE IMMEDIATELY BEFORE SUBMISSION (Lawal's 19:13, section 4, point 4): the checks above take time.
      const lateNow = latestAt ? pastLatest(latestAt, clock()) : null
      if (lateNow) {
        await expire(id, lateNow)
        continue
      }
      const facts = await placeCorrectionFor(db, rev.eventIds, rev.versions[platform].caption ?? '')
      for (const c of facts.corrections) corrected.push(`${pieceId} on ${platform}: "${c.from}" became "${c.to}"`)
      const { ref, submission } = await opts.publisher({ pieceId, platform, format, slides: rev.slides, caption: onItsDay(facts.caption, rev.slides, now), collaborators })
      // THE OUTSIDE ID FIRST, WHERE ONLY ITS OWN SHAPE IS CHECKED (the PM's 18:40 of 18 November 2026, item 1 (a)): Blotato's
      // submission goes to its own column while the row still reads scheduled, so a refusal of the reference below can
      // never lose it. On 18 November five accepted posts lost theirs: the only record was the refused update.
      if (submission) {
        const { error: serr } = await db.from('social_piece_schedules').update({ submission_ref: `blotato:${submission}` }).eq('id', id).eq('state', 'scheduled')
        if (serr) console.error('[social] the submission could not be written to its own column', { id, submission, error: serr.message })
      }
      // Marked published and, with a public address, recorded as it went, in one step (markPublished, AV (a)).
      const marked = await markPublished(db, {
        scheduleId: id,
        pieceId,
        approvalId: r.approval_id as string,
        ref,
        now,
        platform,
        submission: submission ?? null,
        measure: { objective: (r.objective as string | null) ?? (timing.kind === 'window' ? timing.objective : null), latestAt, firstStart: await firstStartOf(db, rev.eventIds) },
      })
      // A reference the database refuses is kept FIRST in the held reason, so the post it names can always be read back.
      if (marked.error) await hold(id, `Sent as ${ref}; the database refused that reference: ${marked.error}`)
      else published.push(`${pieceId} on ${platform}: ${ref}`)
      // LAW 40 (c): each Collab invitation the post carried is recorded in the CRM as pending (never 'accepted': only
      // Instagram's own read of the post's collaborators can say that, law 40 (b)). A failed record never stops
      // publishing (law 40 (e)); it is logged and the read back finds the invite on the post.
      if (collaborators.length > 0) await recordCollabInvites(db, { pieceId, scheduleId: id, handles: collaborators, postRef: ref, now })
    } catch (e) {
      await hold(id, `Not published: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { switchOn, due: (rows ?? []).length, published, held, wouldPublish, waiting, corrected }
}

/**
 * A one night piece's caption with its place line given the night's own venue where it names no venue we hold
 * (venue-identity.ts). A piece of several nights, or a night with no venue on record, is left as it is. A failed read
 * leaves the caption as it is: the gate has already judged it.
 */
async function placeCorrectionFor(db: Db, eventIds: readonly string[], caption: string): Promise<{ readonly caption: string; readonly corrections: readonly { readonly from: string; readonly to: string }[] }> {
  if (eventIds.length !== 1) return { caption, corrections: [] }
  try {
    const { data, error } = await db.from('events').select('id, venue_name, venue_id, venue_row:venues(name)').eq('id', eventIds[0]).maybeSingle()
    if (error || !data) return { caption, corrections: [] }
    const e = data as unknown as { venue_name: string | null; venue_id: string | null; venue_row: { name: string | null } | null }
    const aliases = e.venue_id ? ((await venueAliasesOf(db, [e.venue_id])).get(e.venue_id) ?? []) : []
    const canonical = (e.venue_row?.name ?? '').trim() || (e.venue_name ?? '').trim() || null
    const own = [e.venue_name ?? '', ...venueNamesOf(e.venue_row, aliases)].filter((x) => x.trim() !== '')
    return correctPlaceLines(caption, { canonical, own, venueId: e.venue_id }, await knownVenuesOf(db))
  } catch (e) {
    console.error('[social] the place could not be read for its correction; the caption goes as approved', e instanceof Error ? e.message : e)
    return { caption, corrections: [] }
  }
}

/**
 * LAW 40 (c): a published post's Collab invitations, one row per organiser whose verified handle it invited, status
 * pending. Never throws: a failure is logged, because collaboration never interrupts publishing (law 40 (e)).
 */
export async function recordCollabInvites(
  db: Db,
  input: { readonly pieceId: string; readonly scheduleId: string; readonly handles: readonly string[]; readonly postRef: string | null; readonly now: Date },
): Promise<number> {
  try {
    const { data, error } = await db.from('organisers').select('id, instagram_handle').in('instagram_handle', [...input.handles]).not('instagram_verified_at', 'is', null)
    if (error) throw new Error(error.message)
    // Never the platform's own listings organisation or a test organiser (src/lib/growth/platform-organiser.ts).
    const platform = await readPlatformOrganiserIds(db)
    const rows = ((data ?? []) as { id: string; instagram_handle: string }[]).filter((o) => !platform.has(o.id)).map((o) => ({
      organiser_id: o.id,
      piece_id: input.pieceId,
      schedule_id: input.scheduleId,
      handle: o.instagram_handle.toLowerCase(),
      post_ref: input.postRef && /^https:\/\//.test(input.postRef) ? input.postRef : null,
      sent_at: input.now.toISOString(),
    }))
    if (rows.length === 0) return 0
    const { error: ierr } = await db.from('collab_invitations').upsert(rows, { onConflict: 'organiser_id,piece_id', ignoreDuplicates: true })
    if (ierr) throw new Error(ierr.message)
    return rows.length
  } catch (error) {
    console.error('[social] a Collab invitation could not be recorded (the post went out):', { pieceId: input.pieceId, error: error instanceof Error ? error.message : error })
    return 0
  }
}

/** Each piece's schedules, for /admin/social. */
/** A public post's own address, as the database's published_ref check reads it (20261118190001). */
export const PUBLIC_POST_URL = /^https:\/\/(www\.)?(instagram\.com|facebook\.com|fb\.com)\/\S+$/i

/**
 * EVERY POST BLOTATO ACCEPTED, READ BACK UNTIL ITS PUBLIC URL IS KNOWN (the PM's 18:40 of 18 November 2026, item 1 (a)): a
 * row published under a 'blotato:<id>' reference is read from Blotato's own post status, and once Blotato gives its public
 * URL that URL takes the reference's place (the database lets a published row change that and nothing else,
 * supabase/migrations/20261118190001_social_blotato_reference.sql). A read towards Blotato; nothing is sent again.
 */
export async function readBackPendingPosts(db: Db, read: BlotatoPostReader | null): Promise<{ readonly read: number; readonly filled: string[]; readonly pending: string[] }> {
  if (read === null) return { read: 0, filled: [], pending: [] }
  // Every reference that begins 'blotato:', asked by its prefix (WINDOW 5A, 20 November 2026). It was asked as the range
  // >= 'blotato:' and < 'blotato;', which holds only in byte order; the column collates as en_US.UTF-8, and production
  // found 0 of the 4 posts waiting that way ('like' found 4, the range in byte order 4), so no Blotato post's URL was
  // ever read back. A prefix asked with like is the same in every collation. No URL begins 'blotato:'.
  const { data, error } = await db.from('social_piece_schedules').select('id, piece_id, approval_id, published_ref, published_at').eq('state', 'published').like('published_ref', 'blotato:%').order('go_at').limit(20)
  if (error) throw new Error(`the posts waiting for their URL could not be read: ${error.message}`)
  const filled: string[] = []
  const pending: string[] = []
  for (const r of data ?? []) {
    const ref = String(r.published_ref)
    let answer: { readonly status: string; readonly publicUrl: string | null }
    try {
      answer = await read(ref.slice('blotato:'.length))
    } catch (e) {
      pending.push(`${ref}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    if (answer.status === 'published' && answer.publicUrl !== null && PUBLIC_POST_URL.test(answer.publicUrl)) {
      const { error: uerr } = await db.from('social_piece_schedules').update({ published_ref: answer.publicUrl }).eq('id', r.id as string).eq('published_ref', ref)
      if (uerr) pending.push(`${ref}: ${refusalOf(uerr.message) ?? uerr.message}`)
      else {
        filled.push(`${ref} is ${answer.publicUrl}`)
        // The provider confirmed the address: the post is recorded as it went (AV (a)), with its own approval.
        const posting = await recordAutoPosting(db, { pieceId: (r.piece_id as string | undefined) ?? null, approvalId: (r.approval_id as string | undefined) ?? null, postUrl: answer.publicUrl, postedAt: new Date(String(r.published_at ?? new Date().toISOString())) })
        if (posting !== 'recorded' && posting !== 'recorded already') console.error(`[social] ${ref}: the posting ${posting}`)
      }
    } else {
      pending.push(`${ref}: ${answer.status || 'no status yet'}`)
    }
  }
  return { read: (data ?? []).length, filled, pending }
}

/**
 * A POST BLOTATO ACCEPTED BUT WHOSE ID WAS NEVER KEPT, NAMED FOR A PERSON (Lawal's 09:01 of 20 November 2026, item 2:
 * "status by stable provider id, never caption matching"). Until then each such held row was looked for in Blotato's
 * published list by its caption's words. Now each is listed by its piece, network and the time it was due, for a person
 * to read on Blotato by that time; nothing is matched by words and no row is touched. Read only.
 */
export async function heldPostsNeedingInvestigation(db: Db): Promise<readonly string[]> {
  const { data, error } = await db.from('social_piece_schedules').select('id, piece_id, platform, go_at, held_reason').eq('state', 'held').order('go_at', { ascending: false }).limit(60)
  if (error) throw new Error(`the held posts could not be read: ${error.message}`)
  return (data ?? [])
    .filter((r) => LOST_ID.test(String(r.held_reason ?? '')))
    .map((r) => `${String(r.piece_id)} on ${String(r.platform)}, due ${String(r.go_at)}: requires investigation (accepted by Blotato, its id never kept)`)
}

export async function readSchedules(db: Db, pieceIds: readonly string[]): Promise<Map<string, { platform: SocialPlatform; goAt: string; state: string; heldReason: string | null; publishedRef: string | null }[]>> {
  const out = new Map<string, { platform: SocialPlatform; goAt: string; state: string; heldReason: string | null; publishedRef: string | null }[]>()
  if (pieceIds.length === 0) return out
  const { data } = await db.from('social_piece_schedules').select('piece_id, platform, go_at, state, held_reason, published_ref, created_at').in('piece_id', [...pieceIds]).order('created_at', { ascending: false }).limit(2000)
  for (const r of data ?? []) {
    const list = out.get(r.piece_id as string) ?? []
    if (!list.some((x) => x.platform === r.platform)) list.push({ platform: r.platform as SocialPlatform, goAt: r.go_at as string, state: r.state as string, heldReason: (r.held_reason as string | null) ?? null, publishedRef: (r.published_ref as string | null) ?? null })
    out.set(r.piece_id as string, list)
  }
  return out
}

export type PostedNow = {
  readonly state: 'posted' | 'held' | 'drawn'
  readonly pieceId: string | null
  /** Each network's own answer: published with the provider's reference, or held with its reason. */
  readonly lines: readonly string[]
}

/**
 * POST THIS NIGHT NOW, ON THE OWNER'S WORD, FROM THE ENGINE'S SIDE (Lawal, 22 November 2026, 00:32: "her post goes to
 * Facebook and Instagram now ... I don't care about the time ... the schedule"; his 01:23: posting is done by the engine
 * from our side through Blotato, never through Lawal in the admin; the PM's 00:33 and 00:56). On 22 November the engine
 * could not post Asia Oasis's Colours of Asia on its last night before its posting hours. The social run's ?post=now
 * (started by .github/workflows/social-post-now.yml) is now the software's own path for that word, each step the engine's:
 *   1. the planner draws the night's feed moment for today on its best permitted photograph not used before
 *      (planCampaignWeek with ownerAsked, judged at this minute);
 *   2. the checked approval, the publish gate at approval (approvePieceChecked), in the standing approval's name;
 *   3. a slot at this minute on Instagram and Facebook (scheduleApprovedPieces with goNow), with the publish gate and each
 *      network's fit at scheduling, and never once its night has started unless its words say it is on now;
 *   4. the publisher (publishDuePieces: Blotato, the switch, never a blind resend), then the provider's read back.
 * Waived, and only this: the posting hours, for the night the word names. How the leaders do it (read 22 November
 * 2026): Meta Business Suite publishes a scheduled post at once by 'Publish now'
 * (https://www.facebook.com/business/help/816464273497113), and Buffer keeps a 'Share Now' button beside every queued post
 * (https://support.buffer.com/article/656-saving-and-scheduling-draft-posts).
 */
export async function postNightNow(
  db: Db,
  input: {
    readonly eventId: string
    readonly by: string
    readonly now: Date
    readonly siteOrigin: string
    readonly publisher: Publisher | null
    readonly reader?: BlotatoPostReader | null
    readonly fetcher?: Fetcher
    /**
     * THE PM VERIFY GATE (Lawal's 13:05 and the PM's 13:06 of 23 November 2026: "Every piece stops at a PM VERIFY gate
     * before it publishes ... only PASS publishes"). 'draw' draws the night's piece and stops, approving nothing, so it
     * can be verified with its evidence; 'publish' takes the drawn piece the PM passed (pieceId) through the checked
     * approval, a slot at this minute and the publisher. There is no single step that draws and publishes.
     */
    readonly stage: 'draw' | 'publish'
    readonly pieceId?: string | null
  },
): Promise<PostedNow> {
  if (input.stage === 'publish') return publishPassedPiece(db, input)
  const planned = await planCampaignWeek(db, { plannedBy: input.by, now: input.now, ownerAsked: { eventId: input.eventId } })
  const keys = planned.momentKeys ?? []
  if (keys.length === 0) return { state: 'held', pieceId: null, lines: [planned.held.join(' ') || 'No feed post is due for this night today.'] }
  const { data: found, error: ferr } = await db.from('social_pieces').select('id').in('moment_key', [...keys]).order('planned_at', { ascending: false }).limit(1)
  if (ferr) throw new Error(`the drawn piece could not be read: ${ferr.message}`)
  const pieceId = ((found ?? [])[0] as { id?: string } | undefined)?.id ?? null
  if (pieceId === null) return { state: 'held', pieceId: null, lines: [planned.held.join(' ') || 'The post was drawn but could not be read back.'] }
  // Drawn, and stopped here for the PM's VERIFY: nothing is approved, scheduled or sent at this stage.
  return { state: 'drawn', pieceId, lines: [`drawn for the PM's VERIFY, nothing approved or sent: piece ${pieceId}`] }
}

/**
 * The second stage of postNightNow: the piece the PM passed, for the night the word named, approved checked in the standing
 * approval's name, given a slot at this minute (every other check stands, Instagram's booking journey included) and sent
 * through the publisher, then read back. A piece that does not name that night is refused before anything is written.
 */
async function publishPassedPiece(
  db: Db,
  input: { readonly eventId: string; readonly by: string; readonly now: Date; readonly siteOrigin: string; readonly publisher: Publisher | null; readonly reader?: BlotatoPostReader | null; readonly fetcher?: Fetcher; readonly pieceId?: string | null },
): Promise<PostedNow> {
  const pieceId = input.pieceId ?? null
  if (pieceId === null) return { state: 'held', pieceId: null, lines: ['Not published: the passed piece was not named.'] }
  const rev = await newestRevision(db, pieceId)
  if (!rev) return { state: 'held', pieceId, lines: ['Not published: the piece has no version.'] }
  if (!rev.eventIds.includes(input.eventId)) return { state: 'held', pieceId, lines: ['Not published: the piece does not name that night.'] }
  const approved = await approvePieceChecked(db, { pieceId, by: input.by, now: input.now, siteOrigin: input.siteOrigin, fetcher: input.fetcher })
  if (approved.state === 'refused' && !/approved already/.test(approved.reason)) return { state: 'held', pieceId, lines: [approved.reason] }
  const scheduled = await scheduleApprovedPieces(db, input.now, { fetcher: input.fetcher, goNow: new Set([pieceId]) })
  const lines = scheduled.held.filter((h) => h.startsWith(pieceId))
  if (!scheduled.scheduled.some((s) => s.pieceId === pieceId)) return { state: 'held', pieceId, lines: lines.length > 0 ? lines : ['It was not given a slot now.'] }
  const published = await publishDuePieces(db, input.now, { siteOrigin: input.siteOrigin, publisher: input.publisher, fetcher: input.fetcher, reader: input.reader ?? null })
  const mine = (list: readonly string[]) => list.filter((l) => l.includes(pieceId))
  lines.push(...mine(published.published), ...mine(published.held), ...mine(published.wouldPublish).map((w) => `not sent, publishing is switched off: ${w}`), ...mine(published.waiting))
  if (input.reader) {
    try {
      const back = await readBackPendingPosts(db, input.reader)
      lines.push(...back.filled.filter((f) => f.includes(pieceId)).map((f) => `read back: ${f}`))
    } catch (e) {
      lines.push(`the provider's read back waits for the next run: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { state: mine(published.published).length > 0 ? 'posted' : 'held', pieceId, lines }
}
