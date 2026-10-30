import { getCity } from '@/lib/cities/data'
import { CREDIT_DAYS, resultOf, type CreditedOrder, type LinkEvent, type PostResult } from '@/lib/social/results'

/**
 * THE WEEKLY CAMPAIGN'S REPORT: WHAT EACH PIECE DID, BESIDE THE CAMPAIGNS BEFORE IT, AND AT MOST THREE CHANGES.
 *
 * The release checklist of 28 October 2026: J16 (measurement), J17 (the weekly report), G1 to G5 (the scorecard, the
 * comparison, a few evidence-based changes, none automatic, a weak city diagnosed) and K14 (measured kept apart from
 * entered; an outside ticket press never claimed as a sale).
 *
 * TWO KINDS OF FIGURE, NEVER MIXED:
 *   entered  what Instagram or Facebook reported for a piece (reach, watch time on the Reel, saves, shares), typed in
 *            by a person from the app (social_piece_figures, 20261028151001); the newest read is the figure, shown with
 *            when it was read. Entered figures are added only to other entered figures of the same platform and metric.
 *   counted  what EventLinqs recorded itself: per piece through a link that counts (the partner kit's own /e/ link,
 *            ../social/results.ts resultOf), and per campaign week from the platform's own rows (./social-report.ts).
 * No line of this file adds one kind to the other (scripts/guards/social-measured-apart.mjs).
 *
 * NO BASELINE, NO RECOMMENDATION. A baseline is an earlier campaign that went. Until one exists the report says so
 * and proposes nothing; a figure nobody counted is null and shown as not counted, never as zero.
 *
 * PURE. ./social-report.ts reads the rows; the founder's answer to each recommendation is kept as history and changes
 * nothing by itself (G4).
 */

export type Platform = 'instagram' | 'facebook'
export type PlatformMetric = 'reach' | 'watch_time_seconds' | 'saves' | 'shares'
export const PLATFORMS: readonly Platform[] = ['instagram', 'facebook']
export const PLATFORM_METRICS: readonly PlatformMetric[] = ['reach', 'watch_time_seconds', 'saves', 'shares']

/** At most this many changes a week (the 13:54 order: "up to three recommendations with their data"). */
export const MAX_RECOMMENDATIONS = 3
/** Earlier campaigns shown beside this one. */
export const EARLIER_SHOWN = 4
/** A kind is compared only over at least this many measured pieces, so one lucky post is not a pattern. */
export const MIN_PIECES_PER_KIND = 3
/** The strongest kind is named only when its median reach is at least this many times the weakest's. */
export const KIND_GAP = 1.5
/** A platform is named only over at least this many pieces measured on both, and at least this ratio between them. */
export const MIN_PIECES_BOTH_PLATFORMS = 3
export const PLATFORM_GAP = 2
/** Fewer nights live than this in a city is weak supply (G5). */
export const SUPPLY_FLOOR = 10
/** Under half the campaign's median reach is weak distribution; reach at the median but under half its social visitors a piece is weak content. */
export const CITY_GAP = 0.5

export interface CampaignRow {
  readonly id: string
  /** The Monday the week starts, YYYY-MM-DD. */
  readonly weekStart: string
}

export interface PieceRow {
  readonly id: string
  readonly campaignId: string
  readonly kind: string
  readonly city: string
  readonly audience: string
  readonly objective: string
  readonly outcome: string
  readonly link: string
  readonly partnerName: string | null
  /** When it went, from social_piece_postings; null until then. */
  readonly postedAt: string | null
  readonly postUrl: string | null
  /** The share link whose rows are this piece's own (the partner kit's /e/ link), or null for a page link. */
  readonly countedLinkId: string | null
  /** The nights its newest version names (social_piece_revisions.event_ids), for the claims after it went. */
  readonly nightIds?: readonly string[]
}

export interface FigureRow {
  readonly pieceId: string
  readonly platform: Platform
  readonly metric: PlatformMetric
  readonly value: number
  readonly readAt: string
  readonly enteredAt: string
}

