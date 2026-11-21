import type { SupabaseClient } from '@supabase/supabase-js'
import { tierOf } from '@/lib/events/relevance'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import { crmNameKey } from '@/lib/listings/discovery-organisers'
import type { CampaignNight, PiecePlan, Slide } from './campaign'
import { goHop } from './go-hop'
import {
  captionFor,
  collabWorthIt,
  collaboratorsFor,
  dayIn,
  daysFrom,
  FIRST_LINE_WINDOW_DAYS,
  firstLineFor,
  endedByFirstBand,
  momentKey,
  momentsDue,
  rankPhotos,
  runRef,
  runsOf,
  seedOf,
  chooseToday,
  postableBand,
  storyLine,
  LIFECYCLE_ZONE,
  type Candidate,
  type CollabOrganiser,
  type LifecycleNight,
  type MomentKind,
  type PhotoAsset,
  type Run,
  type RunHistory,
} from './lifecycle'

/**
 * THE LIFECYCLE PLANNER'S READS AND ITS PIECES (train AI-2, law 37 (l) and law 40; the rules are lifecycle.ts's, each with
 * its test). Every day it reads the publication history FIRST, then plans only the day's few moments, each a law 37
 * photograph whole, its own words, its own day (social_pieces.moment_key), and for a feed post about one organiser's
 * event, a Collab with their verified Instagram account where it adds value. A failed read of photos, history or
 * organisers plans nothing new (fail closed: a piece is never planned on a history it could not read).
 */

type Db = SupabaseClient

/** The planner's switch (law 13): on with AI-2; off, the week's plan draws no lifecycle piece. */
export const LIFECYCLE_ON = true

/** How far ahead a run is read: far enough for its announce and build posts. */
export const LIFECYCLE_AHEAD_DAYS = 45

/**
 * HOW FAR BACK A SEASON'S ENDED NIGHTS ARE READ (the PM's 03:39 of 22 November 2026; 5C's 03:12 trace): the nights the
 * planner reads are those not yet ended, so at 02:59 on the 22nd Colours of Asia's 20th and 21st were gone and its last
 * night read as a first day. Its ended nights are read for their days only, never drawn. Fourteen days: the gap inside
 * that season was five days (15 to 20 November), and a fortnight keeps a two weekend festival whole.
 */
export const SEASON_LOOKBACK_DAYS = 14

