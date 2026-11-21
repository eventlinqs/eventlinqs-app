import type { createAdminClient } from '@/lib/supabase/admin'
import { isUnsubscribeToken } from '@/lib/consent/token'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { getCity } from '@/lib/cities/data'

type Admin = ReturnType<typeof createAdminClient>

/**
 * MANAGE THE NEWSLETTER WITHOUT SIGNING IN (the PM's order of 21 November 2026, about 03:30: "/newsletter/city (city
 * and interests)"; found 404 on production at 14:58 that day while every edition linked it). A reader is named by the
 * token their own unsubscribe link carries (marketing_consents.unsubscribe_token, one row per address), so the link at
 * the foot of their edition opens their own settings and nobody else's.
 */

/** The four guide cities with an edition each (law 45; src/lib/newsletter/edition.ts VICTORIA_CITIES), by name. */
export const NEWSLETTER_CITIES: readonly { readonly slug: string; readonly name: string }[] = ['melbourne', 'geelong', 'ballarat', 'bendigo'].map(
  (slug) => ({ slug, name: getCity(slug)?.name ?? slug.charAt(0).toUpperCase() + slug.slice(1) }),
)

export type NewsletterSubscriber = {
  readonly email: string
  readonly citySlug: string | null
  /** False once they unsubscribed: the page says so and offers the one step back. */
  readonly subscribed: boolean
}

/**
 * The reader a token names, or null when it names no one. A malformed token is answered without a read: the column is
 * a uuid, so the query would be an error rather than a miss (scripts/guards/an-unsubscribe-link-never-500s.mjs). A read
 * that fails throws, so a blink is never told "this link is not valid".
 */
export async function readNewsletterSubscriber(admin: Admin, token: string | null | undefined): Promise<NewsletterSubscriber | null> {
  if (!isUnsubscribeToken(token)) return null
  const row = await readOrThrow('the newsletter reader by their token', () =>
    admin.from('marketing_consents').select('email, city_slug, status').eq('unsubscribe_token', token as string).maybeSingle(),
  )
  if (!row) return null
  return { email: row.email, citySlug: row.city_slug, subscribed: row.status === 'granted' }
}

/** 'l***@example.com': enough for a reader to know the settings are theirs, never their whole address on a page a link opens. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return '***'
  return `${email.charAt(0)}***${email.slice(at)}`
}

/** The city a reader may move to: one of the four with an edition, by slug; anything else is refused. */
export function newsletterCity(slug: string | null | undefined): { readonly slug: string; readonly name: string } | null {
  return NEWSLETTER_CITIES.find((c) => c.slug === slug) ?? null
}

/**
 * The link a share carries: the newsletter's own page, its source in UTM (the share's channel is counted by the
 * button). No reward is offered, because none is run (law 51: no claim we cannot prove).
 */
export function newsletterShareUrl(origin: string): string {
  return `${origin}/newsletter?utm_source=friend&utm_medium=share&utm_campaign=newsletter_refer`
}
