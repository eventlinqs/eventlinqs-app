import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DRAFT_PLAY_HOLD, VENUE_ASK_DM, VENUE_ASK_EMAIL, VENUE_PHOTO_ASK, draftVenueAsk, type VenueAsk } from '@/lib/outreach/venue-asks'
import { DM_SIGN_OFF, LAWAL_SIGNATURE } from '@/lib/outreach/rules'

// D7, the venue partnership asks: twelve venues from window 3's research, each written in Lawal's format and judged by
// every rule of the messages file; each draft held because its play is a draft; a venue with no address read on its
// own pages gets no draft and says why.

const data = JSON.parse(readFileSync('scripts/ops/data/venue-asks-30oct.json', 'utf8')) as { asks: VenueAsk[]; seenOn: string }
const UNSUB = 'https://www.eventlinqs.com.au/unsubscribe/outreach?t=0123456789abcdef0123456789abcdef'
const drafts = data.asks.map((a) => draftVenueAsk(a, UNSUB))

describe('the D7 venue asks', () => {
  it('cover the twelve venues of window 3\'s research, each once', () => {
    expect(data.asks).toHaveLength(12)
    expect(new Set(data.asks.map((a) => a.organiser)).size).toBe(12)
    const addresses = data.asks.flatMap((a) => (a.contact ? [a.contact.address] : []))
    expect(new Set(addresses).size).toBe(addresses.length)
  })

  it('draft ten, eight by email and two by DM, and say why the other two have none', () => {
    const drafted = drafts.filter((d) => d.state === 'drafted')
    expect(drafted).toHaveLength(10)
    expect(drafted.filter((d) => d.state === 'drafted' && d.channel === 'email')).toHaveLength(8)
    expect(drafted.filter((d) => d.state === 'drafted' && d.channel === 'dm')).toHaveLength(2)
    const none = drafts.filter((d) => d.state === 'no_draft')
    expect(none.map((d) => d.organiser).sort()).toEqual(['The Capital, Bendigo', 'The University of Melbourne events'])
    for (const d of none) if (d.state === 'no_draft') expect(d.reason.length).toBeGreaterThan(40)
  })

  it('pass every rule of the messages file, so the only hold is the draft play', () => {
    for (const d of drafts) {
      if (d.state !== 'drafted') continue
      expect(d.ruleFailures, d.organiser).toEqual([])
      expect(d.heldBecause).toEqual([DRAFT_PLAY_HOLD])
    }
  })

  it('open "Hi <venue> team,", ask exactly one question, and never introduce Lawal', () => {
    for (const d of drafts) {
      if (d.state !== 'drafted') continue
      const venue = data.asks.find((a) => a.organiser === d.organiser)?.venue
      expect(d.body.startsWith(`Hi ${venue} team,`), d.organiser).toBe(true)
      const content = d.channel === 'email' ? d.body.split('\nKind regards,')[0] : d.body.split(`\n${DM_SIGN_OFF}`)[0]
      expect((content.match(/\?/g) ?? []).length, d.organiser).toBe(1)
      expect(d.body).not.toMatch(/I'm Lawal|I run EventLinqs|we're new/i)
    }
  })

  // The project manager's 16:42 of 30 October 2026: D7's venue asks gain "send us 3 photos of your venue, with your yes".
  // A statement, not a second question, so each email still asks exactly one; the DM stays short and does not carry it.
  it('ask each email\'s venue for three photos of it with their yes, without a second question', () => {
    for (const d of drafts) {
      if (d.state !== 'drafted' || d.channel !== 'email') continue
      expect(d.body, d.organiser).toContain(VENUE_PHOTO_ASK)
      expect(VENUE_PHOTO_ASK).not.toContain('?')
    }
  })

  it('close each email with Lawal\'s full signature and the contact\'s own unsubscribe link, and each DM with his sign-off', () => {
    for (const d of drafts) {
      if (d.state !== 'drafted') continue
      if (d.channel === 'email') {
        expect(d.body).toContain(LAWAL_SIGNATURE)
        expect(d.body).toContain(UNSUB)
        expect(d.subject?.length).toBeGreaterThan(3)
      } else {
        expect(d.body.endsWith(DM_SIGN_OFF)).toBe(true)
        expect(d.subject).toBeNull()
      }
    }
  })

  it('record where every new address was read, the role it is published for and why the ask fits it', () => {
    expect(data.seenOn).toBe('2026-10-30')
    for (const a of data.asks) {
      if (!a.contact || a.contact.existing) continue
      expect(a.contact.channel).toBe('email')
      expect(a.contact.publishedOn).toMatch(/^https:\/\//)
      expect(a.contact.role?.length).toBeGreaterThan(3)
      expect(a.contact.relevance?.length).toBeGreaterThan(20)
    }
  })

  it('hold a draft whose fact is missing, naming the field, rather than send a stand-in', () => {
    const ask = data.asks.find((a) => a.contact?.channel === 'email') as VenueAsk
    const d = draftVenueAsk({ ...ask, trueLine: undefined }, UNSUB)
    expect(d.state).toBe('drafted')
    if (d.state === 'drafted') expect(d.ruleFailures.join(' ')).toMatch(/true line/)
  })

  it('carry the two templates in the format the database stores', () => {
    expect(VENUE_ASK_EMAIL).toMatchObject({ key: 'venue_ask', channel: 'email', purpose: 'cadence', step: 1 })
    expect(VENUE_ASK_DM).toMatchObject({ key: 'venue_ask_dm', channel: 'dm', purpose: 'cadence', step: 1, subject: null })
  })
})
