import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * THE CLAIM'S LAST STEPS STAY ON THE PAGE (the claim drive on TEST, 29 October 2026, drive-2). An action that calls
 * revalidatePath re-renders the page it was pressed on. Once the code is right the venue or night is claimed, so the
 * claim page re-rendered draws "already run by its owner" and the claim card, with its upload, regular nights and done
 * steps, is gone: the photo was stored, its "Added" line never showed, and the organiser was left on a page that no
 * longer has the rest of their claim. The organiser's page (/dashboard/organisation/media) still refreshes its lists.
 */

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) } }),
}))
vi.mock('@/lib/rate-limit/action', () => ({ actionRateLimit: async () => ({ ok: true }) }))
vi.mock('@/lib/listings/organiser-media', () => ({
  addOrganiserMedia: async () => ({ state: 'done' }),
  keepOrganiserSeries: async () => ({ state: 'done' }),
  replaceOrganiserMedia: async () => ({ state: 'done' }),
  withdrawOrganiserMedia: async () => ({ state: 'done' }),
  withdrawOrganiserYes: async () => ({ state: 'done' }),
  giveOrganiserYes: async () => ({ state: 'done' }),
  mediaDeps: () => ({}),
}))

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

describe('the claim flow is not re-rendered away under the organiser', () => {
  beforeEach(() => revalidatePath.mockClear())

  it('an upload from the claim page answers done and refreshes no page', async () => {
    const { addMedia } = await import('@/app/actions/organiser-media')
    const answer = await addMedia(null, form({ eventId: 'e-1', flow: 'claim' }))
    expect(answer).toEqual({ state: 'done' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('a regular night kept or paused from the claim page refreshes no page', async () => {
    const { keepSeries } = await import('@/app/actions/organiser-media')
    await keepSeries(null, form({ seriesId: 's-1', keep: 'no', flow: 'claim' }))
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("the organiser's own page still refreshes its lists", async () => {
    const { addMedia, keepSeries } = await import('@/app/actions/organiser-media')
    await addMedia(null, form({ eventId: 'e-1' }))
    await keepSeries(null, form({ seriesId: 's-1', keep: 'yes' }))
    expect(revalidatePath).toHaveBeenCalledTimes(2)
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/organisation/media')
  })

  it('the claim card marks both of its forms as the claim flow', () => {
    const card = readFileSync('src/components/listings/claim-form.tsx', 'utf8')
    expect(card).toMatch(/<AddMediaForm[\s\S]*?inClaim[\s\S]*?\/>/)
    expect(card).toMatch(/<RegularNightsForm[\s\S]*?inClaim[\s\S]*?\/>/)
    const forms = readFileSync('src/components/listings/organiser-media-forms.tsx', 'utf8')
    expect(forms).toMatch(/name="flow" value="claim"/)
    expect(forms).toMatch(/fd\.set\('flow', 'claim'\)/)
  })
})
