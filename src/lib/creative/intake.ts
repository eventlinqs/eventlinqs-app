/**
 * THE CREATIVE INTAKE: HANDOFF AND GATES (Lawal, 23 November 2026, 13:15, START-16OCT\CREATIVE-PRODUCTION-ENGINE-23NOV.md
 * sections A, E, F and K; the PM's 12:18 items 2 and 3, and 13:16, car F). ARCHITECTURE, IN TEN LINES:
 * EXISTS: Car A (social/store.ts) draws, approves, schedules, publishes and reconciles pieces; the register (social_assets,
 * organiser_permissions) holds every permitted asset and yes; the timing engine (social/timing.ts) gives each window.
 * THIS CAR: creative_intake, one record per finished piece; these gates, run at intake (store.ts receiveIntake) and again
 * before publishing (store.ts pieceDependencies), each failure held with its reason and NO FALLBACK (nothing else takes
 * the slot); a passed record handed to Car A as a 'creative' piece (store.ts drawIntakePiece), unapproved until the PM's
 * verify; the creative budget (creative/budget.ts), its cap zero and generation off until a logged write sets them.
 * NEXT CARS: the reference library and playbook, make and critic (briefs, candidates and the review, through budget.ts),
 * the weekly loop (learn, plan, measure) and the weekly report. A finished design is never a publication by itself.
 */
import { BANNED_SELF_DESCRIPTIONS } from '@/lib/brand/positioning'
import { goDestination } from '@/lib/growth/go-math'
import { APPROVED_FILE_PREFIX, creativeRefusals, FEED_CROP, isCreativeFileUrl, postTitle, whenOf, type CampaignNight, type PiecePlan, type PlatformVersion, type Slide } from '@/lib/social/campaign'
import { goHop, PIECE_MARK } from '@/lib/social/go-hop'
import { LIFECYCLE_ZONE, nightTimes } from '@/lib/social/lifecycle'
import { feedNightDates } from '@/lib/social/lifecycle-plan'
import { relativeDateWords } from '@/lib/social/playbook'
import { pastLatest, type Timing } from '@/lib/social/timing'
import { namesOwnVenue, normaliseVenueName, placeOfLine, placeVerdict, type KnownVenues } from '@/lib/social/venue-identity'
import { carriesBannedWord } from '@/lib/social/words'

export type Network = 'instagram' | 'facebook'
export const NETWORKS: readonly Network[] = ['instagram', 'facebook']

/** What an image rests on: an organiser's yes, a permitted asset of the register, an approved file, or the organiser's artwork kept whole. */
export type RestsOn =
  | { readonly kind: 'grant'; readonly grantId: string }
  | { readonly kind: 'asset'; readonly assetId: string }
  | { readonly kind: 'organiser_artwork'; readonly assetId: string }
  | { readonly kind: 'approved_file' }

export type IntakeImage = { readonly url: string; readonly restsOn: RestsOn }

/** A night's facts as the piece states them, from the brief: the gate compares them with the record at every check. */
export type StatedFact = {
  readonly eventId: string
  readonly title: string
  readonly startDate: string
  readonly endDate: string | null
  readonly venue: string | null
  readonly organiser: string | null
}

export type IntakeObjective = 'discovery' | 'engagement' | 'conversion'
export type IntakeState = 'received' | 'held' | 'passed' | 'handed_off' | 'expired'
export type GateStage = 'intake' | 'publish'

/** One finished piece, as the engine hands it in. Its timeline: preferred, latest useful and expiry (never a 'deadline'). */
export type IntakeInput = {
  readonly briefId: string
  readonly eventIds: readonly string[]
  readonly format: 'feed' | 'story'
  readonly images: readonly IntakeImage[]
  /** The approved caption for each network; both are always written, and destinations says where it goes. */
  readonly captions: Readonly<Record<Network, string>>
  readonly destinations: readonly Network[]
  readonly facts: readonly StatedFact[]
  /** The booking destination on www the /go hop lands on: the night's own page, or a page listing every night. */
  readonly link: string
  readonly objective: IntakeObjective
  readonly preferredAt: string
  readonly latestAt: string
  readonly expiresAt: string
}

