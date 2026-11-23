import { describe, expect, it, vi } from 'vitest'
import { fakeOutreachDb, type Tables } from '../../helpers/outreach-db-fake'
import { SOURCE_ASK_EMAIL } from '@/lib/outreach/source-asks'

/*
 * ONE FIRST LETTER PER ORGANISATION, BEFORE A PLAY DRAFTS IT (the coordinator's order of 23 November 2026, train seven).
 *
 * THE CASE. At 22:13 on 23 November the source asks were loaded to production. The loader refused the City of Ballarat's
 * letter, quoted: "not drafted: already written to or replied at balc@ballarat.vic.gov.au (one first letter per
 * organisation: src/lib/outreach/one-first-letter.ts)". At 22:15 the engine's own outreach run (planPlays, the play
 * 'Source asks, 23 November 2026') drafted it anyway, to marketing@ballarat.vic.gov.au, because a play's first letter
 * drafter read the contact policy (by organiser) and never the one first letter rule (by organiser AND by address
 * domain), which only the sender read. The sender would have refused it at send; it should never have been drafted.
 *
 * These drive the real planner and the real drafter against the in-memory fake (tests/helpers/outreach-db-fake.ts).
 */
vi.mock('@/lib/outreach/facts', () => ({ factsForContact: vi.fn(async () => ({})) }))

const { planPlays } = await import('@/lib/outreach/planner')
const { draftFromTemplate } = await import('@/lib/outreach/drafts')

const ORIGIN = 'https://www.eventlinqs.com.au'
// 22:15 in Melbourne on Monday 23 November 2026, the run that drafted the fifth letter.
const RUN = new Date('2026-11-23T11:15:00Z')
const contact = (id: string, organiser: string, address: string, created = '2026-11-23T11:13:00Z') => ({
  id, organiser_id: organiser, address, channel: 'email', basis: 'conspicuous_publication', unsubscribe_token: `00000000-0000-4000-8000-${id.padStart(12, '0').slice(-12)}`, person_name: null, created_at: created,
})
const sent = (id: string, contactId: string, at: string) => ({
  id, contact_id: contactId, purpose: 'cadence', step: 1, template_id: 'tpl-old', comms_category: 'ACQ', comms_subtype: 'ACQ-FIRST', context_key: null,
  state: 'sent', sent_at: at, scheduled_for: at, subject: 'Complimentary EventLinqs listing', body: 'Hi team,', internet_message_id: `<${id}@eventlinqs.com>`,
})

function world(extra: Partial<Tables> = {}): Tables {
  return {
    outreach_plays: [{
      id: 'fb64eece-4b4e-4270-a0b1-7c07f7481c54', name: 'Source asks, 23 November 2026', state: 'approved',
      cohort_rule: { organisers: ['o-city', 'o-geelong'] }, step1_template_id: 'tpl-src', step2_template_id: null, step3_template_id: null, variant_template_id: null, test_per_half: null,
    }],
    outreach_templates: [
      { id: 'tpl-src', key: 'source_ask', version: 1, channel: 'email', purpose: 'cadence', step: 1, subject: SOURCE_ASK_EMAIL.subject, body: SOURCE_ASK_EMAIL.body },
      { id: 'tpl-old', key: 'acq_first', version: 2, channel: 'email', purpose: 'cadence', step: 1, subject: 'Complimentary EventLinqs listing for [organiser]', body: 'Hi [organiser] team,' },
    ],
    organisers: [
      { id: 'o-city', name: 'City of Ballarat', organisation_id: null, is_test: false },
      { id: 'o-balc', name: 'Ballarat Aquatic and Lifestyle Centre', organisation_id: null, is_test: false },
      { id: 'o-geelong', name: 'City of Greater Geelong Event Services', organisation_id: null, is_test: false },
    ],
    organiser_contacts: [
      // The address the loader wrote for the City of Ballarat, whose letter it refused.
      contact('c-city', 'o-city', 'marketing@ballarat.vic.gov.au'),
      // Another organiser at the same organisation domain, written to before.
      contact('c-balc', 'o-balc', 'balc@ballarat.vic.gov.au', '2026-11-01T00:00:00Z'),
      // CONTROL: an organiser in the same cohort at a domain never written to.
      contact('c-geelong', 'o-geelong', 'events@geelongcity.vic.gov.au'),
    ],
    outreach_touches: [sent('t-balc', 'c-balc', '2026-11-05T20:00:00Z')],
    outreach_replies: [],
    outreach_unsubscribes: [],
    outreach_delivery_events: [],
    organisations: [],
    organiser_venues: [],
    ...extra,
  }
}

