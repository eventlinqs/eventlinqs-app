import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'
import { resolveCitySlug } from '@/lib/cities/resolve'
import { recordPlatformDigestConsent } from '@/lib/consent/record'
import {
  CITY_NEWSLETTER_CONSENT_VERSION,
  cityNewsletterConsentWording,
} from '@/lib/consent/wording'

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
 * It now records express consent in `marketing_consents`, the one table the
 * weekly digest actually reads, so a person who asks to hear about their city
 * is on the list that gets sent.
 *
 * SPAM ACT POSTURE. The wording stored is the EXACT promise printed on the
 * panel (`cityNewsletterConsentWording`), pinned to the component's own
 * literals by test so the two cannot drift. Consent is city scoped, the row
 * carries its own unsubscribe token, and the existing token-based
 * `/unsubscribe/digest/[token]` page withdraws it with no login.
 *
 * The address is stored ONLY when its locality resolves to a city the platform
 * actually publishes a digest for. A consent row with a null city can never be
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

  // Public, unauthenticated, and now it writes rows, so it is rate limited.
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
      `[newsletter] refusing to record consent: locality ${JSON.stringify(city)} does not resolve to a city with a digest`,
    )
    return NextResponse.json({ ok: false, error: 'unknown_city' }, { status: 400 })
  }

  const stored = await recordPlatformDigestConsent(createAdminClient(), {
    email,
    citySlug,
    source: `newsletter-${source ?? 'city'}`,
    at: new Date().toISOString(),
    consentText: cityNewsletterConsentWording(city ?? citySlug),
    consentVersion: CITY_NEWSLETTER_CONSENT_VERSION,
  })

  if (!stored) {
    // Never tell someone they subscribed when the write failed. That is the
    // whole defect this route existed as.
    return NextResponse.json({ ok: false, error: 'not_saved' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
