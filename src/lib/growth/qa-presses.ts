import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * QA PRESSES, SHOWN APART (the master mandate of 29 October 2026, the project manager's R3, 20261029220001): the
 * presses a QA drive made on the counted hops with a verified marker, counted on their own line so a test can be seen,
 * and never inside a figure (every other read leaves them out: scripts/guards/counted-rows-exclude-tests.mjs).
 * Head-only counts: no row leaves the database.
 */
export interface QaPresses {
  readonly shareEvents: number
  readonly goPresses: number
  readonly since: string
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function readQaPresses(now: Date = new Date(), days = 7): Promise<QaPresses> {
  const since = new Date(now.getTime() - days * DAY_MS).toISOString()
  const admin = createAdminClient()
  const [share, go] = await Promise.all([
    admin.from('share_link_events').select('id', { count: 'exact', head: true }).eq('is_test', true).gte('occurred_at', since),
    admin.from('go_presses').select('id', { count: 'exact', head: true }).eq('is_test', true).gte('pressed_at', since),
  ])
  if (share.error) throw new Error(`the QA share presses could not be counted: ${share.error.message}`)
  if (go.error) throw new Error(`the QA /go presses could not be counted: ${go.error.message}`)
  return { shareEvents: share.count ?? 0, goPresses: go.count ?? 0, since }
}
