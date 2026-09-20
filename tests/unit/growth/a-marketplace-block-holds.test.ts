import { describe, expect, test } from 'vitest'
import { resolve } from 'node:path'
import { readRepoFile } from '../../helpers/read-repo-file'
import { stripComments } from '../../../scripts/guards/lib/source.mjs'
import {
  fetchArtistRequests,
  fetchGigApplications,
  fetchOpenGigs,
  fetchOrganisationGigs,
  fetchRequestById,
  isPairBlocked,
} from '@/lib/marketplace/gigs'
import { fetchPickerCities } from '@/lib/marketplace/cities'

/**
 * A MARKETPLACE BLOCK HOLDS WHEN THE READ THAT CHECKS IT BLINKS, AND NO GIG
 * BOARD SURFACE ANSWERS A FAILED READ AS AN ANSWER.
 *
 * ---------------------------------------------------------------------------
 * THE BLOCK THAT FAILED OPEN. The rule was written down on 11 July 2026, in the
 * migration that created the table, as a comment: "a block between an
 * organisation and a performer stops applications and requests BOTH ways for
 * the pair". Nothing in the database enforced it. The whole enforcement was
 *
 *     const { data } = await admin.from('marketplace_blocks')...maybeSingle()
 *     return Boolean(data)
 *
 * with `error` never bound, so a dropped socket answered FALSE, and false is
 * the answer that means NOT BLOCKED. Both call sites read it as permission. A
 * block is a safety decision a person made about somebody they do not want
 * contact from, and it stopped holding for the length of any fault in one read.
 *
 * THE APPLICATIONS THAT VANISHED. fetchGigApplications was unbounded with its
 * error discarded, so a failed read drew "no applications yet" on a gig that
 * had them: the organiser books nobody, and every performer who applied waits
 * for an answer that was never coming.
 *
 * EVERY READ HERE IS TESTED AGAINST A FAKE SERVER rather than a fake reader,
 * because both failures are properties of the server: it can refuse, and it can
 * answer 200 with rows left out and nothing saying so.
 *
 * WHAT IS NOT CLAIMED HERE. The database half, the two triggers that refuse the
 * contact whatever the application decides, cannot be proven in a unit test and
 * is not. It is proven against TEST by scripts/verify/lb-gigwhole-drive.mjs,
 * which blocks a real pair and reads the 23514 back.
 */

type Row = Record<string, unknown>

/**
 * A PostgREST builder that answers from a table with a CEILING, exactly as the
 * real server does: at most `ceiling` rows per response, HTTP 200, `error`
 * null, and nothing in the response saying rows were left out.
 *
 * Every filter method returns the builder and the builder is thenable, which is
 * how supabase-js behaves and why a read can be awaited at any point.
 */
function server(rows: Row[], { ceiling = 1000, fail = '', failCode = '' } = {}) {
  const pages: number[] = []
  const client = {
    from() {
      let lo = 0
      let hi = Number.MAX_SAFE_INTEGER
      let single = false
      const answer = () => {
        if (fail) return { data: null, error: { message: fail, ...(failCode ? { code: failCode } : {}) } }
        if (single) return { data: rows[0] ?? null, error: null }
        const width = Math.min(hi - lo + 1, ceiling)
        const slice = rows.slice(lo, lo + width)
        pages.push(slice.length)
        return { data: slice, error: null }
      }
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
          Promise.resolve(answer()).then(ok, bad),
      }
      for (const method of ['select', 'eq', 'in', 'is', 'not', 'neq', 'gte', 'lte', 'order', 'limit']) {
        builder[method] = () => builder
      }
      builder.range = (a: number, b: number) => {
        lo = a
        hi = b
        return builder
      }
      builder.maybeSingle = () => {
        single = true
        return builder
      }
      return builder
    },
  }
  return { client: client as never, pages }
}

const APPLICATIONS = Array.from({ length: 2500 }, (_, i) => ({
  id: `app-${i}`,
  gig_id: 'gig-1',
  artist_id: `artist-${i}`,
  status: 'submitted',
}))

describe('the block, which is a safety decision and not a guess', () => {
  test('a failed read THROWS rather than answering "not blocked"', async () => {
    const { client } = server([], { fail: 'connection reset by peer' })
    await expect(isPairBlocked(client, 'org-1', 'artist-1')).rejects.toThrow()
  })

  test('a genuinely absent block is false', async () => {
    const { client } = server([])
    await expect(isPairBlocked(client, 'org-1', 'artist-1')).resolves.toBe(false)
  })

  test('a block that is there is true', async () => {
    const { client } = server([{ id: 'block-1' }])
    await expect(isPairBlocked(client, 'org-1', 'artist-1')).resolves.toBe(true)
  })
})

