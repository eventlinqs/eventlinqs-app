import { describe, expect, it } from 'vitest'
import { newestDraftByContact, twentyView } from '@/lib/outreach/twenty-view'
import type { DailyTwenty } from '@/lib/outreach/daily-twenty'
import type { QueueTouch } from '@/lib/outreach/daily-queue-math'

/*
 * TOMORROW'S TWENTY ON THE COMMAND CENTRE (Lawal, 12 November 2026, 11:11): each of the day's organisers beside the
 * recorded basis of their contact and the newest held draft written to it; none of it decides who or what, it only puts
 * the daily twenty and the held drafts side by side.
 */
const action = (organiserId: string, contactId: string | null) => ({
  organiserId, organiserName: organiserId, group: 'conversion' as const, score: 50, city: 'melbourne', contactId,
  why: 'test', channel: 'email', address: `${organiserId}@example.com.au`, sender: 'lawal@eventlinqs.com',
})
const touch = (touchId: string, contactId: string | undefined, draftedAt: string): QueueTouch => ({
  touchId, contactId, step: 1, purpose: 'first_contact', heldBecause: [], refusal: null, voiceProblems: [], contentHash: '0123456789abcdef',
  subject: 'Your next event, could I ask your advice?', body: 'Hi team,', trackedLink: null, draftedAt, channel: 'email', address: 'a@example.com.au', organiserName: 'A',
})
const day = (actions: ReturnType<typeof action>[]): DailyTwenty => ({
  groups: [{ key: 'conversion', words: 'Conversion asks', size: 5, actions, short: 5 - actions.length }],
  socialFirstTouches: [],
  research: [],
  duplicatesDropped: 0,
})

describe('the twenty with each basis and draft', () => {
  it('takes the newest held draft per contact, and none for a touch with no contact', () => {
    const m = newestDraftByContact([touch('t1', 'c1', '2026-11-11T01:00:00Z'), touch('t2', 'c1', '2026-11-12T01:00:00Z'), touch('t3', undefined, '2026-11-12T02:00:00Z')])
    expect([...m.entries()].map(([c, t]) => [c, t.touchId])).toEqual([['c1', 't2']])
  })
  it('puts each organiser beside its contact basis and draft, and counts the drafted', () => {
    const v = twentyView(
      day([action('o1', 'c1'), action('o2', 'c2'), action('o3', null)]),
      new Map([['c1', { basis: 'conspicuous_publication', basisRecordedAt: '2026-11-01T00:00:00Z', publishedOn: 'https://example.com.au/contact', relevance: 'runs a monthly night' }]]),
      new Map([['c1', touch('t1', 'c1', '2026-11-12T01:00:00Z')]]),
    )
    expect(v.total).toBe(3)
    expect(v.drafted).toBe(1)
    expect(v.groups[0].rows.map((r) => [r.action.organiserId, r.contact?.basis ?? null, r.draft?.touchId ?? null])).toEqual([
      ['o1', 'conspicuous_publication', 't1'],
      ['o2', null, null],
      ['o3', null, null],
    ])
  })
})