/** What EventLinqs counted in a campaign's week, from its own rows (./social-report.ts). */
export interface WeekCounted {
  /** Distinct visitors to event pages (the ledger's key). */
  readonly visitors: number
  /** Event page views. */
  readonly eventViews: number
  /** Distinct visitors whose first touch was Instagram, Facebook or another social site. */
  readonly visitorsFromSocial: number
  /** Presses out to an organiser's own booking page (/out). A press, never a sale. */
  readonly externalBookingClicks: number
  /** Orders on EventLinqs that stand, and their value. */
  readonly nativeOrders: number
  readonly nativeOrderCents: number
  /** Subscribers who confirmed in the week. */
  readonly subscriptions: number
  /** Organiser and partner enquiries sent in the week; null where the database has no enquiry table to count. */
  readonly organiserEnquiries: number | null
  /** Listings live and still to come at the week's end, per city slug. */
  readonly liveByCity: Readonly<Record<string, number>>
  /** Distinct social visitors to each city's event pages. */
  readonly socialVisitorsByCity: Readonly<Record<string, number>>
}

export interface Entered {
  readonly value: number
  readonly readAt: string
}

export type EnteredSet = Readonly<Record<Platform, Readonly<Record<PlatformMetric, Entered | null>>>>

export interface PieceReport {
  readonly id: string
  readonly kind: string
  readonly city: string
  readonly audience: string
  readonly objective: string
  readonly outcome: string
  readonly link: string
  readonly partnerName: string | null
  readonly posted: boolean
  readonly postedAt: string | null
  readonly postUrl: string | null
  readonly entered: EnteredSet
  /** Counted through this piece's own link, or null where it has none or has not gone. */
  readonly counted: PostResult | null
  readonly countedWords: string
  /** Taps on its /go link within the credit window from when it went; null until it has gone. */
  readonly goTaps: number | null
  /** Claims of the nights it names made within the credit window after it went; null until it has gone. */
  readonly claimsAfter: number | null
  readonly claimsWords: string
}

export interface EnteredTotal {
  readonly value: number
  readonly pieces: number
}

export type EnteredTotals = Readonly<Record<Platform, Readonly<Record<PlatformMetric, EnteredTotal | null>>>>

export interface EarlierCampaign {
  readonly id: string
  readonly weekStart: string
  readonly piecesPosted: number
  readonly counted: WeekCounted | null
  readonly enteredTotals: EnteredTotals
}

export interface Recommendation {
  readonly rule: string
  readonly words: string
  readonly evidence: Readonly<Record<string, string | number>>
}

export interface SocialReport {
  readonly campaign: CampaignRow
  readonly pieces: readonly PieceReport[]
  readonly enteredTotals: EnteredTotals
  readonly counted: WeekCounted | null
  readonly previous: readonly EarlierCampaign[]
  readonly baseline: { readonly campaigns: number; readonly from: string; readonly to: string } | null
  readonly baselineWords: string
  readonly recommendations: readonly Recommendation[]
  readonly recommendationWords: string
  /** D6: each partner's kits across every campaign read, strongest first. */
  readonly partners: readonly PartnerKits[]
  readonly partnerWords: string
  readonly limitations: readonly string[]
}

/**
 * D6 (the DemandOS directive of 30 October 2026, section 6): one partner's kits, keyed by the name the planner made
 * them for (the host a night is shown under, ../social/campaign.ts hostOf). Delivery is apart from sharing: sent is a
 * kit recorded as gone, used a sent kit whose own link was tapped in its credit window. Then the levels, never added:
 * visits through their links, presses out to an outside booking page (booking intent, never a sale), and EventLinqs
 * orders that stand (the verified sale).
 */
export interface PartnerKits {
  readonly partner: string
  readonly kits: number
  readonly sent: number
  readonly used: number
  readonly visits: number
  readonly pressedOut: number
  readonly orders: number
  readonly tickets: number
}