/** The public nights ended in the last SEASON_LOOKBACK_DAYS, as the runs need them (days and keys only). Fails closed. */
async function readSeasonPast(db: Db, now: Date): Promise<LifecycleNight[]> {
  const since = new Date(now.getTime() - SEASON_LOOKBACK_DAYS * 86_400_000).toISOString()
  const { data, error } = await db
    .from('events')
    .select('id, title, start_date, end_date, timezone, created_at, listing_series_id, venue_id, venue_name')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gt('end_date', since)
    .lte('end_date', now.toISOString())
    .order('end_date', { ascending: false })
    .limit(1000)
  if (error) throw new Error(`the season's ended nights could not be read: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    eventId: r.id as string,
    seriesId: (r.listing_series_id as string | null) ?? null,
    title: String(r.title ?? ''),
    venueKey: (r.venue_id as string | null) ?? (String(r.venue_name ?? '').trim() || null),
    startDate: r.start_date as string,
    endDate: (r.end_date as string | null) ?? null,
    timezone: (r.timezone as string | null) ?? null,
    listedAt: (r.created_at as string | null) ?? (r.start_date as string),
    cancelled: false,
    salesOpen: false,
    ticketedHere: false,
    // The weakest tier, so an ended night never lifts its run's rank (a run takes its nights' best tier).
    tier: 4,
  }))
}

/** A moment piece's key, parsed back. */
export type MomentKeyParts = { readonly kind: MomentKind; readonly format: 'feed' | 'story'; readonly day: string; readonly runKey: string }

export function parseMomentKey(key: string | null | undefined): MomentKeyParts | null {
  const m = /^([a-z_]+)\|(feed|story)\|(\d{4}-\d{2}-\d{2})\|(.+)$/.exec(key ?? '')
  if (!m) return null
  return { kind: m[1] as MomentKind, format: m[2] as 'feed' | 'story', day: m[3], runKey: m[4] }
}

/** The night a moment is about: the run's night on that day, else its first. */
function nightForDay(run: Run, day: string): LifecycleNight {
  return (
    run.nights.find((n) => {
      const zone = n.timezone?.trim() || LIFECYCLE_ZONE
      return dayIn(new Date(n.startDate), zone) <= day && dayIn(new Date(n.endDate ?? n.startDate), zone) >= day
    }) ?? run.nights[0]
  )
}

/** What the history says, read from every lifecycle piece not rejected. */
type History = {
  readonly byRun: Map<string, { feedDays: string[]; storyDays: string[]; had: string[] }>
  readonly usedPhotos: Set<string>
  readonly recentLines: Set<string>
}

/**
 * The history, leaving out the pieces the sweep is drawing again (`redrawing`): their moments are due again and their
 * photographs theirs to keep, so the redraw is the same moment with the code in force, never a different one.
 */
async function readHistory(db: Db, now: Date, redrawing: ReadonlySet<string> = new Set()): Promise<History> {
  const { data, error } = await db
    .from('social_pieces')
    .select('id, format, moment_key, planned_at, social_piece_revisions(version, slides, versions), social_piece_decisions(revision, decision)')
    .not('moment_key', 'is', null)
    .order('planned_at', { ascending: false })
    .limit(3000)
  if (error) throw new Error(`the lifecycle history could not be read: ${error.message}`)
  // The pieces that have posted in public, read on their own: a partner kit marked sent (post_url 'sent') is not a post
  // (scripts/guards/kit-sent-reads-the-touch.mjs). A failed read fails the plan closed, as the history's does.
  const posts = await db
    .from('social_piece_postings')
    .select('piece_id')
    .neq('post_url', 'sent')
    .order('posted_at', { ascending: false })
    .limit(5000)
  if (posts.error) throw new Error(`the lifecycle history's public posts could not be read: ${posts.error.message}`)
  const postedInPublic = new Set(((posts.data ?? []) as { piece_id: string }[]).map((r) => r.piece_id))
  // A piece the provider accepted (a schedule published, or one carrying its submission) may have gone before its
  // posting row is written (recordMissingPostings heals that later): its photograph is spent as if it had posted.
  const sent = await db.from('social_piece_schedules').select('piece_id').or('state.eq.published,submission_ref.not.is.null').limit(5000)
  if (sent.error) throw new Error(`the lifecycle history's sent posts could not be read: ${sent.error.message}`)
  const wentOut = new Set(((sent.data ?? []) as { piece_id: string }[]).map((r) => r.piece_id))
  const today = dayIn(now, LIFECYCLE_ZONE)
  const byRun = new Map<string, { feedDays: string[]; storyDays: string[]; had: string[] }>()
  const usedPhotos = new Set<string>()
  const recentLines = new Set<string>()
  for (const p of (data ?? []) as Record<string, unknown>[]) {
    if (redrawing.has(p.id as string)) continue
    const parts = parseMomentKey(p.moment_key as string)
    if (!parts) continue
    const revs = ((p.social_piece_revisions as { version: number; slides: Slide[]; versions: Record<string, { caption?: string }> }[] | null) ?? []).sort((a, b) => b.version - a.version)
    const newest = revs[0]
    if (!newest) continue
    const rejected = ((p.social_piece_decisions as { revision: number; decision: string }[] | null) ?? []).some((d) => d.revision === newest.version && d.decision === 'rejected')
    // A photograph is spent once its piece has posted and reserved while its piece is open, so a post is never repeated
    // and two open pieces never share one (law 37 (l)); a piece rejected before it ever posted frees it (the PM's 12:28
    // of 21 November 2026, item 1: Sunday's photograph was lost to a story set aside before it could post). A piece
    // whose day has passed without it going can never post (law 42: a missed day is never posted late), so it frees its
    // photograph too: on 22 November Saturday's tomorrow story for Colours of Asia, never approved, still held Asia
    // Oasis's only Sunday photograph, and her Sunday post could not be drawn ('no permitted photograph for a story').
    const posted = postedInPublic.has(p.id as string) || wentOut.has(p.id as string)
    const open = !rejected && parts.day >= today
    if (posted || open) for (const s of newest.slides ?? []) if (s.t === 'photo') usedPhotos.add(s.photo)
    if (rejected) continue
    const h = byRun.get(parts.runKey) ?? { feedDays: [], storyDays: [], had: [] }
    if (parts.format === 'feed') h.feedDays.push(parts.day)
    else h.storyDays.push(parts.day)
    h.had.push(`${parts.kind}|${parts.format}`)
    byRun.set(parts.runKey, h)
    const age = daysFrom(parts.day, today)
    if (age >= 0 && age < FIRST_LINE_WINDOW_DAYS) {
      const first = (newest.versions?.instagram?.caption ?? '').split('\n\n')[0]?.trim()
      if (first) recentLines.add(first)
    }
  }
  return { byRun, usedPhotos, recentLines }
}

/** Every photograph the register permits for social now, per night (social_usable_images_all, the one rule). */
async function readPhotos(db: Db, eventIds: readonly string[], now: Date): Promise<Map<string, PhotoAsset[]>> {
  const out = new Map<string, PhotoAsset[]>()
  if (eventIds.length === 0) return out
  const { data, error } = await db.rpc('social_usable_images_all', { p_events: [...new Set(eventIds)], p_at: now.toISOString() })
  if (error) throw new Error(`the photographs permitted for social could not be read: ${error.message}`)
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const list = out.get(r.event_id as string) ?? []
    list.push({
      assetId: r.asset_id as string,
      url: r.asset_url as string,
      type: String(r.asset_type ?? ''),
      leadRank: (r.lead_rank as number | null) ?? null,
      width: (r.source_width as number | null) ?? null,
      height: (r.source_height as number | null) ?? null,
    })
    out.set(r.event_id as string, list)
  }
  return out
}

