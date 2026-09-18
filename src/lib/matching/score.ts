/**
 * THE MATCHER, AND THE WHOLE METHOD IS IN THIS COMMENT.
 *
 * A reader learns the method here without running anything, which is GA2 step
 * 10 and is also the point of choosing arithmetic in the first place: the first
 * organiser who asks why their event went to 340 people and not 3,400 gets an
 * answer on screen rather than a shrug.
 *
 * THE METHOD: weighted-additive v1. Each component is a fit between 0 and 1
 * computed from ONE column of the audience row against ONE fact about the
 * event. Each fit is multiplied by its weight, the weighted fits are summed,
 * and the sum is scaled to 0 to 100. Nothing is multiplied by anything else,
 * nothing is learned, and nothing is hidden, so the score of any person can be
 * read back as a list of sentences with a number beside each one.
 *
 *   component        source column                       weight source
 *   ---------------  ----------------------------------  ---------------------
 *   category         audience_members.category_slugs     marketing_match_weights
 *   community        audience_members.community_slugs    marketing_match_weights
 *   city             audience_members.city_slugs         marketing_match_weights
 *   postcode         audience_members.postcode           marketing_match_weights
 *                    banded by marketing_match_postcode_bands
 *   price            audience_members.price_band         marketing_match_weights
 *                    tolerance from marketing_match_config.price_band_tolerance
 *   recency          audience_members.last_order_at      marketing_match_weights
 *                    half life from marketing_match_config.recency_half_life_days
 *   spend            audience_members.lifetime_spend_cents  marketing_match_weights
 *   channel_consent  audience_members.consent_channel    marketing_match_weights
 *
 * NO COMPONENT READS A HARD CODED TAXONOMY VALUE, CITY, PRICE OR FEE. The
 * community and category values arrive on the rows, resolved from the taxonomy
 * tables by GA1's refresh; the bands and the weights arrive from configuration.
 * The only numbers written in this file are 0, 1 and 100, and they are the
 * bounds of a fit and of a score.
 *
 * WHY THIS METHOD AND NOT THE OTHER TWO. The comparison is
 * scripts/verify/ga2-method-comparison.mjs and its output is
 * C:\dev\EVIDENCE\GA2\method-comparison.json. Against the three criteria GA2
 * names: on separation the three are within noise of each other on a seeded
 * catalogue (lift over random 10.2, 8.9 and 7.6 on the population that has a
 * history to score, over four events, which is too few to separate them); on
 * cost all three are trivial; on EXPLAINABILITY only this one can put one
 * sentence beside each component, which is what an organiser is owed. The rules
 * ladder lost because five tiers cannot rank inside a tier, so a cap cuts
 * arbitrarily through people the method calls identical. Nearest neighbour lost
 * because it cannot say why one person is in the list, and because a first-time
 * organiser's event has no similar past events to draw neighbours from.
 *
 * PURE. No database, no clock except the `now` passed in, no I/O. The half of
 * this that reads the ledger and the orders is src/lib/matching/run.ts.
 */
import { priceBandOf, type AudiencePriceBand } from '@/lib/audience/segments'

export interface MatchWeight {
  component: string
  weight: number
  sentence: string
}

export interface PostcodeBand {
  band: number
  sharedPrefix: number
  fit: number
  label: string
}

export interface MatchConfig {
  methodName: string
  methodVersion: string
  recencyHalfLifeDays: number
  priceBandTolerance: number
  sendCooldownDays: number
  minimumScoreFloor: number
  maxRecipientsPerRun: number
  weightSumTolerance: number
  weights: MatchWeight[]
  postcodeBands: PostcodeBand[]
}

/** The eight components, in the order the breakdown is read in. */
export const MATCH_COMPONENTS = [
  'category',
  'community',
  'city',
  'postcode',
  'price',
  'recency',
  'spend',
  'channel_consent',
] as const

export type MatchComponent = (typeof MATCH_COMPONENTS)[number]

export interface AudienceRowForScoring {
  id: string
  email: string
  categorySlugs: string[]
  communitySlugs: string[]
  citySlugs: string[]
  postcode: string | null
  priceBand: AudiencePriceBand
  lastOrderAt: string | null
  lifetimeSpendCents: number
  /** The channel scope the ledger recorded for this person. */
  consentChannel: 'email' | 'sms' | 'both' | null
}