export type IntakeRecord = IntakeInput & { readonly id: string; readonly state: IntakeState; readonly pieceId: string | null }

/** An asset of the register as the gates read it now: the record's nights it is usable for at this minute. */
export type RegisterAsset = {
  readonly id: string
  readonly assetUrl: string
  readonly assetType: string
  readonly eventId: string | null
  readonly width: number | null
  readonly height: number | null
  readonly usableFor: ReadonlySet<string>
}

/** Everything the gates read at that minute (store.ts readIntakeFacts). */
export type IntakeRead = {
  /** The record's nights read now as public nights still to come; one missing is not read. */
  readonly nights: ReadonlyMap<string, CampaignNight>
  /** Each venue id's recorded aliases, and every venue we hold (venue-identity.ts). */
  readonly aliases: ReadonlyMap<string, readonly string[]>
  readonly known: KnownVenues
  /** The timing engine's window for the record's nights, read now. */
  readonly timing: Timing
  readonly assets: ReadonlyMap<string, RegisterAsset>
  /** Each grant named, and the record's nights it covers now (organiser_permission_for); a withdrawn yes covers none. */
  readonly grants: ReadonlyMap<string, ReadonlySet<string>>
  /** The booking destination's own page, where it was read at this stage; null where another check reads it. */
  readonly page: { readonly ok: boolean; readonly status: number | null; readonly body: string } | null
  /** Each destination's fit for the images (destination-check.ts slidesMisfit); null fits. */
  readonly misfits: ReadonlyMap<Network, string | null>
}

const DAY_LINE = '\u{1F4C5}'
const URLS = /https?:\/\/[^\s]+/g
const LINK_IN_BIO = /link in (?:our )?bio/gi

/* ------------------------------------------------------------------ the record, as a row and back */

/** The row an intake record is written as. Pure. */
export function intakeRow(r: IntakeInput): Record<string, unknown> {
  return {
    brief_id: r.briefId,
    event_ids: [...r.eventIds],
    format: r.format,
    images: r.images.map((i) => ({ url: i.url, rests_on: restsOnRow(i.restsOn) })),
    captions: { instagram: r.captions.instagram, facebook: r.captions.facebook },
    destinations: [...r.destinations],
    facts: r.facts.map((f) => ({ event_id: f.eventId, title: f.title, start_date: f.startDate, end_date: f.endDate, venue: f.venue, organiser: f.organiser })),
    link: r.link,
    objective: r.objective,
    preferred_at: r.preferredAt,
    latest_at: r.latestAt,
    expires_at: r.expiresAt,
  }
}

function restsOnRow(o: RestsOn): Record<string, string> {
  if (o.kind === 'grant') return { kind: o.kind, grant_id: o.grantId }
  if (o.kind === 'asset' || o.kind === 'organiser_artwork') return { kind: o.kind, asset_id: o.assetId }
  return { kind: o.kind }
}

function restsOnOf(v: unknown): RestsOn {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  if (o.kind === 'grant') return { kind: 'grant', grantId: String(o.grant_id ?? '') }
  if (o.kind === 'asset') return { kind: 'asset', assetId: String(o.asset_id ?? '') }
  if (o.kind === 'organiser_artwork') return { kind: 'organiser_artwork', assetId: String(o.asset_id ?? '') }
  return { kind: 'approved_file' }
}

