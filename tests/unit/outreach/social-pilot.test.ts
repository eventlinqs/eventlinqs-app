import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * THE SOCIAL PILOT (Lawal's ruling of 23:01 on 26 November 2026, law 31 narrowed; the PM's car K lean, items K3 and K4).
 * Red on main, where any Instagram handle with a basis could be drafted a first DM by the planner, a DM could be logged
 * sent to any social contact, and the 08:00 report had no pilot block:
 *   1. a message a person sent is recorded on a pilot contact, sent by them, in the pilot thread; any other is refused;
 *   2. the database refuses an acquisition cadence message to an Instagram or Facebook contact not in the pilot, keeps
 *      the pilot basis beside the message, and holds the pilot to 20 (migration 20261126200002);
 *   3. the planner drafts no first DM at all ("No automated first message");
 *   4. the 08:00 scoreboard carries the eight measures as its own block, and admin shows them with the record form.
 */

const policy = vi.hoisted(() => ({ decision: { state: 'allowed' } as { state: string; rule?: string; reason?: string; nextEligibleAt?: string | null }, blocked: null as string | null }))
vi.mock('@/lib/outreach/contact-policy', () => ({
  readContactPolicy: vi.fn(async () => policy.decision),
  decisionWords: (d: { reason?: string }) => d.reason ?? 'held',
}))
vi.mock('@/lib/outreach/first-letter-record', () => ({ FIRST_LETTER_WRITTEN: ['queued', 'sending', 'sent'], readFirstLetterRecord: vi.fn(async () => ({ candidate: {}, sent: [], replies: [] })) }))
vi.mock('@/lib/outreach/one-first-letter', () => ({ firstLetterBlocked: vi.fn(() => policy.blocked) }))

import { PILOT_CONTEXT, pilotMessageProblems, recordPilotMessage } from '@/lib/outreach/pilot'
import { pilotLine } from '@/lib/outreach/pilot-board'

const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const NOW = new Date('2026-11-28T03:00:00Z')
const GOOD = "Hi Dee,\n\nI'm writing from EventLinqs about your weekly night.\n\nIf you'd rather not hear from us, reply stop and I won't message again."