export interface EventForScoring {
  id: string
  categorySlug: string | null
  communitySlugs: string[]
  citySlug: string | null
  postcode: string | null
  /** The median tier price, in cents, or null for an event with no tiers. */
  medianTierPriceCents: number | null
}

export interface BreakdownEntry {
  component: MatchComponent
  /** What the component actually saw, in words, so the row explains itself. */
  raw: string
  /** The 0 to 1 fit before the weight. */
  fit: number
  weight: number
  /** fit x weight x 100, which is what this component added to the score. */
  contribution: number
  sentence: string
}

export interface MatchVerdict {
  score: number
  breakdown: BreakdownEntry[]
}

/**
 * The error a bad weight set raises, by name, so a caller can catch this one
 * thing rather than every failure.
 */
export class MatchConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MatchConfigError'
  }
}

/**
 * Refuse to score at all when the weights do not sum to one.
 *
 * A weight set that sums to 0.8 does not produce a slightly wrong score, it
 * produces a score whose maximum is 80, and every threshold anybody set against
 * it silently means something else. The error names the offending row: a single
 * weight outside 0 to 1 is named on its own, and a bad sum is reported with
 * every row and its weight, because with eight rows the reader needs to see
 * which one moved.
 */
export function assertWeightsAreUsable(config: MatchConfig): void {
  if (config.weights.length === 0) {
    throw new MatchConfigError(
      'marketing_match_weights is empty, so there is no method to score with. Seed the eight components.',
    )
  }
  for (const row of config.weights) {
    if (!Number.isFinite(row.weight) || row.weight < 0 || row.weight > 1) {
      throw new MatchConfigError(
        `marketing_match_weights row "${row.component}" carries the weight ${row.weight}, which is outside 0 to 1.`,
      )
    }
  }
  const sum = config.weights.reduce((total, row) => total + row.weight, 0)
  if (Math.abs(sum - 1) > config.weightSumTolerance) {
    const rows = config.weights.map(row => `${row.component}=${row.weight}`).join(', ')
    throw new MatchConfigError(
      `marketing_match_weights sums to ${Math.round(sum * 1000) / 1000}, not 1 within the configured tolerance of ${config.weightSumTolerance}. The rows are: ${rows}.`,
    )
  }
}

function weightOf(config: MatchConfig, component: MatchComponent): MatchWeight {
  const found = config.weights.find(row => row.component === component)
  if (!found) {
    throw new MatchConfigError(
      `marketing_match_weights has no row for the component "${component}", so the method is incomplete.`,
    )
  }
  return found
}

/** The postcode band two postcodes fall in, read from configuration. */
export function postcodeBandFor(
  buyerPostcode: string | null,
  eventPostcode: string | null,
  bands: PostcodeBand[],
): PostcodeBand | null {
  if (!buyerPostcode || !eventPostcode || bands.length === 0) return null
  const ordered = [...bands].sort((a, b) => b.sharedPrefix - a.sharedPrefix)
  for (const band of ordered) {
    if (band.sharedPrefix === 0) return band
    if (buyerPostcode.slice(0, band.sharedPrefix) === eventPostcode.slice(0, band.sharedPrefix)) {
      return band
    }
  }
  return ordered[ordered.length - 1] ?? null
}

const BAND_LADDER: AudiencePriceBand[] = [
  'free',
  'under-30',
  '30-to-59',
  '60-to-99',
  '100-to-199',
  '200-plus',
]

/** How well an event's price sits against what this buyer usually pays. */
export function priceFit(
  buyerBand: AudiencePriceBand,
  eventBand: AudiencePriceBand,
  tolerance: number,
): number {
  if (buyerBand === 'unknown' || eventBand === 'unknown') return 0
  const distance = Math.abs(BAND_LADDER.indexOf(buyerBand) - BAND_LADDER.indexOf(eventBand))
  if (distance === 0) return 1
  if (distance <= tolerance) return 0.5
  return 0
}

/**
 * The pull of a purchase, halving every `halfLifeDays`.
 *
 * Exponential rather than a cliff, because a buyer does not stop being a buyer
 * on the ninety-first day, and because a cliff makes the ranking jump on a date
 * nobody chose.
 */
export function recencyFit(lastOrderAt: string | null, now: Date, halfLifeDays: number): number {
  if (!lastOrderAt) return 0
  const at = Date.parse(lastOrderAt)
  if (Number.isNaN(at)) return 0
  const days = (now.getTime() - at) / 86_400_000
  if (days <= 0) return 1
  return Math.pow(0.5, days / halfLifeDays)
}

