import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * THE ENGINE'S PAGE CHECKS, SEEN AND STOPPED (law 43; Lawal, 21 November 2026, 01:05: "You see each one in the morning
 * report and can stop any"). Each check the basis pool made (./basis-pool.ts engineCheck) is listed with its organiser,
 * the address, the page and the time; its saved copy can be opened; a person can stop it. A stop is kept on the check
 * (never deleted), unticks the contact so nothing queues on it again, and puts any letter of that contact waiting to go
 * back to held; the database refuses a letter leaving held on a stopped check in any case (migration 20261121010002).
 */
type Admin = SupabaseClient<Database>

export type PageCheckRow = {
  readonly id: string
  readonly checkedAt: string
  readonly pageUrl: string
  readonly address: string
  readonly organiser: string
  readonly sha256: string
  readonly stoppedAt: string | null
  readonly stoppedReason: string | null
}

type Raw = {
  id: string
  checked_at: string
  page_url: string
  page_sha256: string
  stopped_at: string | null
  stopped_reason: string | null
  organiser_contacts: { address: string; organisers: { name: string } | null } | null
}

/** Every engine check since the given instant, newest first. */
export async function readPageChecks(db: Admin, sinceIso: string): Promise<PageCheckRow[]> {
  const { data, error } = await db
    .from('organiser_page_checks')
    .select('id, checked_at, page_url, page_sha256, stopped_at, stopped_reason, organiser_contacts(address, organisers(name))')
    .gte('checked_at', sinceIso)
    .order('checked_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(`the page checks could not be read: ${error.message}`)
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id,
    checkedAt: r.checked_at,
    pageUrl: r.page_url,
    address: r.organiser_contacts?.address ?? '',
    organiser: r.organiser_contacts?.organisers?.name ?? '',
    sha256: r.page_sha256,
    stoppedAt: r.stopped_at,
    stoppedReason: r.stopped_reason,
  }))
}

/** One check's saved copy of the page, as the engine read it. */
export async function readPageCopy(db: Admin, id: string): Promise<{ readonly html: string; readonly sha256: string; readonly pageUrl: string } | null> {
  const { data, error } = await db.from('organiser_page_checks').select('page_html, page_sha256, page_url').eq('id', id).maybeSingle()
  if (error) throw new Error(`the saved page could not be read: ${error.message}`)
  return data ? { html: data.page_html, sha256: data.page_sha256, pageUrl: data.page_url } : null
}

export type StopAnswer = { readonly state: 'stopped'; readonly held: number } | { readonly state: 'refused'; readonly reason: string }

/** A person stops a check: kept on the check, the contact unticked, any letter waiting to go back to held. */
export async function stopPageCheck(db: Admin, input: { readonly id: string; readonly by: string; readonly reason: string; readonly now: Date }): Promise<StopAnswer> {
  const check = await db.from('organiser_page_checks').select('id, contact_id, stopped_at').eq('id', input.id).maybeSingle()
  if (check.error) return { state: 'refused', reason: `the check could not be read: ${check.error.message}` }
  if (!check.data) return { state: 'refused', reason: 'no such check' }
  if (check.data.stopped_at) return { state: 'refused', reason: 'it was already stopped' }
  const stopped = await db
    .from('organiser_page_checks')
    .update({ stopped_at: input.now.toISOString(), stopped_by: input.by, stopped_reason: input.reason.slice(0, 500) })
    .eq('id', input.id)
    .is('stopped_at', null)
  if (stopped.error) return { state: 'refused', reason: `the stop could not be written: ${stopped.error.message}` }
  const unticked = await db.from('organiser_contacts').update({ no_marketing_statement_checked: false, page_checked_by: null }).eq('id', check.data.contact_id)
  if (unticked.error) return { state: 'refused', reason: `stopped, but the contact could not be unticked: ${unticked.error.message}` }
  const held = await db
    .from('outreach_touches')
    .update({ state: 'held', scheduled_for: null })
    .eq('contact_id', check.data.contact_id)
    .eq('state', 'queued')
    .select('id')
  if (held.error) return { state: 'refused', reason: `stopped and unticked, but its waiting letters could not be held: ${held.error.message}` }
  return { state: 'stopped', held: (held.data ?? []).length }
}
