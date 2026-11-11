/**
 * EVERY WRITE THAT CHANGES A GUIDE REVALIDATES IT, AND EVERY DEPLOY DOES (the PM's 19:20 of 11 November 2026).
 *
 * THE DEFECT. The plain /city/melbourne served a render without the organisers' own events while a fresh render had
 * them. A guide revalidated only by its time window keeps its last render until a visitor arrives after the window,
 * and that visitor is served the old render while the new one is made (stale-while-revalidate,
 * node_modules/next/dist/docs/01-app/02-guides/how-revalidation-works.md), so a quiet guide can show a page of any age.
 *
 * THE CLASS, found by a sweep of every writer of events (one defect is a class): the organiser's self-listing marked
 * its event published and put its photo on AFTER the occurrence run's revalidation; a photo attached later
 * revalidated nothing; the admin console's pause, cancel, takedown, archive, resume, restore and feature revalidated
 * nothing; an accepted set of booking links revalidated nothing; a reviewed production write applied by script, and
 * a deploy, revalidated nothing. Each is pinned here, so a writer that loses its revalidation fails the build.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const revalidatePath = vi.fn()
const revalidateTag = vi.fn()
const updateTag = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (p: string, type?: string) => revalidatePath(p, type),
  revalidateTag: (t: string, profile: unknown) => revalidateTag(t, profile),
  updateTag: (t: string) => updateTag(t),
}))
vi.mock('server-only', () => ({}))

const eventRow = { slug: 'a-night', venue_city: 'Melbourne', tags: [], category: { slug: 'music' }, organisation: { slug: 'org' } }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: eventRow, error: null }) }) }) }),
  }),
}))

const { revalidateEveryGuideFromRouteHandler } = await import('@/lib/events/revalidate-event')
const { EVENT_DATA_CACHE_TAGS } = await import('@/lib/events/cache-tags')
const { POST } = await import('@/app/api/revalidate-guides/route')

const source = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

beforeEach(() => {
  revalidatePath.mockClear()
  revalidateTag.mockClear()
  updateTag.mockClear()
  process.env.CRON_SECRET = 'test-cron-secret'
})

describe('every guide at once', () => {
  it('invalidates the home, /events and the sitemap, and every city, suburb and state page by route pattern', () => {
    const out = revalidateEveryGuideFromRouteHandler()
    expect(revalidatePath).toHaveBeenCalledWith('/', undefined)
    expect(revalidatePath).toHaveBeenCalledWith('/events', undefined)
    expect(revalidatePath).toHaveBeenCalledWith('/sitemap.xml', undefined)
    expect(revalidatePath).toHaveBeenCalledWith('/city/[slug]', 'page')
    expect(revalidatePath).toHaveBeenCalledWith('/city/[slug]/[suburb]', 'page')
    expect(revalidatePath).toHaveBeenCalledWith('/state/[state]', 'page')
    expect(out).toEqual(['/', '/events', '/sitemap.xml', '/city/[slug]', '/city/[slug]/[suburb]', '/state/[state]'])
  })

  it('expires every data cache under the guides at once, never stale-while-revalidate', () => {
    revalidateEveryGuideFromRouteHandler()
    for (const tag of EVENT_DATA_CACHE_TAGS) expect(revalidateTag).toHaveBeenCalledWith(tag, { expire: 0 })
    expect(revalidateTag).toHaveBeenCalledWith('picker-cities', { expire: 0 })
    expect(updateTag).not.toHaveBeenCalled()
  })
})

describe('/api/revalidate-guides', () => {
  const call = (headers: Record<string, string>, body?: string) =>
    POST(new NextRequest('http://localhost/api/revalidate-guides', { method: 'POST', headers, body }))

  it('refuses a caller without the cron secret, and revalidates nothing', async () => {
    const res = await call({ authorization: 'Bearer wrong' })
    expect(res.status).toBe(401)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a body that is not the expected shape', async () => {
    const auth = { authorization: 'Bearer test-cron-secret', 'content-type': 'application/json' }
    expect((await call(auth, 'not json')).status).toBe(400)
    expect((await call(auth, JSON.stringify({ eventIds: ['not-a-uuid'] }))).status).toBe(400)
    expect((await call(auth, JSON.stringify({ other: 1 }))).status).toBe(400)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('revalidates every guide with no body', async () => {
    const res = await call({ authorization: 'Bearer test-cron-secret' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.revalidated).toEqual(expect.arrayContaining(['/', '/city/[slug]', '/state/[state]']))
    expect(json.events).toBe(0)
  })

  it("with event ids, also revalidates each event's own page and its city", async () => {
    const res = await call(
      { authorization: 'Bearer test-cron-secret', 'content-type': 'application/json' },
      JSON.stringify({ eventIds: ['3f2b8f4e-6c1a-4d2b-9e3f-1a2b3c4d5e6f'] }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.events).toBe(1)
    expect(json.revalidated).toEqual(expect.arrayContaining(['/events/a-night', '/city/melbourne']))
  })
})

describe('the writers that change a guide revalidate it (the class, pinned)', () => {
  it("the organiser's self-listing revalidates AFTER it names the event its own, and after a later photo", () => {
    const s = source('src/lib/listings/self-listing-run.ts')
    const published = s.indexOf("status: 'published', reviewed_at")
    const after = s.indexOf('await revalidateEventSurfacesFromRouteHandlerById(admin, made.id as string)')
    expect(published).toBeGreaterThan(0)
    expect(after).toBeGreaterThan(published)
    const photos = s.slice(s.indexOf('export async function attachApprovedPhotos'))
    expect(photos).toMatch(/if \(photo\.attached\) await revalidateEventSurfacesFromRouteHandlerById\(admin, r\.published_event_id\)/)
  })

  it("the admin console's status change and feature toggle revalidate the event's surfaces", () => {
    const s = source('src/app/admin/(authed)/events/actions.ts')
    const calls = s.match(/await revalidateEventSurfacesById\(createAdminClient\(\), /g) ?? []
    expect(calls.length).toBe(2)
    const action = s.slice(s.indexOf('export async function eventActionForm'), s.indexOf('const DeleteSchema'))
    expect(action.indexOf('revalidateEventSurfacesById')).toBeGreaterThan(action.indexOf('applyEventAction('))
    const feature = s.slice(s.indexOf('export async function eventFeatureForm'))
    expect(feature.indexOf('revalidateEventSurfacesById')).toBeGreaterThan(feature.indexOf('setEventFeatured('))
  })

  it("an accepted set of booking links revalidates the event's surfaces", () => {
    const s = source('src/app/admin/(authed)/collected/actions.ts')
    const links = s.slice(s.indexOf("c.kind === 'adds_links'"))
    expect(links.indexOf('await revalidateEventSurfacesById(db, c.event_id as string)')).toBeGreaterThan(links.indexOf('addCuratedLinks('))
  })

  it('a reviewed production write starts the guides revalidation after APPLIED', () => {
    const s = source('scripts/ops/apply-reviewed-sql-production.mjs')
    expect(s.indexOf('askForGuideRevalidation()')).toBeGreaterThan(s.indexOf('APPLIED: ${r.statements}'))
  })

  it('every production deploy revalidates the guides, after the smoke proves the commit under test', () => {
    const s = source('.github/workflows/post-deploy-smoke.yml')
    const smoke = s.indexOf('- name: Smoke production')
    const step = s.indexOf('- name: Revalidate every guide on the new deployment')
    expect(smoke).toBeGreaterThan(0)
    expect(step).toBeGreaterThan(smoke)
    expect(s.slice(step, step + 1400)).toMatch(/\$PROD_URL\/api\/revalidate-guides/)
  })

  it('the script-write workflow is started by hand or by the apply script only: never a schedule (law 14 (d))', () => {
    const s = source('.github/workflows/revalidate-guides.yml')
    const on = s.slice(s.indexOf('\non:'), s.indexOf('\npermissions:'))
    expect(on).toMatch(/workflow_dispatch:/)
    expect(on).not.toMatch(/schedule:|push:|pull_request:/)
  })
})

describe('askForGuideRevalidation', () => {
  it('starts the workflow and says how to read its run', async () => {
    const { askForGuideRevalidation } = await import('../../../scripts/ops/apply-reviewed-sql-production.mjs')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const run = vi.fn(() => ({ status: 0, stderr: '' }))
    expect(askForGuideRevalidation(run)).toBe(true)
    expect(run).toHaveBeenCalledWith('gh', ['workflow', 'run', 'revalidate-guides.yml', '-R', 'eventlinqs/eventlinqs-app'], { encoding: 'utf8' })
    expect(String(log.mock.calls.at(-1)?.[0])).toMatch(/^GUIDES: revalidation started/)
    log.mockRestore()
  })

  it('when it cannot start, says so and prints the one command to run', async () => {
    const { askForGuideRevalidation } = await import('../../../scripts/ops/apply-reviewed-sql-production.mjs')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(askForGuideRevalidation(() => ({ status: 1, stderr: 'not logged in' }))).toBe(false)
    expect(String(log.mock.calls.at(-1)?.[0])).toMatch(/^GUIDES NOT YET REVALIDATED \(not logged in\)\. Run: gh workflow run revalidate-guides\.yml/)
    log.mockRestore()
  })
})
