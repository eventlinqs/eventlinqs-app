import { describe, expect, test } from 'vitest'
import { extractListingBlock, pageLines, planWalkInDraft } from '@/lib/walk-in/list-draft'

/**
 * THE LISTING SCRIPT'S JUDGE (scripts/ops/list-walk-in-draft.mjs, for the AMCF
 * page): a data block passes only what the organiser form would let through,
 * and the founder's ruling of 23 October 12:21 holds, no "to confirm" anywhere.
 * The fixture is shaped like AMCF's block with neutral words; the real data is
 * window 5's and never lives in the repository.
 */

const day = (date: string, opens: string | null, closes: string, hours_label: string | null = null) => ({
  date,
  opens,
  closes,
  hours_label,
  items: [{ when: 'All day', what: 'Food stalls and markets open' }],
  closer: { name: 'A headline act', note: 'Main Stage' },
})

const block = (over: { event?: Record<string, unknown>; guide?: Record<string, unknown>; listing_source?: string } = {}) => ({
  listing_source: over.listing_source ?? 'organiser',
  organisation: { name: 'Riverside Drum Festival', slug: 'riverside-drum-festival', short_name: 'RDF', website: 'https://example.org', instagram_handle: null },
  event: {
    title: 'Riverside Drum Festival 2026',
    summary: 'Three days of drumming, food and music by the river. Free for everyone.',
    category_slug: 'festivals',
    start: ['2026-11-20', '11:00'],
    end: ['2026-11-22', '20:00'],
    timezone: 'Australia/Melbourne',
    venue_name: 'Fed Square',
    venue_address: 'Corner of Swanston and Flinders Streets',
    venue_city: 'Melbourne',
    venue_state: 'VIC',
    venue_latitude: -37.818,
    venue_longitude: 144.9691,
    city_primary: 'melbourne',
    cover: { file: 'cover.jpg', alt: 'Drummers on the main stage at dusk' },
    gallery: [{ file: 'crowd.jpg', alt: 'A crowd dancing in the square' }],
    ...over.event,
  },
  guide: {
    days: [day('2026-11-20', '11:00', '22:00'), day('2026-11-21', '10:00', '22:00'), day('2026-11-22', '10:00', '20:00')],
    at_a_glance: [{ value: 'Free', label: 'for every visitor' }],
    highlights: [{ title: 'Drumming', body: 'Free sessions across all three days, open to all.' }],
    program_note: 'Times are the festival\'s published hours.',
    ...over.guide,
  },
})

const problems = (input: unknown) => {
  const r = planWalkInDraft(input)
  return r.ok ? [] : r.problems
}

describe('a block the organiser form would accept', () => {
  test('plans, with the times read in the event\'s own zone and the city from the venue', () => {
    const r = planWalkInDraft(block())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 11am on 20 November in Melbourne is daylight time, eleven hours ahead of UTC.
    expect(r.plan.startsAt).toBe('2026-11-20T00:00:00.000Z')
    expect(r.plan.endsAt).toBe('2026-11-22T09:00:00.000Z')
    expect(r.plan.citySlug).toBe('melbourne')
    expect(r.plan.guide.days).toHaveLength(3)
  })

  test("the organiser's own words show as written, a price on the day included (ruling 2)", () => {
    const g = { highlights: [{ title: 'Food', body: 'Stalls from $10, open all day.' }] }
    expect(problems(block({ guide: g }))).toEqual([])
  })
})

describe('the founder\'s ruling: no placeholder, every day opens at a clock time', () => {
  test('a day with no opening time is refused', () => {
    const g = { days: [day('2026-11-20', null, '22:00', 'Opening to confirm'), day('2026-11-21', '10:00', '22:00'), day('2026-11-22', '10:00', '20:00')] }
    const p = problems(block({ guide: g }))
    expect(p.some((x) => /day 1 \(2026-11-20\) has no opening time/.test(x))).toBe(true)
    expect(p.some((x) => /hours wording reads as a placeholder/.test(x))).toBe(true)
  })

  test('to confirm, TBC, TBA, coming soon and a bracketed note are each refused by name', () => {
    for (const note of ['Times to confirm.', 'Schedule TBC', 'Line-up TBA', 'More coming soon', 'Opens [10am or 11am]']) {
      expect(problems(block({ guide: { program_note: note } })).some((x) => /the program note reads as a placeholder|program note reads as a placeholder/.test(x))).toBe(true)
    }
  })

  test("the organiser's own state of a fact is not a placeholder: a topic still to be announced", () => {
    const forum = 'Forum on a topical issue, with a panel of speakers. Topic to be announced.'
    expect(problems(block({ guide: { program_note: forum } }))).toEqual([])
  })

  test("the event's start must be its first day's opening", () => {
    const p = problems(block({ event: { start: ['2026-11-20', '10:00'] } }))
    expect(p).toContain('the event starts at 10:00 but its first day opens at 11:00')
  })
})

