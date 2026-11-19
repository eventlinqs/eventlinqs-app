// THE ACCEPTANCE TESTS' UNLISTED NIGHT (the PM's 05:38 of 20 November 2026, item 2): T4 and T5 run on one published,
// UNLISTED test night. Only an organiser marked is_test on its own row is offered its linked venues' unlisted nights on its
// photo page (src/lib/outreach/their-nights.ts, read by src/lib/listings/photo-permission.ts); the night never reaches a
// guide, the sitemap or IndexNow, and its own page carries noindex while still showing its photograph.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readTheirNights } from '@/lib/outreach/their-nights'
import { eventRobotsDirective, isPubliclyDiscoverable } from '@/lib/events/visibility'

type Call = { table: string; ops: [string, unknown[]][] }

/** A client that records every query and answers each with no rows (organiser_venues with one venue). */
function fakeDb() {
  const calls: Call[] = []
  const db = {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const answer = () => ({ data: table === 'organiser_venues' ? [{ venue_id: 'v1' }] : [], error: null })
      const q: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, name: string) {
            if (name === 'then') return (resolve: (r: unknown) => unknown) => resolve(answer())
            if (name === 'maybeSingle' || name === 'single') return async () => ({ data: null, error: null })
            return (...args: unknown[]) => (call.ops.push([name, args]), q)
          },
        },
      )
      return q
    },
  }
  return { db, calls }
}

const unlistedQueries = (calls: Call[]) => calls.filter((c) => c.table === 'events' && c.ops.some(([n, a]) => n === 'eq' && a[0] === 'visibility' && a[1] === 'unlisted'))
const organiser = { id: 'o1', organisation_id: null, website_url: null }
const NOW = new Date('2026-11-20T00:00:00Z')

describe("the test organiser's own unlisted night, offered to it alone", () => {
  it('(a) a real organiser is never offered a non-public night: no unlisted night is read for it', async () => {
    const { db, calls } = fakeDb()
    await readTheirNights(db as never, organiser, NOW, 12)
    expect(unlistedQueries(calls)).toEqual([])
    await readTheirNights(db as never, { ...organiser, isTest: false }, NOW, 12)
    expect(unlistedQueries(calls)).toEqual([])
  })

  it('a test organiser is offered the published unlisted nights at its linked venues, and only those', async () => {
    const { db, calls } = fakeDb()
    await readTheirNights(db as never, { ...organiser, isTest: true }, NOW, 12)
    const [q] = unlistedQueries(calls)
    expect(q).toBeDefined()
    expect(q.ops).toContainEqual(['in', ['venue_id', ['v1']]])
    expect(q.ops).toContainEqual(['eq', ['status', 'published']])
  })

  it('the test mark is read on the server from the organiser row, and only the photo page passes it', () => {
    const page = readFileSync(join(process.cwd(), 'src/lib/listings/photo-permission.ts'), 'utf8')
    expect(page).toContain('organisers(id, name, organisation_id, website_url, is_test)')
    expect(page).toContain('isTest: org.is_test === true')
    for (const file of ['src/lib/outreach/daily-twenty-read.ts', 'src/lib/outreach/follow-ups.ts', 'src/lib/outreach/segment-a-read.ts', 'src/lib/outreach/twenty-drafts.ts']) {
      expect(readFileSync(join(process.cwd(), file), 'utf8'), file).not.toContain('isTest')
    }
  })

  it('(b) an unlisted night is never publicly discoverable, so no guide, sitemap or IndexNow read can list it', () => {
    expect(isPubliclyDiscoverable('unlisted')).toBe(false)
    // Every IndexNow read (the changed nights and the ended nights) takes public nights only.
    const indexNow = readFileSync(join(process.cwd(), 'src/lib/seo/indexnow.ts'), 'utf8')
    const reads = indexNow.split(".from('events')").length - 1
    expect(reads).toBeGreaterThan(0)
    expect(indexNow.split(".eq('visibility', 'public')").length - 1).toBe(reads)
  })

  it("(c) its own page carries noindex and still shows (only a private night's page is held back)", () => {
    expect(eventRobotsDirective('unlisted')).toMatchObject({ index: false, follow: false })
    const page = readFileSync(join(process.cwd(), 'src/app/events/[slug]/page.tsx'), 'utf8')
    expect(page).toContain('eventRobotsDirective(event.visibility)')
    expect(page).toContain("if (event.visibility === 'private') {")
    expect(page).not.toContain("if (event.visibility === 'unlisted') {")
  })
})
