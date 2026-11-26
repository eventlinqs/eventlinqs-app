import { beforeEach, describe, expect, it } from 'vitest'
import { fakeOutreachDb as fakeDb, type Row, type Tables } from '../../helpers/outreach-db-fake'

/*
 * THE SENDER READS A LAW 49 LETTER'S NIGHT FROM ITS OWN CONTEXT (26 November 2026, read on production at 06:00 and 08:06:
 * The JazzLab's photo request was set aside at send with 'it names no night of theirs to check the timing against', and
 * law 49's clock drafted it again at 06:15). Lawal's approved photo request of 22 November (lifecycle_perm version 2)
 * names its night in words and carries no /events/ link, and the sender read the night from that link alone, so no
 * version 2 request had ever gone. The night is now read from the letter's context ('event:<events.id>', as the plays
 * write it) first, then from its link; the clock's own rule (never inside T-7) still decides.
 */

const { runOutreachSender, clearRecordedOutreachMail, recordedOutreachMail } = await import('@/lib/outreach/sender')

const fakeOutreachDb = (t: Tables) => fakeDb(t, { outreach_close_stuck_sends: () => 0 })
const ORIGIN = 'https://www.eventlinqs.com.au'
const MON_6 = new Date('2026-11-22T19:00:00Z') // Monday 23 November 2026, 06:00 in Melbourne
const NIGHT_FAR = '0a1b2c3d-0000-4000-8000-000000000001'
const NIGHT_NEAR = '0a1b2c3d-0000-4000-8000-000000000002'
// The version 2 words: the night by name and day, no link to it.
const V2 = `Hi Jazz team,\n\nWe're featuring upcoming Melbourne events on EventLinqs and have included Transients on Monday 30 November.\n\nKind regards,\nLawal Adams\n\n${ORIGIN}/unsubscribe/outreach?t=x`

function world(night: string): Tables {
  return {
    organisers: [{ id: 'o1', name: 'Jazz Room', organisation_id: null }],
    organiser_contacts: [{ id: 'c1', organiser_id: 'o1', address: 'jazz@eventlinqs.com', channel: 'email', basis: 'conspicuous_publication', unsubscribe_token: 't1', person_name: null }],
    outreach_templates: [{ id: 'tpl-perm-v2', key: 'lifecycle_perm', version: 2, channel: 'email', purpose: 'cadence', step: 1, subject: 'Promoting Transients on EventLinqs', body: V2 }],
    outreach_touches: [{
      id: 'q-perm', contact_id: 'c1', purpose: 'cadence', step: 1, template_id: 'tpl-perm-v2', comms_category: 'PERM', comms_subtype: 'PERM-IMAGE',
      context_key: `event:${night}`, state: 'queued', provider: 'graph', scheduled_for: MON_6.toISOString(), subject: 'Promoting Transients on EventLinqs', body: V2, in_reply_to: null, sent_at: null,
    }],
    outreach_replies: [],
    outreach_unsubscribes: [],
    outreach_delivery_events: [],
    outreach_sender: [{ id: true, mode: 'test', from_address: 'hello@eventlinqs.com', test_domain: 'eventlinqs.com', send_days: null, send_from_minute: null, send_until_minute: null }],
    organiser_venues: [],
    events: [
      { id: NIGHT_FAR, slug: 'transients-far', start_date: '2026-12-12T09:00:00Z', end_date: null, status: 'published', timezone: 'Australia/Melbourne' },
      { id: NIGHT_NEAR, slug: 'transients-near', start_date: '2026-11-26T09:00:00Z', end_date: null, status: 'published', timezone: 'Australia/Melbourne' },
    ],
  }
}

const touch = (t: Tables): Row => (t.outreach_touches ?? []).find((r) => r.id === 'q-perm') as Row

beforeEach(() => clearRecordedOutreachMail())

describe('a version 2 photo request, its night named by its context alone', () => {
  it('goes while its night is more than a week ahead: never set aside for carrying no link', async () => {
    const { db, tables } = fakeOutreachDb(world(NIGHT_FAR))
    await runOutreachSender(db, { now: MON_6, origin: ORIGIN, graph: null })
    expect(touch(tables).void_reason ?? null).toBeNull()
    expect(touch(tables).state).toBe('sent')
    expect(recordedOutreachMail()).toHaveLength(1)
  })

  it('is set aside by the clock inside its final week, with the clock\'s reason, never for a missing link', async () => {
    const { db, tables } = fakeOutreachDb(world(NIGHT_NEAR))
    await runOutreachSender(db, { now: MON_6, origin: ORIGIN, graph: null })
    expect(recordedOutreachMail()).toHaveLength(0)
    expect(String(touch(tables).void_reason ?? touch(tables).held_because ?? '')).toMatch(/inside its final week/)
    expect(String(touch(tables).void_reason ?? '')).not.toMatch(/names no night/)
  })
})
