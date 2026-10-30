import { describe, expect, it } from 'vitest'
import { QUEUE_CHANNELS, buildDailyQueue, nextStepWords, notReady, openInApp, type QueueTouch } from '@/lib/outreach/daily-queue-math'

/*
 * LAWAL's DAILY OUTREACH QUEUE (the PROJECT MANAGER's 00:42 and 05:05, 31 October 2026). Every message he sends by hand
 * is a held touch in the CRM; the queue shows today's, channel by channel, never more than a channel's day allows, each
 * with the place to send it opened in its own app, and one press marks it sent (crm.ts markSent). Nothing here sends.
 */
const touch = (id: string, channel: QueueTouch['channel'], draftedAt: string, step = 1): QueueTouch => ({
  touchId: id,
  step,
  purpose: 'cadence',
  heldBecause: [],
  refusal: null,
  subject: null,
  body: `Hi team, a message ${id}`,
  trackedLink: null,
  draftedAt,
  channel,
  address: channel === 'instagram' ? 'kaze.ballarat' : channel === 'email' ? 'hello@venue.com.au' : 'https://venue.com.au/contact',
  organiserName: `Venue ${id}`,
})

describe('the daily queue', () => {
  it('shows each channel in a fixed order, oldest draft first', () => {
    const q = buildDailyQueue([touch('b', 'website_form', '2026-10-31T02:00:00Z'), touch('a', 'website_form', '2026-10-31T01:00:00Z'), touch('i', 'instagram', '2026-10-31T03:00:00Z')], {})
    expect(q.map((c) => c.channel)).toEqual([...QUEUE_CHANNELS])
    expect(q.find((c) => c.channel === 'website_form')?.today.map((t) => t.touchId)).toEqual(['a', 'b'])
  })

  it("never shows more than a channel's day allows, counting what was already sent today", () => {
    const many = Array.from({ length: 14 }, (_, i) => touch(`i${String(i).padStart(2, '0')}`, 'instagram', `2026-10-31T00:${String(i).padStart(2, '0')}:00Z`))
    const ig = buildDailyQueue(many, { instagram: 4 }).find((c) => c.channel === 'instagram')
    expect(ig?.cap).toBe(10)
    expect(ig?.left).toBe(6)
    expect(ig?.today).toHaveLength(6)
    expect(ig?.waiting).toBe(8)
  })

  it('a channel at its cap shows none today and says how many wait', () => {
    const fb = buildDailyQueue([touch('f', 'facebook', '2026-10-31T00:00:00Z')], { facebook: 10 }).find((c) => c.channel === 'facebook')
    expect(fb?.left).toBe(0)
    expect(fb?.today).toEqual([])
    expect(fb?.waiting).toBe(1)
  })
})

describe('open in its own app', () => {
  it("opens an Instagram account's own page, a Facebook Page and a form as they are, an email in the mail app", () => {
    expect(openInApp('instagram', 'kaze.ballarat')).toBe('https://www.instagram.com/kaze.ballarat/')
    expect(openInApp('facebook', 'https://www.facebook.com/fadgallerybar')).toBe('https://www.facebook.com/fadgallerybar')
    expect(openInApp('website_form', 'https://venue.com.au/contact')).toBe('https://venue.com.au/contact')
    expect(openInApp('email', 'hello@venue.com.au', 'Photos for your nights')).toBe('mailto:hello@venue.com.au?subject=Photos%20for%20your%20nights')
  })

  it('refuses an address that is not the shape its channel stores', () => {
    expect(openInApp('instagram', 'https://evil.example/x')).toBeNull()
    expect(openInApp('facebook', 'javascript:alert(1)')).toBeNull()
  })
})

describe('what follows a press of sent', () => {
  it('names the next message by the cadence the database keeps (day 0, 4, 10), and says when nothing follows', () => {
    expect(nextStepWords(1)).toBe('Follow up 1 is drafted 4 days after this is sent.')
    expect(nextStepWords(2)).toBe('Follow up 2 is drafted 6 days after this is sent.')
    expect(nextStepWords(3)).toBe('The last message: nothing follows it.')
  })
})

describe('ready to send', () => {
  it('a draft held for a reason, or with nowhere to open, is not ready, and says why', () => {
    expect(notReady(touch('ok', 'instagram', '2026-10-31T00:00:00Z'))).toEqual([])
    expect(notReady({ ...touch('h', 'instagram', '2026-10-31T00:00:00Z'), heldBecause: ['the no-messages statement is not checked'] })).toEqual(['the no-messages statement is not checked'])
    expect(notReady({ ...touch('x', 'facebook', '2026-10-31T00:00:00Z'), address: 'http://insecure.example' })).toEqual(['its address cannot be opened safely'])
  })
})

describe('suppression', () => {
  it('a contact the database refuses (a stop, an unsubscribe, a no) is never offered Sent, and says why first', () => {
    const t = { ...touch('s', 'instagram', '2026-10-31T00:00:00Z'), refusal: 'they asked us to stop', heldBecause: ['x'] }
    expect(notReady(t)).toEqual(['they asked us to stop', 'x'])
  })
})