describe('the rest of the form\'s rules', () => {
  test('a day outside the event\'s dates is refused by the publish gate\'s own hours check', () => {
    // The gate allows a gap (a festival may be closed one day); it refuses a day the event does not span.
    const g = { days: [day('2026-11-20', '11:00', '22:00'), day('2026-11-21', '10:00', '22:00'), day('2026-11-23', '10:00', '20:00')] }
    expect(problems(block({ guide: g }))).toContain("2026-11-23 is outside the event's dates. Check the dates in step 2, or remove that day.")
    const gap = { days: [day('2026-11-20', '11:00', '22:00'), day('2026-11-22', '10:00', '20:00')] }
    expect(problems(block({ guide: gap }))).toEqual([])
  })

  test("EventLinqs' own words are judged when it wrote them: a dollar sign is refused", () => {
    const g = { highlights: [{ title: 'Food', body: 'Stalls from $10, open all day.' }] }
    expect(problems(block({ listing_source: 'eventlinqs', guide: g })).some((x) => /a dollar sign/.test(x))).toBe(true)
  })

  test('a city the data names that the venue does not resolve to is refused', () => {
    expect(problems(block({ event: { city_primary: 'geelong' } }))).toContain('the data says city geelong but the venue resolves to melbourne')
  })

  test('an end before the start is refused', () => {
    expect(problems(block({ event: { end: ['2026-11-19', '20:00'] } }))).toContain('the event ends before it starts')
  })

  test('a shape the form never takes is refused with its path', () => {
    const p = problems(block({ event: { category_slug: 'Big Festivals' } }))
    expect(p.some((x) => x.startsWith('event.category_slug'))).toBe(true)
    expect(problems({})[0]).toMatch(/^listing_source/)
  })
})

describe('addresses carry no banned word (CLAUDE.md, Copy and banned content)', () => {
  // The organiser's own NAME shows as written (ruling 2); its addresses do not carry the word.
  const realName = 'African Music and Cultural Festival 2026'

  test('a title that would give a banned address is refused until the block names its own slug', () => {
    const p = problems(block({ event: { title: realName } }))
    expect(p.some((x) => /the event address "african-music-and-cultural-festival-2026" carries a word the constitution bans/.test(x))).toBe(true)
    const ok = planWalkInDraft(block({ event: { title: realName, slug: 'amcf-2026' } }))
    expect(ok.ok && ok.plan.slug).toBe('amcf-2026')
    expect(ok.ok && ok.plan.block.event.title).toBe(realName)
  })

  test('an organisation slug carrying the word is refused too', () => {
    const b = block()
    b.organisation.slug = 'african-cultural-collective'
    expect(problems(b).some((x) => /the organisation address/.test(x))).toBe(true)
  })
})

/*
 * THE SOURCE NEEDED LINES (project manager, 24 October 2026, 09:48): a line the
 * organiser's own pages do not carry is shown as the organiser wrote it, with
 * that source named, or left off. Never invented, and never shown unruled.
 */
describe('a line marked SOURCE NEEDED', () => {
  const quote = 'We started this festival thirteen years ago, by the river.'
  const withQuote = (ruling: unknown, guide: Record<string, unknown> = {}) => ({
    ...block({ guide: { quote_text: quote, quote_attribution: 'The chair', ...guide } }),
    source_needed: [{ line: "the chair's quote", words: quote, ruling }],
  })

  test('unruled, it stops the run by name', () => {
    expect(problems(withQuote(null))).toContain(`the chair's quote is SOURCE NEEDED and not ruled: ${JSON.stringify(quote)}`)
  })

  test('ruled as the organiser wrote it, with that source named, it shows', () => {
    expect(problems(withQuote({ as_amcf_wrote: "the chair's email of 25 October 2026" }))).toEqual([])
  })

  test('ruled as the organiser wrote it, the page must carry those words exactly', () => {
    const p = problems(withQuote({ as_amcf_wrote: "the chair's email" }, { quote_text: 'Thirteen years ago, by the river, we began.' }))
    expect(p).toContain("the chair's quote is ruled as AMCF wrote it, but no line on the page carries those words exactly")
  })

  test('ruled as the organiser wrote it, the source must be named', () => {
    expect(problems(withQuote({ as_amcf_wrote: '' })).some((x) => x.startsWith('source_needed.0.ruling'))).toBe(true)
  })

  test('ruled left off, the words must be gone from every line the page shows', () => {
    expect(problems(withQuote('left_off'))).toContain("the chair's quote is ruled left off, but the page still carries those words")
    expect(problems({ ...block(), source_needed: [{ line: "the chair's quote", words: quote, ruling: 'left_off' }] })).toEqual([])
  })

  test('a block with no such line needs no ledger', () => {
    expect(problems(block())).toEqual([])
  })
})

describe("the page proof reads every line a visitor reads", () => {
  test("the title, each day's items and closing act, at a glance, the highlights and the notes", () => {
    const r = planWalkInDraft(block({ guide: { quote_text: 'A line from the chair.', quote_attribution: 'The chair' } }))
    if (!r.ok) throw new Error(r.problems.join('; '))
    expect(pageLines(r.plan)).toEqual(
      expect.arrayContaining([
        'Riverside Drum Festival 2026',
        'Three days of drumming, food and music by the river. Free for everyone.',
        'Food stalls and markets open',
        'A headline act',
        'Free',
        'for every visitor',
        'Drumming',
        'Free sessions across all three days, open to all.',
        "Times are the festival's published hours.",
        'A line from the chair.',
        'The chair',
      ]),
    )
  })
})

describe('the data file', () => {
  test('exactly one fenced json block is read; none, two or broken json are refused', () => {
    expect(extractListingBlock('Sources...\n```json\n{"a": 1}\n```\nmore')).toEqual({ ok: true, value: { a: 1 } })
    expect(extractListingBlock('no block')).toEqual({ ok: false, problem: 'the data file must hold exactly one fenced json block; it holds 0' })
    expect(extractListingBlock('```json\n{}\n```\n```json\n{}\n```')).toEqual({ ok: false, problem: 'the data file must hold exactly one fenced json block; it holds 2' })
    const broken = extractListingBlock('```json\n{ nope\n```')
    expect(broken.ok).toBe(false)
  })
})
