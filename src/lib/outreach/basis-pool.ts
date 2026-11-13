import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { COLLECTOR_AGENT, robotsVerdict } from '@/lib/listings/collect'
import { FETCH_TIMEOUT_MS, type Fetcher } from '@/lib/listings/collect-run'
import { scoutOrder } from '@/lib/listings/scout-engine'
import { readPlatformOrganiserIds, withoutPlatformOrganisers } from '@/lib/growth/platform-organiser'
import { BASIS_PATHS, basisFinds, domainOf } from './basis-find'

/**
 * THE TWENTY'S POOL GROWS BY ITSELF (Lawal's 10:42 of 13 November 2026: every engine runs by itself; his 06:51: 200
 * lawful contacts). Once a night, in the twenty's own run (src/app/api/cron/outreach-run/route.ts, the 23:30 turn in
 * Melbourne; no schedule added), it reads a few CRM organisers' own sites politely (our named reader, robots.txt first,
 * one request a second, a stop at the first 403 or 429) and records each address that passes the basis tool's reading
 * (./basis-find.ts) as the reviewed tool records it: its page, the day it was seen, why a message fits their role, the
 * founder account as who recorded it. The no-messages check is left UNTICKED on purpose: the law relies on Lawal's own
 * check of the page, which the database requires before any message to that contact leaves held (migration
 * 20261031053501). So nothing is ever sent to an address this finds until Lawal opens its page and presses.
 */

/** Organisers read a night: five pages each, at one request a second. */
export const POOL_PER_NIGHT = 12

/** The Melbourne hour and quarter of the twenty's run that grows the pool: the 23:30 turn. */
export const POOL_HOUR = 23
export const POOL_MINUTE_FROM = 30

/** Why a message to a published events address fits the holder's role (the relevance the basis records). */
export const RELEVANCE =
  'They publish and run public events; the message invites them to list their own nights on EventLinqs, which relates to that role.'

export type PoolCandidate = { id: string; name: string; website: string; known: string[] }
export type PoolOutcome = { organiser: string; outcome: string; recorded: number }

export interface PoolStore {
  candidates(): Promise<PoolCandidate[]>
  /** Records the contact with its basis whole but its no-messages check unticked; false when the address is held already. */
  record(row: { organiserId: string; address: string; pageUrl: string; day: string }): Promise<boolean>
}

