import { describe, expect, it, vi } from 'vitest'

/*
 * THE FIRST LETTERS AND FOLLOW UPS CARDS NEVER HIDE A HELD LETTER (the PM's 15:05 of 15 November 2026, found at the 41
 * letters' re-read): every outreach draft is stored held (src/lib/outreach/drafts.ts) and only a person's approval queues
 * it inside a play, so a held letter waits on a person whatever the sender's mode. Red before the fix: with the sender
 * live the two cards counted nothing waiting, and the letters dropped out of "Needs you today".
 */
const rows: Record<string, unknown> = {
  outreach_sender: { mode: 'live', dns_ok: true, dns_checked_at: '2026-11-15T03:45:03.308Z', changed_by: 'a-person' },
  feature_flags: { enabled: true },
}

/** A query builder for any chain: every filter returns itself; awaited, it answers a count of 4 and no rows. */
function builder(table: string): unknown {
  const answer = { data: [] as unknown[], count: 4, error: null }
  const self: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(answer).then(resolve, reject)
        if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: rows[table] ?? null, error: null })
        return () => self
      },
    },
  )
  return self
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => builder(table), rpc: () => builder('rpc') }) }))

import { readAutomation } from '@/lib/admin/automation'

describe('held letters wait for a person in every sender mode', () => {
  it('the first letters card counts its held letters as waiting with the sender live', async () => {
    const { cards } = await readAutomation(new Date('2026-11-15T04:30:00Z'))
    const letters = cards.find((c) => c.key === 'first-letters')
    expect(letters?.readFailed ?? null).toBeNull()
    expect(letters?.state).toBe('waits')
    expect(letters?.waitsFor).toBe('4 letter(s) wait for your approval before they can queue')
    expect(letters?.queue.map((f) => f.label)).toEqual(['Letters held', 'Letters queued', 'Plays approved'])
  })
  it('the follow ups card does the same', async () => {
    const { cards } = await readAutomation(new Date('2026-11-15T04:30:00Z'))
    const follow = cards.find((c) => c.key === 'follow-ups')
    expect(follow?.state).toBe('waits')
    expect(follow?.waitsFor).toBe('4 follow up(s) wait for your approval before they can queue')
  })
})