/** An intake record from its row. Pure. */
export function intakeOfRow(row: Record<string, unknown>): IntakeRecord {
  const captions = (row.captions ?? {}) as Record<string, unknown>
  return {
    id: String(row.id),
    state: String(row.state) as IntakeState,
    pieceId: (row.piece_id as string | null) ?? null,
    briefId: String(row.brief_id),
    eventIds: ((row.event_ids as string[] | null) ?? []).map(String),
    format: row.format === 'story' ? 'story' : 'feed',
    images: ((row.images as Record<string, unknown>[] | null) ?? []).map((i) => ({ url: String(i.url ?? ''), restsOn: restsOnOf(i.rests_on) })),
    captions: { instagram: String(captions.instagram ?? ''), facebook: String(captions.facebook ?? '') },
    destinations: ((row.destinations as string[] | null) ?? []).filter((d): d is Network => d === 'instagram' || d === 'facebook'),
    facts: ((row.facts as Record<string, unknown>[] | null) ?? []).map((f) => ({
      eventId: String(f.event_id ?? ''),
      title: String(f.title ?? ''),
      startDate: String(f.start_date ?? ''),
      endDate: (f.end_date as string | null) ?? null,
      venue: (f.venue as string | null) ?? null,
      organiser: (f.organiser as string | null) ?? null,
    })),
    link: String(row.link ?? ''),
    objective: String(row.objective) as IntakeObjective,
    preferredAt: String(row.preferred_at),
    latestAt: String(row.latest_at),
    expiresAt: String(row.expires_at),
  }
}

/* ------------------------------------------------------------------ the database's caption rule, as words */