async function get(fetcher: Fetcher, url: string): Promise<{ status: number | null; body: string; url: string }> {
  try {
    const res = await fetcher(url, { headers: { 'User-Agent': COLLECTOR_AGENT, Accept: 'text/html' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    return { status: res.status, body: res.status >= 200 && res.status < 300 ? await res.text() : '', url }
  } catch {
    return { status: null, body: '', url }
  }
}

const melbourneDay = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)

/** One night's reading: up to `cap` organisers in today's order, each politely; stops when the deadline nears. */
export async function runBasisPool(
  store: PoolStore,
  fetcher: Fetcher,
  now: Date,
  deadline: number,
  options: { cap?: number; pauseMs?: number } = {},
): Promise<PoolOutcome[]> {
  const cap = options.cap ?? POOL_PER_NIGHT
  const pauseMs = options.pauseMs ?? 1000
  const pause = () => (pauseMs > 0 ? new Promise((r) => setTimeout(r, pauseMs)) : Promise.resolve())
  const day = melbourneDay(now)
  const out: PoolOutcome[] = []
  for (const o of scoutOrder(await store.candidates(), day).slice(0, cap)) {
    if (Date.now() >= deadline) break
    let origin: string
    try {
      origin = new URL(o.website).origin
    } catch {
      out.push({ organiser: o.name, outcome: 'its website is not an address', recorded: 0 })
      continue
    }
    const robots = await get(fetcher, `${origin}/robots.txt`)
    if (robots.status === null || robots.status === 403 || robots.status === 429 || robots.status >= 500) {
      out.push({ organiser: o.name, outcome: `robots.txt answered ${robots.status ?? 'nothing'}: not read`, recorded: 0 })
      continue
    }
    const pages: { url: string; html: string }[] = []
    let refused: number | null = null
    for (const p of BASIS_PATHS) {
      const url = p ? `${origin}${p}` : o.website
      const at = new URL(url)
      if (robotsVerdict(robots.status, robots.body, at.pathname + at.search) === 'disallowed') continue
      await pause()
      const page = await get(fetcher, url)
      if (page.status === 403 || page.status === 429) {
        refused = page.status
        break
      }
      if (page.body && !pages.some((x) => x.url === page.url)) pages.push({ url: page.url, html: page.body })
    }
    if (refused !== null) {
      out.push({ organiser: o.name, outcome: `the site answered ${refused}: never read`, recorded: 0 })
      continue
    }
    if (pages.length === 0) {
      out.push({ organiser: o.name, outcome: 'none of its own pages could be read', recorded: 0 })
      continue
    }
    const { finds, refused: notTaken } = basisFinds({ name: o.name, website: o.website }, pages, o.known)
    let recorded = 0
    for (const f of finds) {
      if (await store.record({ organiserId: o.id, address: f.address, pageUrl: f.pageUrl, day })) recorded += 1
    }
    out.push({
      organiser: o.name,
      outcome: `${recorded} recorded${notTaken.length ? `; ${notTaken.length} not taken (${notTaken[0].why})` : ''}${finds.length === 0 && notTaken.length === 0 ? '; no address at its own domain on its own pages' : ''}`,
      recorded,
    })
  }
  return out
}

type Db = SupabaseClient<Database>

/** The pool's database: CRM organisers with their own website and no contact with a basis yet; the platform never. */
export function basisPoolStore(db: Db, recordedBy: string): PoolStore {
  return {
    async candidates() {
      const { data, error } = await db.from('organisers').select('id, name, website_url').not('website_url', 'is', null)
      if (error) throw new Error(`the CRM could not be read: ${error.message}`)
      const organisers = withoutPlatformOrganisers(data ?? [], await readPlatformOrganiserIds(db))
      const { data: contacts, error: cErr } = await db.from('organiser_contacts').select('organiser_id, address, basis').eq('channel', 'email')
      if (cErr) throw new Error(`the contacts could not be read: ${cErr.message}`)
      const byOrganiser = new Map<string, { address: string; basis: string }[]>()
      for (const c of contacts ?? []) {
        const list = byOrganiser.get(c.organiser_id as string) ?? []
        list.push({ address: String(c.address), basis: String(c.basis) })
        byOrganiser.set(c.organiser_id as string, list)
      }
      return organisers
        .filter((o) => /^https:\/\//i.test(String(o.website_url)) && domainOf(String(o.website_url)))
        .filter((o) => !(byOrganiser.get(o.id) ?? []).some((c) => c.basis !== 'none'))
        .map((o) => ({ id: o.id, name: String(o.name), website: String(o.website_url).trim(), known: (byOrganiser.get(o.id) ?? []).map((c) => c.address) }))
    },

    async record(r) {
      const { data: held, error: hErr } = await db.from('organiser_contacts').select('id').eq('channel', 'email').eq('address', r.address).limit(1)
      if (hErr) throw new Error(`the contacts could not be read: ${hErr.message}`)
      if ((held ?? []).length > 0) return false
      const { error } = await db.from('organiser_contacts').insert({
        organiser_id: r.organiserId,
        role: 'Published contact address',
        channel: 'email',
        address: r.address,
        basis: 'conspicuous_publication',
        published_on_url: r.pageUrl,
        seen_on: r.day,
        /* Lawal's own check, on the page, before any message leaves held (migration 20261031053501). */
        no_marketing_statement_checked: false,
        relevance: RELEVANCE,
        basis_recorded_by: recordedBy,
        basis_recorded_at: new Date().toISOString(),
        created_by: recordedBy,
      })
      if (error) {
        /* Another night's or the tool's row for the same address: the one-per-address key refuses it, never twice. */
        if (/organiser_contacts_one_per_address|duplicate key/i.test(error.message)) return false
        throw new Error(`the contact could not be recorded: ${error.message}`)
      }
      return true
    },
  }
}