/** Spend, flattened at the point where more spend stops meaning more intent. */
export function spendFit(lifetimeSpendCents: number, ceilingCents = 50_000): number {
  if (!Number.isFinite(lifetimeSpendCents) || lifetimeSpendCents <= 0) return 0
  return Math.min(1, lifetimeSpendCents / ceilingCents)
}

function channelFit(consentChannel: AudienceRowForScoring['consentChannel'], channel: 'email' | 'sms'): number {
  if (!consentChannel) return 0
  return consentChannel === 'both' || consentChannel === channel ? 1 : 0
}

/**
 * Score one person against one event. Returns the number and the whole
 * arithmetic that produced it, so nothing has to be recomputed to explain it.
 */
export function scoreAudienceMember(
  member: AudienceRowForScoring,
  event: EventForScoring,
  config: MatchConfig,
  options: { now: Date; channel: 'email' | 'sms' },
): MatchVerdict {
  assertWeightsAreUsable(config)

  const eventBand = priceBandOf(event.medianTierPriceCents)
  const band = postcodeBandFor(member.postcode, event.postcode, config.postcodeBands)

  const sharedCommunities = event.communitySlugs.filter(slug => member.communitySlugs.includes(slug))
  const categoryHit = Boolean(event.categorySlug && member.categorySlugs.includes(event.categorySlug))
  const cityHit = Boolean(event.citySlug && member.citySlugs.includes(event.citySlug))

  const fits: Record<MatchComponent, { fit: number; raw: string }> = {
    category: {
      fit: categoryHit ? 1 : 0,
      raw: categoryHit
        ? `has bought in ${event.categorySlug}`
        : `has never bought in ${event.categorySlug ?? 'this category'}`,
    },
    community: {
      fit: sharedCommunities.length > 0 ? 1 : 0,
      raw:
        sharedCommunities.length > 0
          ? `shares the community ${sharedCommunities.join(', ')}`
          : 'shares no community with this event',
    },
    city: {
      fit: cityHit ? 1 : 0,
      raw: cityHit ? `has bought in ${event.citySlug}` : `has not bought in ${event.citySlug ?? 'this city'}`,
    },
    postcode: {
      fit: band?.fit ?? 0,
      raw: band ? band.label : 'no postcode on either side',
    },
    price: {
      fit: priceFit(member.priceBand, eventBand, config.priceBandTolerance),
      raw: `usually pays ${member.priceBand}, this event is ${eventBand}`,
    },
    recency: {
      fit: recencyFit(member.lastOrderAt, options.now, config.recencyHalfLifeDays),
      raw: member.lastOrderAt
        ? `last bought ${Math.max(0, Math.round((options.now.getTime() - Date.parse(member.lastOrderAt)) / 86_400_000))} days ago`
        : 'no recorded purchase',
    },
    spend: {
      fit: spendFit(member.lifetimeSpendCents),
      raw: `${member.lifetimeSpendCents} cents lifetime`,
    },
    channel_consent: {
      fit: channelFit(member.consentChannel, options.channel),
      raw: member.consentChannel
        ? `consent covers ${member.consentChannel}, this campaign is ${options.channel}`
        : 'no channel recorded',
    },
  }

  const breakdown: BreakdownEntry[] = MATCH_COMPONENTS.map(component => {
    const weight = weightOf(config, component)
    const { fit, raw } = fits[component]
    const bounded = Math.max(0, Math.min(1, fit))
    return {
      component,
      raw,
      fit: Math.round(bounded * 1000) / 1000,
      weight: weight.weight,
      contribution: Math.round(bounded * weight.weight * 1000) / 10,
      sentence: weight.sentence,
    }
  })

  const total = breakdown.reduce((sum, entry) => sum + entry.contribution, 0)
  return {
    // Bounded rather than trusted: a weight set that passed the sum check can
    // still be rounded into 100.1, and a score outside its own range is the
    // kind of thing that reaches a screen before anybody notices.
    score: Math.max(0, Math.min(100, Math.round(total * 10) / 10)),
    breakdown,
  }
}

/** The method, in one sentence, for the admin view to print. */
export function methodSentence(config: MatchConfig): string {
  return `Each person scores out of 100 by adding up eight fits, each one a single fact about what they have bought weighed by a number the owner sets: ${config.weights
    .map(w => `${w.component.replace('_', ' ')} ${Math.round(w.weight * 100)}%`)
    .join(', ')}.`
}
