import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { SOCIAL_SLOT_ZONE, slotDay, slotFromEarlierDay, wordsNameATime } from '@/lib/ops/stale-slot'

/*
 * LAW 42, A MISSED DAY IS NEVER CAUGHT UP (Lawal, 20 November 2026, 23:58: "if today is missed, let's forget about it and
 * start afresh"; the PM's 00:20 of 21 November 2026, (c)). A sending window or posting slot that has passed is never
 * fired late as that day's batch. The sender's own case is in tests/unit/outreach/sending.test.ts and the social
 * publisher's in tests/unit/social/approved-pieces-publish-path.test.ts; this file holds the rule and the class.
 */

// 21 November 2026, 00:30 in Melbourne (AEDT, UTC+11) is 20 November, 13:30 UTC.
const NOW = new Date('2026-11-20T13:30:00Z')

describe('the rule', () => {
  test('a slot on the day before is from an earlier day, even one an hour ago across midnight', () => {
    expect(slotFromEarlierDay('2026-11-20T12:30:00Z', NOW, SOCIAL_SLOT_ZONE)).toBe(true)
    expect(slotDay('2026-11-20T12:30:00Z', SOCIAL_SLOT_ZONE)).toBe('2026-11-20')
    expect(slotFromEarlierDay('2026-11-18T22:00:00Z', NOW, SOCIAL_SLOT_ZONE)).toBe(true)
  })
  test('a slot earlier today, now, later, or none is not', () => {
    expect(slotFromEarlierDay('2026-11-20T13:05:00Z', NOW, SOCIAL_SLOT_ZONE)).toBe(false)
    expect(slotFromEarlierDay('2026-11-20T13:30:00Z', NOW, SOCIAL_SLOT_ZONE)).toBe(false)
    expect(slotFromEarlierDay('2026-11-23T22:00:00Z', NOW, SOCIAL_SLOT_ZONE)).toBe(false)
    expect(slotFromEarlierDay(null, NOW, SOCIAL_SLOT_ZONE)).toBe(false)
  })
  test("the day is the recipient city's own: in Perth it is still the 20th", () => {
    expect(slotFromEarlierDay('2026-11-20T03:00:00Z', NOW, 'Australia/Perth')).toBe(false)
  })
  test('words that name a day or a date are found; a letter with none is timeless', () => {
    expect(wordsNameATime('See you this weekend')).toBe('this weekend')
    expect(wordsNameATime('Your night on Saturday 22 November')).toBe('Saturday')
    expect(wordsNameATime("We'd be happy to prepare a complimentary listing for your next event")).toBeNull()
  })
})

describe('the social publisher never posts a missed day late, switch on or off', () => {
  type Call = { table: string; op: 'select' | 'update'; payload: unknown; filters: [string, unknown][] }
  const fakeDb = (schedules: Record<string, unknown>[], switchOn: boolean) => {
    const calls: Call[] = []
    const from = (table: string) => {
      const call: Call = { table, op: 'select', payload: null, filters: [] }
      const answer = () => {
        if (call.op === 'update') return { data: null, error: null }
        if (table === 'social_piece_schedules') return { data: schedules, error: null }
        return { data: [], error: null }
      }
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => (call.filters.push([`eq:${k}`, v]), b),
        lte: (k: string, v: unknown) => (call.filters.push([`lte:${k}`, v]), b),
        order: () => b,
        limit: () => b,
        update: (p: unknown) => ((call.op = 'update'), (call.payload = p), b),
        maybeSingle: async () => (table === 'feature_flags' ? { data: { enabled: switchOn }, error: null } : { data: null, error: null }),
        then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) => {
          calls.push(call)
          return Promise.resolve(answer()).then(ok, no)
        },
      }
      return b
    }
    return { db: { from }, calls }
  }
  // 20 November 2026, 20:00 in Melbourne: the evening before NOW.
  const YESTERDAY = { id: 's-old', piece_id: 'p-old', approval_id: 'a-old', platform: 'instagram', go_at: '2026-11-20T09:00:00Z' }

  for (const switchOn of [true, false]) {
    test(`a slot from yesterday is held with its reason and never given to the publisher (switch ${switchOn ? 'on' : 'off'})`, async () => {
      const { publishDuePieces } = await import('@/lib/social/store')
      const { db, calls } = fakeDb([YESTERDAY], switchOn)
      let given = 0
      const publisher = async () => {
        given++
        return { ref: 'never' }
      }
      const out = await publishDuePieces(db as never, NOW, { siteOrigin: 'https://www.eventlinqs.com.au', publisher })
      expect(given).toBe(0)
      expect(out.published).toEqual([])
      expect(out.wouldPublish).toEqual([])
      expect(out.held[0]).toContain('s-old: Not published: its slot of 2026-11-20 passed before it could post')
      const update = calls.find((c) => c.op === 'update' && c.table === 'social_piece_schedules')
      expect(update?.payload).toMatchObject({ state: 'held' })
      expect(update?.filters).toEqual(expect.arrayContaining([['eq:id', 's-old'], ['eq:state', 'scheduled']]))
    })
  }
})

describe('the class: every reader that sends or posts at a passed slot asks the rule first', () => {
  const SLOT_READER = /\.lte\(\s*'(scheduled_for|go_at|send_at|post_at|scheduled_at|due_at)'/
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
    })
  const readers = files(join(process.cwd(), 'src')).filter((f) => SLOT_READER.test(readFileSync(f, 'utf8')))

  test('the readers are found: the sender and the social publisher', () => {
    const names = readers.map((f) => f.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/'))
    expect(names).toEqual(expect.arrayContaining(['src/lib/outreach/sender.ts', 'src/lib/social/store.ts']))
  })
  test('each calls slotFromEarlierDay, so a missed day is never fired late', () => {
    const missing = readers.filter((f) => !readFileSync(f, 'utf8').includes('slotFromEarlierDay('))
    expect(missing).toEqual([])
  })
})
