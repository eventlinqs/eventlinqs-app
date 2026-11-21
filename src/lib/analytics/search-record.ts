/**
 * INTERNAL SEARCHES, RECORDED FIRST PARTY (the PM's order 3 of 11 November 2026, addition 1: every Phase C event in
 * EventLinqs' own tables). Plausible's 'event_search' fired only when a filter chip was pressed with a query already
 * set (src/components/features/events/m5-events-filter-bar.tsx), so a search a person typed was recorded nowhere as a
 * search. /events records it here, after its answer has gone (next/server's after), so it adds nothing to the page.
 *
 * What is kept is public.site_searches (migration 20261111010001): the term, normalised, and how many events it found.
 * No address, user, session, device string or identifier, and never a term that reads as an email address, a phone
 * number or a web address: a person sometimes types their own details into a search box, and those are not kept.
 */
import { isPreviewCrawler } from '@/lib/broadcast/crawler'

const MAX = 80
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
const PHONE = /(?:\d[\s().-]*){8,}/
const WEB = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|au|io|co)\b/i

/** The term as kept: lower case, single spaces, at most 80 characters; null when it must not be kept at all. Pure. */
export function searchTerm(q: string | null | undefined): string | null {
  if (typeof q !== 'string') return null
  const term = q.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, MAX).trim()
  if (term.length === 0) return null
  if (EMAIL.test(term) || PHONE.test(term) || WEB.test(term)) return null
  return term
}

/**
 * EventLinqs' own checks say who they are in their user agent (the search reach guard, scripts/verify/search-reach.mjs,
 * and the press of every control): their searches are tests, and the search log feeds the learning loop that reads the
 * zero result rate (the PM's 05:25 of 22 November 2026, item 7), so they are never recorded as a person's.
 */
export const QA_USER_AGENT_TOKEN = 'EventLinqs-QA'

/** Whether this request's search is recorded: a person's, with a term that may be kept. Pure. */
export function searchToRecord(q: string | null | undefined, userAgent: string | null): string | null {
  if (isPreviewCrawler(userAgent)) return null
  if (userAgent?.includes(QA_USER_AGENT_TOKEN)) return null
  return searchTerm(q)
}

export type SearchInsert = { term: string; results: number | null; surface: 'events' | 'events-fallback' }
type SearchClient = { from: (t: 'site_searches') => { insert: (row: SearchInsert) => PromiseLike<{ error: { message: string } | null }> } }

/** Writes the row; a refusal is logged and never thrown, since the page has already answered. */
export async function recordSearch(client: SearchClient, term: string, results: number | null): Promise<void> {
  const { error } = await client.from('site_searches').insert({ term, results, surface: 'events' })
  if (error) console.error(`[search-record] the search was not recorded: ${error.message}`)
}

/**
 * THE SEARCH FALLBACK IS NEVER SILENT (the PM's order of 22 November 2026, 05:45, condition (b)). When the one search
 * engine cannot answer and the old word filter answers instead (src/lib/events/fetchers.ts resolveSearch), one row is
 * written with surface 'events-fallback' (migration 20261122060002), the term kept by the same rule as every search row
 * (searchTerm). A refused write is logged, never thrown: the search has already been answered.
 */
export async function recordEngineFallback(client: SearchClient, q: string): Promise<void> {
  const term = searchTerm(q)
  if (!term) return
  const { error } = await client.from('site_searches').insert({ term, results: null, surface: 'events-fallback' })
  if (error) console.error(`[search-record] the search fallback was not recorded: ${error.message}`)
}
