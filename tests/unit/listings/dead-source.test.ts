import { describe, expect, it } from 'vitest'
import { DEAD_AFTER_RUNS, deadSource, runCollection, type CollectionStore, type Fetcher } from '@/lib/listings/collect-run'
import type { RegisteredSource } from '@/lib/listings/collect'

/*
 * CAPTURE RETIRES DEAD ONES (Lawal's 10:42 of 13 November 2026). A source whose every run has failed for three days or
 * more, at least six runs in a row, is put back to 'ask' with why; a source down for an afternoon is never retired.
 */

const NOW = new Date('2026-11-13T00:25:00Z')
const PAGE = 'https://www.bp-proof-gone.com.au/events/'
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString()
const failing = (n: number, everyHours: number) => Array.from({ length: n }, (_, i) => ({ ranAt: hoursAgo(i * everyHours), succeeded: false }))

describe('a dead source, pure', () => {
  it('six failures in a row spanning three days is dead', () => {
    expect(deadSource(failing(DEAD_AFTER_RUNS, 15), NOW)).toBe(true)
  })

  it('six failures in one afternoon is not', () => {
    expect(deadSource(failing(DEAD_AFTER_RUNS, 1), NOW)).toBe(false)
  })

  it('a success inside the streak ends it', () => {
    const runs = [...failing(3, 24), { ranAt: hoursAgo(80), succeeded: true }, ...failing(5, 24).map((r) => ({ ...r, ranAt: hoursAgo(100) }))]
    expect(deadSource(runs, NOW)).toBe(false)
  })
})

describe('the run retires a dead source', () => {
  const source: RegisteredSource = {
    id: 'gone',
    name: 'Bp Proof Gone',
    pageUrl: PAGE,
    collection: 'read',
    changes: 'daily',
    lastCheckedAt: null,
    lastSuccessAt: null,
    permits: { facts: true, descriptions: false, images: false, links: true },
    verified: true,
    partner: false,
    partnerVenue: null,
    citySlug: 'geelong',
  }
  const fetcher: Fetcher = async (url) =>
    url.endsWith('/robots.txt') ? { status: 200, text: async () => 'User-agent: *\nAllow: /' } : { status: 500, text: async () => '' }

  function store(history: { ranAt: string; succeeded: boolean }[]) {
    const stopped: string[] = []
    const s: CollectionStore = {
      sources: async () => [source],
      known: async () => [],
      heldLinks: async () => new Set(),
      land: async () => true,
      record: async () => {},
      addLinks: async () => {},
      logRun: async (row) => {
        history.unshift({ ranAt: row.ranAt, succeeded: row.succeeded })
      },
      publishPartnerNight: async () => {},
      expirePassed: async () => 0,
      stopSource: async (_id, because) => {
        stopped.push(because)
      },
      recentRuns: async (_id, n) => history.slice(0, n),
    }
    return { s, stopped }
  }

  it('after three days of failures this failed run retires it, saying why', async () => {
    /* Six failed runs, 15 hours apart, the newest 15 hours ago: with this run's failure, seven spanning 90 hours. */
    const m = store(Array.from({ length: DEAD_AFTER_RUNS }, (_, i) => ({ ranAt: hoursAgo(15 + i * 15), succeeded: false })))
    await runCollection(m.s, fetcher, NOW, Infinity, { pauseMs: 0 })
    expect(m.stopped).toHaveLength(1)
    expect(m.stopped[0]).toMatch(/^Retired on 2026-11-13: every run for three days or more has failed/)
  })

  it('a first failure retires nothing', async () => {
    const m = store([{ ranAt: hoursAgo(24), succeeded: true }])
    await runCollection(m.s, fetcher, NOW, Infinity, { pauseMs: 0 })
    expect(m.stopped).toEqual([])
  })
})
