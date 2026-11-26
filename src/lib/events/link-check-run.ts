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

/** Never read by robot, by its terms (law 14 (k); the probe of 16 November 2026 left it out the same way). */
const NEVER_READ = /(^|\.)ticketmaster\.com(\.au)?$/i

/**
 * THE POLITE READER FOR ONE RUN (law 14 (k): robots.txt first, which checkLink reads before any page; one request a second
 * per host; a stop at a host's first 403 or 429; a named agent). Each run makes its own, so a host stopped today is read
 * again tomorrow. A stopped or never read host answers nothing, so its links are 'could not check' and keep what they
 * hold: a seller refusing a robot is never read as dead (the PM's 12:35 item 2 of 16 November 2026). The daily check read
 * every page back to back before it, 40 of them at AXS after its first 403 on 16 November.
 */
export function politeLinkDeps(inner: CheckDeps = fetchDeps, pauseMs = 1000): CheckDeps & { stopped(): string[] } {
  const lastHit = new Map<string, number>()
  const stopped = new Set<string>()
  return {
    async get(url) {
      let host: string
      try {
        host = new URL(url).host
      } catch {
        return null
      }
      if (NEVER_READ.test(host) || stopped.has(host)) return null
      const wait = (lastHit.get(host) ?? 0) + pauseMs - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      lastHit.set(host, Date.now())
      const res = await inner.get(url)
      if (res && (res.status === 403 || res.status === 429)) stopped.add(host)
      return res
    },
    stopped: () => [...stopped],
  }
}

export type LinkCheckSummary = { links: number; changed: number; confirmed: number; robots: number; unknown: number; failed: number; healed?: number }

/**
 * THE LINK HEALS BEFORE ANYONE IS TOLD (the PM's 11:53 of 26 November 2026, item 2: "On a dead booking link the engine
 * itself re-reads the source, sets the new link when the source gives one ... and records which"). The case: The
 * Greatest Christmas Show's one booking page, .../the-greatest-christmas-show-2/, answered 404 or 410 and the sentinel
 * emailed Lawal CRITICAL at 11:42, while the night's own newer listing from its source (Geelong Arts Centre) already named
 * the moved page, .../the-greatest-christmas-show-3/, live and selling. So before a link is written dead, the night's own
 * pages from its sources (listing_candidates of that night, newest first) that the night does not already carry are read,
 * the same polite way; the first that answers 2xx and does not state itself dead becomes the link, with what it states.
 * Which pages to try, in order. Pure.
 */
