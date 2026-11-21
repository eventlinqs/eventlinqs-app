import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { resolveCitySlug } from '@/lib/cities/resolve'
import { recordPlatformDigestConsent } from '@/lib/consent/record'
import { CITY_NEWSLETTER_CONSENT_VERSION, cityNewsletterConsentWording, normaliseConsentEmail } from '@/lib/consent/wording'

/**
 * EVERY PENDING NEWSLETTER SIGNUP MADE A SUBSCRIBER, ITS CLICK THE RECORD (law 50 (a); the PM's 10:07 of 21 November
 * 2026: "every pending unconfirmed signup on production made a subscriber with its original click as the record (a
 * dry run first, then the script, logged)").
 *
 * From 12 to 21 November 2026 the city newsletter's click sealed the request into a link and emailed it ('Confirm your
 * weekly <city> guide', src/lib/newsletter/confirmation-email.ts); nothing was written until the owner pressed Confirm.
 * So a pending signup lives only in our sender's log. This reads that log (Resend's GET /emails), keeps each address's
 * FIRST confirm per city (the first click is the record, sent the same second it was made), and records the consent
 * through the one writer, at that time, with the exact wording the panel showed at its version (v1 since August 2026).
 *
 * NEVER over a person's own word: an address with any consent row for that city (granted, or withdrawn), a recorded
 * spam complaint, or a recorded hard bounce is left as it is. A failed read writes nothing for that address. Nothing
 * is emailed. The answer carries counts only, never an address.
 */

type Admin = SupabaseClient<Database>

/** The subject the double opt in sent (src/lib/newsletter/confirmation-email.ts). */
const PREFIX = 'Confirm your weekly '
const SUFFIX = ' guide'

export interface SentConfirm {
  email: string
  cityName: string
  sentAt: string
}

/** Resend writes '2026-11-20 22:55:01.123+00'; Date reads ISO. */
export function senderTimeToIso(value: string): string | null {
  const direct = Date.parse(value)
  if (Number.isFinite(direct)) return new Date(direct).toISOString()
  let s = value.trim().replace(' ', 'T')
  if (s.endsWith('+00')) s = `${s.slice(0, -3)}Z`
  const second = Date.parse(s)
  return Number.isFinite(second) ? new Date(second).toISOString() : null
}

/** The city named by a confirm's subject, or null for any other email. */
export function cityOfConfirmSubject(subject: unknown): string | null {
  if (typeof subject !== 'string') return null
  if (!subject.startsWith(PREFIX) || !subject.endsWith(SUFFIX)) return null
  const city = subject.slice(PREFIX.length, subject.length - SUFFIX.length).trim()
  return city === '' ? null : city
}

/** The first confirm per address and city, from the sender's rows. */
export function pendingFromSenderLog(rows: ReadonlyArray<{ to?: unknown; subject?: unknown; created_at?: unknown }>): SentConfirm[] {
  const first = new Map<string, SentConfirm>()
  for (const row of rows) {
    const cityName = cityOfConfirmSubject(row.subject)
    if (!cityName) continue
    const to = Array.isArray(row.to) ? row.to[0] : row.to
    const email = typeof to === 'string' ? normaliseConsentEmail(to) : ''
    const sentAt = typeof row.created_at === 'string' ? senderTimeToIso(row.created_at) : null
    if (!email || !sentAt) continue
    const key = `${email} ${cityName.toLowerCase()}`
    const held = first.get(key)
    if (!held || sentAt < held.sentAt) first.set(key, { email, cityName, sentAt })
  }
  return [...first.values()].sort((a, b) => (a.sentAt < b.sentAt ? -1 : 1))
}

export interface SenderRead {
  confirms: SentConfirm[]
  pages: number
  complete: boolean
}

/** Reads the sender's log a page at a time (100 a page, a pause between pages), up to maxPages. */
export async function readSenderConfirms(
  fetchImpl: typeof fetch,
  key: string,
  opts: { maxPages?: number; pauseMs?: number } = {},
): Promise<SenderRead> {
  const maxPages = opts.maxPages ?? 50
  const pauseMs = opts.pauseMs ?? 600
  const rows: Array<{ to?: unknown; subject?: unknown; created_at?: unknown }> = []
  let after: string | null = null
  let pages = 0
  let complete = false
  while (pages < maxPages) {
    const url = `https://api.resend.com/emails?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${key}` } })
    if (!res.ok) throw new Error(`the sender's log answered ${res.status}`)
    const body = (await res.json()) as { data?: Array<{ id?: string; to?: unknown; subject?: unknown; created_at?: unknown }>; has_more?: boolean }
    const data = body.data ?? []
    pages += 1
    rows.push(...data)
    const last = data[data.length - 1]?.id
    if (!body.has_more || data.length === 0 || !last) {
      complete = true
      break
    }
    after = last
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
  }
  return { confirms: pendingFromSenderLog(rows), pages, complete }
}

export interface BackfillResult {
  mode: 'dry_run' | 'apply'
  confirmsFound: number
  pending: number
  alreadyListed: number
  stopped: number
  unknownCity: number
  readFailed: number
  recorded: number
  writeFailed: number
  byCity: Record<string, number>
}

/** Judges every confirm and, in apply, records each pending one through the one writer. Counts only. */
export async function backfillPendingConfirms(admin: Admin, confirms: readonly SentConfirm[], opts: { apply: boolean }): Promise<BackfillResult> {
  const out: BackfillResult = {
    mode: opts.apply ? 'apply' : 'dry_run',
    confirmsFound: confirms.length,
    pending: 0,
    alreadyListed: 0,
    stopped: 0,
    unknownCity: 0,
    readFailed: 0,
    recorded: 0,
    writeFailed: 0,
    byCity: {},
  }
  for (const c of confirms) {
    const citySlug = resolveCitySlug(c.cityName)
    if (!citySlug) {
      out.unknownCity += 1
      continue
    }
    const listed = await admin.from('marketing_consents').select('status').eq('email', c.email).eq('city_slug', citySlug).limit(1)
    const stops = await admin
      .from('email_delivery_events')
      .select('event_type')
      .eq('address', c.email)
      .or('undeliverable.eq.true,event_type.eq."email.complained"')
      .limit(1)
    if (listed.error || stops.error) {
      out.readFailed += 1
      continue
    }
    if ((listed.data ?? []).length > 0) {
      out.alreadyListed += 1
      continue
    }
    if ((stops.data ?? []).length > 0) {
      out.stopped += 1
      continue
    }
    out.pending += 1
    out.byCity[citySlug] = (out.byCity[citySlug] ?? 0) + 1
    if (!opts.apply) continue
    const ok = await recordPlatformDigestConsent(admin, {
      email: c.email,
      citySlug,
      source: `newsletter-city, the subscribe click of ${c.sentAt}, recorded on 21 November 2026 (law 50 (a): a pending confirm made a subscriber, its click the record)`,
      at: c.sentAt,
      consentText: cityNewsletterConsentWording(c.cityName),
      consentVersion: CITY_NEWSLETTER_CONSENT_VERSION,
    })
    if (ok) out.recorded += 1
    else out.writeFailed += 1
  }
  return out
}