function partnersOf(input: ReportInput): PartnerKits[] {
  const by = new Map<string, { kits: number; sent: number; used: number; visits: number; pressedOut: number; orders: number; tickets: number }>()
  for (const p of input.pieces) {
    if (p.kind !== 'partner_kit' || p.partnerName === null) continue
    const t = by.get(p.partnerName) ?? { kits: 0, sent: 0, used: 0, visits: 0, pressedOut: 0, orders: 0, tickets: 0 }
    t.kits += 1
    if (p.postedAt !== null) {
      t.sent += 1
      if (p.countedLinkId !== null) {
        const r = resultOf(p.countedLinkId, new Date(p.postedAt), input.linkEvents, input.orders)
        if (r.arrived > 0) t.used += 1
        t.visits += r.arrived
        t.pressedOut += r.pressedOut
        t.orders += r.orders
        t.tickets += r.tickets
      }
    }
    by.set(p.partnerName, t)
  }
  return [...by.entries()]
    .map(([partner, t]) => ({ partner, ...t }))
    .sort((a, b) => b.orders - a.orders || b.visits - a.visits || a.partner.localeCompare(b.partner))
}

function partnerWordsOf(partners: readonly PartnerKits[], campaigns: number): string {
  if (partners.length === 0) return 'No partner kit made yet, so no partner has anything to count.'
  const who = partners.length === 1 ? '1 partner' : `${partners.length} partners`
  const over = campaigns === 1 ? 'the 1 campaign read' : `the ${campaigns} campaigns read`
  return `${who} across ${over}. Sent is a kit you recorded as gone; used, a sent kit whose own link was tapped within ${CREDIT_DAYS} days. A press out is a press to their own booking page, never a sale; orders are EventLinqs orders through their links that still stand.`
}

export interface ReportInput {
  readonly campaignId: string
  readonly campaigns: readonly CampaignRow[]
  readonly pieces: readonly PieceRow[]
  readonly figures: readonly FigureRow[]
  readonly linkEvents: readonly LinkEvent[]
  /** What taps on a page-linked piece's /go link brought, on nights it named (share_link_events.piece_id), keyed by the piece's id as linkId. */
  readonly pieceEvents?: readonly LinkEvent[]
  readonly orders: ReadonlyMap<string, CreditedOrder>
  readonly counted: ReadonlyMap<string, WeekCounted>
  readonly now: Date
  /** Presses on /go, per piece, QA presses already left out (the daily poster directive of 30 October 2026, step 9). */
  readonly goPresses?: readonly { readonly pieceId: string; readonly pressedAt: string }[]
  /** Listing claims by night, with when each was made. */
  readonly claims?: readonly { readonly eventId: string; readonly createdAt: string }[]
}

export const KIND_NAMES: Readonly<Record<string, string>> = {
  week_ahead: 'Week ahead',
  discovery_reel: 'Discovery Reel',
  weekend_carousel: 'Weekend guide',
  venue_spotlight: 'Venue spotlight',
  organiser_campaign: 'Organiser campaign',
  partner_kit: 'Partner kit',
  // Family F, the daily event poster (window 3's 20261030010001, the founder's decision of 30 October 2026, 00:20).
  daily_poster: 'Daily poster',
}

export const LIMITATIONS: readonly string[] = [
  "Instagram and Facebook figures are typed in from each app's insights until Meta's app review lets EventLinqs read them; each shows when it was read, and they are never added to EventLinqs' own counts.",
  'A piece whose link is a city, free or organisers page is counted for the week only: the site does not tell its arrivals apart by post.',
  'A press out to another booking site is a press, not a sale: what happens on that site is not visible to EventLinqs.',
  "A visitor is the ledger's key (the address and the browser), so one person on two devices counts twice. A social visitor is one whose first touch was a social site.",
]

const kindName = (k: string) => KIND_NAMES[k] ?? k
const cityName = (slug: string) => getCity(slug)?.name ?? slug
const fmt = (n: number) => new Intl.NumberFormat('en-AU').format(n)

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function emptySet<T>(): Record<Platform, Record<PlatformMetric, T | null>> {
  const row = () => ({ reach: null, watch_time_seconds: null, saves: null, shares: null })
  return { instagram: row(), facebook: row() }
}

/** The newest read of each platform and metric for one piece. */
function enteredFor(pieceId: string, figures: readonly FigureRow[]): EnteredSet {
  const out = emptySet<Entered>()
  for (const f of figures) {
    if (f.pieceId !== pieceId) continue
    const had = out[f.platform][f.metric]
    if (had === null || f.readAt > had.readAt) out[f.platform][f.metric] = { value: f.value, readAt: f.readAt }
  }
  return out
}

