// D3 (6): a venue that said no to EventLinqs' own posts is never planned and never approved. The three places the
// social store chooses or re-checks nights (the post planner's candidates, the weekly campaign's plan, and the check
// before a piece is approved) each read the venues that said no to 'our_posts' and leave their nights out; the nights
// carry their venue id for it. Pinned by reading the source, as the press wiring test does, because these functions
// read the database and no fake of the whole store exists; the decisions themselves are tested in
// tests/unit/venues/venue-distribution.test.ts and the SQL is proved on TEST.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const STORE = readFileSync(resolve(process.cwd(), 'src/lib/social/store.ts'), 'utf8')

function bodyOf(text: string, head: string): string {
  const start = text.indexOf(head)
  expect(start, `${head} must exist`).toBeGreaterThan(-1)
  const next = text.slice(start + 1).search(/\n(export |async function |function |const )/)
  return text.slice(start, next === -1 ? text.length : start + 1 + next)
}

describe("a venue's no to our posts, in the social store", () => {
  test('the post planner reads each night with its venue and leaves out the nights of a venue that said no', () => {
    const body = bodyOf(STORE, 'export async function readCandidates(')
    expect(body).toMatch(/venue_id/)
    expect(body).toMatch(/venuesOff\('our_posts'/)
    expect(body).toMatch(/nightsLeftOut\(/)
  })

  test("the weekly campaign's nights carry their venue, and its plan leaves out the nights of a venue that said no", () => {
    expect(STORE).toMatch(/const NIGHT_COLUMNS =\s*\n?\s*'[^']*\bvenue_id\b/)
    expect(bodyOf(STORE, 'export async function readCampaignNights(')).toMatch(/venueId:/)
    const plan = bodyOf(STORE, 'async function planNow(')
    expect(plan).toMatch(/venuesOff\('our_posts'/)
    expect(plan).toMatch(/nightsLeftOut\(/)
  })

  test('a piece is refused before approval when a night on it is at a venue that has since said no', () => {
    const check = bodyOf(STORE, 'export async function pieceDependencies(')
    expect(check).toMatch(/venuesOff\('our_posts'/)
    expect(check).toMatch(/its venue has asked us not to carry its nights in our posts/)
  })
})
