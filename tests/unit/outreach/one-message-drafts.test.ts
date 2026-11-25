import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeOutreachDb as fakeDb, type Row, type Tables } from '../../helpers/outreach-db-fake'
import type { Goal } from '@/lib/outreach/goals'

/*
 * ONE MESSAGE CARRIES EVERY GOAL, AT THE DRAFTER (Lawal, 26 November 2026, 00:01; the PM's 00:02, item A). The real
 * drafter (src/lib/outreach/drafts.ts) against the in-memory fake, with the goals read from production replaced by the
 * goals a test names (the pure goals are held in goals.test.ts): a partner's message carries every due goal before its
 * sign off and passes the render's rules as one letter; a cold letter keeps its one category; a confirmation carries
 * nothing more; a goals read that fails leaves the message as its template wrote it; and a partner's message while our
 * last one is unanswered is not drafted at all (one-open-message.test.ts holds that rule's cases).
 */

const { readDueGoals } = vi.hoisted(() => ({ readDueGoals: vi.fn() }))
vi.mock('@/lib/outreach/facts', () => ({ factsForContact: vi.fn(async () => ({ 'first name': 'Jennifer' })) }))
vi.mock('@/lib/outreach/goals', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/outreach/goals')>()), readDueGoals }))

const { draftFromTemplate } = await import('@/lib/outreach/drafts')

const fakeOutreachDb = (t: Tables) => fakeDb(t, { outreach_close_stuck_sends: () => 0 })
const ORIGIN = 'https://www.eventlinqs.com.au'
const NOW = new Date('2026-11-25T20:00:00Z') // Thursday 26 November 2026, 07:00 in Melbourne
const PAGE = `${ORIGIN}/photos/c1/0123456789abcdef0123456789abcdef`
const PARTNER_BODY = `Hi [first name],\n\nYour feature went out on our pages this morning: ${ORIGIN}/events/continuum-dance\n\nKind regards,\n[signature]\n\n[unsubscribe]`
const COLD_BODY = `Hi [first name],\n\nYour night is on EventLinqs: ${ORIGIN}/events/continuum-dance\n\nKind regards,\n[signature]\n\n[unsubscribe]`

const GOALS: Goal[] = [
  { key: 'listing', line: `Your night is live on EventLinqs:\nContinuum Dance Performance, Saturday 28 November: ${ORIGIN}/events/continuum-dance`, link: `${ORIGIN}/events/continuum-dance` },
  { key: 'photo', line: `If you're happy for us to promote it with your own photos, you can add and approve them here: ${PAGE}`, link: PAGE },
  { key: 'claim', line: "You can also claim your listings for free and sell tickets directly: just reply and I'll set it up.", link: null },
  { key: 'future', line: "And if you have more nights coming up, send me the dates and we'll list those too.", link: null },
]

function world(extra: Partial<Tables> = {}): Tables {
  return {
    organisers: [{ id: 'o1', name: 'Stage Studio', organisation_id: null }],
    organiser_contacts: [{ id: 'c1', organiser_id: 'o1', address: 'studio@eventlinqs.com', channel: 'email', basis: 'conspicuous_publication', unsubscribe_token: 't1', person_name: 'Jennifer' }],
    outreach_templates: [
      { id: 'tpl-featured', key: 'featured', version: 1, channel: 'email', purpose: 'relationship', step: null, subject: 'Your feature', body: PARTNER_BODY },
      { id: 'tpl-withdrawn', key: 'withdrawal_confirmed', version: 1, channel: 'email', purpose: 'relationship', step: null, subject: 'Re: your photos', body: PARTNER_BODY },
      { id: 'tpl-perm', key: 'lifecycle_perm', version: 1, channel: 'email', purpose: 'cadence', step: 1, subject: 'Your [event] listing', body: COLD_BODY },
    ],
    outreach_touches: [],
    outreach_replies: [],
    outreach_unsubscribes: [],
    outreach_delivery_events: [],
    organiser_venues: [],
    events: [],
    ...extra,
  }
}

const draft = (db: Parameters<typeof draftFromTemplate>[0], template: string, purpose: 'cadence' | 'relationship', context: string | null = null) =>
  draftFromTemplate(db, { contactId: 'c1', templateKey: template, templateId: template, purpose, step: purpose === 'cadence' ? 1 : null, contextKey: context, scheduledFor: NOW, origin: ORIGIN, draftedBy: 'u1' })

const written = (t: Tables): Row => {
  const rows = (t.outreach_touches ?? []).filter((r) => r.state !== 'void')
  expect(rows).toHaveLength(1)
  return rows[0]
}

beforeEach(() => {
  readDueGoals.mockReset()
  readDueGoals.mockResolvedValue(GOALS)
})

describe("a partner's message carries every goal that is due", () => {
  it('each due goal one paragraph before the sign off, the one its words already carry left out, and the letter passes as one', async () => {
    const { db, tables } = fakeOutreachDb(world())
    const r = await draft(db, 'tpl-featured', 'relationship', 'kit:k1')
    expect(r).toMatchObject({ state: 'done', value: { state: 'held', heldBecause: [] } })
    expect(readDueGoals).toHaveBeenCalledWith(db, { contactId: 'c1', origin: ORIGIN, now: NOW })
    const body = String(written(tables).body)
    const signOff = body.indexOf('Kind regards,')
    expect(body.startsWith('Hi Jennifer,\n\nYour feature went out')).toBe(true)
    for (const g of GOALS.slice(1)) {
      expect(body.split(g.line)).toHaveLength(2)
      expect(body.indexOf(g.line)).toBeLessThan(signOff)
    }
    // Its own link is already in its words: the listing line is not repeated.
    expect(body).not.toContain('Your night is live on EventLinqs')
    expect(body.indexOf(GOALS[1].line)).toBeLessThan(body.indexOf(GOALS[2].line))
    expect(body.indexOf(GOALS[2].line)).toBeLessThan(body.indexOf(GOALS[3].line))
  })

  it('a goals read that fails leaves the message as its template wrote it, and drafts it', async () => {
    readDueGoals.mockRejectedValue(new Error('their nights could not be read'))
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, tables } = fakeOutreachDb(world())
    expect((await draft(db, 'tpl-featured', 'relationship', 'kit:k1')).state).toBe('done')
    expect(String(written(tables).body)).not.toContain('claim your listings')
    expect(quiet).toHaveBeenCalledWith(expect.stringContaining('their goals could not be read'), 'their nights could not be read')
    quiet.mockRestore()
  })
})