/** Entered figures added only to their own platform and metric, over the pieces that have one. */
function totalsOf(pieces: readonly PieceReport[]): EnteredTotals {
  const out = emptySet<EnteredTotal>()
  for (const p of pieces) {
    for (const platform of PLATFORMS) {
      for (const metric of PLATFORM_METRICS) {
        const e = p.entered[platform][metric]
        if (e === null) continue
        const had = out[platform][metric]
        out[platform][metric] = { value: (had?.value ?? 0) + e.value, pieces: (had?.pieces ?? 0) + 1 }
      }
    }
  }
  return out
}

function pieceReport(p: PieceRow, input: ReportInput): PieceReport {
  const posted = p.postedAt !== null
  let counted: PostResult | null = null
  let countedWords: string
  if (!posted) countedWords = 'Not gone yet.'
  else if (p.countedLinkId === null) {
    if (input.pieceEvents?.some((e) => e.linkId === p.id)) {
      counted = resultOf(p.id, new Date(p.postedAt as string), input.pieceEvents, input.orders)
      countedWords = 'Counted through taps on its link for 30 days from when it went, on the nights it named.'
    } else countedWords = 'Its link is a page, so it is counted for the week only.'
  }
  else {
    counted = resultOf(p.countedLinkId, new Date(p.postedAt as string), input.linkEvents, input.orders)
    countedWords = 'Counted through its own link for 30 days from when it went.'
  }
  return {
    id: p.id,
    kind: p.kind,
    city: p.city,
    audience: p.audience,
    objective: p.objective,
    outcome: p.outcome,
    link: p.link,
    partnerName: p.partnerName,
    posted,
    postedAt: p.postedAt,
    postUrl: p.postUrl,
    entered: enteredFor(p.id, input.figures),
    counted,
    countedWords,
    ...posterFigures(p, input),
  }
}

/**
 * ATTRIBUTION PER POSTER (the daily poster directive of 30 October 2026, step 9: "taps through /go and /e, clicks out,
 * and claims per poster, on the growth page. Never called sales."). /e taps and clicks out are its own link's rows
 * above; this adds its /go taps and the claims of the nights it names, each within the same credit window from when it
 * went. A claim carries no link, so a claim is said as made AFTER the poster went, never as caused by it.
 */
function posterFigures(p: PieceRow, input: ReportInput): Pick<PieceReport, 'goTaps' | 'claimsAfter' | 'claimsWords'> {
  if (p.postedAt === null) return { goTaps: null, claimsAfter: null, claimsWords: 'Not gone yet.' }
  const from = Date.parse(p.postedAt)
  const until = from + CREDIT_DAYS * 86_400_000
  const within = (iso: string) => {
    const t = Date.parse(iso)
    return t >= from && t < until
  }
  const nights = new Set(p.nightIds ?? [])
  return {
    goTaps: (input.goPresses ?? []).filter((g) => g.pieceId === p.id && within(g.pressedAt)).length,
    claimsAfter: (input.claims ?? []).filter((c) => nights.has(c.eventId) && within(c.createdAt)).length,
    claimsWords: `Claims of the nights it names made in the ${CREDIT_DAYS} days after it went, not proof it caused them.`,
  }
}

