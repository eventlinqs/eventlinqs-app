import { describe, expect, it } from 'vitest'
import { composeFromText, detectsRecurring } from '@/lib/launch/compose'

/**
 * THE SIX ARRIVALS. Founder directive 8 August 2026.
 *
 * "The composer must work for a professional promoter AND for someone who has
 * never sold a ticket, without asking which they are and without either
 * feeling it was built for the other. If any one of them hits a screen that
 * does not fit them, that is a defect."
 *
 * Every arrival below runs through the SAME code path with no mode flag, no
 * branch on who they are, and no question about their experience. The only
 * thing that varies is what their own words earned.
 */

const CATEGORIES = [
  'Music', 'Nightlife', 'Comedy', 'Performing Arts', 'Food & Drink',
  'Community', 'Charity', 'Family', 'Education', 'Business', 'Sports',
]
const COMMUNITIES = ['aboriginal-torres-strait-islander', 'south-asian', 'pasifika']
const NOW = '2026-08-09T10:00:00.000Z'

const compose = (text: string) =>
  composeFromText({ text, categoryNames: CATEGORIES, communitySlugs: COMMUNITIES, nowIso: NOW })

const ARRIVALS = {
  dj: 'Warehouse party at the Barwon Club, Marlo Reyes b2b Kita, Sat 20th September, doors 10pm, $25 presale',
  comedian: 'Comedy night at the Prince, first Tuesday every month, 5 comics, $15 on the door',
  market: 'Geelong makers market, third Sunday, 40 stalls, free entry, 9am to 2pm at Johnstone Park',
  workshop: 'Pottery workshop, 6 places, $85, Saturday 27th September 10am, my studio in Newtown',
  charity: 'Trivia night for Geelong Animal Rescue, Sat 12th September, $30 a head, tables of 8, at the RSL',
  birthday: "Ruby's 16th, Saturday 20th September, 6pm at our place in Belmont, about 40 kids, no charge",
} as const

describe('every arrival gets a real kit, never a blank form', () => {
  it.each(Object.entries(ARRIVALS))('%s gets a usable draft', (_name, text) => {
    const { payload } = compose(text)

    // A description always exists: it is their own words at worst.
    expect(payload.description.length).toBeGreaterThan(0)
    // A category is always chosen. An unselected category is a blank field,
    // which the founder ruled is a failure of the tool.
    expect(payload.categoryName).not.toBe('')
    expect(CATEGORIES).toContain(payload.categoryName)
    // The summary is never empty, because it is the listing line.
    expect(payload.summary.length).toBeGreaterThan(0)
    // Their original words are always kept so the kit can be rebuilt.
    expect(payload.sourceText).toBe(text)
  })

  it.each(Object.entries(ARRIVALS))('%s never sees a gap without a question', (_name, text) => {
    const { payload, questions } = compose(text)
    // Every unresolved field has exactly one plain question attached. No blank
    // field is ever shown without something to answer.
    expect(questions.length).toBe(payload.unresolved.length)
    for (const q of questions) {
      expect(q.endsWith('?')).toBe(true)
      expect(q).not.toMatch(/[—–!]/)
    }
  })
})

describe('the kids birthday, which broke the design before this build', () => {
  const { payload, reachFraming } = compose(ARRIVALS.birthday)

  it('is UNLISTED, never public', () => {
    expect(payload.visibility).toBe('unlisted')
  })

  it('holds the street address back, because it is a home', () => {
    // "our place" is a residence signal.
    expect(payload.addressHeldBack).toBe(true)
  })

  it('is told about attendance, not ticket revenue', () => {
    expect(reachFraming).toBe('attendance')
  })

  it('is given a plain reason, not a warning or an error', () => {
    expect(payload.visibilityReason).toMatch(/link/i)
    expect(payload.visibilityReason).not.toMatch(/[!—–]/)
    expect(payload.visibilityReason.toLowerCase()).not.toMatch(/blocked|denied|not allowed|error/)
  })
})

describe('D1: recurring phrasing is answered, never silently resolved', () => {
  it('detects the three shapes the arrivals actually use', () => {
    expect(detectsRecurring('first Tuesday every month')).toBe(true)
    expect(detectsRecurring('third Sunday')).toBe(true)
    expect(detectsRecurring('every Friday')).toBe(true)
    expect(detectsRecurring('weekly')).toBe(true)
  })

  it('does not fire on a one-off', () => {
    expect(detectsRecurring(ARRIVALS.dj)).toBe(false)
    expect(detectsRecurring(ARRIVALS.birthday)).toBe(false)
  })

  it('gives the comedian and the market an honest note', () => {
    expect(compose(ARRIVALS.comedian).recurringNote).toBeTruthy()
    expect(compose(ARRIVALS.market).recurringNote).toBeTruthy()
    // And it never claims we support recurrence.
    const note = compose(ARRIVALS.comedian).recurringNote ?? ''
    expect(note).toMatch(/first date|first one/i)
    expect(note).not.toMatch(/[!—–]/)
  })

  it('gives a one-off arrival no note at all', () => {
    expect(compose(ARRIVALS.dj).recurringNote).toBeNull()
  })
})

describe('D2: a free event is never told a revenue story', () => {
  it('the free market gets attendance framing', () => {
    expect(compose(ARRIVALS.market).reachFraming).toBe('attendance')
  })

  it('the paid gig gets ticket framing', () => {
    expect(compose(ARRIVALS.dj).reachFraming).toBe('tickets')
  })

  it('the paid charity night gets ticket framing', () => {
    expect(compose(ARRIVALS.charity).reachFraming).toBe('tickets')
  })

  it('an unlisted event never gets revenue framing even when priced', () => {
    // The workshop is $85 but at a private studio, so it is unlisted and the
    // discovery-and-revenue story does not apply to it.
    expect(compose(ARRIVALS.workshop).reachFraming).toBe('attendance')
  })
})

describe('THE BILL is typed, never inferred', () => {
  it('never guesses a performer from prose', () => {
    // "Comedy night at the Prince" must not yield a share card for a pub.
    for (const text of Object.values(ARRIVALS)) {
      expect(compose(text).payload.billNames).toEqual([])
    }
  })
})

describe('no arrival is asked which kind of organiser they are', () => {
  it('the same call signature serves all six', () => {
    // The proof is structural: composeFromText takes text and taxonomy only.
    // There is no mode, no persona, no experience flag to pass.
    const results = Object.values(ARRIVALS).map(compose)
    expect(results).toHaveLength(6)
    for (const r of results) {
      expect(r.payload.visibility).toMatch(/^(public|unlisted|private)$/)
    }
  })

  it('a thin description still produces a kit rather than a rejection', () => {
    const { payload, questions } = compose('party saturday')
    expect(payload.categoryName).not.toBe('')
    expect(payload.description.length).toBeGreaterThan(0)
    // It asks rather than refuses.
    expect(questions.length).toBeGreaterThan(0)
  })

  it('an empty description still produces a kit shell rather than throwing', () => {
    expect(() => compose('')).not.toThrow()
    expect(compose('').payload.visibility).toBe('unlisted')
  })
})