/** The organisers a night's host names, as the CRM holds them for a Collab (law 40 (c)); none read means no invite. */
async function readCollabOrganisers(db: Db, hosts: readonly string[]): Promise<Map<string, CollabOrganiser[]>> {
  const out = new Map<string, CollabOrganiser[]>()
  const keys = [...new Set(hosts.map((h) => crmNameKey(h)).filter((k) => k !== ''))]
  if (keys.length === 0) return out
  const { data, error } = await db
    .from('organisers')
    .select('id, name_key, instagram_handle, instagram_verified_at, collab_preference, collab_invitations(status)')
    .in('name_key', keys)
    .not('instagram_verified_at', 'is', null)
  if (error) {
    console.error('[social] the organisers for a Collab could not be read; no piece invites anyone:', error.message)
    return out
  }
  // The platform's own listings organisation and every test organiser are never invited (the one rule).
  const platform = await readPlatformOrganiserIds(db)
  for (const o of (data ?? []) as Record<string, unknown>[]) {
    if (platform.has(o.id as string)) continue
    const list = out.get(o.name_key as string) ?? []
    list.push({
      handle: (o.instagram_handle as string | null) ?? null,
      verifiedAt: (o.instagram_verified_at as string | null) ?? null,
      preference: (o.collab_preference as CollabOrganiser['preference']) ?? 'open',
      invites: ((o.collab_invitations as { status: CollabOrganiser['invites'][number]['status'] }[] | null) ?? []).map((i) => ({ status: i.status })),
    })
    out.set(o.name_key as string, list)
  }
  return out
}

function toLifecycleNight(n: CampaignNight): LifecycleNight {
  const ticketed = n.cta.where !== null && !n.cta.freeEntry && !n.cta.registrationRequired
  return {
    eventId: n.eventId,
    seriesId: n.seriesId ?? null,
    title: n.title,
    venueKey: n.venueId ?? n.placeName ?? n.venueName ?? null,
    startDate: n.startDate,
    endDate: n.endDate ?? null,
    timezone: n.timezone,
    listedAt: n.listedAt ?? n.startDate,
    cancelled: false,
    salesOpen: true,
    ticketedHere: n.cta.ticketingByEventLinqs,
    tier: tierOf({ title: n.title, venue: n.placeName ?? n.venueName, categorySlug: n.categorySlug, ticketed }),
  }
}

function dateLabel(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso)).replace(/,/g, '')
}

