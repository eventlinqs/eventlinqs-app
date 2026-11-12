import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { recordPlatformDigestConsent } from '@/lib/consent/record'
import { CITY_NEWSLETTER_CONSENT_VERSION, cityNewsletterConsentWording } from '@/lib/consent/wording'
import { openConfirmRequest, resolveConfirmSecret, type ConfirmRequest } from './confirm-token'

/**
 * WHAT A CONFIRMATION LINK STANDS FOR, AND THE PRESS THAT STARTS THE GUIDE (Release 2, item 8: double opt in). The page
 * reads the link (readConfirmLink) and shows the person exactly what they asked for; only the Confirm button
 * (confirmCityGuide, a server action, so a mail scanner opening the link confirms no one) writes the consent: one
 * 'granted' event in the consent ledger, through the one writer recordPlatformDigestConsent, with the wording and version
 * the panel showed and a capture surface naming both steps. A second press, or a person already on that city's list,
 * writes nothing more.
 */

type Admin = SupabaseClient<Database>

export type ConfirmLink =
  | { readonly state: 'invalid' }
  | { readonly state: 'expired' }
  | { readonly state: 'unavailable' }
  | { readonly state: 'waiting'; readonly request: ConfirmRequest }
  | { readonly state: 'confirmed'; readonly request: ConfirmRequest }

async function onTheList(db: Admin, request: ConfirmRequest): Promise<boolean> {
  const r = await db
    .from('marketing_consents')
    .select('status')
    .eq('email', request.email)
    .eq('city_slug', request.citySlug)
    .order('granted_at', { ascending: false })
    .limit(1)
  if (r.error) throw new Error(`the city list could not be read: ${r.error.message}`)
  return r.data?.[0]?.status === 'granted'
}

export async function readConfirmLink(db: Admin, token: string, now: number): Promise<ConfirmLink> {
  const secret = resolveConfirmSecret()
  if (!secret) return { state: 'unavailable' }
  const opened = openConfirmRequest(token, secret, now)
  if (!opened.ok) return { state: opened.why }
  // A link from a form whose wording has since changed: the person is asked again, so the consent recorded is always
  // the wording they read, never a newer one standing in for it.
  if (opened.request.consentVersion !== CITY_NEWSLETTER_CONSENT_VERSION) return { state: 'expired' }
  return (await onTheList(db, opened.request)) ? { state: 'confirmed', request: opened.request } : { state: 'waiting', request: opened.request }
}

export async function confirmCityGuide(db: Admin, token: string, now: number): Promise<ConfirmLink> {
  const link = await readConfirmLink(db, token, now)
  if (link.state !== 'waiting') return link
  const r = link.request
  const stored = await recordPlatformDigestConsent(db, {
    email: r.email,
    citySlug: r.citySlug,
    source: `${r.source}, confirmed by email (asked ${new Date(r.requestedAt).toISOString()})`,
    at: new Date(now).toISOString(),
    consentText: cityNewsletterConsentWording(r.cityName),
    consentVersion: r.consentVersion,
  })
  if (!stored) throw new Error('the confirmation could not be recorded')
  return { state: 'confirmed', request: r }
}