const run = (t: Tables) => {
  const { db, tables } = fakeOutreachDb(t, { outreach_play_cap_today: () => 5 })
  return { tables, reports: planPlays(db, { now: RUN, origin: ORIGIN, actingUser: 'u1' }) }
}
const drafted = (t: Tables, contactId: string) => (t.outreach_touches ?? []).filter((r) => r.contact_id === contactId && r.state !== 'void')

describe("a play's first letter, one per organisation, as the sender reads it", () => {
  it('a play whose cohort holds a contact whose organisation was written to at another address drafts no letter for it', async () => {
    const { tables, reports } = run(world())
    const [report] = await reports
    expect(drafted(tables, 'c-city')).toEqual([])
    expect(report.refused).toEqual([{ contactId: 'c-city', why: expect.stringContaining('already written at balc@ballarat.vic.gov.au') }])
    // CONTROL: the other organiser in the cohort, at a domain never written to, is still drafted.
    expect(drafted(tables, 'c-geelong')).toHaveLength(1)
  })

  it('an organisation that has replied at another address gets no first letter either', async () => {
    const { tables, reports } = run(world({ outreach_touches: [], outreach_replies: [{ id: 'r1', contact_id: 'c-balc', outcome: 'question', received_at: '2026-11-20T01:00:00Z', wording: null, objection: null }] }))
    const [report] = await reports
    expect(drafted(tables, 'c-city')).toEqual([])
    expect(report.refused).toEqual([{ contactId: 'c-city', why: expect.stringContaining('they have replied (balc@ballarat.vic.gov.au') }])
  })

  it('a letter already queued to another address of the organisation counts as written: the first to go holds the other', async () => {
    const queued = { ...sent('t-balc', 'c-balc', '2026-11-23T19:00:00Z'), state: 'queued', sent_at: null }
    const { tables, reports } = run(world({ outreach_touches: [queued] }))
    const [report] = await reports
    expect(drafted(tables, 'c-city')).toEqual([])
    expect(report.refused.map((r) => r.contactId)).toEqual(['c-city'])
  })

  it('CONTROL: with nothing written to its organisation, the same contact is drafted', async () => {
    const { tables, reports } = run(world({ outreach_touches: [] }))
    const [report] = await reports
    expect(report.refused).toEqual([])
    expect(drafted(tables, 'c-city')).toHaveLength(1)
  })
})

describe('every first letter is drafted through the one drafter, which reads the rule (one defect is a class)', () => {
  it('the drafter itself refuses a first letter to an organisation written at another address', async () => {
    const { db, tables } = fakeOutreachDb(world())
    const base = { contactId: 'c-city', templateKey: 'source_ask', templateId: 'tpl-src', scheduledFor: RUN, origin: ORIGIN, draftedBy: 'u1' }
    const first = await draftFromTemplate(db, { ...base, purpose: 'cadence', step: 1, contextKey: 'play:fb64eece-4b4e-4270-a0b1-7c07f7481c54' })
    expect(first).toEqual({ state: 'refused', reason: expect.stringContaining('one first letter per organiser') })
    expect(drafted(tables, 'c-city')).toEqual([])
  })

  it("the play's own first letters, segment A's, law 49's and the twenty all draft through draftFromTemplate", async () => {
    const { readFileSync } = await import('node:fs')
    for (const file of ['planner.ts', 'segment-a-play.ts', 'lifecycle-play.ts', 'twenty-drafts.ts']) {
      expect(readFileSync(`src/lib/outreach/${file}`, 'utf8'), file).toMatch(/draftFromTemplate\(db,/)
    }
    // The only other writer of a touch, the CRM's draftTouch, reads the same rule.
    expect(readFileSync('src/lib/outreach/crm.ts', 'utf8')).toMatch(/readFirstLetterRecord\(db, \{ contactId: input\.contactId \}, FIRST_LETTER_WRITTEN\)/)
  })
})
