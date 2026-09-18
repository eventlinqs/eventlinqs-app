/**
 * THE CLICK COOKIE.
 *
 * It carries ONE value, the click id, and nothing else. Everything else about
 * that click is already on `marketing_click`, keyed by the same id, so putting
 * a campaign or a recipient in the cookie would create a second copy that a
 * person can edit in their own browser and that would then have to be believed
 * or disbelieved. The id is a lookup key; a forged one resolves to no row and
 * the resolver falls to the next rung, which is exactly the right answer.
 *
 * ON THE SAME TERMS AS THE THREE COOKIES THIS PLATFORM ALREADY SETS
 * (`el_share_code`, `el_from`, `el_arrival`, see `src/proxy.ts`): path `/`,
 * sameSite lax, not httpOnly, secure in production only. Its LIFETIME is read
 * from `marketing_attribution_config.click_cookie_days` rather than from a
 * fourth constant, because a window written down twice is a window that
 * disagrees with itself.
 *
 * LAST TOUCH, NOT FIRST, and this is the one place this item differs from
 * `el_from` on purpose. `el_from` answers "which channel brought this person to
 * the platform", where the first touch is the honest credit. This answers
 * "which message produced this sale", where a person who received two campaigns
 * and bought after the second one bought after the second one. The attribution
 * MODEL is last click for the same reason, and a first-touch cookie feeding a
 * last-click model would quietly contradict it.
 */

export const CLICK_COOKIE = 'el_click'

/**
 * THE SECOND CARRIER, and why there are two rather than one.
 *
 * `el_click` is written by the /m route on the redirect itself. `el_click_q` is
 * written by the page from the identifier in its own ADDRESS. They differ in
 * exactly one situation and it is a common one: somebody opens the tracked
 * link, copies the address out of the bar and sends it on, or opens it on a
 * second device by pasting it. The redirect never ran for that person, so no
 * cookie was set by it, but the identifier is right there in the address.
 *
 * Keeping them apart is what makes rungs 1 and 2 a real distinction rather than
 * a relabelling: rung 1 is an identifier we handed out and got back, rung 2 is
 * one that travelled in an address. Both are evidence; the first is stronger,
 * which is why it is asked first.
 */
export const CLICK_QUERY_COOKIE = 'el_click_q'

/** Bound, so a crafted cookie cannot be used to stuff a header or a query. */
const MAX_CLICK_ID = 64

/** A click id is a uuid. Anything else is not one, and is treated as absent. */
const CLICK_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function readClickCookie(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim().slice(0, MAX_CLICK_ID)
  if (!raw) return null
  return CLICK_ID_SHAPE.test(raw) ? raw.toLowerCase() : null
}

export function clickCookieOptions(clickCookieDays: number): {
  maxAge: number
  path: string
  sameSite: 'lax'
  httpOnly: false
  secure: boolean
} {
  if (!Number.isInteger(clickCookieDays) || clickCookieDays < 1) {
    throw new Error(`click cookie lifetime must be a positive whole number of days, got ${clickCookieDays}`)
  }
  return {
    maxAge: clickCookieDays * 24 * 60 * 60,
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  }
}