/**
 * THE NIGHT'S DATES AS A READER NEEDS THEM (the look of 05:12 on 21 November 2026: AMCF's Saturday pieces read 'Still on
 * today' over 'Fri 20 Nov', its first day only). One day reads as one day; a night that runs over more than one day in
 * its zone reads as its run, 'Fri 20 to Sun 22 Nov', so a post on any of its days is true. An end recorded as a default
 * midnight never extends a night (law 22 class 2): an end at 00:00 belongs to the day before.
 */
export function nightDates(startIso: string, endIso: string | null, zone: string, onDay?: string): string {
  // A piece posts on a day of the run: its label starts there, never on a day already over (the publish gate's past day
  // rule, law 22): AMCF's Saturday post reads 'Sat 21 to Sun 22 Nov', its Sunday post 'Sun 22 Nov' (law 37 (l)).
  const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  if (onDay && onDay > dayKey(new Date(startIso))) startIso = `${onDay}T12:00:00.000Z`
  const first = dateLabel(startIso, zone)
  if (!endIso) return first
  const lastInstant = new Date(new Date(endIso).getTime() - 1)
  const dayOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  if (dayOf(lastInstant) <= dayOf(new Date(startIso))) return first
  const part = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-AU', { timeZone: zone, ...opts }).format(d).replace(/,/g, '')
  const start = new Date(startIso)
  const sameMonth = part(start, { month: 'short', year: 'numeric' }) === part(lastInstant, { month: 'short', year: 'numeric' })
  const head = sameMonth ? `${part(start, { weekday: 'short' })} ${part(start, { day: 'numeric' })}` : first
  return `${head} to ${dateLabel(lastInstant.toISOString(), zone)}`
}

/** Whether a night has ended by this minute (an owner's Post now is judged at the minute it is pressed). */
function endedByNow(endIso: string | null, now: Date): boolean {
  return endIso !== null && Number.isFinite(Date.parse(endIso)) && Date.parse(endIso) <= now.getTime()
}

function linkFor(origin: string, slug: string, platform: 'instagram' | 'facebook', format: 'feed' | 'story', kind: MomentKind, day: string): string {
  const q = new URLSearchParams({ utm_source: platform, utm_medium: format, utm_campaign: 'lifecycle', utm_content: `${kind}-${day}` })
  return `${origin}/events/${slug}?${q.toString()}`
}

/**
 * Today's lifecycle pieces: the history read first, the day's few chosen (chooseToday, which heals), each with its strongest photo
 * not used before, its own first line, its story line, its own link per network, and a Collab where law 40 allows.
 */
