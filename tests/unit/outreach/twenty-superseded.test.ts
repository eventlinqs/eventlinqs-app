import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { TWENTY_ADVICE_DRAFTING, storeSegmentALetters } from '@/lib/outreach/twenty-drafts'

/*
 * THE ADVICE TWENTY IS SUPERSEDED, HIDDEN AND NOT DELETED (the communication standard of 17 November 2026; law 13), and
 * the segment A letters are stored every hour, versioned, so a play can pin their exact version.
 */
describe('the advice twenty is switched off; segment A is stored', () => {
  it('the switch is off, and the hourly run drafts the twenty only behind it', () => {
    expect(TWENTY_ADVICE_DRAFTING).toBe(false)
    const route = readFileSync('src/app/api/cron/outreach-run/route.ts', 'utf8')
    expect(route).toMatch(/TWENTY_ADVICE_DRAFTING\s*\?/)
    expect(route).toMatch(/storeSegmentALetters\(db\)/)
  })

  it('stores the three segment A letters in the founder name, each as a first version when none is stored', async () => {
    const inserted: { key: string; version: number; created_by: string }[] = []
    const db = {
      from: (table: string) => {
        const b: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'is', 'order', 'limit']) b[m] = () => b
        b.maybeSingle = async () => ({ data: null, error: null })
        b.then = (resolve: (v: unknown) => unknown) => resolve(table === 'admin_users' ? { data: [{ id: 'founder' }], error: null } : { data: [], error: null })
        b.insert = async (row: { key: string; version: number; created_by: string }) => (inserted.push(row), { error: null })
        return b
      },
    } as unknown as SupabaseClient<Database>
    expect(await storeSegmentALetters(db)).toEqual(['segment_a_first v1', 'segment_a_day4 v1', 'segment_a_day10 v1'])
    expect(inserted.map((r) => [r.key, r.version, r.created_by])).toEqual([
      ['segment_a_first', 1, 'founder'],
      ['segment_a_day4', 1, 'founder'],
      ['segment_a_day10', 1, 'founder'],
    ])
  })
})
