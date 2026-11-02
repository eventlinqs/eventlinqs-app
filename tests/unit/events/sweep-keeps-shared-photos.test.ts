import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * NEVER A PHOTO ANOTHER EVENT STILL SHOWS (1 November 2026). duplicateEvent and a repeat night share their original's
 * cover and gallery URLs, so deleting the copy used to delete the original's photo. The sweep keeps any object another
 * event names, and keeps it when that cannot be read.
 */
const BASE = 'https://test.supabase.co/storage/v1/object/public/event-images/'
const state = {
  objects: new Set<string>(),
  removed: [] as string[],
  coverElsewhere: new Set<string>(),
  galleryElsewhere: new Set<string>(),
  failReads: false,
}

function eventsQuery() {
  let kind: 'cover' | 'gallery' = 'cover'
  let key = ''
  const q = {
    select: () => q,
    neq: () => q,
    like: (_col: string, pattern: string) => ((kind = 'cover'), (key = pattern.replace(/^%\//, '')), q),
    contains: (_col: string, value: { url: string }[]) => ((kind = 'gallery'), (key = value[0].url.slice(BASE.length)), q),
    limit: async () => {
      if (state.failReads) return { data: null, error: { message: 'down' } }
      const hit = kind === 'cover' ? state.coverElsewhere.has(key) : state.galleryElsewhere.has(key)
      return { data: hit ? [{ id: 'other' }] : [], error: null }
    },
  }
  return q
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => eventsQuery(),
    storage: {
      from: () => ({
        list: async (prefix: string) => ({
          data: [...state.objects].filter((p) => p.startsWith(`${prefix}/`)).map((p) => ({ name: p.slice(prefix.length + 1) })),
          error: null,
        }),
        remove: async (paths: string[]) => {
          for (const p of paths) state.objects.delete(p)
          state.removed.push(...paths)
          return { data: paths.map((name) => ({ name })), error: null }
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${BASE}${path}` } }),
      }),
    },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/media/image-pipeline', () => ({ processEventImage: async () => null }))
vi.mock('@/lib/redis/rate-limit', () => ({ checkRateLimit: async () => ({ ok: true }) }))

const { sweepEventStorage } = await import('@/lib/upload')

beforeEach(() => {
  state.objects = new Set(['u1/night1/cover.avif', 'u1/night1/old.avif', 'u1/night1/gallery-1.avif'])
  state.removed = []
  state.coverElsewhere = new Set()
  state.galleryElsewhere = new Set()
  state.failReads = false
})

describe('sweepEventStorage', () => {
  it("keeps the cover and gallery photos a repeat night still shows, and removes the event's own", async () => {
    state.coverElsewhere.add('u1/night1/cover.avif')
    state.galleryElsewhere.add('u1/night1/gallery-1.avif')
    const result = await sweepEventStorage({ eventId: 'night1', createdBy: 'u1', urls: [`${BASE}u1/night1/cover.avif`] })
    expect(state.removed).toEqual(['u1/night1/old.avif'])
    expect(state.objects).toEqual(new Set(['u1/night1/cover.avif', 'u1/night1/gallery-1.avif']))
    expect(result).toMatchObject({ kept: 2, remaining: 0 })
  })

  it('removes everything when no other event shows it', async () => {
    const result = await sweepEventStorage({ eventId: 'night1', createdBy: 'u1', urls: [] })
    expect(state.objects.size).toBe(0)
    expect(result).toMatchObject({ removed: 3, kept: 0, remaining: 0 })
  })

  it('keeps a photo when it cannot tell whether another event shows it, and says so', async () => {
    state.failReads = true
    const result = await sweepEventStorage({ eventId: 'night1', createdBy: 'u1', urls: [] })
    expect(state.removed).toEqual([])
    expect(result.kept).toBe(3)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