export async function planLifecyclePieces(
  db: Db,
  input: {
    readonly now: Date
    readonly nights: readonly CampaignNight[]
    readonly origin: string
    /** Pieces the sweep draws again: read as if not yet drawn, so each moment is planned again with its own photograph. */
    readonly redrawing?: ReadonlySet<string>
    /**
     * THE OWNER'S WORD FOR ONE NIGHT, CARRIED BY THE ENGINE (store.ts postNightNow, the social run's ?post=now; Lawal, 22
     * November 2026, 00:32: "her post goes to Facebook and Instagram now ... I don't care about the time ... the
     * schedule"): only that night's feed moment for today is drawn, judged at this minute rather than at a posting band.
     * The posting hours are what his word waives; every other check (a permitted photograph not used before, the night
     * not ended, the publish gate at approval and at scheduling) stands.
     */
    readonly ownerAsked?: { readonly eventId: string }
  },
): Promise<{ readonly pieces: PiecePlan[]; readonly notes: string[]; readonly due: number; readonly photoless: readonly string[] }> {
  const notes: string[] = []
  const byId = new Map(input.nights.map((n) => [n.eventId, n]))
  // Every night of each season: those still to come, and those ended inside SEASON_LOOKBACK_DAYS for their days only.
  const past = (await readSeasonPast(db, input.now)).filter((p) => !byId.has(p.eventId))
  const runs = runsOf([...input.nights.map(toLifecycleNight), ...past])
  const history = await readHistory(db, input.now, input.redrawing)
  const photos = await readPhotos(db, input.nights.map((n) => n.eventId), input.now)
  const used = new Set(history.usedPhotos)

  const none: RunHistory = { feedDays: [], storyDays: [], had: [] }
  const candidates: Candidate[] = []
  // The nights with a moment due today, and those with no permitted photograph in either format (the pre-flight's line,
  // AV (c)).
  let due = 0
  const photoless: string[] = []
  for (const run of runs) {
    const day = dayIn(input.now, run.zone)
    const night = nightForDay(run, day)
    if (input.ownerAsked && night.eventId !== input.ownerAsked.eventId) continue
    // Its own history and every key its nights were drawn under before the season was joined (runsOf aliases).
    const had: RunHistory[] = []
    for (const k of [run.key, ...(run.aliases ?? [])]) {
      const h = history.byRun.get(runRef(k))
      if (h) had.push(h)
    }
    const runHistory: RunHistory = had.length === 0 ? none : { feedDays: had.flatMap((h) => h.feedDays), storyDays: had.flatMap((h) => h.storyDays), had: had.flatMap((h) => h.had) }
    const moments = momentsDue(run, input.now, runHistory).filter((m) => !input.ownerAsked || m.format === 'feed')
    if (moments.length > 0) {
      due += 1
      const own = photos.get(night.eventId) ?? []
      if (rankPhotos(own, 'feed', used).length === 0 && rankPhotos(own, 'story', used).length === 0) photoless.push(byId.get(night.eventId)?.title ?? run.key)
    }
    for (const moment of moments) {
      candidates.push({ run, moment, hasPhoto: rankPhotos(photos.get(night.eventId) ?? [], moment.format, used).length > 0 })
    }
  }
  // THE CHOICE THAT HEALS (lifecycle.ts chooseToday; the PM's 16:30 of 21 November 2026): a moment is drawn only if it
  // can post on its day, by the same checks the drawing below and the scheduler and the publish gate make; one that
  // cannot is passed over without spending its cap, and the same moment in the other format, then the next night, is
  // tried instead.
  const drawable = (c: Candidate): string | null => {
    const day = dayIn(input.now, c.run.zone)
    const ln = nightForDay(c.run, day)
    const n = byId.get(ln.eventId)
    if (!n) return 'its night could not be read'
    const photo = rankPhotos(photos.get(n.eventId) ?? [], c.moment.format, used)[0]
    if (!photo || photo.width === null || photo.height === null) return `no permitted photograph for a ${c.moment.format}`
    if (input.ownerAsked) return endedByNow(ln.endDate ?? null, input.now) ? 'it has ended' : null
    const zone = ln.timezone?.trim() || LIFECYCLE_ZONE
    if (endedByFirstBand(ln.endDate ?? null, zone, c.moment.format, day)) return `it ends before the ${c.moment.format}'s first band that day`
    const band = postableBand({ kind: c.moment.kind, format: c.moment.format, night: { title: n.title, startDate: ln.startDate, endDate: ln.endDate ?? null }, day, zone, now: input.now })
    return 'why' in band ? band.why : null
  }
  const choice = chooseToday(candidates, drawable)
  for (const p of choice.passedOver) {
    const title = byId.get(nightForDay(p.candidate.run, dayIn(input.now, p.candidate.run.zone)).eventId)?.title ?? p.candidate.run.key
    notes.push(`${title} ${p.candidate.moment.kind} ${p.candidate.moment.format}: passed over, ${p.why}`)
  }
  const chosen = choice.chosen
  const hosts = chosen.map((c) => byId.get(nightForDay(c.run, dayIn(input.now, c.run.zone)).eventId)?.host ?? '').filter((h) => h !== '')
  const organisers = await readCollabOrganisers(db, hosts)

  const lines = new Set(history.recentLines)
  const pieces: PiecePlan[] = []
  for (const c of chosen) {
    const day = dayIn(input.now, c.run.zone)
    const ln = nightForDay(c.run, day)
    const n = byId.get(ln.eventId)
    if (!n) continue
    const photo = rankPhotos(photos.get(n.eventId) ?? [], c.moment.format, used)[0]
    if (!photo || photo.width === null || photo.height === null) continue
    let onNow: boolean
    if (input.ownerAsked) {
      // Posted at this minute on the owner's word: judged now, never at a band.
      if (endedByNow(ln.endDate ?? null, input.now)) {
        notes.push(`${n.title} ${c.moment.kind} ${c.moment.format}: it has ended; not drawn`)
        continue
      }
      onNow = Date.parse(ln.startDate) <= input.now.getTime()
    } else {
      // A piece that could not post on its day is not drawn: its night has ended by the format's first band.
      if (endedByFirstBand(ln.endDate ?? null, ln.timezone?.trim() || LIFECYCLE_ZONE, c.moment.format, day)) {
        notes.push(`${n.title} ${c.moment.kind} ${c.moment.format}: it ends before the ${c.moment.format}'s first band that day; not drawn`)
        continue
      }
      // The band it can post in (lifecycle.ts postableBand, the one rule the choice above used): a first day under way by
      // that band says it is on now.
      const band = postableBand({ kind: c.moment.kind, format: c.moment.format, night: { title: n.title, startDate: ln.startDate, endDate: ln.endDate ?? null }, day, zone: ln.timezone?.trim() || LIFECYCLE_ZONE, now: input.now })
      if ('why' in band) {
        notes.push(`${n.title} ${c.moment.kind} ${c.moment.format}: ${band.why}; not drawn`)
        continue
      }
      onNow = band.onNow
    }
    const startedByBand = c.moment.kind === 'first_day' && onNow
    const first = firstLineFor(c.moment.kind, c.run.salesOpen, lines, seedOf(`${c.run.key}|${day}|${c.moment.format}`), startedByBand)
    if (first === null) {
      notes.push(`${n.title} ${c.moment.kind} ${c.moment.format}: every first line was used inside ${FIRST_LINE_WINDOW_DAYS} days; not posted`)
      continue
    }
    used.add(photo.url)
    lines.add(first)
    const place = n.placeName ?? n.venueName ?? null
    const slide: Slide = {
      t: 'photo',
      composition: 'photo_whole',
      eventId: n.eventId,
      photo: photo.url,
      credit: null,
      width: photo.width,
      height: photo.height,
      line: c.moment.format === 'story' ? storyLine(c.moment.kind, place) : null,
    }
    const facts = { title: n.title, place, dateLabel: nightDates(n.startDate, n.endDate ?? null, c.run.zone, day), priceLine: n.priceLine, summary: n.summary, names: [n.title, ...(n.host ? [n.host] : [])] }
    // The page a press lands on, with its tags, is the piece's stored link; the words carry the counted /go hop
    // (go-hop.ts; AV (e)), its piece id written by revisionRow.
    const pageLink = linkFor(input.origin, n.slug, 'instagram', c.moment.format, c.moment.kind, day)
    const igLink = goHop(input.origin, 'instagram')
    const fbLink = goHop(input.origin, 'facebook')
    const ig = captionFor({ platform: 'instagram', firstLine: first, facts, link: igLink })
    const fb = captionFor({ platform: 'facebook', firstLine: first, facts, link: fbLink })
    const collaborators = collaboratorsFor({
      format: c.moment.format,
      slideCount: 1,
      eventCount: 1,
      worthIt: collabWorthIt({ categorySlug: n.categorySlug, title: n.title, organiserFollowers: null }),
      organisers: n.host ? (organisers.get(crmNameKey(n.host)) ?? []) : [],
    })
    const crop = c.moment.format === 'feed' ? '4:5' : '9:16'
    pieces.push({
      kind: 'coming_up',
      city: n.citySlug,
      audience: 'attendees',
      objective: 'audience_growth',
      purpose: `Law 37 lifecycle: ${c.moment.kind.replace('_', ' ')} for ${n.title}, its permitted photograph whole`,
      nextStep: 'Open its page at eventlinqs.com.au',
      outcome: "Visits through this post's own link, then tickets sold through EventLinqs",
      link: pageLink,
      format: c.moment.format,
      eventIds: [n.eventId],
      picks: [{ eventId: n.eventId, reason: `${c.moment.kind.replace('_', ' ')} on ${day}` }],
      mode: 'photo_led',
      slides: [slide],
      caption: ig,
      versions: {
        instagram: { hook: first, caption: ig, crop, cta: 'Link in our bio.', ...(collaborators.length > 0 ? { collaborators } : {}) },
        facebook: { hook: first, caption: fb, crop, cta: fbLink },
      },
      partnerName: null,
      partnerEventId: null,
      message: null,
      posterDay: null,
      momentKey: `${momentKey(c.moment).split('|')[0]}|${c.moment.format}|${day}|${runRef(c.run.key)}`,
      names: [n.title, ...(n.host ? [n.host] : [])],
    })
  }
  return { pieces, notes, due, photoless }
}
