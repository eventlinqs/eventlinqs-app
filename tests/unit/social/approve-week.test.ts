import { describe, expect, it, vi } from 'vitest'
import { approveWeek } from '@/lib/social/store'

/*
 * THE WEEK APPROVED IN ONE PRESS (the release checklist's B3: "Approve control per post and per week"). The same checked
 * approval as one piece (approvePieceChecked: its nights, links, admission, images and page re-read first), run on every
 * piece still waiting; each that passes is approved, each held is said with its reason, and nothing already approved,
 * rejected or gone is touched.
 */
const piece = (id: string, state: 'drafted' | 'rejected' | 'approved' | 'gone', label = id) => ({ id, state, label })

describe('approve the week', () => {
  it('runs the checked approval on every piece still waiting, and only on those', async () => {
    const approveOne = vi.fn(async (_id: string) => ({ state: 'done' as const }))
    const done = await approveWeek([piece('a', 'drafted'), piece('b', 'approved'), piece('c', 'rejected'), piece('d', 'gone'), piece('e', 'drafted')], approveOne)
    expect(approveOne.mock.calls.map((c) => c[0])).toEqual(['a', 'e'])
    expect(done.approved).toEqual(['a', 'e'])
    expect(done.held).toEqual([])
  })

  it('says why each held piece is held, and still approves the rest', async () => {
    const approveOne = vi.fn(async (id: string) =>
      id === 'b' ? { state: 'refused' as const, reason: 'Not approved yet: Hop Temple Trivia: it has ended.' } : { state: 'done' as const },
    )
    const done = await approveWeek([piece('a', 'drafted', 'Week ahead, Geelong'), piece('b', 'drafted', 'Week ahead, Ballarat'), piece('c', 'drafted', 'Partner kit, Aireys Pub')], approveOne)
    expect(done.approved).toEqual(['a', 'c'])
    expect(done.held).toEqual([{ id: 'b', label: 'Week ahead, Ballarat', reason: 'Not approved yet: Hop Temple Trivia: it has ended.' }])
  })

  it('a check that throws holds that piece with the reason, never the week', async () => {
    const approveOne = vi.fn(async (id: string) => {
      if (id === 'a') throw new Error('the page could not be read')
      return { state: 'done' as const }
    })
    const done = await approveWeek([piece('a', 'drafted'), piece('b', 'drafted')], approveOne)
    expect(done.approved).toEqual(['b'])
    expect(done.held[0]).toMatchObject({ id: 'a', reason: expect.stringContaining('the page could not be read') })
  })

  it('a week with nothing waiting approves nothing and says so by its empty lists', async () => {
    const approveOne = vi.fn()
    expect(await approveWeek([piece('a', 'approved')], approveOne)).toEqual({ approved: [], held: [] })
    expect(approveOne).not.toHaveBeenCalled()
  })
})
