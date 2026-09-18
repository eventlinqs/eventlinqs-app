import { NextResponse } from 'next/server'
import { headers, cookies } from 'next/headers'
import { bookClick } from '@/lib/attribution/record'
import { CLICK_COOKIE, clickCookieOptions, readClickCookie } from '@/lib/attribution/cookie'
import { readAttributionConfig } from '@/lib/attribution/config'
import { appendClickIdentifiers } from '@/lib/attribution/route-config'

/**
 * THE TRACKED LINK: /m/[code].
 *
 * FOUR THINGS, IN THIS ORDER, and the order is the requirement:
 *   1. load the link by its code;
 *   2. write one click row;
 *   3. set the first party click cookie carrying the click id;
 *   4. redirect to the stored target with the identifiers appended.
 *
 * A ROUTE HANDLER RATHER THAN A PAGE, and the difference matters. /e/[code], the
 * SHARE address, renders the event page itself because a redirect costs a round
 * trip on a phone in a venue. This one redirects, because it has to SET A
 * COOKIE, and a Server Component cannot write one during render. The share
 * system solves that by setting its cookie in the middleware; doing the same
 * here would mean the middleware writing a cookie whose value is a click id it
 * has not yet created, which cannot work. So the hop is paid for deliberately
 * and the reason is written down rather than rediscovered.
 *
 * IT NEVER BLOCKS ON THE WRITE. A buyer reaches the event page even when
 * tracking is degraded, and a degraded click is recorded with a reason rather
 * than dropped silently. An unknown or inactive code answers 404, because a
 * code that does not resolve has no target to send anybody to.
 *
 * THE CODE CARRIES EVERYTHING. A messaging app that strips every query
 * parameter strips nothing that matters: the identifiers hang off the code, and
 * the parameters appended below are a convenience copy.
 */

export const dynamic = 'force-dynamic'

const CODE_SHAPE = /^[a-z0-9]{8,32}$/

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  if (!CODE_SHAPE.test(code)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const [headerList, jar] = await Promise.all([headers(), cookies()])
  const cookieWasPresent = readClickCookie(jar.get(CLICK_COOKIE)?.value ?? null) !== null

  const booked = await bookClick({
    code,
    userAgent: headerList.get('user-agent'),
    referrer: headerList.get('referer'),
    ownHost: headerList.get('host'),
    cookieWasPresent,
  })

  if (!booked) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const target = booked.clickId
    ? appendClickIdentifiers(booked.targetPath, {
        clickId: booked.clickId,
        campaignId: booked.campaignId,
        channelCode: booked.channelCode,
      })
    : booked.targetPath

  /*
   * A RELATIVE LOCATION, AND THIS IS A DEFECT THAT WAS DRIVEN OUT RATHER THAN
   * REASONED ABOUT.
   *
   * The first version composed an absolute URL from `origin`, falling back to
   * `https://` plus the host header. A same-origin GET carries NO Origin
   * header, so every tracked link opened on a development server redirected to
   * `https://localhost:3100` and the browser answered ERR_SSL_PROTOCOL_ERROR.
   * On a preview it would have worked, which is the worst version of a bug:
   * invisible everywhere except the machine it is built on.
   *
   * A relative Location is valid HTTP (RFC 7231 section 7.1.2) and every
   * browser resolves it against the request URL, so the scheme and the host are
   * whatever the visitor actually used and this code never has to guess either.
   * `NextResponse.redirect` requires an absolute URL, so the response is
   * constructed directly; the cookie is set on it exactly the same way.
   */
  const response = new NextResponse(null, { status: 307, headers: { Location: target } })

  if (booked.clickId) {
    const config = await readAttributionConfig()
    response.cookies.set(CLICK_COOKIE, booked.clickId, clickCookieOptions(config.clickCookieDays))
  }

  return response
}