/** The en dash, the em dash and the exclamation mark the database refuses, the dashes named by code point (words.ts does the same). */
const REVISION_REFUSES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}!]`)

/**
 * THE CAPTION THE DATABASE ENFORCES on social_piece_revisions.caption (20261028141001_social_campaigns.sql): between 1 and
 * 2,200 characters once trimmed, and never an en dash, an em dash or an exclamation mark. A record whose revision caption
 * the database would refuse is held at intake with this reason, never left to fail at the handoff. Pure.
 */
export function revisionCaptionRefusal(caption: string): string | null {
  const length = caption.trim().length
  if (length < 1 || length > 2200) return `its caption runs to ${length} characters once trimmed; the database keeps 1 to 2,200`
  if (REVISION_REFUSES.test(caption)) return 'its caption carries an en dash, an em dash or an exclamation mark, which the database refuses'
  return null
}

/** The caption a piece's revision row carries: Instagram's, as every planner writes it. */
export const revisionCaptionOf = (captions: Readonly<Record<Network, string>>): string => captions.instagram

/* ------------------------------------------------------------------ the gates */

/** The record's own shape: what it must hold before anything is read. Pure. */
export function shapeFaults(r: IntakeInput): string[] {
  const out: string[] = []
  const ids = new Set(r.eventIds)
  if (r.eventIds.length === 0 || r.eventIds.length > 10 || ids.size !== r.eventIds.length) out.push('[shape] It names its nights once each, one to ten.')
  const stated = new Set(r.facts.map((f) => f.eventId))
  if (stated.size !== r.facts.length || [...ids].some((id) => !stated.has(id)) || [...stated].some((id) => !ids.has(id))) out.push('[shape] It states the facts of each of its nights, once.')
  if (r.images.length === 0 || r.images.length > 10) out.push('[shape] It carries one to ten images, in order.')
  if (r.destinations.length === 0 || new Set(r.destinations).size !== r.destinations.length) out.push('[shape] It names its destinations, each once.')
  for (const n of NETWORKS) if (!r.captions[n]?.trim()) out.push(`[shape] Its ${n} caption is empty.`)
  const t = [r.preferredAt, r.latestAt, r.expiresAt].map((x) => Date.parse(x))
  if (t.some((x) => !Number.isFinite(x))) out.push('[shape] Its timeline (preferred, latest useful, expiry) is not three times.')
  else if (!(t[0] <= t[1] && t[1] <= t[2])) out.push('[shape] Its timeline is out of order: preferred, then latest useful, then expiry.')
  if (!/^https:\/\/www\.eventlinqs\.com\.au\/\S*$/.test(r.link)) out.push(`[shape] Its booking destination, ${r.link}, is not a page on www.eventlinqs.com.au.`)
  return out
}

const approvedFile = (url: string) => url.startsWith(APPROVED_FILE_PREFIX) && /^[0-9a-z-]+\.jpg$/.test(url.slice(APPROVED_FILE_PREFIX.length))

/** The night an asset's slide carries: its own night where the record names it, else the first the asset is usable for. */
function nightOfAsset(asset: RegisterAsset, eventIds: readonly string[]): string {
  if (asset.eventId && eventIds.includes(asset.eventId)) return asset.eventId
  return eventIds.find((id) => asset.usableFor.has(id)) ?? eventIds[0] ?? ''
}

/** Every image against what it rests on, read now. An organiser's poster is never altered. Pure. */
export function rightsFaults(r: IntakeInput, read: Pick<IntakeRead, 'assets' | 'grants' | 'nights'>): string[] {
  const out: string[] = []
  const name = (id: string) => read.nights.get(id)?.title ?? r.facts.find((f) => f.eventId === id)?.title ?? id
  r.images.forEach((img, i) => {
    const n = i + 1
    const o = img.restsOn
    if (o.kind === 'approved_file') {
      if (!approvedFile(img.url)) out.push(`[rights] Image ${n} rests on an approved file, and ${img.url} is not one under /social/approved/.`)
      return
    }
    if (o.kind === 'grant') {
      const covers = read.grants.get(o.grantId)
      if (!covers) out.push(`[rights] Image ${n} rests on the yes ${o.grantId}, which is not on record or is withdrawn.`)
      else for (const id of r.eventIds) if (!covers.has(id)) out.push(`[rights] Image ${n}: the yes ${o.grantId} does not cover ${name(id)} now.`)
      if (!isCreativeFileUrl(img.url)) out.push(`[rights] Image ${n} rests on a yes and is not a finished design in our own storage (${img.url}).`)
      return
    }
    const asset = read.assets.get(o.assetId)
    if (!asset) {
      out.push(`[rights] Image ${n} rests on the asset ${o.assetId}, which is not in the register.`)
      return
    }
    const whole = img.url === asset.assetUrl
    if (o.kind === 'organiser_artwork' && asset.assetType !== 'artwork') out.push(`[rights] Image ${n}: the asset ${o.assetId} is a ${asset.assetType}, not the organiser's artwork.`)
    if ((o.kind === 'organiser_artwork' || asset.assetType === 'artwork') && !whole) {
      out.push(`[rights] Image ${n}: an organiser's poster is never altered; it goes as its own file (${asset.assetUrl}), whole.`)
    } else if (!whole && !isCreativeFileUrl(img.url)) {
      out.push(`[rights] Image ${n} is neither its asset's own file nor a finished design in our own storage (${img.url}).`)
    }
    if (whole && (asset.width === null || asset.height === null)) out.push(`[rights] Image ${n}: the register holds no size for ${o.assetId}, so it cannot be drawn whole.`)
    const night = nightOfAsset(asset, r.eventIds)
    if (!asset.usableFor.has(night)) out.push(`[rights] Image ${n}: the asset ${o.assetId} has no approved, current permission for ${name(night)} now.`)
  })
  return out
}

/** The one feed format's date line for one night: '📅 Tuesday 24 November, 7pm to 9pm' (the weekday once). Pure. */
export function feedDateLine(n: Pick<CampaignNight, 'startDate' | 'endDate' | 'timezone'>): string {
  const zone = n.timezone?.trim() || LIFECYCLE_ZONE
  const times = nightTimes(n.startDate, n.endDate ?? null, zone)
  return `${DAY_LINE} ${feedNightDates(n.startDate, n.endDate ?? null, zone)}${times ? `, ${times}` : ''}`
}

const venueNamesOf = (n: CampaignNight, aliases: ReadonlyMap<string, readonly string[]>): string[] =>
  [n.placeName ?? null, n.venueName, ...(n.venueId ? (aliases.get(n.venueId) ?? []) : [])].filter((s): s is string => typeof s === 'string' && s.trim() !== '')

