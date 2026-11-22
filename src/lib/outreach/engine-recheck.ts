import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { COLLECTOR_AGENT, robotsVerdict } from '@/lib/listings/collect'
import { FETCH_TIMEOUT_MS, type Fetcher } from '@/lib/listings/collect-run'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import { AGAINST, FREE_MAIL, addressKind, addressesOn, domainOf, quoteFor, words } from './basis-find'
import { ACQ_GUIDE_CITIES } from './acq-target'
import { engineCheck } from './basis-pool'
import { organiserCitySlugs } from './organiser-city'

/**
 * THE ENGINE READS AGAIN THE PAGES OF ADDRESSES IT HAS NOT CLEARED (the PM's 15:48 of 22 November 2026, F5; Lawal's
 * platform reliability directive of 15:13, sections 1 and 4: no workflow waits on a person when no human decision is
 * needed). The pool's own page check (./basis-pool.ts engineCheck) ran only for an address recorded new that night, so
 * every contact recorded before it, and every one it left unticked, waited for a person's tick indefinitely, and the self
 * queue refused their first letters forever.
 *
 * Each pool turn's second run (23:45) reads, for each such contact, the page its address was published on, under the
 * same robots rules, politely, one contact at a time, each in its own guard. Where the page still publishes the address,
 * at the organiser's own domain or a free mail provider, with no statement against messages, and the organiser runs
 * events in a guide city, engineCheck saves the page with its sha256 and ticks the contact, by the engine. Otherwise the
 * exact reason is recorded on the contact (engine_check_note, migration 20261122160001) with the day, and the contact is
 * read again next turn: it stays in the CRM, simply not yet eligible for email marketing. A statement against messages
 * is quoted as it reads on the page.
 */

export type UntickedContact = {
  readonly contactId: string
  readonly organiserId: string
  readonly website: string | null
  readonly address: string
  readonly pageUrl: string
  readonly inGuideCity: boolean
}

export type RecheckOutcome = { readonly contactId: string; readonly address: string; readonly outcome: string }

export interface RecheckStore {
  unticked(): Promise<UntickedContact[]>
  /** The engine's check with the page as read: 'checked' once the copy is saved and the contact ticked. */
  check(r: { organiserId: string; address: string; pageUrl: string; pageHtml: string; inGuideCity: boolean; kind: 'own domain' | 'free mail'; quote: string }): Promise<'checked' | 'left'>
  /** The reason the engine could not clear it, or that it did, with the day. */
  note(contactId: string, note: string, day: string): Promise<void>
}

export const RECHECK_PER_TURN = 40

const melbourneDay = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)

