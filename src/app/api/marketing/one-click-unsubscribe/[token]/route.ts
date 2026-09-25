import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { withdrawDigestByAnyToken } from '@/lib/consent/record'
import { applyRateLimit } from '@/lib/rate-limit/middleware'

/**
 * THE ENDPOINT THE `List-Unsubscribe` HEADER POINTS AT.
 *
 * RFC 8058 (https://www.rfc-editor.org/rfc/rfc8058.html, fetched 2026-09-19):
 * "A mail receiver can do a one-click unsubscription by performing an HTTPS
 * POST to the HTTPS URI in the List-Unsubscribe header", sending "the key/value
 * pair in the List-Unsubscribe-Post header as the request body". Google
 * requires senders of more than 5,000 messages a day to Gmail to support it
 * (https://support.google.com/a/answer/81126, fetched 2026-09-19).
 *
 * The composition of the headers lives in `src/lib/consent/one-click.ts`, which
 * also owns the path this file sits at. The registered guard
 * `scripts/guards/marketing-mail-carries-one-click.mjs` checks the constant and
 * this file agree, so the header can never advertise an address that 404s.
 *
 * ---------------------------------------------------------------------------
 * WHY POST MUTATES AND GET DOES NOT, which is the whole safety argument.
 *
 * Mail scanners, link checkers and prefetchers follow GET links in mail all
 * day. If GET withdrew consent, a security appliance scanning an inbox would
 * unsubscribe its owner from everything, silently, and the ledger would record
 * a withdrawal the person never made. That is why RFC 8058 specifies a POST and
 * why it says "The mail receiver MUST NOT perform a POST on the HTTPS URI
 * without user consent."
 *
 * So GET changes nothing and redirects to the page a person can read and press
 * on. The same rule the human preferences page already states about itself
 * ("NOTHING HAPPENS ON LOAD"), applied to the machine-readable door.
 *
 * ---------------------------------------------------------------------------
 * WHY IT ALWAYS ANSWERS 200, even for a token that matches nothing.
 *
 * Two reasons, and neither is laziness. The first is that this endpoint is
 * reached by a MACHINE that cannot read an explanation: a mailbox provider
 * interprets a non-2xx as "the unsubscribe facility is broken", which is the
 * exact judgement the headers exist to avoid earning. The second is that a
 * distinguishable 404 turns the endpoint into an oracle for whether a given
 * token exists. The body says what happened for a human reading a log; the
 * status says the facility works, which is the true statement in every case
 * because after this request the address is not subscribed.
 *
 * WHY IT IS IDEMPOTENT. `withdrawDigestByAnyToken` writes nothing on a second
 * call and reports `alreadyWithdrawn`. A provider that retries a delivery, or a
 * person who presses the button in three copies of the same message, produces
 * one withdrawal and three 200s.
 */

export const dynamic = 'force-dynamic'

/** Recorded on the ledger row so a one-click withdrawal is legible as one. */
const CAPTURE_SURFACE = 'one-click-unsubscribe'

type Ctx = { params: Promise<{ token: string }> }

export async function POST(request: Request, { params }: Ctx): Promise<NextResponse> {
  const { token } = await params

  /*
   * KEYED BY THE TOKEN, NEVER BY THE IP, and this is the one decision on this
   * route that would have been a defect if taken by habit.
   *
   * The caller here is Google's or Yahoo's infrastructure, not a household. An
   * IP-keyed bucket would put every recipient behind a provider's egress range
   * into one window and start refusing real unsubscribes the moment a campaign
   * went out at any size. That is the carrier-NAT bucket
   * `docs/RATE-LIMIT-DOCTRINE.md` records this platform meeting twice already
   * (launch-artefact, launch-compose-daily) and which `payouts-read` and
   * `stream-post` were both re-keyed to escape.
   *
   * One token is one subscriber, so the bucket is exactly the unit of abuse
   * worth bounding, and a token is an unguessable uuid rather than something a
   * stranger can enumerate.
   */
  const blocked = await applyRateLimit('marketing-one-click', request, token)
  if (blocked) return blocked

  const admin = createAdminClient()
  const result = await withdrawDigestByAnyToken(admin, token, new Date().toISOString(), CAPTURE_SURFACE)

  if (!result) {
    return NextResponse.json(
      { ok: true, outcome: 'no-matching-subscription' },
      { status: 200 },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      outcome: result.alreadyWithdrawn ? 'already-unsubscribed' : 'unsubscribed',
      source: result.source,
    },
    { status: 200 },
  )
}

/**
 * A scanner, a curious person, or a mail client that renders the header URI as
 * a link. Nothing is withdrawn here: they are sent to the page that explains
 * what is on file and offers the button.
 *
 * 303 rather than 302 so the method is defined as GET on the redirect target,
 * which is what a page is.
 */
export async function GET(request: Request, { params }: Ctx): Promise<NextResponse> {
  const { token } = await params
  const destination = new URL(`/marketing/preferences/${encodeURIComponent(token)}`, request.url)
  return NextResponse.redirect(destination, 303)
}
