// THE PREFERENCES THE ALERT ENGINE READS ON EVERY SEND.
//
// The timezone stored here is handed to Intl.DateTimeFormat by the dispatcher
// for every recipient of every alert, and Intl THROWS on a zone it cannot
// resolve. The schema used to be `z.string().max(64)`, so "Somewhere/Nowhere"
// was accepted and stored, and one such row could have aborted a whole cron
// pass and taken every other follower's alert with it. The dispatcher is
// defensive about it as well; this is the half that refuses the value where it
// is offered, which is the only place it can be refused honestly.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  upserts: [] as Record<string, unknown>[],
  upsertError: null as { message: string } | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
      upsert: async (payload: Record<string, unknown>) => {
        h.upserts.push(payload)
        return { error: h.upsertError }
      },
    }),
  }),
}))

const { POST } = await import('@/app/api/notifications/prefs/route')

function post(body: unknown): NextRequest {
  return new Request('https://eventlinqs.com/api/notifications/prefs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

beforeEach(() => {
  h.user = { id: 'user-1' }
  h.upserts = []
  h.upsertError = null
})

describe('the quiet-hours preferences a cron will later trust', () => {
  it('saves a real zone', async () => {
    const res = await POST(post({ timezone: 'Australia/Perth', quiet_hours_start: 22, quiet_hours_end: 7 }))
    expect(res.status).toBe(200)
    expect(h.upserts).toHaveLength(1)
    expect(h.upserts[0]).toMatchObject({ timezone: 'Australia/Perth' })
  })

  it('refuses a zone the runtime cannot resolve, and stores nothing', async () => {
    const res = await POST(post({ timezone: 'Somewhere/Nowhere' }))
    expect(res.status).toBe(400)
    expect(h.upserts).toHaveLength(0)
  })

  it('refuses an hour outside the day', async () => {
    const res = await POST(post({ quiet_hours_start: 24 }))
    expect(res.status).toBe(400)
    expect(h.upserts).toHaveLength(0)
  })

  it('accepts clearing the window, which is how a user turns quiet hours off', async () => {
    const res = await POST(post({ quiet_hours_start: null, quiet_hours_end: null }))
    expect(res.status).toBe(200)
    expect(h.upserts[0]).toMatchObject({ quiet_hours_start: null, quiet_hours_end: null })
  })

  it('refuses anyone who is not signed in, before touching the table', async () => {
    h.user = null
    const res = await POST(post({ timezone: 'Australia/Sydney' }))
    expect(res.status).toBe(401)
    expect(h.upserts).toHaveLength(0)
  })
})
