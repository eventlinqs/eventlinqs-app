import { formatPlatformDate } from '@/lib/dates/event-time'

/**
 * THE RESOLVER. Which campaign, if any, produced this sale, and why.
 *
 * PURE. No database, no clock, no environment. Everything it needs is handed
 * to it, so the same inputs always produce the same record, a test can walk
 * every rung, and the decision stored on an order in March can be recomputed in
 * September and compared. A resolver that reads its own inputs is a resolver
 * nobody can re-run against a disputed invoice.
 *
 * THE LADDER, and each rung is named in code and stored on the record:
 *
 *   1 COOKIE CLICK ID      The buyer's browser still carried the click id we
 *                          set when they opened the link. Strongest: an
 *                          identifier we minted, returned to us.
 *   2 SIGNAL CLICK ID      The click id came back in the order's own address
 *                          rather than in a cookie. Same evidence, different
 *                          carrier, and it is what survives a browser that
 *                          dropped the cookie.
 *   3 RECIPIENT IDENTITY   No identifier survived, but the buyer IS the person
 *                          the link was sent to, and they clicked inside the
 *                          window. This is the rung that solves the phone to
 *                          laptop case, and it is the last rung that is
 *                          evidence rather than proximity.
 *   4 CAMPAIGN WINDOW      A campaign click for this event happened inside the
 *                          window and nothing ties this buyer to it. Recorded
 *                          with a confidence below one, read on screen, and
 *                          NEVER billed: measured over 308 real TEST orders
 *                          this rung attributed 140 sales that no campaign
 *                          produced.
 *   5 NONE                 Nothing. Stored, with a reason, because an order
 *                          that falls off the edge of a query is an order
 *                          nobody can account for.
 *
 * THE FORWARDED CASE lives inside rungs 1, 2 and 3 rather than beside them. A
 * recipient who sends the link to the friend who actually wants to come has
 * done exactly what a campaign wants: the sale is real and the campaign
 * produced it. So the campaign, channel and partner attribution STANDS and the
 * recipient level credit is stored as forwarded, never as that recipient
 * converting. Billing the campaign and not crediting the person is the only
 * combination that is true.
 *
 * ONE CLICK BACKS ONE SALE AT THE IDENTITY RUNG. Rungs 1 and 2 carry the click
 * id ON the order, so two orders cannot both hold it. Rung 3 has only a shared
 * identity, so a person who buys twice inside the window would match the same
 * click twice and be billed twice. A click already spent is not spent again;
 * the later order falls to rung 4, is recorded, and is not billed.
 */

export const RUNG = {
  COOKIE_CLICK_ID: 1,
  SIGNAL_CLICK_ID: 2,
  RECIPIENT_IDENTITY: 3,
  CAMPAIGN_WINDOW: 4,
  NONE: 5,
} as const

export type Rung = (typeof RUNG)[keyof typeof RUNG]

export const RUNG_NAME: Record<Rung, string> = {
  [RUNG.COOKIE_CLICK_ID]: 'cookie click identifier',
  [RUNG.SIGNAL_CLICK_ID]: 'click identifier on the order',
  [RUNG.RECIPIENT_IDENTITY]: 'recipient identity inside the window',
  [RUNG.CAMPAIGN_WINDOW]: 'campaign click inside the window, buyer unmatched',
  [RUNG.NONE]: 'nothing on record',
}

/**
 * Why a decision came back as none. Stored, so "we do not know" is a recorded
 * answer with a cause rather than an empty column.
 */
export const NONE_REASON = {
  NO_CLICK_AT_ALL: 'no_campaign_click_for_this_event',
  ONLY_OUTSIDE_WINDOW: 'every_campaign_click_fell_outside_the_window',
  CAPTURE_DISABLED: 'attribution_capture_was_switched_off',
} as const

export type NoneReason = (typeof NONE_REASON)[keyof typeof NONE_REASON]

export const NONE_REASON_SENTENCE: Record<NoneReason, string> = {
  [NONE_REASON.NO_CLICK_AT_ALL]:
    'No campaign click is on record for this event, so nothing is credited.',
  [NONE_REASON.ONLY_OUTSIDE_WINDOW]:
    'Every campaign click for this event fell outside the attribution window, so nothing is credited.',
  [NONE_REASON.CAPTURE_DISABLED]:
    'Attribution capture was switched off when this order was placed, so nothing was recorded to credit.',
}

/**
 * An identity KEY rather than an address. The resolver compares keys, so the
 * kind of identity it can match on is a property of the data rather than of
 * this file: today the recipient side carries an email key, and the day a
 * phone is captured it carries a phone key as well, with no change here and no
 * dead branch waiting for one.
 */
export type IdentityKey = string

