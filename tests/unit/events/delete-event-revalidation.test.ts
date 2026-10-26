import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ONE DELETE, TWO CALLERS' CONTEXTS (WI2 Part 1, docs/walk-in/WI2-PLAN.md 7a).
 *
 * Every organiser and admin delete is a server action and revalidates with
 * `updateTag`; the daily listings run is a cron route, where `updateTag` throws
 * ("can only be called from within a Server Action"), so it asks for the route
 * handler form. The default must stay exactly what every existing caller had,
 * and a system run with no person behind it is audited with no actor id.
 */

const calls: string[] = []
const audits: Array<{ actor: { id: string | null; role: string } }> = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'e-1',
              slug: 'folk-night-pat-s-bar-2026-11-04',
              title: 'Folk Night',
              status: 'published',
              organisation_id: 'org-listings',
              created_by: 'owner-1',
              cover_image_url: null,
              gallery_urls: [],
              venue_city: 'Geelong',
              tags: [],
              archived_from_status: null,
              category: { slug: 'music' },
              organisation: { slug: 'eventlinqs-listings' },
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/upload', () => ({
  sweepEventStorage: async () => ({ prefixes: [], removed: 0, remaining: 0 }),
}))
vi.mock('@/lib/events/delete-eligibility', () => ({
  readMoneyRecordCounts: async () => ({}),
  judgeDeleteEligibility: () => ({ deletable: true, counts: {} }),
  deleteRefusalSentence: () => '',
  isMoneyRefusal: () => false,
}))
vi.mock('@/lib/events/lifecycle-audit', () => ({
  recordLifecycleAudit: async (input: { actor: { id: string | null; role: string } }) => {
    audits.push(input)
  },
}))
vi.mock('@/lib/events/revalidate-event', () => ({
  revalidateEventSurfaces: () => {
    calls.push('server-action')
    return []
  },
  revalidateEventSurfacesFromRouteHandler: () => {
    calls.push('route-handler')
    return []
  },
}))

const deleteWith = {
  from: () => ({
    delete: () => ({ eq: () => ({ select: async () => ({ data: [{ id: 'e-1' }], error: null }) }) }),
  }),
}

beforeEach(() => {
  calls.length = 0
  audits.length = 0
})

describe('deleteEventEverywhere revalidates the way its caller can', () => {
  it('a server action (every existing caller) is unchanged', async () => {
    const { deleteEventEverywhere } = await import('@/lib/events/delete-event-core')
    const out = await deleteEventEverywhere({ eventId: 'e-1', actor: { id: 'owner-1', email: null, role: 'organiser' }, deleteWith })
    expect(out.ok).toBe(true)
    expect(calls).toEqual(['server-action'])
  })

  it('a cron says route-handler, and never reaches updateTag', async () => {
    const { deleteEventEverywhere } = await import('@/lib/events/delete-event-core')
    const out = await deleteEventEverywhere({
      eventId: 'e-1',
      actor: { id: null, email: null, role: 'listings-run' },
      deleteWith,
      revalidateFrom: 'route-handler',
    })
    expect(out.ok).toBe(true)
    expect(calls).toEqual(['route-handler'])
  })

  it('a system run is audited with no person named', async () => {
    const { deleteEventEverywhere } = await import('@/lib/events/delete-event-core')
    await deleteEventEverywhere({ eventId: 'e-1', actor: { id: null, email: null, role: 'listings-run' }, deleteWith, revalidateFrom: 'route-handler' })
    expect(audits[0].actor).toMatchObject({ id: null, role: 'listings-run' })
  })
})
