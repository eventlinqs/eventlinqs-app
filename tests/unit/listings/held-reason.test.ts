import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PARTNER_TYPES } from '@/lib/listings/collect-store'

/*
 * A HOLD'S REASON (the PM's 02:40 of 19 November 2026, gap 1, check c). The discovery engine's check c read 2, 2 and 9
 * 'held without a reason' on 15 to 17 November for finds whose reason was known: a high confidence find from a source
 * that is not a partner waits for a person by design, its reasons list empty because reasons are doubts about the facts
 * (listing_candidates_confidence). Read on production at 03:44: all 146 such waits came from sources that are not
 * partners. Only a partner's find that waits with no doubt named is unexplained, and only that is counted.
 */
describe("the day judge's held without a reason", () => {
  const store = readFileSync(join(process.cwd(), 'src/lib/listings/discovery-day-store.ts'), 'utf8').replace(/\r\n/g, '\n')
  const query = store.slice(store.indexOf("'the nights held without a reason'"), store.indexOf("'the nights held without a reason'") + 400)

  it("counts only a partner source's find that waits with no doubt named", () => {
    expect(query).toMatch(/listing_sources!inner\(source_type\)/)
    expect(query).toMatch(/\.eq\('reasons', '\{\}'\)/)
    expect(query).toMatch(/\.in\('listing_sources\.source_type', \[\.\.\.PARTNER_TYPES\]\)/)
  })

  it("the partner types are the partner rule's own", () => {
    expect([...PARTNER_TYPES].sort()).toEqual(['organiser_submission', 'venue_partnership'])
  })
})