describe('what carries nothing more', () => {
  it('a cold first letter keeps its one category: no goals are read for it', async () => {
    const { db, tables } = fakeOutreachDb(world())
    expect((await draft(db, 'tpl-perm', 'cadence', 'event:E1')).state).toBe('done')
    expect(readDueGoals).not.toHaveBeenCalled()
    expect(String(written(tables).body)).not.toContain('claim your listings')
  })

  it('the confirmation that their withdrawal was done carries nothing but itself', async () => {
    const { db, tables } = fakeOutreachDb(world())
    expect((await draft(db, 'tpl-withdrawn', 'relationship', 'withdrawal:w1')).state).toBe('done')
    expect(readDueGoals).not.toHaveBeenCalled()
    expect(String(written(tables).body)).not.toContain('claim your listings')
  })
})

describe('no second message while one is unanswered', () => {
  it("a partner's message is not drafted while our last letter waits for their answer; it is once they answer", async () => {
    const sent: Row = {
      id: 'perm-1', contact_id: 'c1', purpose: 'cadence', step: 1, template_id: 'tpl-perm', comms_category: 'PERM', context_key: 'event:E1',
      state: 'sent', sent_at: '2026-11-24T20:00:00Z', scheduled_for: '2026-11-24T20:00:00Z', subject: 'Your night', body: COLD_BODY,
    }
    const open = fakeOutreachDb(world({ outreach_touches: [sent] }))
    expect(await draft(open.db, 'tpl-featured', 'relationship', 'kit:k1')).toMatchObject({ state: 'held by policy', rule: 'open' })
    expect((open.tables.outreach_touches ?? []).filter((r) => r.id !== 'perm-1')).toHaveLength(0)
    const answered = fakeOutreachDb(world({ outreach_touches: [sent], outreach_replies: [{ id: 'r1', contact_id: 'c1', outcome: 'yes', received_at: '2026-11-25T01:00:00Z' }] }))
    expect((await draft(answered.db, 'tpl-featured', 'relationship', 'kit:k1')).state).toBe('done')
  })
})