/** G3: the kind with the higher median Instagram reach over enough measured pieces, against the weakest. */
function kindRule(pool: readonly PieceReport[], campaigns: number): Recommendation | null {
  const byKind = new Map<string, number[]>()
  for (const p of pool) {
    const reach = p.entered.instagram.reach
    if (reach === null) continue
    byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), reach.value])
  }
  const kinds = [...byKind.entries()].filter(([, v]) => v.length >= MIN_PIECES_PER_KIND).map(([k, v]) => ({ kind: k, median: median(v), n: v.length }))
  if (kinds.length < 2) return null
  kinds.sort((a, b) => b.median - a.median || a.kind.localeCompare(b.kind))
  const strong = kinds[0]
  const weak = kinds[kinds.length - 1]
  if (weak.median === 0 ? strong.median === 0 : strong.median < weak.median * KIND_GAP) return null
  const each = Math.min(strong.n, weak.n)
  return {
    rule: 'more_of_the_strongest_kind',
    words: `Plan one more ${kindName(strong.kind)} and one fewer ${kindName(weak.kind)} next week: on Instagram the ${kindName(strong.kind)} reached a median of ${fmt(strong.median)} people a piece against ${fmt(weak.median)} for the ${kindName(weak.kind)}, over at least ${each} pieces each in ${campaigns} campaigns (entered from the app).`,
    evidence: { platform: 'instagram', strongest: strong.kind, weakest: weak.kind, strongestMedianReach: strong.median, weakestMedianReach: weak.median, piecesEach: each, campaigns, source: 'entered' },
  }
}

/** G3: one platform reaching at least twice the other over the same pieces. */
function platformRule(pool: readonly PieceReport[], campaigns: number): Recommendation | null {
  const both = pool.filter((p) => p.entered.instagram.reach !== null && p.entered.facebook.reach !== null)
  if (both.length < MIN_PIECES_BOTH_PLATFORMS) return null
  const ig = median(both.map((p) => (p.entered.instagram.reach as Entered).value))
  const fb = median(both.map((p) => (p.entered.facebook.reach as Entered).value))
  const [hi, lo, hiName, loName] = ig >= fb ? [ig, fb, 'Instagram', 'Facebook'] : [fb, ig, 'Facebook', 'Instagram']
  if (lo === 0 ? hi === 0 : hi < lo * PLATFORM_GAP) return null
  return {
    rule: 'lead_with_the_stronger_platform',
    words: `Write each piece for ${hiName} first and adapt the ${loName} version from it: over ${both.length} pieces measured on both, the median reach was ${fmt(hi)} on ${hiName} against ${fmt(lo)} on ${loName} (entered from each app).`,
    evidence: { stronger: hiName.toLowerCase(), weaker: loName.toLowerCase(), strongerMedianReach: hi, weakerMedianReach: lo, pieces: both.length, campaigns, source: 'entered' },
  }
}

/** G5: the city whose pieces brought the fewest social visitors, diagnosed as weak supply, distribution or content. */
function cityRule(pieces: readonly PieceReport[], counted: WeekCounted | null): Recommendation | null {
  if (counted === null) return null
  const posted = pieces.filter((p) => p.posted)
  const cities = [...new Set(posted.map((p) => p.city))]
  if (cities.length < 2) return null
  const rows = cities.map((city) => {
    const own = posted.filter((p) => p.city === city)
    const reaches = own.map((p) => p.entered.instagram.reach?.value).filter((v): v is number => v !== undefined)
    return { city, pieces: own.length, live: counted.liveByCity[city] ?? 0, social: counted.socialVisitorsByCity[city] ?? 0, reach: reaches.length > 0 ? median(reaches) : null }
  })
  rows.sort((a, b) => a.social / a.pieces - b.social / b.pieces || a.city.localeCompare(b.city))
  const weak = rows[0]
  const name = cityName(weak.city)
  const base = { city: weak.city, liveListings: weak.live, socialVisitors: weak.social, pieces: weak.pieces }
  if (weak.live < SUPPLY_FLOOR) {
    return {
      rule: 'city_weak_supply',
      words: `${name} is short of nights, not of posts: ${fmt(weak.live)} listings were live there at the week's end against a floor of ${SUPPLY_FLOOR}, and its ${weak.pieces} pieces brought ${fmt(weak.social)} visitors from social. Collect more ${name} nights before adding ${name} pieces.`,
      evidence: { ...base, floor: SUPPLY_FLOOR, source: 'counted' },
    }
  }
  const allReach = rows.map((r) => r.reach).filter((v): v is number => v !== null)
  if (weak.reach === null || allReach.length < 2) return null
  const campaignReach = median(allReach)
  if (weak.reach < campaignReach * CITY_GAP) {
    return {
      rule: 'city_weak_distribution',
      words: `${name}'s pieces were seen by too few people: a median Instagram reach of ${fmt(weak.reach)} against ${fmt(campaignReach)} across the week's cities. Offer ${name}'s hosts their partner kit so their own followers see it.`,
      evidence: { ...base, medianReach: weak.reach, campaignMedianReach: campaignReach, source: 'entered, beside the counted visitors' },
    }
  }
  /* Weak content: seen as widely as the others (entered against entered) yet far fewer came (counted against counted).
     The two are compared each with its own kind, never divided one by the other (K14). */
  const perPiece = rows.map((r) => r.social / r.pieces)
  const campaignVisitors = median(perPiece)
  const ownVisitors = weak.social / weak.pieces
  if (weak.reach >= campaignReach && campaignVisitors > 0 && ownVisitors < campaignVisitors * CITY_GAP) {
    return {
      rule: 'city_weak_content',
      words: `${name}'s pieces were seen but not acted on: a median Instagram reach of ${fmt(weak.reach)}, at or above the ${fmt(campaignReach)} of the week's cities, yet ${fmt(weak.social)} visitors from social from its ${weak.pieces} pieces, under half the week's median a piece. Change the ${name} pieces' first line and call to action.`,
      evidence: { ...base, medianReach: weak.reach, campaignMedianReach: campaignReach, campaignMedianVisitorsAPiece: Math.round(campaignVisitors * 10) / 10, source: 'entered and counted, compared each with its own kind' },
    }
  }
  return null
}

