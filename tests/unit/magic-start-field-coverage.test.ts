import { describe, expect, it } from 'vitest'
import { buildDeterministicDraft, type MagicStartDraft } from '@/lib/ai/magic-start'
import { findCopyTells } from '@/lib/ai/copy-tells'
import { buildDraftPatch, summariseDraft } from '@/lib/events/magic-draft-apply'

/**
 * Field-coverage gate (defects C1 to C5).
 *
 * The founder's bar: every field arrives filled with something defensible, and
 * the organiser's job is subtraction and correction, never composition from a
 * blank field. A blank field is a failure of the tool.
 *
 * These tests run the DETERMINISTIC path on purpose. It is the floor beneath
 * every draft: whatever the model does or fails to do, this is what the
 * organiser is guaranteed. If the floor covers every field for six different
 * kinds of event, no organiser can meet an empty step 1.
 *
 * The final describe block proves the assertions are not vacuous by running
 * them against a deliberately blank draft and requiring them to fail.
 */

// The live taxonomy as read from TEST on 8 August 2026. Comedy is deliberately
// absent: that is the real list, and the tool must still always choose.
const LIVE_CATEGORIES = [
  'Music', 'Sports', 'Arts & Culture', 'Food & Drink', 'Business & Networking',
  'Education', 'Charity', 'Nightlife', 'Family', 'Technology', 'Religion',
  'Fashion', 'Health & Wellness', 'Community', 'Festival', 'Film', 'Other',
  'Pride', 'European', 'Middle Eastern', 'Pacific',
]

const LIVE_COMMUNITY_SLUGS = [
  'aboriginal-torres-strait-islander', 'african', 'caribbean', 'indian', 'chinese',
  'filipino', 'latin-american', 'vietnamese', 'lebanese-levantine', 'greek',
  'italian', 'korean', 'japanese', 'pacific-pasifika', 'maori', 'persian-iranian',
  'turkish', 'arab', 'other-south-asian', 'other-east-southeast-asian', 'other-european',
]

/** The six event types the brief requires, in the organiser's own words. */
const INPUTS: { label: string; text: string }[] = [
  {
    label: 'comedy night (the founder\'s exact first input)',
    text: 'Comedy night at The Pier Geelong on Friday 21 August, doors 7pm, show starts 8pm. Stand-up from four local acts. General admission $20, 80 tickets.',
  },
  {
    label: 'club night',
    text: 'Warehouse techno party at Sub Club Melbourne this Saturday, 10pm till 4am. Four DJs across the night, presale $30 and $40 on the door, 400 capacity.',
  },
  {
    label: 'market',
    text: 'Geelong night market at Johnstone Park on Friday 5 September, 5pm to 10pm. Forty food trucks and makers stalls, live acoustic sets, free entry.',
  },
  {
    label: 'workshop',
    text: 'Sourdough baking masterclass at The Mill Newtown on Saturday 12 September, 10am to 1pm. Twelve places only, $95 including a sourdough starter and lunch.',
  },
  {
    label: 'fundraiser',
    text: 'Charity gala dinner for Geelong Animal Rescue at The Pier on Saturday 3 October, 6.30pm. Three course dinner and a silent auction, $150 a head, tables of ten.',
  },
  {
    label: 'kids birthday party',
    text: 'Superhero sixth birthday party at Waurn Ponds Community Hall on Sunday 14 September, 10am to 12pm. Face painting, games and cake, $15 per child, 25 kids.',
  },
]

function draftFor(text: string): MagicStartDraft {
  return buildDeterministicDraft({
    description: text,
    categoryNames: LIVE_CATEGORIES,
    communitySlugs: LIVE_COMMUNITY_SLUGS,
  })
}

/**
 * The coverage contract. Extracted so the vacuity test below can run the exact
 * same assertions against a blank draft and prove they fail.
 */
function assertFieldCoverage(draft: MagicStartDraft) {
  // C3: a category is always chosen, and it is a real one.
  expect(draft.category).not.toBe('')
  expect(LIVE_CATEGORIES).toContain(draft.category)

  // C2: the listing line always exists, fits, and is a finished sentence.
  expect(draft.summary).not.toBe('')
  expect(draft.summary.length).toBeLessThanOrEqual(200)
  expect(draft.summary.trimEnd().endsWith('.')).toBe(true)

  // C2: it is its own copy, never the description cut short.
  if (draft.description) {
    const head = draft.description.slice(0, Math.min(60, draft.summary.length))
    expect(draft.summary.startsWith(head)).toBe(false)
  }

  // C4: tags are present, lowercase, deduplicated and usable.
  expect(draft.tags.length).toBeGreaterThanOrEqual(4)
  expect(draft.tags.length).toBeLessThanOrEqual(8)
  expect(new Set(draft.tags).size).toBe(draft.tags.length)
  for (const tag of draft.tags) {
    expect(tag).toBe(tag.toLowerCase())
    expect(tag.startsWith('#')).toBe(false)
    expect(tag.length).toBeGreaterThanOrEqual(3)
  }

  // C5: any community tick is a real slug. Empty is allowed and correct.
  for (const slug of draft.communities) {
    expect(LIVE_COMMUNITY_SLUGS).toContain(slug)
  }

  // The copy laws hold on everything generated here.
  expect(findCopyTells(draft.summary)).toEqual([])
  expect(draft.summary).not.toMatch(/[–—]/)
  expect(draft.summary).not.toContain('!')
}