export function emailIdentityKey(normalisedEmail: string): IdentityKey {
  return `email:${normalisedEmail}`
}

export function phoneIdentityKey(hashedPhone: string): IdentityKey {
  return `phone:${hashedPhone}`
}

export interface ResolverClick {
  id: string
  campaignId: string
  campaignName: string
  channelCode: string
  channelName: string
  partnerId: string | null
  recipientId: string | null
  /** The identity keys of the person this link was minted for. May be empty. */
  recipientIdentityKeys: readonly IdentityKey[]
  occurredAt: string
  /** The window this click's own campaign runs, in days. */
  campaignWindowDays: number
}

export interface ResolverOrder {
  id: string
  reference: string
  /** The identity keys of the person who bought. May be empty for a guest. */
  buyerIdentityKeys: readonly IdentityKey[]
  placedAt: string
}

export interface ResolverSignal {
  clickIdFromCookie: string | null
  clickIdFromQuery: string | null
  cookiePresent: boolean
}

export interface ResolverConfig {
  modelName: string
  modelVersion: string
  rungFourConfidence: number
}

export interface ResolverInput {
  order: ResolverOrder
  signal: ResolverSignal | null
  /** Every click on a campaign for THIS order's event. Filtered by the caller. */
  clicks: readonly ResolverClick[]
  config: ResolverConfig
  /** Click ids already spent as a billing basis by an earlier order. */
  spentClickIds?: readonly string[]
  /** True when the capture switch was off, which is a reason and not a gap. */
  captureDisabled?: boolean
}

export interface CandidateClick {
  clickId: string
  occurredAt: string
  campaignId: string
  /** Whether this click was inside its own campaign's window for this order. */
  insideWindow: boolean
  /** Whether it was already spent by an earlier sale. */
  alreadySpent: boolean
}

export interface AttributionDecision {
  decision: 'attributed' | 'none'
  rung: Rung
  modelName: string
  modelVersion: string
  campaignId: string | null
  channelCode: string | null
  partnerId: string | null
  recipientId: string | null
  clickId: string | null
  forwarded: boolean
  confidence: number
  candidateClicks: CandidateClick[]
  explanation: string
  reason: NoneReason | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function ms(iso: string): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Number.NaN
}

function insideWindow(click: ResolverClick, order: ResolverOrder): boolean {
  const clickAt = ms(click.occurredAt)
  const orderAt = ms(order.placedAt)
  if (!Number.isFinite(clickAt) || !Number.isFinite(orderAt)) return false
  if (clickAt > orderAt) return false
  return orderAt - clickAt <= click.campaignWindowDays * DAY_MS
}

function daysBetween(from: string, to: string): number {
  return Math.floor((ms(to) - ms(from)) / DAY_MS)
}

function sharesIdentity(click: ResolverClick, order: ResolverOrder): boolean {
  if (click.recipientIdentityKeys.length === 0) return false
  if (order.buyerIdentityKeys.length === 0) return false
  return click.recipientIdentityKeys.some(k => order.buyerIdentityKeys.includes(k))
}

/**
 * The deterministic tie break, so two candidate clicks always resolve the same
 * way. Newest first, because the model is last click; then by click id, because
 * two clicks can share a timestamp and a query has no promised order.
 */