async function get(fetcher: Fetcher, url: string): Promise<{ status: number | null; body: string; url: string }> {
  try {
    const res = await fetcher(url, { headers: { 'User-Agent': COLLECTOR_AGENT, Accept: 'text/html' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    return { status: res.status, body: res.status >= 200 && res.status < 300 ? await res.text() : '', url }
  } catch {
    return { status: null, body: '', url }
  }
}

/** Why the engine cannot clear this address from its page as read, or null when it can. Pure. */
export function recheckRefusal(c: UntickedContact, html: string): string | null {
  const pageWords = words(html)
  const against = AGAINST.map((re) => pageWords.match(re)).find((m) => m !== null)
  if (against) return `a statement against messages on its page: "${against[0]}"`
  if (!addressesOn(html).includes(c.address.toLowerCase())) return 'its page no longer publishes the address'
  const site = c.website ? domainOf(c.website) : null
  const domain = (c.address.split('@')[1] ?? '').toLowerCase()
  const kind = site ? addressKind(c.address, site) : FREE_MAIL.has(domain) ? 'free mail' : null
  if (kind === null) return 'the organiser has no website on record to judge the address against'
  if (kind === 'another domain') return `another organisation's domain (${domain}), not theirs`
  if (!c.inGuideCity) return 'no road places the organiser in a guide city yet'
  return null
}

/** One turn: up to `cap` unticked contacts, each read once, each in its own guard; no new read past the deadline. */
export async function recheckUnticked(store: RecheckStore, fetcher: Fetcher, now: Date, deadline: number, options: { cap?: number; pauseMs?: number } = {}): Promise<RecheckOutcome[]> {
  const cap = options.cap ?? RECHECK_PER_TURN
  const pauseMs = options.pauseMs ?? 1000
  const day = melbourneDay(now)
  const out: RecheckOutcome[] = []
  for (const c of (await store.unticked()).slice(0, cap)) {
    if (Date.now() >= deadline) break
    let outcome: string
    try {
      outcome = await readOne(store, fetcher, c, pauseMs)
    } catch (error) {
      outcome = `the read failed: ${error instanceof Error ? error.message : String(error)}`
    }
    try {
      await store.note(c.contactId, outcome === 'checked' ? 'cleared by the engine: its page saved with its sha256' : outcome, day)
    } catch (error) {
      outcome = `${outcome}; the note could not be kept: ${error instanceof Error ? error.message : String(error)}`
    }
    out.push({ contactId: c.contactId, address: c.address, outcome })
  }
  return out
}

async function readOne(store: RecheckStore, fetcher: Fetcher, c: UntickedContact, pauseMs: number): Promise<string> {
  let at: URL
  try {
    at = new URL(c.pageUrl)
  } catch {
    return 'its recorded page is not an address'
  }
  if (at.protocol !== 'https:') return 'its recorded page is not read over https'
  const robots = await get(fetcher, `${at.origin}/robots.txt`)
  if (robots.status === null || robots.status === 403 || robots.status === 429 || robots.status >= 500) return `robots.txt answered ${robots.status ?? 'nothing'}: not read`
  if (robotsVerdict(robots.status, robots.body, at.pathname + at.search) === 'disallowed') return 'its robots.txt does not allow the page to be read'
  if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
  const page = await get(fetcher, c.pageUrl)
  if (!page.body) return `the page answered ${page.status ?? 'nothing'}`
  const refusal = recheckRefusal(c, page.body)
  if (refusal) return refusal
  const site = c.website ? domainOf(c.website) : null
  const kind = site ? (addressKind(c.address, site) as 'own domain' | 'free mail') : 'free mail'
  const checked = await store.check({ organiserId: c.organiserId, address: c.address, pageUrl: c.pageUrl, pageHtml: page.body, inGuideCity: c.inGuideCity, kind, quote: quoteFor(words(page.body), c.address) })
  return checked === 'checked' ? 'checked' : 'the page copy or the tick could not be saved'
}

type Db = SupabaseClient<Database>

/** The store over production's rows: the unticked contacts least recently read first, the platform's own never. */
export function engineRecheckStore(db: Db): RecheckStore {
  return {
    async unticked() {
      const { data, error } = await db
        .from('organiser_contacts')
        .select('id, organiser_id, address, published_on_url, engine_checked_on, organisers(id, website_url, found_on, organisation_id)')
        .eq('channel', 'email')
        .eq('basis', 'conspicuous_publication')
        .eq('no_marketing_statement_checked', false)
        .not('published_on_url', 'is', null)
        .order('engine_checked_on', { ascending: true, nullsFirst: true })
        .limit(500)
      if (error) throw new Error(`the unticked contacts could not be read: ${error.message}`)
      const platform = await readPlatformOrganiserIds(db)
      type Row = { id: string; organiser_id: string; address: string; published_on_url: string; organisers: { id: string; website_url: string | null; found_on: string | null; organisation_id: string | null } | null }
      const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.organisers && !platform.has(r.organiser_id))
      const cities = await organiserCitySlugs(
        db,
        rows.map((r) => ({ id: r.organiser_id, found_on: r.organisers?.found_on ?? null, organisation_id: r.organisers?.organisation_id ?? null })),
        new Date(),
      ).catch(() => new Map<string, string>())
      return rows.map((r) => ({
        contactId: r.id,
        organiserId: r.organiser_id,
        website: r.organisers?.website_url ?? null,
        address: String(r.address).toLowerCase(),
        pageUrl: r.published_on_url,
        inGuideCity: ACQ_GUIDE_CITIES.includes(cities.get(r.organiser_id) ?? ''),
      }))
    },
    check(r) {
      return engineCheck(db, r)
    },
    async note(contactId, note, day) {
      const { error } = await db.from('organiser_contacts').update({ engine_check_note: note.slice(0, 500), engine_checked_on: day }).eq('id', contactId)
      if (error) throw new Error(error.message)
    },
  }
}
