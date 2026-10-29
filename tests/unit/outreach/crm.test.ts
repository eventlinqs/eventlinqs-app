import { describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  OUTREACH_UNSUBSCRIBE_URL,
  basisProblems,
  logReply,
  markSent,
  messageProblems,
  nextDueOn,
  normaliseContactAddress,
  recordContact,
  refusalFromError,
} from '@/lib/outreach/crm'

/**
 * THE ORGANISER CRM's helpers (src/lib/outreach/crm.ts). The database is the judge of every send; these say the same
 * thing earlier, so the tests pin them to the migration's own rules (20261028201001_organiser_crm.sql), and pin that a
 * refusal reaches Lawal in the database's words rather than as a generic failure. The database refusals themselves are
 * proved on TEST with raw SQL: C:\dev\EVIDENCE\CRM-28OCT\crm-GREEN.txt.
 */

const body = `Hi, I am Lawal from EventLinqs. Your night could be listed free. Unsubscribe: ${OUTREACH_UNSUBSCRIBE_URL}`

describe('the address, in the one spelling the database takes', () => {
  test('an email is trimmed and lower cased', () => {
    expect(normaliseContactAddress('email', '  Bookings@Venue.COM.au ')).toEqual({ ok: true, address: 'bookings@venue.com.au' })
  })
  test('an Instagram handle loses its @ or profile URL', () => {
    expect(normaliseContactAddress('instagram', '@Geelong.Comedy')).toEqual({ ok: true, address: 'geelong.comedy' })
    expect(normaliseContactAddress('instagram', 'https://www.instagram.com/geelongcomedyfestival/')).toEqual({ ok: true, address: 'geelongcomedyfestival' })
  })
  test('a form or page must be https', () => {
    expect(normaliseContactAddress('website_form', 'http://venue.example/contact').ok).toBe(false)
    expect(normaliseContactAddress('facebook', 'https://facebook.com/venue').ok).toBe(true)
  })
  test('not an address is refused before the database', () => {
    expect(normaliseContactAddress('email', 'bookings at venue')).toEqual({ ok: false, problem: 'That is not an email address.' })
  })
})

describe('a published address is never a basis by itself', () => {
  const whole = {
    basis: 'conspicuous_publication' as const,
    publishedOnUrl: 'https://venue.example/contact',
    seenOn: '2026-10-28',
    noMarketingStatementChecked: true,
    relevance: 'Books the acts for the weekly night.',
  }
  test('all three tests recorded is whole', () => {
    expect(basisProblems(whole)).toEqual([])
  })
  test('the no-messages statement unchecked is not whole', () => {
    expect(basisProblems({ ...whole, noMarketingStatementChecked: false })).toEqual(['A check that the page says nothing against receiving messages.'])
  })
  test('no relevance to their role is not whole', () => {
    expect(basisProblems({ ...whole, relevance: 'yes' })).toEqual(['Why the message fits their role, in a sentence.'])
  })
  test('no page and no date are both named', () => {
    expect(basisProblems({ ...whole, publishedOnUrl: null, seenOn: null })).toHaveLength(2)
  })
  test('no basis means nothing may be sent', () => {
    expect(basisProblems({ basis: 'none' })).toEqual(['No basis is recorded, so nothing may be sent.'])
  })
  test('express consent needs their words and the date', () => {
    expect(basisProblems({ basis: 'express_consent', consentWording: 'Yes, keep me posted about EventLinqs.', seenOn: '2026-10-23' })).toEqual([])
    expect(basisProblems({ basis: 'express_consent', consentWording: 'ok' })).toHaveLength(2)
  })
})

describe('sections 17 and 18 on every message', () => {
  test('an email with the link, a subject and EventLinqs named passes', () => {
    expect(messageProblems('email', 'Your night on EventLinqs', body)).toEqual([])
  })
  test('an email without the unsubscribe link is named', () => {
    expect(messageProblems('email', 'Hello', 'Hi, I am Lawal from EventLinqs. Your night could be listed free.')).toEqual([
      `An email must carry the unsubscribe link ${OUTREACH_UNSUBSCRIBE_URL}.`,
    ])
  })
  test('a message by hand may say reply STOP instead of the link', () => {
    expect(messageProblems('instagram', null, 'Hi from EventLinqs, your open mic could be listed free. Reply STOP and we will not message again.')).toEqual([])
    expect(messageProblems('instagram', null, 'Hi from EventLinqs, your open mic could be listed free on EventLinqs.')).toEqual([
      'A message by hand must carry the unsubscribe link or a reply STOP line.',
    ])
  })
  test('a message that does not name EventLinqs is named', () => {
    expect(messageProblems('email', 'Hello', `Hi, I am Lawal. Unsubscribe: ${OUTREACH_UNSUBSCRIBE_URL}`)).toContain('The message must name EventLinqs as its sender.')
  })
})

