import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'
import { resolveCitySlug } from '@/lib/cities/resolve'
import { CITY_NEWSLETTER_CONSENT_VERSION, normaliseConsentEmail } from '@/lib/consent/wording'
import { resolveConfirmSecret, sealConfirmRequest } from '@/lib/newsletter/confirm-token'
import { sendConfirmationEmail } from '@/lib/newsletter/confirmation-email'
import { getSiteUrl } from '@/lib/site-url'

/**
 * POST /api/newsletter/subscribe - the city newsletter capture.
 *
 * WHAT THIS USED TO DO, and why it mattered. It validated the address, wrote a
 * two-character redacted console.log, and returned `{ ok: true }`, storing
 * nothing. The panel that posts to it then rendered "Subscribed. We'll be in
 * your inbox by next Friday." It is on every city landing, all 420
 * community-by-city pages and every organiser profile. The platform was
 * telling people they had subscribed while discarding the address: the single
 * largest audience leak on the site and a false statement to a member of the
 * public. Nobody had typed one in yet (production had zero rows when this was
 * found), so nothing is owed.
 *
 * DOUBLE OPT IN (12 November 2026, Release 2 item 8 of the Growth OS order: "the
 * weekly email editions for Geelong and Melbourne, double opt in, every send
 * recorded"). The form is the person's express consent (ACMA, "Avoid sending
 * spam", acma.gov.au/avoid-sending-spam, last updated 29 November 2024: consent
 * is given by "filling in a form"). Nothing is recorded here any more: this
 * route seals the request into a link (src/lib/newsletter/confirm-token.ts) and
 * emails it, with no marketing in it, to the address typed. The consent is
 * written in `consent_events` (mirrored to `marketing_consents`, the table the
 * digest reads) only when the owner of that address presses Confirm on
 * /subscribe/confirm/[token], so no one can put another person on a list and
 * the list holds only real inboxes.
 *
 * SPAM ACT POSTURE. The wording recorded at confirmation is the EXACT promise
 * printed on the panel (`cityNewsletterConsentWording`), pinned to the
 * component's own literals by test, at the version the panel showed, carried in
 * the sealed link. Consent is city scoped and the existing
 * `/unsubscribe/digest/[token]` page withdraws it with no login.
 *
 * The request is taken ONLY when its locality resolves to a city the platform
 * actually publishes a digest for. A consent with a null city can never be
 * selected by any city digest, which is consent captured and the person
 * unreachable: the same defect in a quieter costume.
 */

const Body = z.object({
  email: z.string().email().max(254),
  source: z.enum(['city', 'suburb', 'community', 'home']).optional(),
  city: z.string().max(120).optional(),
})

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 })
  }

  // Public, unauthenticated, and it sends an email from our domain, so it is
  // rate limited per network and, below, per address; both fail closed.
  const policy = POLICIES['newsletter-subscribe']
  const limited = await checkRateLimit({
    key: `${policy.keyPrefix}:${clientIp(request)}`,
    limit: policy.limit,
    windowSec: policy.windowSec,
    failClosed: policy.failClosed,
  })
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  const { email, source, city } = parsed.data

  const citySlug = resolveCitySlug(city)
  if (!citySlug) {
    // Honest failure rather than a silent one. The panel shows its error state,
    // which is true: we cannot put this person on a list that does not exist.
    console.error(
      `[newsletter] refusing the request: locality ${JSON.stringify(city)} does not resolve to a city with a digest`,
    )
    return NextResponse.json({ ok: false, error: 'unknown_city' }, { status: 400 })
  }

  const address = normaliseConsentEmail(email)
  const perAddress = POLICIES['newsletter-confirm-address']
  const addressLimited = await checkRateLimit({
    key: `${perAddress.keyPrefix}:${createHash('sha256').update(address).digest('hex').slice(0, 32)}`,
    limit: perAddress.limit,
    windowSec: perAddress.windowSec,
    failClosed: perAddress.failClosed,
  })
  if (!addressLimited.ok) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  const secret = resolveConfirmSecret()
  if (!secret) {
    console.error('[newsletter] no confirmation key: ORDER_ACCESS_SECRET is not set on this deployment')
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 500 })
  }
  const cityName = city ?? citySlug
  const token = sealConfirmRequest(
    {
      email: address,
      citySlug,
      cityName,
      consentVersion: CITY_NEWSLETTER_CONSENT_VERSION,
      source: `newsletter-${source ?? 'city'}`,
      requestedAt: Date.now(),
    },
    secret,
  )

  try {
    await sendConfirmationEmail({ to: address, cityName, url: `${getSiteUrl()}/subscribe/confirm/${token}` })
  } catch (error) {
    // Never tell someone to check their inbox when nothing was sent: the same
    // false statement this route once made about storing their address.
    console.error('[newsletter] the confirmation email was not sent:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ ok: false, error: 'not_sent' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, confirm: 'sent' })
}
