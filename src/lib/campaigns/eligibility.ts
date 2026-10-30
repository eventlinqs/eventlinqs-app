import type { CtaState } from '@/lib/events/cta'

/**
 * THE CAMPAIGN ELIGIBILITY ENGINE (D1 of Lawal's DemandOS directive of 30 October 2026, section 1: "Every verified event
 * must be evaluated for" nine points, then "Assign the event to Discovery, Featured Distribution or Performance Campaign
 * eligibility. Do not promise equal promotion to every event."). The levels are the blueprint's table:
 *
 *   Discovery    every eligible verified listing: its facts hold and its destination answers.
 *   Featured     strong local events with approved imagery and relevant audiences. The image is the organiser's own, or
 *                an approved photograph of the actual venue. A night without one stays a correct listing (K1).
 *   Performance  verified conversion tracking, sufficient lead time and viable economics. An outside sale cannot be
 *                verified, and a free night has no sale to convert.
 *
 * It decides eligibility and says why. It spends nothing and publishes nothing: paid controls stay off (D7x), and the
 * planner's own selection is unchanged. Pure: ./eligibility-read.ts reads the rows.
 */

export type CampaignLevel = 'discovery' | 'featured' | 'performance'
export type EligibilityPoint = 'status' | 'time' | 'venue' | 'media' | 'ticketing' | 'availability' | 'audience' | 'viability' | 'attribution'
export type EligibilityCheck = { readonly point: EligibilityPoint; readonly ok: boolean; readonly words: string }
export type EligibilityJudgement = { readonly level: CampaignLevel | null; readonly checks: readonly EligibilityCheck[] }

export type EligibilityFacts = {
  readonly status: string
  readonly visibility: string
  readonly startDate: string
  readonly endDate: string
  readonly venueName: string | null
  readonly city: string | null
  readonly categoryKnown: boolean
  readonly ctaState: CtaState
  /** Sold elsewhere, and every booking link the daily check holds reads dead. */
  readonly destinationDead: boolean
  readonly soldOut: boolean
  /** Whose approved photograph it may carry: the organiser's, the actual venue's, or none. */
  readonly media: 'organiser' | 'venue' | null
  /** The fee at the live schedule if every remaining place sold; null when that cannot be known. Never ticket value. */
  readonly potentialFeeCents: number | null
}

/**
 * Starting assumptions, not sourced figures: the directive names lead time and viable economics and gives no number, and
 * the blueprint's A$2.50 example is barred (the PM's 17:25). Named here for the project manager's review, and nothing
 * spends on them while paid controls are off.
 */
export const PERFORMANCE_MIN_DAYS = 14
export const PERFORMANCE_MIN_POTENTIAL_CENTS = 50_000

const DAY_MS = 24 * 60 * 60 * 1000

const TICKETING_WORDS: Record<CtaState, string> = {
  over: 'The night is over',
  free_open: 'Free entry, no ticket',
  free_registration: 'Free, registration through its page',
  paid_native: 'Tickets on EventLinqs',
  paid_external: 'Tickets at an outside provider',
  unknown_price: 'No price known, its page gives the details',
}

export function judgeEvent(f: EligibilityFacts, now: Date): EligibilityJudgement {
  const isLive = f.status === 'published' && f.visibility === 'public'
  const ended = new Date(f.endDate).getTime() <= now.getTime()
  const daysLeft = (new Date(f.startDate).getTime() - now.getTime()) / DAY_MS
  const hasPlace = Boolean(f.venueName && f.city)
  const verifiable = f.ctaState === 'paid_native'
  const viable = f.potentialFeeCents !== null && f.potentialFeeCents >= PERFORMANCE_MIN_POTENTIAL_CENTS

  const checks: EligibilityCheck[] = [
    { point: 'status', ok: isLive, words: isLive ? 'Published and public' : `Not public: ${f.status}, ${f.visibility}` },
    {
      point: 'time',
      ok: !ended,
      words: ended ? 'Already ended' : daysLeft <= 0 ? 'On now' : `${Math.ceil(daysLeft)} days to go`,
    },
    { point: 'venue', ok: hasPlace, words: hasPlace ? `${f.venueName}, ${f.city}` : 'No venue or city on record' },
    {
      point: 'media',
      ok: f.media !== null,
      words: f.media === 'organiser' ? "The organiser's own approved photograph" : f.media === 'venue' ? 'An approved photograph of the venue' : 'No approved photograph',
    },
    { point: 'ticketing', ok: !f.destinationDead && f.ctaState !== 'over', words: f.destinationDead ? 'Its booking link is dead' : TICKETING_WORDS[f.ctaState] },
    { point: 'availability', ok: !f.soldOut, words: f.soldOut ? 'Sold out' : 'Places still available, as far as we can read' },
    { point: 'audience', ok: f.categoryKnown && Boolean(f.city), words: f.categoryKnown ? 'Its category and city are known' : 'No category on record' },
    {
      point: 'viability',
      ok: viable,
      words: f.potentialFeeCents === null ? 'Economics not known' : viable ? 'Enough left to earn at the live fee' : 'Too little left to earn at the live fee',
    },
    {
      point: 'attribution',
      ok: verifiable,
      words: verifiable ? 'A sale here is verified' : f.ctaState === 'paid_external' ? 'Clicks only, an outside sale cannot be verified' : 'No sale to verify',
    },
  ]

  const ok = (p: EligibilityPoint) => checks.find((c) => c.point === p)?.ok === true
  if (!ok('status') || !ok('time') || !ok('venue') || !ok('ticketing')) return { level: null, checks }
  if (!ok('media') || !ok('availability') || !ok('audience')) return { level: 'discovery', checks }
  if (!ok('viability') || !ok('attribution') || daysLeft < PERFORMANCE_MIN_DAYS) return { level: 'featured', checks }
  return { level: 'performance', checks }
}

export function levelCounts(judged: readonly EligibilityJudgement[]): Record<CampaignLevel | 'none', number> {
  const counts = { performance: 0, featured: 0, discovery: 0, none: 0 }
  for (const j of judged) counts[j.level ?? 'none'] += 1
  return counts
}