describe('the cadence: day 0, 4 and 10, then stop', () => {
  test('after step 1 the next is due on day 4', () => {
    expect(nextDueOn('2026-10-28', 1)).toBe('2026-11-01')
  })
  test('after step 2 the last is due on day 10, counted from step 1', () => {
    expect(nextDueOn('2026-10-28', 2)).toBe('2026-11-07')
  })
  test('after step 3 nothing is due', () => {
    expect(nextDueOn('2026-10-28', 3)).toBeNull()
  })
  test('across a month end', () => {
    expect(nextDueOn('2026-10-30', 2)).toBe('2026-11-09')
  })
})

describe('a refusal reaches Lawal in the database\'s words', () => {
  test('the trigger\'s own sentence', () => {
    expect(refusalFromError({ message: 'refused: proof@venue.example asked to stop on 28 Oct 2026.' })).toBe('proof@venue.example asked to stop on 28 Oct 2026.')
  })
  test('a constraint named plainly', () => {
    expect(refusalFromError({ message: 'duplicate key value violates unique constraint "organisers_one_per_name"' })).toBe('That organiser is already recorded under the same name.')
  })
  test('anything else is passed through, never hidden', () => {
    expect(refusalFromError({ message: 'permission denied for table organisers' })).toBe('permission denied for table organisers')
  })
})

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] }

/** A client that records what was asked and answers with the given result. */
function fakeClient(answer: { data: unknown; error: { message: string } | null }) {
  const calls: Call[] = []
  const chain = (call: Call) => {
    const q = {
      select: () => q,
      single: async () => answer,
      eq: (col: string, val: unknown) => {
        call.filters.push([col, val])
        return q
      },
    }
    return q
  }
  const client = {
    from: (table: string) => ({
      insert: (payload: unknown) => {
        const call = { table, op: 'insert', payload, filters: [] }
        calls.push(call)
        return chain(call)
      },
      update: (payload: unknown) => {
        const call = { table, op: 'update', payload, filters: [] }
        calls.push(call)
        return chain(call)
      },
    }),
  }
  return { db: client as unknown as SupabaseClient<Database>, calls }
}

describe('the store', () => {
  test('a contact with a whole basis records who recorded it and when', async () => {
    const { db, calls } = fakeClient({ data: { id: 'c1' }, error: null })
    const done = await recordContact(db, {
      organiserId: 'o1', role: 'Bookings', channel: 'email', address: ' Bookings@Venue.example ', recordedBy: 'u1',
      basis: 'conspicuous_publication', publishedOnUrl: 'https://venue.example/contact', seenOn: '2026-10-28',
      noMarketingStatementChecked: true, relevance: 'Books the acts for the weekly night.',
    })
    expect(done).toEqual({ state: 'done', value: { id: 'c1' } })
    const row = calls[0].payload as Record<string, unknown>
    expect(row.address).toBe('bookings@venue.example')
    expect(row.basis_recorded_by).toBe('u1')
    expect(typeof row.basis_recorded_at).toBe('string')
  })
  test('a contact with no basis records no basis author', async () => {
    const { db, calls } = fakeClient({ data: { id: 'c2' }, error: null })
    await recordContact(db, { organiserId: 'o1', role: 'General inbox', channel: 'email', address: 'hello@venue.example', recordedBy: 'u1', basis: 'none' })
    const row = calls[0].payload as Record<string, unknown>
    expect(row.basis_recorded_by).toBeNull()
    expect(row.basis_recorded_at).toBeNull()
  })
  test('a malformed address never reaches the database', async () => {
    const { db, calls } = fakeClient({ data: null, error: null })
    expect(await recordContact(db, { organiserId: 'o1', role: 'Owner', channel: 'email', address: 'nope', recordedBy: 'u1', basis: 'none' })).toEqual({
      state: 'refused', reason: 'That is not an email address.',
    })
    expect(calls).toHaveLength(0)
  })
  test('marking sent only moves a held draft, and a refusal comes back in words', async () => {
    const { db, calls } = fakeClient({ data: null, error: { message: 'refused: step 2 is due from day 4, this is day 1.' } })
    expect(await markSent(db, { touchId: 't1', sentAt: '2026-10-29T00:00:00Z', sentBy: 'u1' })).toEqual({
      state: 'refused', reason: 'step 2 is due from day 4, this is day 1.',
    })
    expect(calls[0].filters).toEqual([['id', 't1'], ['state', 'held']])
  })
  test('a reply is written verbatim with its outcome', async () => {
    const { db, calls } = fakeClient({ data: { id: 'r1' }, error: null })
    await logReply(db, { contactId: 'c1', receivedAt: '2026-10-30T01:00:00Z', wording: 'Please take us off your list.', outcome: 'stop', loggedBy: 'u1' })
    expect(calls[0]).toMatchObject({ table: 'outreach_replies', op: 'insert', payload: { wording: 'Please take us off your list.', outcome: 'stop', touch_id: null } })
  })
})
