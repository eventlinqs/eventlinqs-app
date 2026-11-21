'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUnsubscribeToken } from '@/lib/consent/token'
import { recordPlatformDigestConsent } from '@/lib/consent/record'
import { CITY_NEWSLETTER_CONSENT_VERSION, cityNewsletterConsentWording } from '@/lib/consent/wording'
import { checkRateLimit } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'
import { newsletterCity, readNewsletterSubscriber, type NewsletterSubscriber } from '@/lib/newsletter/manage'

/**
 * A READER MOVES THEIR NEWSLETTER TO ANOTHER CITY, IN ONE PRESS (law 50 (a): the press is the record). The token their
 * own unsubscribe link carries names them; the new city's consent is written at the press through the one writer
 * (recordPlatformDigestConsent), with the exact sentence the button stood under, its version, the page and the request's
 * address, as the Spam Act asks (acma.gov.au/avoid-sending-spam, read 21 November 2026). The ledger's projection moves
 * their one row to the new city (migration 20260913000040, consent_project_current_state). Rate limited per network
 * like the subscribe form, failing closed (law 50 (d)). Every answer is a redirect back to the page with what happened.
 */
export async function changeNewsletterCityAction(formData: FormData): Promise<void> {
  const token = String(formData.get('t') ?? '')
  const city = newsletterCity(String(formData.get('city') ?? ''))
  if (!isUnsubscribeToken(token)) redirect('/newsletter/city?error=link')
  const back = (outcome: string): never => redirect(`/newsletter/city?t=${token}&${outcome}`)
  if (!city) back('error=city')

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || 'local'
  const policy = POLICIES['newsletter-subscribe']
  const limited = await checkRateLimit({ key: `${policy.keyPrefix}:${ip}`, limit: policy.limit, windowSec: policy.windowSec, failClosed: policy.failClosed })
  if (!limited.ok) back('error=busy')

  const admin = createAdminClient()
  let reader: NewsletterSubscriber | null = null
  let unreadable = false
  try {
    reader = await readNewsletterSubscriber(admin, token)
  } catch (error) {
    unreadable = true
    console.error('[newsletter-manage] the reader could not be read:', error instanceof Error ? error.message : error)
  }
  if (unreadable) back('error=read')
  if (!reader) redirect('/newsletter/city?error=link')
  if (!reader.subscribed) back('error=unsubscribed')
  const chosen = city as { slug: string; name: string }
  if (reader.citySlug === chosen.slug) back(`saved=${chosen.slug}`)

  const recorded = await recordPlatformDigestConsent(admin, {
    email: reader.email,
    citySlug: chosen.slug,
    source: "newsletter-manage, the city chosen by the button's press on /newsletter/city (law 50)",
    at: new Date().toISOString(),
    consentText: cityNewsletterConsentWording(chosen.name),
    consentVersion: CITY_NEWSLETTER_CONSENT_VERSION,
    reference: ip,
  })
  if (!recorded) console.error('[newsletter-manage] the new city could not be recorded')
  revalidatePath('/newsletter/city')
  back(recorded ? `saved=${chosen.slug}` : 'error=save')
}