export function buildSocialReport(input: ReportInput): SocialReport {
  const campaign = input.campaigns.find((c) => c.id === input.campaignId)
  if (campaign === undefined) throw new Error(`no campaign ${input.campaignId}`)
  const reportsOf = (campaignId: string) => input.pieces.filter((p) => p.campaignId === campaignId).map((p) => pieceReport(p, input))
  const pieces = reportsOf(campaign.id)

  const earlier = input.campaigns
    .filter((c) => c.weekStart < campaign.weekStart)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .map((c) => {
      const own = reportsOf(c.id)
      return { id: c.id, weekStart: c.weekStart, piecesPosted: own.filter((p) => p.posted).length, counted: input.counted.get(c.id) ?? null, enteredTotals: totalsOf(own), own }
    })
    .filter((c) => c.piecesPosted > 0)
    .slice(0, EARLIER_SHOWN)

  const partners = partnersOf(input)
  const baseline = earlier.length === 0 ? null : { campaigns: earlier.length, from: earlier[earlier.length - 1].weekStart, to: earlier[0].weekStart }
  const counted = input.counted.get(campaign.id) ?? null

  const recommendations: Recommendation[] = []
  if (baseline !== null) {
    const pool = [...pieces, ...earlier.flatMap((c) => c.own)].filter((p) => p.posted)
    const campaigns = 1 + earlier.length
    for (const r of [kindRule(pool, campaigns), cityRule(pieces, counted), platformRule(pool, campaigns)]) {
      if (r !== null && recommendations.length < MAX_RECOMMENDATIONS) recommendations.push(r)
    }
  }

  return {
    campaign,
    pieces,
    enteredTotals: totalsOf(pieces),
    counted,
    previous: earlier.map(({ own: _own, ...c }) => c),
    baseline,
    baselineWords:
      baseline === null
        ? 'No baseline yet: no earlier campaign has gone, so there is nothing to compare this week with. The first campaign that goes becomes the baseline.'
        : baseline.campaigns === 1
          ? `Compared with 1 earlier campaign that went, the week of ${baseline.from}.`
          : `Compared with ${baseline.campaigns} earlier campaigns that went, from the week of ${baseline.from} to the week of ${baseline.to}.`,
    recommendations,
    recommendationWords:
      baseline === null
        ? 'No recommendation until there is a baseline: a change is proposed only from a comparison with campaigns that went.'
        : recommendations.length === 0
          ? 'No recommendation this week: no comparison cleared the bar a change needs.'
          : 'Each change waits for your approval; approving one records it and changes nothing by itself.',
    partners,
    partnerWords: partnerWordsOf(partners, input.campaigns.length),
    limitations: LIMITATIONS,
  }
}
