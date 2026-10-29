/**
 * THE ORGANISER SCORE, 0 TO 100, THE ARITHMETIC (window 6, 30 October 2026; the growth blueprint's "organiser scoring
 * model", C:\dev\START-16OCT\EVENTLINQS-GROWTH-BLUEPRINT-30OCT.md, and the project manager's ruling 3 of the same day:
 * "computed from data we hold (recurring nights in listings, basis records, booking links, field completeness). Each
 * weight is a named constant, and the score is shown with its parts. It is a prioritisation rule, not a prediction.").
 *
 * The blueprint's own words for it: "a prioritisation framework to test and refine, not a scientifically validated
 * predictor". So every part below is read from a stored row, never estimated, and each says why it scored what it did.
 *
 * THE SIX PARTS (the blueprint's weights):
 *   frequency     25  the organiser's published nights in the next 90 days (the engine plan's horizon), against the
 *                     median of the organisers WITH nights ahead: half at the median, the full 25 at twice it or more,
 *                     none at no nights. The organisers with none are left out of the median because, on TEST on
 *                     30 October, most had none, which put the median at none and gave 7 nights and 15 the same 25.
 *                     A recurring series counts through its nights.
 *   fit           20  the share of those nights in the pilot cities (ruling 5: Geelong, Melbourne, Ballarat, Bendigo).
 *                     Audience fit is not separately measured: nothing we hold says who attends.
 *   value         20  the share of those nights whose call to action sends a person somewhere we count
 *                     (src/lib/events/cta.ts): EventLinqs tickets, tickets at a named provider, or registration. A
 *                     walk-in night and a night with no known admission send nobody anywhere.
 *   readiness     15  an email address that may be written to: a whole lawful basis and no refusal from the database
 *                     (outreach_contact_refusal). Nothing in between: a prospect is not a contact (the blueprint).
 *   completeness  10  across those nights, the share of four checks that hold: a line about the night (its summary or
 *                     its description; a listing keeps its line in summary), a picture, the venue's address, and a
 *                     known admission.
 *   partnership   10  a positive sign already on record: a yes or interested reply, a claim, or their own submission.
 *
 * An organiser who said no or stop is never scored or ranked, and says so.
 */
import type { CtaState } from '@/lib/events/cta'

export const WEIGHTS = { frequency: 25, fit: 20, value: 20, readiness: 15, completeness: 10, partnership: 10 } as const
export type Part = keyof typeof WEIGHTS
export const PARTS = Object.keys(WEIGHTS) as Part[]

/** The engine plan's horizon: nights 0 to 90 days ahead. */
export const HORIZON_DAYS = 90
/** Ruling 5's starting cities, as their slugs. */
export const PILOT_CITIES = ['geelong', 'melbourne', 'ballarat', 'bendigo'] as const
/** The calls to action that send a person somewhere we count. */
export const COUNTED_DESTINATIONS: readonly CtaState[] = ['paid_native', 'paid_external', 'free_registration']

export type Night = { citySlug: string | null; cta: CtaState; hasDescription: boolean; hasImage: boolean; hasVenueAddress: boolean }

export type OrganiserFacts = {
  id: string
  /** Their published nights in the next HORIZON_DAYS. */
  nights: readonly Night[]
  /** An email contact with a whole basis that the database does not refuse. */
  writableEmail: boolean
  /** A yes or interested reply, a claim, or a submission of their own. */
  positiveSign: boolean
  /** A no or stop on record. */
  stopped: boolean
}

export type OrganiserScore =
  | { id: string; state: 'scored'; score: number; parts: Record<Part, number>; why: Record<Part, string> }
  | { id: string; state: 'stopped' }

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Whether a night carries a line about it: a listing keeps it in summary, an organiser's own night in description. */
export function lineOf(event: { description: string | null; summary: string | null }): boolean {
  return [event.summary, event.description].some((t) => typeof t === 'string' && t.trim() !== '')
}

const share = (weight: number, held: number, of: number): number => (of === 0 ? 0 : Math.round((weight * held) / of))
const nights = (n: number): string => `${n} night${n === 1 ? '' : 's'}`

function frequencyOf(n: number, cohortMedian: number): number {
  if (n === 0) return 0
  if (cohortMedian <= 0) return WEIGHTS.frequency
  return Math.min(WEIGHTS.frequency, Math.round((WEIGHTS.frequency * n) / (2 * cohortMedian)))
}

/** Scores every organiser, frequency against the median of the organisers scored with it that have nights ahead. */
export function scoreOrganisers(cohort: readonly OrganiserFacts[]): OrganiserScore[] {
  const m = median(cohort.filter((o) => !o.stopped && o.nights.length > 0).map((o) => o.nights.length))
  const pilot = new Set<string>(PILOT_CITIES)
  const destinations = new Set<CtaState>(COUNTED_DESTINATIONS)
  return cohort.map((o): OrganiserScore => {
    if (o.stopped) return { id: o.id, state: 'stopped' }
    const n = o.nights.length
    const inPilot = o.nights.filter((x) => x.citySlug !== null && pilot.has(x.citySlug)).length
    const sending = o.nights.filter((x) => destinations.has(x.cta)).length
    const checks = o.nights.reduce((sum, x) => sum + [x.hasDescription, x.hasImage, x.hasVenueAddress, x.cta !== 'unknown_price'].filter(Boolean).length, 0)
    const parts: Record<Part, number> = {
      frequency: frequencyOf(n, m),
      fit: share(WEIGHTS.fit, inPilot, n),
      value: share(WEIGHTS.value, sending, n),
      readiness: o.writableEmail ? WEIGHTS.readiness : 0,
      completeness: share(WEIGHTS.completeness, checks, 4 * n),
      partnership: o.positiveSign ? WEIGHTS.partnership : 0,
    }
    const why: Record<Part, string> = {
      frequency: `${nights(n)} in the next ${HORIZON_DAYS} days (the median of organisers with nights ahead: ${m})`,
      fit: n === 0 ? 'no nights ahead' : `${inPilot} of ${nights(n)} in Geelong, Melbourne, Ballarat or Bendigo`,
      value: n === 0 ? 'no nights ahead' : `${sending} of ${nights(n)} with tickets or registration we count`,
      readiness: o.writableEmail ? 'an email address with a lawful basis on record' : 'no email address we may write to',
      completeness: n === 0 ? 'no nights ahead' : `${checks} of ${4 * n} details held (a line, a picture, the address, admission)`,
      partnership: o.positiveSign ? 'a yes, a claim or their own submission on record' : 'no reply, claim or submission yet',
    }
    return { id: o.id, state: 'scored', score: PARTS.reduce((sum, p) => sum + parts[p], 0), parts, why }
  })
}

/** The scored organisers, highest first; a tie goes by id, so the order never moves between runs. */
export function rankOrganisers(scored: readonly OrganiserScore[]): Extract<OrganiserScore, { state: 'scored' }>[] {
  return scored
    .filter((s): s is Extract<OrganiserScore, { state: 'scored' }> => s.state === 'scored')
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}
