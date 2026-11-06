import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureException } from '@/lib/observability/sentry'
import { AGENT, checkLink, type CheckDeps } from './link-check'

/**
 * The daily run of the link check (src/lib/events/link-check.ts holds the rules and their sources), over every booking
 * link of an event that has not yet ended. Each verdict that changes something is written to the link; the database's
 * mirror re-picks the one button. A link whose availability and price are unchanged is not written.
 */

const TIMEOUT_MS = 10_000
const MOST_LINKS = 2000

/** One GET as a visitor would make it: no cookie, our agent named, ten seconds, redirects followed. */
export const fetchDeps: CheckDeps = {
  async get(url) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': `${AGENT}/1.0 (+https://www.eventlinqs.com.au)`, accept: 'text/html,text/plain;q=0.9' },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      })
      return { status: res.status, body: await res.text() }
    } catch (err) {
      // An outside site that cannot be reached changes nothing (link-check.ts), and is said in the run's log by host.
      console.warn(`[link-check] could not reach ${new URL(url).host}: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  },
}

export type LinkCheckSummary = { links: number; changed: number; robots: number; unknown: number; failed: number }

export async function runLinkCheck(admin: SupabaseClient, deps: CheckDeps, now: Date): Promise<LinkCheckSummary> {
  const { data, error } = await admin
    .from('event_booking_links')
    .select('id, url, availability, price_from_cents, events!inner(end_date, start_date, timezone)')
    .gte('events.end_date', now.toISOString())
    .limit(MOST_LINKS)
  if (error) {
    captureException(error, { scope: 'link-check', handler: 'read-links' })
    throw error
  }
  const summary: LinkCheckSummary = { links: 0, changed: 0, robots: 0, unknown: 0, failed: 0 }
  const robots = new Map()
  // One read of a page per run, however many nights' links it sells (Comedy Republic's Main Stage is one page for every
  // night), and each night read for itself on it (link-check.ts readPage).
  const pages = new Map<string, Promise<{ status: number; body: string } | null>>()
  const once: CheckDeps = {
    get(url) {
      if (!pages.has(url)) pages.set(url, deps.get(url))
      return pages.get(url) as Promise<{ status: number; body: string } | null>
    },
  }
  type Linked = { id: string; url: string; availability: string; price_from_cents: number | null; events: { start_date: string; timezone: string | null } | { start_date: string; timezone: string | null }[] | null }
  for (const link of (data ?? []) as Linked[]) {
    summary.links++
    const ev = Array.isArray(link.events) ? link.events[0] : link.events
    const night = ev?.start_date ? { startsAt: ev.start_date, zone: ev.timezone ?? 'Australia/Melbourne' } : null
    const verdict = await checkLink(link.url, once, robots, night)
    if (!verdict.changed) {
      summary[verdict.why]++
      continue
    }
    const price = verdict.priceFromCents
    if (verdict.availability === link.availability && (price === null || price === link.price_from_cents)) continue
    const { error: writeError } = await admin
      .from('event_booking_links')
      .update(
        price === null
          ? { availability: verdict.availability, updated_at: now.toISOString() }
          : { availability: verdict.availability, price_from_cents: price, price_checked_at: now.toISOString(), updated_at: now.toISOString() },
      )
      .eq('id', link.id)
    if (writeError) {
      summary.failed++
      captureException(writeError, { scope: 'link-check', handler: 'write-verdict', linkId: link.id })
      continue
    }
    summary.changed++
  }
  return summary
}