/** Each night's facts, read now, against what the piece states and what each caption says. Pure. */
export function factFaults(r: IntakeInput, captions: Readonly<Record<Network, string>>, read: Pick<IntakeRead, 'nights' | 'aliases' | 'known'>): string[] {
  const out: string[] = []
  const nights: CampaignNight[] = []
  for (const id of r.eventIds) {
    const n = read.nights.get(id)
    const f = r.facts.find((x) => x.eventId === id)
    if (!n) {
      out.push(`[facts] ${f?.title ?? id}: not read as a public night still to come (published, public, not ended, not sold out, in a guide city).`)
      continue
    }
    nights.push(n)
    if (!f) continue
    if (f.title !== n.title) out.push(`[facts] ${n.title}: the piece states the title "${f.title}".`)
    if (Date.parse(f.startDate) !== Date.parse(n.startDate)) out.push(`[facts] ${n.title}: it now starts ${whenOf(n)}, not as the piece states (${f.startDate}).`)
    if ((f.endDate ? Date.parse(f.endDate) : null) !== (n.endDate ? Date.parse(n.endDate) : null)) out.push(`[facts] ${n.title}: its end is now ${n.endDate ?? 'not on record'}, not as the piece states (${f.endDate ?? 'none'}).`)
    const names = venueNamesOf(n, read.aliases)
    if (f.venue && !namesOwnVenue(f.venue, names)) out.push(`[facts] ${n.title}: the piece names the venue "${f.venue}"; the record's is ${names[0] ?? 'none'}.`)
    if ((f.organiser?.trim() || null) !== (n.organiser?.trim() || null)) out.push(`[facts] ${n.title}: the piece names the organiser ${f.organiser ?? 'nobody'}; the listing names ${n.organiser ?? 'nobody'} (never a hired venue).`)
  }
  for (const net of NETWORKS) {
    const caption = captions[net] ?? ''
    const lines = caption.split('\n').map((l) => l.trim())
    const lower = caption.toLowerCase()
    for (const n of nights) {
      const titles = [n.title, postTitle(n.title, n.venueName)].map((t) => t.toLowerCase())
      if (!titles.some((t) => t !== '' && lower.includes(t))) out.push(`[facts] The ${net} caption does not name ${n.title}.`)
      const names = venueNamesOf(n, read.aliases)
      if (names.length > 0 && !lines.some((l) => namesOwnVenue(l, names))) {
        out.push(`[facts] The ${net} caption does not name ${n.title}'s venue, ${names[0]}.`)
      }
    }
    if (nights.length !== 1) continue
    const n = nights[0]
    // One night: its date line in the one feed format, its place its own venue, and 'by' naming only its organiser.
    if (r.format === 'feed') {
      const want = feedDateLine(n)
      const dated = lines.filter((l) => l.startsWith(DAY_LINE))
      if (dated.length === 0) out.push(`[facts] The ${net} caption has no date line; it reads "${want}".`)
      for (const d of dated) if (d !== want) out.push(`[facts] The ${net} caption's date line reads "${d}"; the record's is "${want}".`)
    }
    const names = venueNamesOf(n, read.aliases)
    for (const l of lines) {
      const place = placeOfLine(l)
      if (place === null) continue
      const verdict = placeVerdict(place, names, read.known, n.venueId ?? null)
      if (verdict.kind === 'other') out.push(`[facts] The ${net} caption's place line names ${verdict.name}, a different venue from ${n.title}'s own.`)
    }
    // The credit line is 'Title, by Organiser' (lifecycle.ts captionFor): a line that starts with the night's own title.
    const titles = [n.title, postTitle(n.title, n.venueName)].map((t) => `${t.toLowerCase()}, by `)
    for (const l of lines) {
      const head = titles.find((t) => l.toLowerCase().startsWith(t))
      if (!head) continue
      const named = l.slice(head.length).replace(/\.$/, '').trim()
      if (!n.organiser) out.push(`[facts] The ${net} caption says "${l}", but the listing names no organiser; the title stands alone.`)
      else if (normaliseVenueName(named) !== normaliseVenueName(n.organiser)) {
        const venue = names.some((v) => normaliseVenueName(v) === normaliseVenueName(named))
        out.push(`[facts] The ${net} caption credits ${named}${venue ? ', the venue,' : ''}; the listing's organiser is ${n.organiser}.`)
      }
    }
  }
  return out
}