export function healCandidates(
  deadUrl: string,
  nightUrls: readonly string[],
  candidates: readonly { readonly page_url: string | null; readonly found_at: string | null }[],
): string[] {
  const taken = new Set([deadUrl, ...nightUrls])
  const seen = new Set<string>()
  return [...candidates]
    .sort((a, b) => Date.parse(b.found_at ?? '') - Date.parse(a.found_at ?? ''))
    .map((c) => (c.page_url ?? '').trim())
    .filter((u) => /^https?:\/\//.test(u) && !taken.has(u) && !seen.has(u) && seen.add(u))
}

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

/**
 * opts.onlyHosts reads only the links on those hosts (the sentinel's re-read of a dead night's whole programme at once,
 * src/lib/health/visitor-sentinel-run.ts). Hosts are read side by side and each host's links one after another, so the
 * polite reader's one request a second per host keeps a run of every link to about the longest host's count of pages.
 */
export async function runLinkCheck(admin: SupabaseClient, deps: CheckDeps, now: Date, opts: { onlyHosts?: ReadonlySet<string> } = {}): Promise<LinkCheckSummary> {
  const { data, error } = await admin
    .from('event_booking_links')
    .select('id, event_id, url, availability, price_from_cents, events!inner(end_date, start_date, timezone)')
    .gte('events.end_date', now.toISOString())
    .limit(MOST_LINKS)
  if (error) {
    captureException(error, { scope: 'link-check', handler: 'read-links' })
    throw error
  }
  const summary: LinkCheckSummary = { links: 0, changed: 0, confirmed: 0, robots: 0, unknown: 0, failed: 0 }
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
  type Linked = { id: string; event_id: string; url: string; availability: string; price_from_cents: number | null; events: { start_date: string; timezone: string | null } | { start_date: string; timezone: string | null }[] | null }
  // THE HEAL (healCandidates above): the night's own source pages it does not carry, newest first, each read once; the
  // first alive becomes the link. A read that fails is no heal, never a guess; the link is then written dead as before.
  const heal = async (link: Linked, night: { startsAt: string; zone: string } | null): Promise<string | null> => {
    const [cands, theirs] = await Promise.all([
      admin.from('listing_candidates').select('page_url, found_at').eq('event_id', link.event_id).not('page_url', 'is', null).limit(20),
      admin.from('event_booking_links').select('url').eq('event_id', link.event_id),
    ])
    if (cands.error || theirs.error) return null
    const tries = healCandidates(link.url, ((theirs.data ?? []) as { url: string }[]).map((r) => r.url), (cands.data ?? []) as { page_url: string | null; found_at: string | null }[]).slice(0, 3)
    for (const url of tries) {
      const verdict = await checkLink(url, once, robots, night)
      const read = pages.has(url) ? await pages.get(url) : null
      const alive = !!read && read.status >= 200 && read.status < 300 && !(verdict.changed && verdict.availability === 'dead')
      if (!alive) continue
      const row: Record<string, unknown> = { url, availability: verdict.changed ? verdict.availability : 'on_sale', updated_at: now.toISOString() }
      if (verdict.changed && verdict.priceFromCents !== null) Object.assign(row, { price_from_cents: verdict.priceFromCents, price_checked_at: now.toISOString() })
      const { error: healError } = await admin.from('event_booking_links').update(row).eq('id', link.id).eq('url', link.url)
      if (healError) {
        captureException(healError, { scope: 'link-check', handler: 'heal', linkId: link.id })
        return null
      }
      console.log(`[link-check] healed ${link.event_id}: ${link.url} answered dead; its source's own page ${url} answers, so it is the link now`)
      return url
    }
    return null
  }
  const byHost = new Map<string, Linked[]>()
  for (const link of (data ?? []) as Linked[]) {
    const host = hostOf(link.url) ?? ''
    if (opts.onlyHosts && !opts.onlyHosts.has(host)) continue
    byHost.set(host, [...(byHost.get(host) ?? []), link])
  }
  const one = async (link: Linked): Promise<void> => {
    summary.links++
    const ev = Array.isArray(link.events) ? link.events[0] : link.events
    const night = ev?.start_date ? { startsAt: ev.start_date, zone: ev.timezone ?? 'Australia/Melbourne' } : null
    const verdict = await checkLink(link.url, once, robots, night)
    // A dead link whose page answers again (2xx) is not dead, whatever the page states: without this, a page that came back
    // stating nothing kept 'dead' for ever, and the sentinel's hold on its night (src/lib/health/dead-link-hold.ts) was never
    // released (16 November 2026). Read from this run's one read of the page; a page never read (robots) proves nothing.
    const read = pages.has(link.url) ? await pages.get(link.url) : null
    const back = link.availability === 'dead' && !!read && read.status >= 200 && read.status < 300
    if (!verdict.changed && !back) {
      summary[verdict.why]++
      return
    }
    const stated = verdict.changed ? verdict.availability : null
    // Before a link is written dead, its night's own newer page from its source is tried (healCandidates).
    if (stated === 'dead' && (await heal(link, night))) {
      summary.healed = (summary.healed ?? 0) + 1
      return
    }
    const price = verdict.changed ? verdict.priceFromCents : null
    // An unstated availability keeps the stored one; only what the page states is written, except a dead link that answers
    // again, which works ('on_sale', the state every link starts in).
    const availability = stated ?? (back ? 'on_sale' : link.availability)
    // A PRICE READ AGAIN IS A PRICE CHECKED NOW (train AL, 20 November 2026): an unchanged price used to write nothing,
    // so price_checked_at never moved and the page and its JSON-LD dropped, after seven days (priceToShow), a price
    // confirmed every day. Only a read that says nothing new about availability and no price writes nothing.
    if (availability === link.availability && price === null) return
    const moved = availability !== link.availability || (price !== null && price !== link.price_from_cents)
    const row: Record<string, unknown> = { updated_at: now.toISOString() }
    if (availability !== link.availability) row.availability = availability
    if (price !== null) Object.assign(row, { price_from_cents: price, price_checked_at: now.toISOString() })
    const { error: writeError } = await admin.from('event_booking_links').update(row).eq('id', link.id)
    if (writeError) {
      summary.failed++
      captureException(writeError, { scope: 'link-check', handler: 'write-verdict', linkId: link.id })
      return
    }
    if (moved) summary.changed++
    else summary.confirmed++
  }
  await Promise.all(
    [...byHost.values()].map(async (links) => {
      for (const link of links) await one(link)
    }),
  )
  return summary
}
