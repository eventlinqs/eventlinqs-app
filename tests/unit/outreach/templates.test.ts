import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { LAWAL_SIGNATURE, renderTemplate, type TemplateRow } from '@/lib/outreach/rules'

/**
 * THE TEMPLATE ROWS (scripts/ops/data/outreach-templates-28oct.json, written to outreach_templates by
 * scripts/ops/outreach-templates.mjs) against the messages file's rules. Every text, filled from facts, must pass every
 * rule, or it would be held for ever and the play would send nothing; and one missing fact must hold it.
 */

type Row = TemplateRow & { key: string; message: string }
const data = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/data/outreach-templates-28oct.json'), 'utf8')) as { templates: Row[] }

const FACTS: Record<string, string> = {
  'first name': 'Sam',
  venue: 'The Brewpub',
  referrer: 'Pat',
  nights: 'Saturday live nights',
  night: 'Saturday live night',
  'night type': 'Live music',
  gigs: 'Saturday gigs',
  gig: 'gig',
  city: 'Ballarat',
  'true line': 'A live act in the brewpub every Saturday with free entry, right through to December, is exactly the kind of night that gets Ballarat out of the house.',
  'short true line': 'Saturday live acts in the brewpub, free entry',
  'claim link': 'https://www.eventlinqs.com.au/claim/abc',
  'listing link': 'https://www.eventlinqs.com.au/events/brewpub-saturday',
  link: 'https://www.eventlinqs.com.au/organisers/submit',
  'thread subject': "The Brewpub's Saturday live nights, could I ask you something?",
  day: 'Thursday',
  'feed image': 'https://www.eventlinqs.com.au/kit/feed.png',
  'story version': 'https://www.eventlinqs.com.au/kit/story.png',
  caption: 'Saturday live at The Brewpub, free entry',
  'tracked link': 'https://www.eventlinqs.com.au/s/brew01',
  views: '42',
  clicks: '9',
  'share clicks': '3',
  provider: 'Humanitix',
}
const UNSUB = 'https://www.eventlinqs.com.au/unsubscribe/outreach?c=tok'

describe('every template row passes every rule once filled from facts', () => {
  test.each(data.templates.map((t) => [t.key, t] as const))('%s', (_key, t) => {
    const r = renderTemplate(t, FACTS, t.channel === 'email' ? UNSUB : null)
    expect(r.heldBecause).toEqual([])
    expect(r.body.startsWith('Hi ')).toBe(true)
    if (t.channel === 'email') {
      expect(r.body).toContain(LAWAL_SIGNATURE)
      expect(r.body).toContain(UNSUB)
    }
  })
})

test('the keys are unique and cover the eleven messages and the stored replies', () => {
  const keys = data.templates.map((t) => t.key)
  expect(new Set(keys).size).toBe(keys.length)
  expect(keys).toEqual(expect.arrayContaining(['first_invitation', 'who_looks_after_events', 'first_dm', 'day4_follow_up', 'day4_dm', 'day10_close', 'thank_you', 'featured', 'after_your_night', 'anything_coming_up', 'withdrawal_confirmed', 'reply_stop', 'reply_take_down']))
})

test('a missing fact holds the message and names the field', () => {
  const first = data.templates.find((t) => t.key === 'first_invitation') as Row
  const r = renderTemplate(first, { ...FACTS, 'true line': '' }, UNSUB)
  expect(r.heldBecause).toEqual(['a field could not be filled from verified facts: [true line]'])
})

test('a contact with no first name cannot take message 1; the general inbox takes 1b', () => {
  const first = data.templates.find((t) => t.key === 'first_invitation') as Row
  const inbox = data.templates.find((t) => t.key === 'who_looks_after_events') as Row
  const facts = { ...FACTS, 'first name': '' }
  expect(renderTemplate(first, facts, UNSUB).heldBecause[0]).toContain('[first name]')
  expect(renderTemplate(inbox, facts, UNSUB).heldBecause).toEqual([])
})