/**
 * The record's timeline against the timing engine's window for its nights. At intake the window is read for the record's
 * own expiry (store.ts readIntakeFacts), so its latest useful time must fall by the engine's latest (two hours before the
 * doors of a short night) and its expiry by the engine's; before publishing, at the minute it goes, neither may have passed.
 * Pure.
 */
export function timingFaults(r: IntakeInput, timing: Timing, now: Date, at: Date = now, stage: GateStage = 'intake'): string[] {
  if (now.getTime() >= Date.parse(r.expiresAt)) return [`[timing] EXPIRED: its expiry, ${r.expiresAt}, has passed; it is never published.`]
  if (timing.kind === 'expired') return [`[timing] EXPIRED: ${timing.reason}`]
  if (timing.kind === 'held') return [`[timing] ${timing.reason}`]
  const out: string[] = []
  if (stage === 'intake') {
    if (Date.parse(r.latestAt) > Date.parse(timing.latestAt)) out.push(`[timing] Its latest useful time, ${r.latestAt}, is after the timing engine's for its nights, ${timing.latestAt}.`)
    if (Date.parse(r.expiresAt) > Date.parse(timing.expiresAt)) out.push(`[timing] Its expiry, ${r.expiresAt}, is after the timing engine's for its nights, ${timing.expiresAt}.`)
  }
  const latest = Math.min(Date.parse(r.latestAt), Date.parse(timing.latestAt))
  const lapse = pastLatest(new Date(latest).toISOString(), at)
  if (lapse) out.push(`[timing] ${lapse}`)
  return out
}

/** The booking destination through the /go hop, and each network's one action. Pure. */
export function destinationFaults(
  r: IntakeInput,
  captions: Readonly<Record<Network, string>>,
  read: Pick<IntakeRead, 'nights' | 'page' | 'misfits'>,
  opts: { readonly origin: string; readonly pieceId: string | null },
): string[] {
  const out: string[] = []
  let path: string
  try {
    path = new URL(r.link).pathname
  } catch {
    return [`[destination] Its booking destination, ${r.link}, is not an address.`]
  }
  const landing = new URL(goDestination(r.link, opts.origin, 'facebook'))
  if (landing.pathname !== path) out.push(`[destination] The /go hop would land on ${landing.pathname}, not its booking destination ${path}.`)
  if (read.page) {
    if (!read.page.ok) out.push(`[destination] Its page ${path} answers ${read.page.status ?? 'nothing'}.`)
    else for (const id of r.eventIds) {
      const n = read.nights.get(id)
      if (n && path !== `/events/${n.slug}` && !read.page.body.includes(`/events/${n.slug}`)) out.push(`[destination] ${path} does not list ${n.title}, so the post would send people to a page without it.`)
    }
  }
  const hop = goHop(opts.origin, 'facebook')
  const want = opts.pieceId ? hop.split(PIECE_MARK).join(opts.pieceId) : hop
  const fb = captions.facebook.match(URLS) ?? []
  if (fb.length !== 1 || fb[0] !== want) out.push(`[destination] The Facebook caption carries ${fb.length === 1 ? `the link ${fb[0]}` : `${fb.length} links`}; it carries one, its counted /go hop ${want}.`)
  const ig = captions.instagram
  if ((ig.match(URLS) ?? []).length > 0) out.push('[destination] The Instagram caption carries a link; Instagram takes none in a caption, and its one action is the link in our bio.')
  const bio = (ig.match(LINK_IN_BIO) ?? []).length
  if (bio !== 1) out.push(`[destination] The Instagram caption says "link in our bio" ${bio} times; its one action is said once.`)
  for (const net of r.destinations) {
    const misfit = read.misfits.get(net)
    if (misfit) out.push(`[destination] ${misfit}`)
  }
  return out
}

