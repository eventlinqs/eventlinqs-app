import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, clientIp } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'
import { resolveCitySlug } from '@/lib/cities/resolve'
import { recordPlatformDigestConsent } from '@/lib/consent/record'
import { CITY_NEWSLETTER_CONSENT_VERSION, cityNewsletterConsentWording, normaliseConsentEmail } from '@/lib/consent/wording'
import { sendNewsletterWelcome } from '@/lib/newsletter/welcome'
import { getSiteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/newsletter/subscribe - the city newsletter capture.
 *
 * WHAT THIS USED TO DO, and why it mattered. It validated the address, wrote a
 * two-character redacted console.log, and returned `{ ok: true }`, storing
 * nothing, while the panel said "Subscribed". Then (12 November 2026) it sent a
 * link to confirm, and nothing was recorded until the owner pressed Confirm.
 *
 * ONE STEP (law 50 (a), Lawal, 21 November 2026, 10:06: "If somebody clicks on
 * 'Subscribe to a newsletter,' that is the record ... You lose a lot of leads
 * this way"). The Spam Act's express consent is given by "filling in a form" or
 * "ticking a box on a website", and the sender keeps "a record when a person
 * gives express consent, including who gave the consent, when and how"
 * (acma.gov.au/avoid-sending-spam, read 21 November 2026); a second
 * confirmation is not required by it. So the click IS the subscription: one
 * 'granted' event in the consent ledger through the one writer
 * (recordPlatformDigestConsent), carrying the address, the time, the page it was
 * made on, the exact wording the panel showed and its version, the city, and
 * the request's IP; then the welcome at once, this week's picks with the one
 * click unsubscribe (src/lib/newsletter/welcome.ts). No 'confirm' email, ever.
 *
 * ABUSE IS STOPPED WITHOUT A STEP (law 50 (d)): a hidden honeypot field a
 * person never sees or fills (a form that fills it is answered as if subscribed
 * and recorded as nothing), rate limits per network and per address, both
 * failing closed; bounces and complaints are suppressed by the sender.
 *
 * The request is taken ONLY when its locality resolves to a city the platform
 * actually publishes a digest for: a consent with a null city can never be
 * selected by any city digest.
 */

const Body = z.object({
  email: z.string().email().max(254),
  source: z.enum(['city', 'suburb', 'community', 'home']).optional(),
  city: z.string().max(120).optional(),
  /** The honeypot: hidden from people, so only a script fills it (law 50 (d)). */
  website: z.string().max(500).optional(),
})

export const runtime = 'nodejs'

/** The page the click was made on, as a path, never its query (it can carry a person's details). */
function pageOf(request: Request): string {
  const ref = request.headers.get('referer')
  if (!ref) return 'unknown page'
  try {
    return new URL(ref).pathname || '/'
  } catch {
    return 'unknown page'
  }
}

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

  // A filled honeypot is a script: answered as a person would be, recorded as nothing, so it learns nothing.
  if ((parsed.data.website ?? '').trim() !== '') {
    return NextResponse.json({ ok: true, subscribed: true, welcome: 'sent' })
  }

  // Public, unauthenticated, and it writes a consent and sends an email from our domain, so it is rate limited per
  // network and, below, per address; both fail closed.
  const policy = POLICIES['newsletter-subscribe']
  const ip = clientIp(request)
  const limited = await checkRateLimit({
    key: `${policy.keyPrefix}:${ip}`,
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

  const admin = createAdminClient()
  const cityName = city ?? citySlug

  // Already on this city's list: nothing is written twice and no second welcome is sent.
  const listed = await admin
    .from('marketing_consents')
    .select('status')
    .eq('email', address)
    .eq('city_slug', citySlug)
    .order('granted_at', { ascending: false })
    .limit(1)
  if (listed.error) {
    console.error('[newsletter] the city list could not be read:', listed.error.message)
    return NextResponse.json({ ok: false, error: 'not_recorded' }, { status: 500 })
  }
  if (listed.data?.[0]?.status === 'granted') {
    return NextResponse.json({ ok: true, subscribed: true, welcome: 'already' })
  }

  const recorded = await recordPlatformDigestConsent(admin, {
    email: address,
    citySlug,
    source: `newsletter-${source ?? 'city'}, subscribed by the form's click on ${pageOf(request)} (law 50)`,
    at: new Date().toISOString(),
    consentText: cityNewsletterConsentWording(cityName),
    consentVersion: CITY_NEWSLETTER_CONSENT_VERSION,
    reference: ip,
  })
  if (!recorded) {
    // Never tell someone they are subscribed when nothing was written.
    console.error('[newsletter] the subscription could not be recorded')
    return NextResponse.json({ ok: false, error: 'not_recorded' }, { status: 500 })
  }

  const welcome = await sendNewsletterWelcome(admin, { email: address, citySlug, cityName, origin: getSiteUrl() })
  if (welcome === 'not_sent' || welcome === 'no_token') console.error(`[newsletter] subscribed, welcome ${welcome}`)
  return NextResponse.json({ ok: true, subscribed: true, welcome })
}
