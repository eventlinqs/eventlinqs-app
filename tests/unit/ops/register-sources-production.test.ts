import { describe, expect, test } from 'vitest'
import { planRegister } from '../../../scripts/ops/register-sources-production.mjs'

/*
 * The project manager's ruling of 16:28 on 29 October 2026: the source register goes to production only after its
 * owner re-reads each source's terms that day; a source whose terms were not read that day goes in as 'ask', never
 * 'read'; only verified feeds read; nothing publishes by itself.
 */
const TODAY = '2026-10-29'
const feed = {
  name: 'Geelong Regional Libraries',
  kind: 'council',
  page_url: 'https://www.grlc.vic.gov.au/whats-on',
  collection: 'read',
  source_type: 'subscription_feed',
  verification: 'verified',
  terms_read_on: TODAY,
  may_subscribe: 'yes',
  may_subscribe_quote: 'Subscribe to our events calendar.',
  may_subscribe_url: 'https://www.grlc.vic.gov.au/whats-on',
  may_subscribe_read_on: TODAY,
  organisation_id: null,
  venue_id: null,
  category_id: null,
  id: 'test-id',
  created_at: '2026-10-28T00:00:00Z',
  last_checked_at: '2026-10-28T19:00:00Z',
  last_outcome: 'ok',
  last_success_at: '2026-10-28T19:00:00Z',
}

describe('planRegister', () => {
  test('a verified feed whose terms and yes were read today goes in as read, without TEST run state or ids', () => {
    const plan = planRegister([feed], TODAY)
    expect(plan.refused).toEqual([])
    expect(plan.rows[0].collection).toBe('read')
    for (const k of ['id', 'created_at', 'last_checked_at', 'last_outcome', 'last_success_at']) expect(plan.rows[0]).not.toHaveProperty(k)
    expect(plan.sql).toContain('on conflict (page_url) do nothing')
  })

  test('a read source whose terms or yes were not read today goes in as ask, and says why', () => {
    const stale = planRegister([{ ...feed, terms_read_on: '2026-10-28' }], TODAY)
    expect(stale.rows[0].collection).toBe('ask')
    expect(stale.demoted[0]).toMatch(/terms read on 2026-10-28, not today/)
    const staleYes = planRegister([{ ...feed, may_subscribe_read_on: '2026-10-27' }], TODAY)
    expect(staleYes.rows[0].collection).toBe('ask')
  })

  test('an ask source goes in as ask, and a source pointing at a TEST row (organisation, venue, category) is refused', () => {
    expect(planRegister([{ ...feed, collection: 'ask' }], TODAY).rows[0].collection).toBe('ask')
    const tied = planRegister([{ ...feed, organisation_id: '11111111-1111-1111-1111-111111111111' }], TODAY)
    expect(tied.rows).toEqual([])
    expect(tied.refused[0]).toMatch(/organisation_id/)
  })

  test('quotes are escaped, so a quote holding an apostrophe cannot end its string', () => {
    const plan = planRegister([{ ...feed, may_subscribe_quote: "Subscribe to the library's calendar." }], TODAY)
    expect(plan.sql).toContain("'Subscribe to the library''s calendar.'")
  })
})