/** Each network's version as Car A keeps it: its words, the feed crop and its one action. Pure. */
export function versionsOf(captions: Readonly<Record<Network, string>>, origin: string): PiecePlan['versions'] {
  const hook = (c: string) => c.split('\n').find((l) => l.trim() !== '')?.trim() ?? ''
  const version = (net: Network, cta: string): PlatformVersion => ({ hook: hook(captions[net]), caption: captions[net], crop: FEED_CROP, cta })
  return { instagram: version('instagram', 'link in our bio'), facebook: version('facebook', goHop(origin, 'facebook')) }
}

/** The playbook's automatable rules and the caption rules every piece keeps, on each network's words. Pure. */
export function wordFaults(r: IntakeInput, captions: Readonly<Record<Network, string>>, nights: readonly CampaignNight[], origin: string): string[] {
  const out: string[] = []
  const names = nights.flatMap((n) => [n.title, postTitle(n.title, n.venueName), n.host ?? '', n.organiser ?? '', n.venueName ?? '', n.placeName ?? '']).filter((s) => s.trim() !== '')
  const sellers = new Set(nights.map((n) => (n.cta.state === 'paid_external' ? n.cta.where : null)))
  const seller = nights.length > 0 && sellers.size === 1 ? [...sellers][0] : null
  for (const net of NETWORKS) {
    const caption = captions[net] ?? ''
    if (r.format === 'feed') for (const w of relativeDateWords(caption)) out.push(`[words] The ${net} caption says "${w}"; a feed post names its day and date (playbook no-relative-date).`)
    for (const phrase of BANNED_SELF_DESCRIPTIONS) if (caption.toLowerCase().includes(phrase)) out.push(`[words] The ${net} caption says "${phrase}"; EventLinqs is never called that (the positioning lock).`)
    if (carriesBannedWord(caption, names)) out.push(`[words] The ${net} caption carries a banned word. Say community.`)
    if (seller && !caption.toLowerCase().includes(seller.toLowerCase())) out.push(`[words] Every night sells through ${seller}; the ${net} caption names it (playbook design-seller-in-the-caption).`)
  }
  for (const reason of creativeRefusals({ slides: [] as Slide[], versions: versionsOf(captions, origin) }, new Map())) out.push(`[words] ${reason}`)
  const db = revisionCaptionRefusal(revisionCaptionOf(captions))
  if (db) out.push(`[words] The Instagram caption: ${db}.`)
  return out
}

/**
 * EVERY GATE, ONE LIST (the founder's section E, automated where a machine can judge): the shape, the facts read that
 * minute, the rights each image rests on, the timing engine's window, the booking destination through the /go hop and
 * each network's one action, and the playbook's and the caption's rules. Run at intake and again before publishing, on
 * the words that will go (at publishing, the newest revision's). None means it passes. Pure.
 */
export function intakeFaults(
  r: IntakeInput,
  read: IntakeRead,
  opts: { readonly stage: GateStage; readonly now: Date; readonly goesAt?: Date; readonly origin: string; readonly pieceId: string | null; readonly captions?: Readonly<Record<Network, string>> },
): string[] {
  const captions = opts.captions ?? r.captions
  const nights = r.eventIds.map((id) => read.nights.get(id)).filter((n): n is CampaignNight => n !== undefined)
  return [
    ...shapeFaults(r),
    ...factFaults(r, captions, read),
    ...rightsFaults(r, read),
    ...timingFaults(r, read.timing, opts.now, opts.goesAt ?? opts.now, opts.stage),
    ...destinationFaults(r, captions, read, { origin: opts.origin, pieceId: opts.pieceId }),
    ...wordFaults(r, captions, nights, opts.origin),
  ]
}

