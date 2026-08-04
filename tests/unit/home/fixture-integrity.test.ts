import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * FIXTURE INTEGRITY GUARD (2026-07-12). The homepage density fixture is
 * served on staging under HOMEPAGE_SEED_FIXTURE=1, and every event it shows
 * must be genuinely purchasable. The 2026-07-12 launch blocker was a fixture
 * event id one hex digit short of a valid UUID: the reservation schema
 * (z.string().uuid()) rightly rejected it as "Invalid reservation data" at
 * checkout, so an event the founder could see and click could not be bought.
 *
 * These pins make that class of defect impossible to ship again: every
 * fixture event AND tier id must be a syntactically valid UUID (so the
 * reservation schema accepts it), and every published fixture event must
 * carry a real cover (so it survives the events_published_real_cover DB
 * constraint when seeded). If the fixture is regenerated malformed, CI fails
 * here instead of the founder finding it at checkout.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type FixtureTier = { id: string }
type FixtureRow = {
  id: string
  slug: string
  status?: string
  cover_image_url?: string | null
  ticket_tiers?: FixtureTier[] | null
}

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../../src/lib/dev/home-seed-fixture.json'), 'utf8'),
) as FixtureRow[]

describe('homepage density fixture integrity', () => {
  it('has fixture rows to check', () => {
    expect(Array.isArray(fixture)).toBe(true)
    expect(fixture.length).toBeGreaterThan(0)
  })

  it('every event id is a valid UUID (reservation schema accepts it)', () => {
    const bad = fixture.filter(r => !UUID_RE.test(r.id)).map(r => `${r.slug}: ${r.id}`)
    expect(bad).toEqual([])
  })

  it('every ticket-tier id is a valid UUID', () => {
    const bad: string[] = []
    for (const r of fixture) {
      for (const t of r.ticket_tiers ?? []) {
        if (!UUID_RE.test(t.id)) bad.push(`${r.slug}: ${t.id}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('every published event carries a real cover image', () => {
    const bad = fixture
      .filter(r => (r.status ?? 'published') === 'published')
      .filter(r => !r.cover_image_url || !/^https?:\/\//.test(r.cover_image_url))
      .map(r => r.slug)
    expect(bad).toEqual([])
  })
})
