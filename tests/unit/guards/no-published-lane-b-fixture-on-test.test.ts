import { describe, expect, test } from 'vitest'
import { judgeRows } from '../../../scripts/guards/no-published-lane-b-fixture-on-test.mjs'
import { venueSlugify } from '@/lib/venues/resolver'

/**
 * THE STATE THIS GUARD EXISTS FOR, driven over synthetic rows.
 *
 * On 13 September 2026 a GA5 run left `lane-b-ga5-event-202609131728` published
 * on shared TEST, with an organisation and four confirmed orders behind it, and
 * GA5 reported "left as found" on every run afterwards because it counted
 * campaign rows and nothing else. It was in the sitemap at three URLs for two
 * days.
 *
 * The guard's drill removes the FO1 exemption and watches it name the rows it was
 * exempting, which proves the wiring against the real database. It cannot prove
 * the interesting half there: creating a genuinely new published organiser page
 * on a database three lanes share IS the incident. These do it with rows that
 * exist nowhere.
 */
const FO1 = [{ prefix: 'lane-b-fo1-', why: 'persistent by design' }]

describe('judgeRows', () => {
  test('the leftover that started this is named, at all three of its URLs', () => {
    const { published } = judgeRows(
      [{ slug: 'lane-b-ga5-org-202609131728' }],
      [{ slug: 'lane-b-ga5-event-202609131728', venue_name: 'Lane B GA5 warehouse' }],
      FO1,
    )
    expect(published).toEqual([
      '/organisers/lane-b-ga5-org-202609131728',
      '/events/lane-b-ga5-event-202609131728',
      '/venues/lane-b-ga5-warehouse',
    ])
  })

  test("FO1's persistent fixtures are allowed, and the allowance is reported as used", () => {
    const { published, matched } = judgeRows(
      [{ slug: 'lane-b-fo1-offer-lane-b-mu1306510' }],
      [{ slug: 'lane-b-fo1-offer-night-lane-b-mu1306510', venue_name: 'Somewhere' }],
      FO1,
    )
    expect(published).toEqual([])
    expect([...matched]).toEqual(['lane-b-fo1-'])
  })

  test('removing the exemption is what the drill does, and it then names those rows', () => {
    const { published } = judgeRows([{ slug: 'lane-b-fo1-offer-lane-b-mu1306510' }], [], [])
    expect(published).toEqual(['/organisers/lane-b-fo1-offer-lane-b-mu1306510'])
  })

  test('an event with no venue publishes its own URL and no venue URL', () => {
    const { published } = judgeRows([], [{ slug: 'lane-b-ga2-event', venue_name: null }], FO1)
    expect(published).toEqual(['/events/lane-b-ga2-event'])
  })

  test('a clean database is an empty answer rather than a failure to look', () => {
    expect(judgeRows([], [], FO1).published).toEqual([])
  })

  test('the venue handle is the product venueSlugify, not a lookalike', () => {
    const names = ['Lane B GA5 warehouse', 'Lane B PL1 warehouse', "St Kilda's Palais & Gardens"]
    for (const venue_name of names) {
      const { published } = judgeRows([], [{ slug: 'lane-b-x-event', venue_name }], FO1)
      expect(published).toContain(`/venues/${venueSlugify(venue_name)}`)
    }
  })
})
