'use client'

import { useEffect } from 'react'
import { CLICK_QUERY_COOKIE, readClickCookie } from '@/lib/attribution/cookie'
import { readClickIdentifiers } from '@/lib/attribution/route-config'

/**
 * CARRIES A CLICK IDENTIFIER OUT OF THE ADDRESS AND ACROSS THE NAVIGATION.
 *
 * Close-out GA3, rung 2. Renders nothing.
 *
 * WHAT IT IS FOR. The /m route sets the click cookie on its own redirect, which
 * covers the person who opened the link. It does not cover the person who was
 * SENT the address: somebody opens the tracked link, copies what is in the bar,
 * and passes it on, or pastes it into a second browser. No redirect ran for
 * them, so no cookie was set, but the identifier is in the address they are
 * looking at. Without this the identifier is gone the moment they tap through
 * to the checkout, and a real sale falls to the identity rung or past it.
 *
 * WHY A SEPARATE COOKIE. Writing it into `el_click` would make an identifier
 * that arrived in an address indistinguishable from one we handed out and got
 * back, and rungs 1 and 2 would stop being a real distinction. See
 * `src/lib/attribution/cookie.ts`.
 *
 * LAST TOUCH, unlike the arrival cookie beside it, and deliberately: a person
 * who opens two campaign links bought after the second one. The arrival cookie
 * answers "which surface brought this account", where first touch is the honest
 * credit; this answers "which message produced this sale", where it is not.
 *
 * IT WRITES NOTHING WHEN THERE IS NOTHING TO SAY, and never the same value
 * twice, so an ordinary page view costs no cookie write at all.
 */
export function ClickIdentifierRelay() {
  useEffect(() => {
    try {
      const { clickId } = readClickIdentifiers(new URLSearchParams(window.location.search))
      const valid = readClickCookie(clickId)
      if (!valid) return
      const already = document.cookie
        .split('; ')
        .find(c => c.startsWith(`${CLICK_QUERY_COOKIE}=`))
        ?.split('=')[1]
      if (already === valid) return
      /*
       * The lifetime is NOT read from the configuration here, and that is a
       * deliberate limit rather than an oversight: this runs in the browser and
       * cannot read a service role table. It is set to a session cookie, with no
       * max-age, so it lives exactly as long as the visit that carried the
       * address. The durable carrier is `el_click`, whose lifetime IS
       * configured, written server side by the redirect.
       */
      document.cookie = `${CLICK_QUERY_COOKIE}=${valid}; path=/; samesite=lax`
    } catch {
      // A browser that refuses a cookie has given its answer and it is a
      // legitimate one. The resolver has the identity rung below this.
    }
  }, [])

  return null
}