type Contact = { id: string; channel: string; pilot_qualified_at: string | null } | null
function fakeDb(contact: Contact, insertError: { message: string } | null = null) {
  const inserted: Record<string, unknown>[] = []
  const db = {
    from(table: string) {
      if (table === 'organiser_contacts') {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: contact, error: null }) }
        return q
      }
      if (table === 'outreach_touches') {
        return {
          insert(row: Record<string, unknown>) {
            inserted.push(row)
            const q = { select: () => q, single: async () => (insertError ? { data: null, error: insertError } : { data: { id: 'touch-1' }, error: null }) }
            return q
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { db: db as never, inserted }
}

beforeEach(() => {
  policy.decision = { state: 'allowed' }
  policy.blocked = null
})

describe('a pilot message as written', () => {
  it('passes when it opens Hi and a name, names EventLinqs and carries a reply STOP line', () => {
    expect(pilotMessageProblems({ body: GOOD, sentAt: NOW.toISOString(), step: 1 }, NOW)).toEqual([])
  })
  it('says each rule the database would refuse it for', () => {
    const why = pilotMessageProblems({ body: 'Hello there\u2014 join us!', sentAt: new Date(NOW.getTime() + 3_600_000).toISOString(), step: 4 }, NOW)
    expect(why).toEqual([
      'it must open with Hi, their first name or their team, and a comma',
      'it must name EventLinqs',
      'it must carry a reply STOP line',
      'it carries an em or en dash',
      'it carries an exclamation mark',
      'it cannot be sent in the future',
      'a pilot message is step 1, 2 or 3',
    ])
    expect(pilotMessageProblems({ body: GOOD, sentAt: 'yesterday', step: 1 }, NOW)).toEqual(['when it was sent is not a time'])
  })
})

describe('recording it', () => {
  const pilot = { id: 'c-1', channel: 'instagram', pilot_qualified_at: '2026-11-27T01:00:00Z' }

  it('records it sent by hand, by the person, in the pilot thread, never sending', async () => {
    const { db, inserted } = fakeDb(pilot)
    const done = await recordPilotMessage(db, { contactId: 'c-1', body: `  ${GOOD}  `, sentAt: NOW.toISOString(), sentBy: 'u-1' }, NOW)
    expect(done).toEqual({ state: 'done', value: { id: 'touch-1' } })
    expect(inserted).toEqual([
      {
        contact_id: 'c-1',
        purpose: 'cadence',
        step: 1,
        state: 'sent',
        provider: 'by_hand',
        sent_at: NOW.toISOString(),
        sent_by: 'u-1',
        body: GOOD,
        drafted_by: 'u-1',
        context_key: PILOT_CONTEXT,
        comms_source: 'manual',
        comms_category: 'ACQ',
        comms_subtype: 'ACQ-FIRST',
      },
    ])
    const { db: db2, inserted: second } = fakeDb(pilot)
    await recordPilotMessage(db2, { contactId: 'c-1', body: GOOD, sentAt: NOW.toISOString(), sentBy: 'u-1', step: 2 }, NOW)
    expect(second[0]).toMatchObject({ step: 2, comms_subtype: 'ACQ-FOLLOWUP', context_key: PILOT_CONTEXT })
  })

  it('refuses a contact not qualified, not on Instagram or Facebook, or not in the CRM, writing nothing', async () => {
    for (const [contact, words] of [
      [{ ...pilot, pilot_qualified_at: null }, 'not qualified into the social pilot'],
      [{ ...pilot, channel: 'email' }, 'Only an Instagram or Facebook contact'],
      [null, 'not in the CRM'],
    ] as const) {
      const { db, inserted } = fakeDb(contact)
      const done = await recordPilotMessage(db, { contactId: 'c-1', body: GOOD, sentAt: NOW.toISOString(), sentBy: 'u-1' }, NOW)
      expect(done.state).toBe('refused')
      expect(done.state === 'refused' && done.reason).toContain(words)
      expect(inserted).toEqual([])
    }
  })

  it('refuses what the contact policy holds and a second first message to the organisation, as for email', async () => {
    policy.decision = { state: 'held', rule: 'stopped', reason: 'They asked us to stop.', nextEligibleAt: null }
    const held = fakeDb(pilot)
    expect(await recordPilotMessage(held.db, { contactId: 'c-1', body: GOOD, sentAt: NOW.toISOString(), sentBy: 'u-1' }, NOW)).toEqual({ state: 'refused', reason: 'They asked us to stop.' })
    expect(held.inserted).toEqual([])
    policy.decision = { state: 'allowed' }
    policy.blocked = 'Their organisation was already written to.'
    const twice = fakeDb(pilot)
    expect(await recordPilotMessage(twice.db, { contactId: 'c-1', body: GOOD, sentAt: NOW.toISOString(), sentBy: 'u-1' }, NOW)).toEqual({ state: 'refused', reason: 'Their organisation was already written to.' })
    expect(twice.inserted).toEqual([])
  })

  it("says the database's own refusal in its words", async () => {
    const { db } = fakeDb(pilot, { message: 'refused: this organiser is already being contacted through x@y.com.' })
    expect(await recordPilotMessage(db, { contactId: 'c-1', body: GOOD, sentAt: NOW.toISOString(), sentBy: 'u-1' }, NOW)).toEqual({
      state: 'refused',
      reason: 'this organiser is already being contacted through x@y.com.',
    })
  })
})

describe('the database (migration 20261126200002)', () => {
  const sql = read('supabase/migrations/20261126200002_the_social_pilot_qualified.sql')
  it('keeps the pilot to Instagram and Facebook contacts with a recorded page and basis, and to 20', () => {
    expect(sql).toMatch(/channel in \('instagram', 'facebook'\)\s+and pilot_qualified_by is not null\s+and published_on_url is not null\s+and length\(trim\(coalesce\(pilot_basis, ''\)\)\) between 20 and 600/)
    expect(sql).toMatch(/where pilot_qualified_at is not null and id <> new\.id\) >= 20 then/)
  })
  it('refuses an acquisition cadence message to a social contact not in the pilot, and keeps the pilot basis on a sent one', () => {
    expect(sql).toMatch(/if new\.purpose <> 'cadence' or new\.state not in \('held', 'queued', 'sending', 'sent'\) or coalesce\(new\.comms_category, 'ACQ'\) <> 'ACQ' then/)
    expect(sql).toMatch(/if c\.pilot_qualified_at is null then\s+raise exception 'refused: a message on Instagram or Facebook goes only to an organiser qualified into the social pilot/)
    expect(sql).toMatch(/'pilot_basis', c\.pilot_basis, 'pilot_qualified_at', c\.pilot_qualified_at, 'pilot_qualified_by', c\.pilot_qualified_by/)
  })
  it('fires after the trigger that writes the class it reads (triggers of one event fire in name order)', () => {
    const name = 'trg_outreach_touch_wants_its_pilot_place'
    expect(sql).toContain(`create trigger ${name}`)
    for (const before of ['trg_outreach_touch_is_lawful', 'trg_outreach_touch_page_checked', 'trg_outreach_touch_takes_its_class']) expect(name > before).toBe(true)
  })
})

describe('the planner and the reports', () => {
  it('drafts no first DM from a template for any handle', () => {
    const planner = read('src/lib/outreach/planner.ts')
    expect(planner).not.toContain("templateKey: 'first_dm'")
    expect(planner).not.toContain('DM_DRAFTS_PER_DAY')
    expect(planner).toContain("templateKey: 'day4_dm'")
  })
  it('the 08:00 scoreboard carries the pilot block, read alone', () => {
    const route = read('src/app/api/cron/health-heartbeat/route.ts')
    expect(route).toMatch(/\.then\(async \(wins\) => `\$\{wins\} \$\{await readPilotLine\(db\)\.catch\(\(err: unknown\) => `Social pilot: not read: /)
  })
  it('admin shows the pilot with the record form, behind the outreach role and its rate limit', () => {
    expect(read('src/app/admin/(authed)/acquisition/page.tsx')).toContain('<PilotSection />')
    const section = read('src/app/admin/(authed)/acquisition/pilot-section.tsx')
    expect(section).toContain('<form action={recordPilotMessageAction}')
    const action = read('src/app/admin/(authed)/acquisition/pilot-actions.ts')
    expect(action).toContain("can(session, 'admin.network.manage')")
    expect(action).toContain("actionRateLimit('admin-outreach-sent', session.userId)")
    expect(action).toMatch(/recordPilotMessage\(createAdminClient\(\), \{ contactId: contact, body, sentAt: now\.toISOString\(\), sentBy: session\.userId/)
  })
})

describe('the eight measures, as said', () => {
  const zero = { qualified: 0, sent: 0, positive: 0, registrations: 0, published: 0, native: 0, tickets: 0, netCents: 0, spendCents: 0, active: 0 }
  it('says plainly when no organiser is qualified yet', () => {
    expect(pilotLine(zero)).toBe('Social pilot: no organiser qualified yet (at most 20, each with its business enquiry basis recorded); nothing sent.')
  })
  it('says all eight, one and many', () => {
    expect(pilotLine({ ...zero, qualified: 12, sent: 1, positive: 2, registrations: 1, published: 1, native: 1, tickets: 14, netCents: 3150 })).toBe(
      'Social pilot: 12 of 20 organisers qualified; 1 permitted message sent; 2 positive responses; 1 registration; 1 event published; 1 native ticketing event; 14 tickets, $31.50 net platform revenue; cost: no active organiser yet, $0 spent.',
    )
    expect(pilotLine({ ...zero, qualified: 20, sent: 20, active: 2 })).toContain('cost: $0 per active organiser.')
  })
})
