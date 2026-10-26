import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { recordAnonAuditEvent } from '@/lib/admin/audit'
import { PLATFORM_SCOPES, type PlatformScope } from './platform-request'

/**
 * EVERY READ BOOKEDPROOF MAKES IS LOGGED AND SHOWN TO THE OWNER IN PLAIN WORDS
 * (the project manager's 22:45 (3), 26 October 2026): "Bookedproof read 214
 * orders and 61 consented buyers today". The log is the platform's own
 * append-only audit_log, written through the one audit writer, so a read
 * leaves the same kind of record an admin action does and is listed on the
 * same audit page.
 */

export const PLATFORM_READ_ACTION = 'bookedproof.platform_read'

/** What one row of each scope is called, as the owner would say it. */
export const SCOPE_NOUNS: Record<PlatformScope, { one: string; many: string }> = {
  ledger: { one: 'order', many: 'orders' },
  buyers: { one: 'consented buyer', many: 'consented buyers' },
  events: { one: 'event', many: 'events' },
  organisations: { one: 'organiser', many: 'organisers' },
}

/** The order the sentence names them in: money first. */
const SENTENCE_ORDER: PlatformScope[] = ['ledger', 'buyers', 'events', 'organisations']

export async function logPlatformRead(entry: { scope: PlatformScope; rows: number; after: string | null; next: string | null }) {
  return recordAnonAuditEvent({
    action: PLATFORM_READ_ACTION,
    actorEmail: 'bookedproof',
    metadata: { scope: entry.scope, rows: entry.rows, after: entry.after, next: entry.next },
  })
}

export type ReadTotals = Record<PlatformScope, number>

export const emptyTotals = (): ReadTotals => ({ organisations: 0, events: 0, buyers: 0, ledger: 0 })

/** Adds up the logged reads; a row whose metadata is not a read of a known scope is ignored. */
export function totalReads(entries: { metadata: unknown }[]): ReadTotals {
  const totals = emptyTotals()
  for (const e of entries) {
    const m = e.metadata as { scope?: unknown; rows?: unknown } | null
    if (!m || typeof m.scope !== 'string' || !(PLATFORM_SCOPES as readonly string[]).includes(m.scope)) continue
    if (typeof m.rows !== 'number' || !Number.isFinite(m.rows) || m.rows < 0) continue
    totals[m.scope as PlatformScope] += m.rows
  }
  return totals
}

/** "Bookedproof read 214 orders and 61 consented buyers today." */
export function readsSentence(totals: ReadTotals, when: string): string {
  const parts = SENTENCE_ORDER.filter((s) => totals[s] > 0).map((s) => {
    const n = totals[s]
    return `${n.toLocaleString('en-AU')} ${n === 1 ? SCOPE_NOUNS[s].one : SCOPE_NOUNS[s].many}`
  })
  if (parts.length === 0) return `Bookedproof read nothing ${when}.`
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `Bookedproof read ${list} ${when}.`
}

export type LoggedRead = { created_at: string; metadata: unknown }

/** Every logged read since a moment, oldest first. */
export async function readLoggedReads(since: Date): Promise<LoggedRead[]> {
  const admin = createAdminClient()
  return readEveryRow<LoggedRead>('Bookedproof reads', (from, to) =>
    admin
      .from('audit_log')
      .select('id, created_at, metadata')
      .eq('action', PLATFORM_READ_ACTION)
      .gte('created_at', since.toISOString())
      .order('id', { ascending: true })
      .range(from, to),
  )
}