describe('C2 to C5: every step 1 field is filled, for six kinds of event', () => {
  for (const { label, text } of INPUTS) {
    it(`fills every field for a ${label}`, () => {
      assertFieldCoverage(draftFor(text))
    })
  }

  it('never returns an empty category even for an event type the taxonomy does not name', () => {
    // Comedy has no category of its own in the live list. The tool must still
    // choose, because an unselected category is a blank field.
    const draft = draftFor(INPUTS[0]!.text)
    expect(draft.category).not.toBe('')
  })

  it('ticks a community only on an unmistakable signal, and never invents one', () => {
    const plain = draftFor(INPUTS[3]!.text) // sourdough workshop, no community signal
    expect(plain.communities).toEqual([])

    const signalled = buildDeterministicDraft({
      description: 'Afrobeats and amapiano night at The Wool Store Geelong, Friday 12 September, 9pm, $25.',
      categoryNames: LIVE_CATEGORIES,
      communitySlugs: LIVE_COMMUNITY_SLUGS,
    })
    expect(signalled.communities).toContain('african')
  })

  it('constrains communities to the live allowed list', () => {
    const draft = buildDeterministicDraft({
      description: 'Greek glendi with bouzouki at the Hellenic Hall, Saturday, $30.',
      categoryNames: LIVE_CATEGORIES,
      communitySlugs: ['african'], // greek deliberately not allowed here
    })
    expect(draft.communities).not.toContain('greek')
  })
})

describe('C1: the status message cannot contradict itself', () => {
  const ctx = {
    categories: LIVE_CATEGORIES.map((name, i) => ({ id: `cat-${i}`, name })),
    allowedCommunitySlugs: LIVE_COMMUNITY_SLUGS,
    newId: () => 'tier-id',
  }

  for (const { label, text } of INPUTS) {
    it(`filled and still-needed never overlap for a ${label}`, () => {
      const app = buildDraftPatch(draftFor(text), ctx)
      const summary = summariseDraft(app)
      const overlap = summary.filled.filter(f => summary.stillNeeded.includes(f))
      expect(overlap).toEqual([])
    })
  }

  it('reports a synthesised end time as assumed, never as filled and never as missing', () => {
    // The exact shape that produced the defect: a start with no stated end.
    const draft: MagicStartDraft = {
      ...draftFor(INPUTS[0]!.text),
      start_date: '2026-08-21T20:00',
      end_date: '',
    }
    const app = buildDraftPatch(draft, ctx)
    const summary = summariseDraft(app)

    expect(app.patch.end_date).toBe('2026-08-21T22:00')
    expect(summary.assumed.join(' ')).toContain('End time')
    expect(summary.filled).not.toContain('End')
    expect(summary.stillNeeded).not.toContain('End')
    expect(summary.stillNeeded.join(' ')).not.toContain('end time')
  })
})

describe('the coverage guard is not vacuous', () => {
  const BLANK: MagicStartDraft = {
    title: '', summary: '', description: '', category: '', tags: [], communities: [],
    start_date: '', end_date: '', event_type: 'in_person',
    venue_name: '', venue_address: '', venue_city: '', venue_state: '',
    venue_postal_code: '', is_free: false, ticket_tiers: [], unresolved: [],
  }

  it('fails when the category is blank', () => {
    expect(() => assertFieldCoverage({ ...draftFor(INPUTS[0]!.text), category: '' })).toThrow()
  })

  it('fails when the summary is blank', () => {
    expect(() => assertFieldCoverage({ ...draftFor(INPUTS[0]!.text), summary: '' })).toThrow()
  })

  it('fails when tags are blank', () => {
    expect(() => assertFieldCoverage({ ...draftFor(INPUTS[0]!.text), tags: [] })).toThrow()
  })

  it('fails when a community slug is not in the live list', () => {
    expect(() =>
      assertFieldCoverage({ ...draftFor(INPUTS[0]!.text), communities: ['not-a-community'] }),
    ).toThrow()
  })

  it('fails when the summary carries a banned pattern', () => {
    expect(() =>
      assertFieldCoverage({
        ...draftFor(INPUTS[0]!.text),
        summary: 'An unforgettable night of comedy awaits.',
      }),
    ).toThrow()
  })

  it('fails on an entirely blank draft', () => {
    expect(() => assertFieldCoverage(BLANK)).toThrow()
  })
})