describe('the applications an organiser is shown', () => {
  test('every application comes back, through a ceiling that hides the rest', async () => {
    const { client, pages } = server(APPLICATIONS, { ceiling: 1000 })
    const got = await fetchGigApplications(client, 'gig-1')
    expect(got).toHaveLength(2500)
    // The ceiling was real: no single response carried more than 1,000.
    expect(Math.max(...pages)).toBe(1000)
  })

  test('a refused read throws rather than drawing a gig with no applicants', async () => {
    const { client } = server([], { fail: 'statement timeout' })
    await expect(fetchGigApplications(client, 'gig-1')).rejects.toThrow()
  })

  test('a gig with genuinely no applications is an empty list', async () => {
    const { client } = server([])
    await expect(fetchGigApplications(client, 'gig-1')).resolves.toEqual([])
  })
})

describe('the other lists the board is made of', () => {
  test("an organiser's own gigs throw rather than reading as none posted", async () => {
    const { client } = server([], { fail: 'pool exhausted' })
    await expect(fetchOrganisationGigs(client, 'org-1')).rejects.toThrow()
  })

  test('the public board throws rather than rendering a platform with no work on it', async () => {
    const { client } = server([], { fail: 'fetch failed' })
    await expect(fetchOpenGigs(client)).rejects.toThrow(/could not be read/)
  })

  test("a performer's booking requests throw rather than reading as nobody wanting them", async () => {
    const { client } = server([], { fail: 'connection reset' })
    await expect(fetchArtistRequests(client, 'artist-1')).rejects.toThrow()
  })

  test('one request throws on a failure and answers null only when there is no row', async () => {
    const failing = server([], { fail: 'connection reset' })
    await expect(fetchRequestById(failing.client, 'req-1')).rejects.toThrow()

    const absent = server([], { fail: 'no rows', failCode: 'PGRST116' })
    await expect(fetchRequestById(absent.client, 'req-1')).resolves.toBeNull()
  })
})

describe('the city picker, which had four copies of one read', () => {
  test('every city comes back through the ceiling', async () => {
    const cities = Array.from({ length: 1400 }, (_, i) => ({ slug: `c-${i}`, name: `City ${i}` }))
    const { client } = server(cities, { ceiling: 1000 })
    await expect(fetchPickerCities(client)).resolves.toHaveLength(1400)
  })

  test('a refused read throws rather than emptying the picker', async () => {
    const { client } = server([], { fail: 'statement timeout' })
    await expect(fetchPickerCities(client)).rejects.toThrow()
  })
})

describe('the rules, where they are written down', () => {
  const root = resolve(__dirname, '..', '..', '..')
  const migration = readRepoFile(
    resolve(root, 'supabase/migrations/20260920000060_a_block_holds_when_the_read_blinks.sql'),
  )
  /*
   * COMMENTS STRIPPED, and that is not tidiness. This file QUOTES the defective
   * line `billing_order: count ?? 0` in the comment explaining why it is gone,
   * and the first version of the test below matched that comment and failed on
   * the explanation of the fix. A source assertion that reads comments is
   * testing the prose.
   */
  const actions = stripComments(readRepoFile(resolve(root, 'src/app/actions/gigs.ts')))

  test('the database refuses both kinds of contact for a blocked pair', () => {
    expect(migration).toMatch(/CREATE TRIGGER trg_marketplace_block_on_application(?![A-Za-z0-9_])/)
    expect(migration).toMatch(/CREATE TRIGGER trg_marketplace_block_on_request(?![A-Za-z0-9_])/)
    // 23514, so the server actions can translate it into a sentence a person
    // reads rather than surfacing a raw database error.
    expect((migration.match(/check_violation/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  test('both call sites fail CLOSED when the block state cannot be established', () => {
    expect(actions).toMatch(/async function refuseIfBlockedOrUnknowable/)
    // Every mention of isPairBlocked outside the helper is a direct call, and a
    // direct call lets the throw escape the action instead of refusing.
    const direct = [...actions.matchAll(/\bisPairBlocked\(/g)].length
    expect(direct).toBe(1)
    expect(actions).toMatch(/const applyRefusal = await refuseIfBlockedOrUnknowable\(/)
    expect(actions).toMatch(/const requestRefusal = await refuseIfBlockedOrUnknowable\(/)
  })

  test('a position on the bill is never a coalesced count', () => {
    expect(actions).not.toMatch(/billing_order:\s*count\s*\?\?/)
    expect(actions).toMatch(/billing_order: count,/)
  })
})
