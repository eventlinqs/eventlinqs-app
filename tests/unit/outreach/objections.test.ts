import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test } from 'vitest'
import type { Database } from '@/types/database'
import { logReply } from '@/lib/outreach/crm'
import { OBJECTIONS, objectionNext, objectionOf } from '@/lib/outreach/objections'
import { classifyInbound } from '@/lib/outreach/replies'

/**
 * OBJECTIONS RECORDED (Growth Engine V3 checklist, item 5: "Objections recorded"; the pilot: "every reply and objection
 * recorded"). An objection is part of a reply's classification, kept on outreach_replies.objection, read from the same
 * rules that pick the stored answer, and correctable by Lawal like the rest of the classification.
 */

const reply = (text: string) => classifyInbound({ subject: 'Re: your nights', fromAddress: 'sam@venue.example', text, headers: {} })

describe('the objection a reply raises', () => {
  test.each([
    ['How much does it cost?', 'cost'],
    ['We already use Humanitix for our tickets.', 'existing_ticketing'],
    ['Who is this? Never heard of EventLinqs.', 'who_are_you'],
    ['Where did you get our details?', 'why_listed'],
    ['Not right now, maybe after the season.', 'not_now'],
    ['No thanks, not for us.', 'not_interested'],
  ] as const)('%s', (text, objection) => {
    expect(objectionOf(reply(text))).toBe(objection)
  })

  test('a yes, a stop, a take down, a bounce and an auto reply raise none', () => {
    expect(objectionOf(reply('Yes please, sounds good.'))).toBeNull()
    expect(objectionOf(reply('Please unsubscribe me.'))).toBeNull()
    expect(objectionOf(reply('Please take our listing down.'))).toBeNull()
    expect(objectionOf({ kind: 'bounce', hard: true })).toBeNull()
    expect(objectionOf({ kind: 'auto_reply' })).toBeNull()
  })

  test('a reply the rules cannot read is not given an objection by guess: Lawal names it', () => {
    expect(objectionOf(reply('How much is it, and who are you anyway?'))).toBeNull()
    expect(objectionOf(reply('Thanks for the note.'))).toBeNull()
  })

  test('every objection has its next action in plain words, and the list is closed', () => {
    expect([...OBJECTIONS].sort()).toEqual(['cost', 'existing_ticketing', 'not_interested', 'not_now', 'other', 'who_are_you', 'why_listed'])
    for (const o of OBJECTIONS) expect(objectionNext(o).length).toBeGreaterThan(20)
    expect(objectionNext('not_interested')).toMatch(/nothing more is sent/i)
    expect(objectionNext('other')).toMatch(/Lawal/)
  })
})

describe('the record', () => {
  test('a reply Lawal logs by hand carries the objection he names', async () => {
    const calls: { table: string; payload: Record<string, unknown> }[] = []
    const db = {
      from: (table: string) => ({
        insert: (payload: Record<string, unknown>) => {
          calls.push({ table, payload })
          const q = { select: () => q, single: async () => ({ data: { id: 'r1' }, error: null }) }
          return q
        },
      }),
    } as unknown as SupabaseClient<Database>
    await logReply(db, { contactId: 'c1', receivedAt: '2026-11-01T01:00:00Z', wording: 'Too dear for us.', outcome: 'no', objection: 'cost', loggedBy: 'u1' })
    await logReply(db, { contactId: 'c1', receivedAt: '2026-11-01T02:00:00Z', wording: 'Yes please.', outcome: 'yes', loggedBy: 'u1' })
    expect(calls[0]).toMatchObject({ table: 'outreach_replies', payload: { objection: 'cost', outcome: 'no' } })
    expect(calls[1].payload.objection).toBeNull()
  })

  test('the inbox handler writes the objection with the reply it classifies', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/outreach/replies.ts'), 'utf8').replace(/\r\n/g, '\n')
    expect(src).toMatch(/objection: objectionOf\(kind\)/)
  })

  test('the database holds the same closed list, and lets the objection be corrected like the rest of the classification', () => {
    const dir = join(process.cwd(), 'supabase/migrations')
    const sql = readFileSync(join(dir, '20261101070001_outreach_objections.sql'), 'utf8').replace(/\r\n/g, '\n')
    const listed = /objection is null or objection in \(([^)]*)\)/.exec(sql)?.[1]
    expect(listed?.split(',').map((s) => s.trim().replace(/'/g, '')).sort()).toEqual([...OBJECTIONS].sort())
    // outreach_reply_words_stay refuses changes to the words only; the objection is not among them.
    expect(sql).not.toMatch(/function public\.outreach_reply_words_stay/)
  })
})