function newestFirst(a: ResolverClick, b: ResolverClick): number {
  const diff = ms(b.occurredAt) - ms(a.occurredAt)
  if (diff !== 0) return diff
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

export function resolveAttribution(input: ResolverInput): AttributionDecision {
  const { order, signal, clicks, config } = input
  const spent = new Set(input.spentClickIds ?? [])
  const byId = new Map(clicks.map(c => [c.id, c]))

  const candidateClicks: CandidateClick[] = [...clicks]
    .sort(newestFirst)
    .map(c => ({
      clickId: c.id,
      occurredAt: c.occurredAt,
      campaignId: c.campaignId,
      insideWindow: insideWindow(c, order),
      alreadySpent: spent.has(c.id),
    }))

  const none = (reason: NoneReason): AttributionDecision => ({
    decision: 'none',
    rung: RUNG.NONE,
    modelName: config.modelName,
    modelVersion: config.modelVersion,
    campaignId: null,
    channelCode: null,
    partnerId: null,
    recipientId: null,
    clickId: null,
    forwarded: false,
    confidence: 1,
    candidateClicks,
    explanation: NONE_REASON_SENTENCE[reason],
    reason,
  })

  if (input.captureDisabled) return none(NONE_REASON.CAPTURE_DISABLED)

  // Rung 1: the identifier we minted, returned by the browser.
  const cookieClick = signal?.clickIdFromCookie ? byId.get(signal.clickIdFromCookie) : undefined
  if (cookieClick && insideWindow(cookieClick, order)) {
    return attribute(cookieClick, RUNG.COOKIE_CLICK_ID, order, config, candidateClicks)
  }

  // Rung 2: the same identifier, carried in the order's own address.
  const queryClick = signal?.clickIdFromQuery ? byId.get(signal.clickIdFromQuery) : undefined
  if (queryClick && insideWindow(queryClick, order)) {
    return attribute(queryClick, RUNG.SIGNAL_CLICK_ID, order, config, candidateClicks)
  }

  // Rung 3: the same person, inside the window, on a click nothing has spent.
  const identityMatch = [...clicks]
    .filter(c => insideWindow(c, order) && sharesIdentity(c, order) && !spent.has(c.id))
    .sort(newestFirst)[0]
  if (identityMatch) {
    return attribute(identityMatch, RUNG.RECIPIENT_IDENTITY, order, config, candidateClicks)
  }

  // Rung 4: a campaign click near this order and nothing tying them together.
  const nearby = [...clicks].filter(c => insideWindow(c, order)).sort(newestFirst)[0]
  if (nearby) {
    return attribute(nearby, RUNG.CAMPAIGN_WINDOW, order, config, candidateClicks)
  }

  return none(clicks.length === 0 ? NONE_REASON.NO_CLICK_AT_ALL : NONE_REASON.ONLY_OUTSIDE_WINDOW)
}

function attribute(
  click: ResolverClick,
  rung: Rung,
  order: ResolverOrder,
  config: ResolverConfig,
  candidateClicks: CandidateClick[],
): AttributionDecision {
  const forwarded = click.recipientId !== null && !sharesIdentity(click, order)
  const confidence = rung === RUNG.CAMPAIGN_WINDOW ? config.rungFourConfidence : 1
  return {
    decision: 'attributed',
    rung,
    modelName: config.modelName,
    modelVersion: config.modelVersion,
    campaignId: click.campaignId,
    channelCode: click.channelCode,
    partnerId: click.partnerId,
    recipientId: click.recipientId,
    clickId: click.id,
    forwarded,
    confidence,
    candidateClicks,
    explanation: explain(click, rung, order, forwarded),
    reason: null,
  }
}

/**
 * THE SENTENCE. It names the rung and the inputs, because this is what a client
 * reads when they ask why they are being charged for a sale, and "our model
 * attributed it" is not an answer anybody accepts.
 */
export function explain(
  click: ResolverClick,
  rung: Rung,
  order: ResolverOrder,
  forwarded: boolean,
): string {
  const when = formatPlatformDate(click.occurredAt)
  const gap = daysBetween(click.occurredAt, order.placedAt)
  const days = gap === 1 ? '1 day' : `${gap} days`
  const window = click.campaignWindowDays === 1 ? '1 day' : `${click.campaignWindowDays} days`
  const forwardedNote = forwarded
    ? ' The link was sent to somebody else and passed on, so the campaign is credited and the person it was sent to is not counted as having bought.'
    : ''

  switch (rung) {
    case RUNG.COOKIE_CLICK_ID:
      return `Credited to ${click.campaignName} because the buyer's browser still carried the identifier from the ${click.channelName} link they opened on ${when}, ${days} before this order, inside the ${window} window.${forwardedNote}`
    case RUNG.SIGNAL_CLICK_ID:
      return `Credited to ${click.campaignName} because this order carried the identifier from the ${click.channelName} link opened on ${when} in its own address, ${days} before the order, inside the ${window} window.${forwardedNote}`
    case RUNG.RECIPIENT_IDENTITY:
      return `Credited to ${click.campaignName} because the buyer is the person the ${click.channelName} link was sent to, and they opened it on ${when}, ${days} before this order and inside the ${window} window. No identifier survived the change of device, so the match is on identity.${forwardedNote}`
    case RUNG.CAMPAIGN_WINDOW:
      return `${click.campaignName} was opened on the ${click.channelName} link on ${when}, ${days} before this order and inside the ${window} window, but nothing ties this buyer to that click. Recorded as an observation and not charged for.`
    default:
      return NONE_REASON_SENTENCE[NONE_REASON.NO_CLICK_AT_ALL]
  }
}

/**
 * THE ONE DEFINITION OF BILLABLE IN TYPESCRIPT, and it matches the one in the
 * database (`marketing_attribution_is_billable`) clause for clause. The
 * database is the authority, because it is what actually writes the column;
 * this exists so a caller can reason before writing, and
 * `tests/unit/growth/attribution-spine.test.ts` holds the two together.
 */
export function decisionCouldBeBillable(decision: AttributionDecision): boolean {
  return decision.decision === 'attributed' && decision.rung <= RUNG.RECIPIENT_IDENTITY
}
