import type { SupabaseClient } from '@supabase/supabase-js'
import { tierOf } from '@/lib/events/relevance'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import { crmNameKey } from '@/lib/listings/discovery-organisers'
import type { CampaignNight, PiecePlan, Slide } from './campaign'
import {
  captionFor,
  collabWorthIt,
  collaboratorsFor,
  dayIn,
  daysFrom,
  FIRST_LINE_WINDOW_DAYS,
  firstLineFor,
  momentKey,
  momentsDue,
  rankPhotos,
  runRef,
  runsOf,
  seedOf,
  selectToday,
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
  readonly feedToday: number
  readonly feedLastSeven: number
  readonly storiesToday: number
}

async function readHistory(db: Db, now: Date): Promise<History> {
  const { data, error } = await db
    .from('social_pieces')
    .select('id, format, moment_key, planned_at, social_piece_revisions(version, slides, versions), social_piece_decisions(revision, decision)')
    .not('moment_key', 'is', null)
    .order('planned_at', { ascending: false })
    .limit(3000)
  if (error) throw new Error(`the lifecycle history could not be read: ${error.message}`)
  const today = dayIn(now, LIFECYCLE_ZONE)
  const byRun = new Map<string, { feedDays: string[]; storyDays: string[]; had: string[] }>()
  const usedPhotos = new Set<string>()
  const recentLines = new Set<string>()
  let feedToday = 0
  let feedLastSeven = 0
  let storiesToday = 0
  for (const p of (data ?? []) as Record<string, unknown>[]) {
    const parts = parseMomentKey(p.moment_key as string)
    if (!parts) continue
    const revs = ((p.social_piece_revisions as { version: number; slides: Slide[]; versions: Record<string, { caption?: string }> }[] | null) ?? []).sort((a, b) => b.version - a.version)
    const newest = revs[0]
    if (!newest) continue
    const rejected = ((p.social_piece_decisions as { revision: number; decision: string }[] | null) ?? []).some((d) => d.revision === newest.version && d.decision === 'rejected')
    // A photograph is never used twice, even one whose piece was rejected after it was drawn (law 37 (l)).
    for (const s of newest.slides ?? []) if (s.t === 'photo') usedPhotos.add(s.photo)
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
    if (parts.day === today) {
      if (parts.format === 'feed') feedToday += 1
      else storiesToday += 1
    }
    if (parts.format === 'feed' && age >= 0 && age < 7) feedLastSeven += 1
  }
  return { byRun, usedPhotos, recentLines, feedToday, feedLastSeven, storiesToday }
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
export function nightDates(startIso: string, endIso: string | null, zone: string): string {
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

function linkFor(origin: string, slug: string, platform: 'instagram' | 'facebook', format: 'feed' | 'story', kind: MomentKind, day: string): string {
  const q = new URLSearchParams({ utm_source: platform, utm_medium: format, utm_campaign: 'lifecycle', utm_content: `${kind}-${day}` })
  return `${origin}/events/${slug}?${q.toString()}`
}

/**
 * Today's lifecycle pieces: the history read first, the day's few chosen (selectToday), each with its strongest photo
 * not used before, its own first line, its story line, its own link per network, and a Collab where law 40 allows.
 */
export async function planLifecyclePieces(
  db: Db,
  input: { readonly now: Date; readonly nights: readonly CampaignNight[]; readonly origin: string },
): Promise<{ readonly pieces: PiecePlan[]; readonly notes: string[] }> {
  const notes: string[] = []
  const byId = new Map(input.nights.map((n) => [n.eventId, n]))
  const runs = runsOf(input.nights.map(toLifecycleNight))
  const history = await readHistory(db, input.now)
  const photos = await readPhotos(db, input.nights.map((n) => n.eventId), input.now)
  const used = new Set(history.usedPhotos)

  const none: RunHistory = { feedDays: [], storyDays: [], had: [] }
  const candidates: Candidate[] = []
  for (const run of runs) {
    const day = dayIn(input.now, run.zone)
    for (const moment of momentsDue(run, input.now, history.byRun.get(runRef(run.key)) ?? none)) {
      const night = nightForDay(run, day)
      candidates.push({ run, moment, hasPhoto: rankPhotos(photos.get(night.eventId) ?? [], moment.format, used).length > 0 })
    }
  }
  const chosen = selectToday(candidates, { feedToday: history.feedToday, feedLastSeven: history.feedLastSeven, storiesToday: history.storiesToday })
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
    const first = firstLineFor(c.moment.kind, c.run.salesOpen, lines, seedOf(`${c.run.key}|${day}|${c.moment.format}`))
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
    const facts = { title: n.title, place, dateLabel: nightDates(n.startDate, n.endDate ?? null, c.run.zone), priceLine: n.priceLine, summary: n.summary, names: [n.title, ...(n.host ? [n.host] : [])] }
    const igLink = linkFor(input.origin, n.slug, 'instagram', c.moment.format, c.moment.kind, day)
    const fbLink = linkFor(input.origin, n.slug, 'facebook', c.moment.format, c.moment.kind, day)
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
      link: igLink,
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
  return { pieces, notes }
}