/** The state a check leaves: passed with none, expired when its timeline or its nights have run out, else held. Pure. */
export function stateAfter(faults: readonly string[]): 'passed' | 'held' | 'expired' {
  if (faults.length === 0) return 'passed'
  return faults.some((f) => f.startsWith('[timing] EXPIRED')) ? 'expired' : 'held'
}

/* ------------------------------------------------------------------ the handoff, planned */

/**
 * THE RECORD'S IMAGES AS CAR A'S SLIDES, in order: an asset's own file goes whole as law 37's photograph (a poster, kept
 * exactly as supplied); an approved file or a finished design in our own storage goes as designed artwork ('file'), its
 * first night carried so the gate reads that night again at approval and publishing. Pure.
 */
export function slidesOf(r: IntakeInput, assets: ReadonlyMap<string, RegisterAsset>, nights: ReadonlyMap<string, CampaignNight>): { readonly slides: Slide[] } | { readonly refused: string } {
  const sorted = r.eventIds.map((id) => nights.get(id)).filter((n): n is CampaignNight => n !== undefined).sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  const first = sorted[0]
  if (!first) return { refused: 'none of its nights is read as a public night still to come' }
  const slides: Slide[] = []
  for (const [i, img] of r.images.entries()) {
    const o = img.restsOn
    const asset = o.kind === 'asset' || o.kind === 'organiser_artwork' ? assets.get(o.assetId) : undefined
    if (asset && img.url === asset.assetUrl) {
      if (asset.width === null || asset.height === null) return { refused: `image ${i + 1}: the register holds no size for ${asset.id}` }
      slides.push({ t: 'photo', composition: 'photo_whole', eventId: nightOfAsset(asset, r.eventIds), photo: asset.assetUrl, credit: null, width: asset.width, height: asset.height, line: null })
      continue
    }
    slides.push({ t: 'file', composition: 'close', url: img.url, format: r.format, eventId: first.eventId, startDate: first.startDate })
  }
  return { slides }
}

/** A passed record as Car A's piece plan: kind 'creative', its own words, unapproved. Pure. */
export function planIntakePiece(r: IntakeRecord, slides: readonly Slide[], nights: ReadonlyMap<string, CampaignNight>, origin: string): PiecePlan {
  const sorted = r.eventIds.map((id) => nights.get(id)).filter((n): n is CampaignNight => n !== undefined).sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  const titles = [...new Set(sorted.map((n) => n.title))]
  const path = new URL(r.link).pathname
  return {
    kind: 'creative',
    city: sorted[0]?.citySlug ?? 'melbourne',
    audience: 'attendees',
    objective: 'audience_growth',
    purpose: `Post the creative engine's piece for ${titles.join(', ')} (${r.objective})`.slice(0, 200),
    nextStep: `Open www.eventlinqs.com.au${path}`.slice(0, 200),
    outcome: "Visits through this post's own link, then presses out and tickets from there",
    link: r.link,
    format: r.format,
    eventIds: sorted.map((n) => n.eventId),
    picks: sorted.map((n) => ({ eventId: n.eventId, reason: `Picked: creative intake ${r.id} (brief ${r.briefId}), on ${whenOf(n)}.` })),
    mode: slides.some((s) => s.t === 'photo') ? 'photo_led' : 'graphic_led',
    slides: [...slides],
    caption: revisionCaptionOf(r.captions),
    versions: versionsOf(r.captions, origin),
    partnerName: null,
    partnerEventId: null,
    message: null,
    posterDay: null,
    momentKey: null,
    names: [...new Set(sorted.flatMap((n) => [n.title, postTitle(n.title, n.venueName), n.host ?? '', n.organiser ?? '']).filter((s) => s.trim() !== ''))],
  }
}
