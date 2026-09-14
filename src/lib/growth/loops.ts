import { REF_PARAM, SOURCE_PARAM, buildAttributedUrl, encodeRefCode } from './referrals'

/**
 * THE TWO PRODUCT LOOPS, AND THE ONE PLACE THEIR LINKS ARE MADE.
 *
 * Close-out PL1. Every attendee who buys a ticket has just seen the product
 * work, and every organiser who publishes has friends who run events. Neither
 * was asked for anything. These are the four places they now are, and the
 * links are built here rather than typed at each one.
 *
 * WHY ONE MODULE. Four surfaces build these links: an email that is rendered on
 * a server with no DOM, a page, a share bar in the browser, and a dashboard. A
 * link typed at each of them is four chances for one to lose a parameter, and
 * the failure is silent in the worst direction: the loop still works, people
 * still arrive, and the count is wrong for ever, so the item is judged on
 * numbers that were never collected. One module means the registered guard has
 * one thing to read.
 *
 * WHY BOTH PARAMETER SYSTEMS RIDE THE SAME LINK. This platform already had one:
 * `ref` and `via`, first touch, cookie backed, feeding the referral and
 * attribution spine (`referrals.ts`, and GA3). AN1 then added a second, `src`
 * plus the utm set, which is what a signup STORES on the account and what the
 * weekly source line aggregates. They answer different questions and neither
 * replaces the other: `via` says which loop, `src` says which surface, and only
 * `src` survives onto the account. PL1 names `src` values explicitly, so every
 * link here carries both and the two can never disagree, because one function
 * writes them.
 */

/**
 * The four surfaces a loop link can start from. PL1 names the first three by
 * name; the fourth is its own item.
 *
 * These strings are stored on `profiles.signup_src` and aggregated by the
 * weekly line, so changing one is a data migration rather than a rename.
 */
export const LOOP_SOURCES = {
  /** The footer of a ticket email. */
  TICKET: 'ticket',
  /** The order confirmation page, under the ticket. */
  CONFIRMATION: 'confirmation',
  /** A share button on an event page. */
  SHARE: 'share',
  /** An organiser's own referral link from their dashboard. */
  ORGANISER_REFERRAL: 'organiser-referral',
  /*
   * The in-account prompt. PL1 names the first four; this fifth was already on
   * /account, typed by hand and carrying `via` without `src`, so every account
   * it produced was recorded as having arrived from nowhere. Found by the
   * registered guard on its first run.
   */
  ACCOUNT: 'account',
} as const

export type LoopSource = (typeof LOOP_SOURCES)[keyof typeof LOOP_SOURCES]

/** Where a person who runs events is sent. One path, four ways in. */
export const ORGANISER_PATH = '/organisers'

/**
 * THE ONE SENTENCE, and it is one sentence because a paragraph on somebody
 * else's ticket is an advertisement rather than an invitation.
 *
 * Split into a lead and a call so the page can set them as two elements and the
 * email can set them as one line, without either retyping the other.
 */
export const RUN_YOUR_EVENT_LEAD = 'Do you run events?'
export const RUN_YOUR_EVENT_CALL = 'Publish yours in ten minutes'

/** The line as one piece of prose, for an email footer and a rendered card. */
export const RUN_YOUR_EVENT_LINE = `${RUN_YOUR_EVENT_LEAD} ${RUN_YOUR_EVENT_CALL}`

/**
 * A relative link to the organiser path carrying both parameters.
 *
 * Relative, because it is used inside the application where relative is
 * correct and where an absolute URL built from a guessed origin is how a link
 * in a preview deployment ends up pointing at production.
 */
export function organiserLoopPath(source: LoopSource): string {
  const via = source === LOOP_SOURCES.SHARE ? 'share-a-ticket' : 'organiser-invite'
  return `${ORGANISER_PATH}?${SOURCE_PARAM}=${via}&src=${source}`
}

/**
 * The same link, absolute, for an email and anywhere else with no page to be
 * relative to. The origin is passed in rather than read from the environment,
 * because the caller knows which site it is sending on behalf of and this
 * module must never be the thing that decides.
 */
export function organiserLoopUrl(siteUrl: string, source: LoopSource): string {
  return `${siteUrl.replace(/\/+$/, '')}${organiserLoopPath(source)}`
}

/**
 * An organiser's own referral link, for their dashboard.
 *
 * Returns null when the id cannot be encoded, and a null is rendered as an
 * explanation rather than as a link to nowhere: a referral link that quietly
 * drops the code credits nobody and looks identical to one that works.
 */
export function organiserReferralUrl(siteUrl: string, organiserProfileId: string): string | null {
  const code = encodeRefCode(organiserProfileId)
  if (!code) return null
  const base = `${siteUrl.replace(/\/+$/, '')}${ORGANISER_PATH}`
  return `${base}?${REF_PARAM}=${code}&${SOURCE_PARAM}=organiser-invite&src=${LOOP_SOURCES.ORGANISER_REFERRAL}`
}

/**
 * A shared event link, carrying `src=share` so AN1 counts the arrival.
 *
 * ON THE EVENT ID, which PL1 asks these links to carry and which is
 * deliberately NOT a second parameter. The link IS the event page, so the event
 * is already in the path, and every share also mints a tracked short code
 * (`/s/[code]`, one per channel) whose row records the event, the channel, the
 * click and the sale. A duplicated event id in the query string would be a
 * second identifier that can disagree with the first, and it would answer less
 * than the table already does. The deviation is recorded in BUILD-LOG-B.md
 * rather than left to be noticed.
 */
export function sharedEventUrl(
  eventUrl: string,
  opts: { refCode?: string | null } = {},
): string {
  const attributed = buildAttributedUrl(eventUrl, {
    refCode: opts.refCode ?? undefined,
    source: 'share-a-ticket',
  })
  const url = new URL(attributed)
  url.searchParams.set('src', LOOP_SOURCES.SHARE)
  return url.toString()
}

/**
 * Add `src=share` to a link somebody else minted, without disturbing anything
 * else on it.
 *
 * The tracked short links arrive from `/api/broadcast/share-link` already
 * formed, and this must not rebuild them: a short link is short on purpose and
 * reconstructing one loses whatever the minting route put there. Returns the
 * input unchanged if it is not a URL this can parse, because a share button
 * that throws is worse than one that shares an untagged link.
 */
export function withShareSource(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.set('src', LOOP_SOURCES.SHARE)
    return parsed.toString()
  } catch {
    return url
  }
}
